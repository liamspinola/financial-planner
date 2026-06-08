import { Router, type Request, type Response } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { toEngineConv } from '../db/mappers';
import { getProvider } from '../ai/router';
import type { AIMessage, FinancialContext, AIProvider } from '../../shared/types/ai';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildAdvisorPrompt } = require('../engine/advisor') as typeof import('../engine/advisor');

const router = Router();
router.use(requireAuth);

async function collectStream(iterable: AsyncIterable<string>): Promise<string> {
  const parts: string[] = [];
  for await (const token of iterable) {
    parts.push(token);
  }
  return parts.join('');
}

async function buildUserContextSnapshot(userId: string): Promise<string | null> {
  const [debts, income, expenses, planCacheRows] = await Promise.all([
    db.select().from(schema.debts).where(eq(schema.debts.userId, userId)),
    db.select().from(schema.incomeSources).where(eq(schema.incomeSources.userId, userId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.userId, userId)),
    db.select().from(schema.planCache).where(eq(schema.planCache.userId, userId)),
  ]);
  if (debts.length === 0 && income.length === 0) return null;
  return JSON.stringify({
    debtCount: debts.length,
    debtNames: debts.map(d => d.name),
    incomeSourceCount: income.length,
    expenseCount: expenses.length,
    hasPlan: planCacheRows.length > 0,
  });
}

// ── Conversations ─────────────────────────────────────────────────────────

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const rows = await db.select().from(schema.conversations).where(and(eq(schema.conversations.userId, userId), sql`${schema.conversations.deletedAt} IS NULL`)).orderBy(desc(schema.conversations.updatedAt));
  res.json(rows);
});

router.post('/conversations', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const [conv] = await db.insert(schema.conversations).values({ userId, useContext: true }).returning();
  if (!conv) { res.status(500).json({ error: 'Insert returned no rows' }); return; }
  res.status(201).json(conv);
});

router.patch('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), sql`${schema.conversations.deletedAt} IS NULL`));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  const { title, useContext } = req.body as { title?: string; useContext?: boolean };

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) { res.status(400).json({ error: 'title must be a non-empty string' }); return; }
    await db.update(schema.conversations).set({ title: title.trim(), updatedAt: new Date().toISOString() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  }

  if (useContext !== undefined) {
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(schema.messages).where(eq(schema.messages.conversationId, id));
    if (Number(count) > 0) { res.status(409).json({ error: 'Cannot change context setting after conversation has started' }); return; }
    await db.update(schema.conversations).set({ useContext: Boolean(useContext) }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  }

  const [updated] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  res.json(updated);
});

router.delete('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const [conv] = await db.select({ id: schema.conversations.id }).from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), sql`${schema.conversations.deletedAt} IS NULL`));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  await db.update(schema.conversations).set({ deletedAt: new Date().toISOString() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
  res.status(204).end();
});

// ── Messages ──────────────────────────────────────────────────────────────

router.get('/conversations/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const [conv] = await db.select({ id: schema.conversations.id }).from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), sql`${schema.conversations.deletedAt} IS NULL`));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  const msgs = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.sequence));
  res.json(msgs);
});

router.post('/conversations/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;

  const { content } = req.body as { content?: string };
  if (typeof content !== 'string' || !content.trim()) { res.status(400).json({ error: 'content must be a non-empty string' }); return; }

  const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), sql`${schema.conversations.deletedAt} IS NULL`));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  const [seqRow] = await db.select({ maxSeq: sql<number>`COALESCE(MAX(${schema.messages.sequence}), 0)` }).from(schema.messages).where(eq(schema.messages.conversationId, id));
  const lastSeq = Number(seqRow?.maxSeq ?? 0);
  const userSeq = lastSeq + 1;
  const isFirst = userSeq === 1;

  let currentConv = conv;
  if (isFirst && conv.useContext && !conv.contextSnapshot) {
    const snapshot = await buildUserContextSnapshot(userId);
    if (snapshot) {
      await db.update(schema.conversations).set({ contextSnapshot: snapshot }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
      currentConv = { ...conv, contextSnapshot: snapshot };
    }
  }

  const [userMessage] = await db.insert(schema.messages).values({ userId, conversationId: id, role: 'user', content: content.trim(), sequence: userSeq }).returning();
  if (!userMessage) { res.status(500).json({ error: 'Failed to insert user message' }); return; }

  const recentMessages = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(desc(schema.messages.sequence)).limit(6);
  recentMessages.reverse();

  const prompt = buildAdvisorPrompt(toEngineConv(currentConv), recentMessages);

  let provider: AIProvider;
  try {
    provider = await getProvider(userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'AI provider unavailable: ' + msg });
    return;
  }

  const history: AIMessage[] = recentMessages
    .filter(m => m.id !== userMessage.id)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.createdAt,
    }));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const emptyContext: FinancialContext = {
    debts: [],
    monthlyIncomePence: 0,
    monthlyExpensesPence: 0,
    strategy: 'avalanche',
    debtFreeDateEstimate: '',
    totalInterestPence: 0,
    windfalls: [],
  };

  const assistantTokens: string[] = [];
  try {
    for await (const token of provider.streamAnalysis(emptyContext, prompt, history)) {
      assistantTokens.push(token);
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: 'AI provider error: ' + msg })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const assistantContent = assistantTokens.join('');
  const assistantSeq = userSeq + 1;
  const [assistantMessage] = await db.insert(schema.messages).values({ userId, conversationId: id, role: 'assistant', content: assistantContent, sequence: assistantSeq }).returning();

  const meta: { assistantMessageId?: number; newTitle?: string } = {};
  if (assistantMessage) meta.assistantMessageId = assistantMessage.id;

  if (isFirst) {
    try {
      const titlePrompt = `Give a conversation title of 4-6 words for a financial chat that started with: "${content.trim().slice(0, 200)}". Respond with only the title — no punctuation, no quotes.`;
      const raw = await collectStream(provider.streamAnalysis(emptyContext, titlePrompt, []));
      const title = raw.trim().slice(0, 60);
      if (title) {
        await db.update(schema.conversations).set({ title, updatedAt: new Date().toISOString() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
        meta.newTitle = title;
      }
    } catch { /* non-critical — title generation failure does not abort the response */ }
  }

  const totalMessages = assistantSeq;
  if (totalMessages > 6 && totalMessages % 6 === 2) {
    try {
      const olderMessages = await db.select({ role: schema.messages.role, content: schema.messages.content }).from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.sequence)).limit(totalMessages - 6);
      if (olderMessages.length > 0) {
        const historyText = olderMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
        const summaryPrompt = `In 2-3 sentences, summarise the key points from this financial advice conversation:\n\n${historyText}\n\nSummary:`;
        const summary = await collectStream(provider.streamAnalysis(emptyContext, summaryPrompt, []));
        await db.update(schema.conversations).set({ summary: summary.trim() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
      }
    } catch { /* non-critical */ }
  }

  await db.update(schema.conversations).set({ updatedAt: new Date().toISOString() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));

  res.write(`data: ${JSON.stringify({ meta })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

export default router;
