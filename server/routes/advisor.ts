import { Router, type Request, type Response } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { toEngineConv } from '../db/mappers';
import { callClaude } from '../lib/claude';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildAdvisorPrompt } = require('../engine/advisor') as typeof import('../engine/advisor');

const router = Router();
router.use(requireAuth);

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

  // Determine next sequence number
  const [seqRow] = await db.select({ maxSeq: sql<number>`COALESCE(MAX(${schema.messages.sequence}), 0)` }).from(schema.messages).where(eq(schema.messages.conversationId, id));
  const lastSeq = Number(seqRow?.maxSeq ?? 0);
  const userSeq = lastSeq + 1;
  const isFirst = userSeq === 1;

  // Capture context snapshot on first message when context is enabled
  let currentConv = conv;
  if (isFirst && conv.useContext && !conv.contextSnapshot) {
    const snapshot = await buildUserContextSnapshot(userId);
    if (snapshot) {
      await db.update(schema.conversations).set({ contextSnapshot: snapshot }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
      currentConv = { ...conv, contextSnapshot: snapshot };
    }
  }

  // Insert user message
  const [userMessage] = await db.insert(schema.messages).values({ userId, conversationId: id, role: 'user', content: content.trim(), sequence: userSeq }).returning();
  if (!userMessage) { res.status(500).json({ error: 'Failed to insert user message' }); return; }

  // Fetch last ≤6 messages for prompt
  const recentMessages = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(desc(schema.messages.sequence)).limit(6);
  recentMessages.reverse();

  // Build prompt and call Claude
  const prompt = buildAdvisorPrompt(toEngineConv(currentConv), recentMessages);
  let assistantContent: string;
  try {
    assistantContent = await callClaude(prompt, 60000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timed out') || msg.includes('timeout')) {
      res.status(504).json({ error: 'Claude took too long — please try again' });
    } else {
      res.status(502).json({ error: 'Claude is unavailable: ' + msg });
    }
    return;
  }

  const assistantSeq = userSeq + 1;
  const [assistantMessage] = await db.insert(schema.messages).values({ userId, conversationId: id, role: 'assistant', content: assistantContent, sequence: assistantSeq }).returning();

  let newTitle: string | null = null;

  // Auto-generate title on first message
  if (isFirst) {
    try {
      const titlePrompt = `Give a conversation title of 4-6 words for a financial chat that started with: "${content.trim().slice(0, 200)}". Respond with only the title — no punctuation, no quotes.`;
      const raw = await callClaude(titlePrompt, 30000);
      const title = raw.trim().slice(0, 60);
      if (title) {
        await db.update(schema.conversations).set({ title, updatedAt: new Date().toISOString() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
        newTitle = title;
      }
    } catch { /* non-critical */ }
  }

  // Regenerate rolling summary every 6 messages
  const totalMessages = assistantSeq;
  if (totalMessages > 6 && totalMessages % 6 === 2) {
    try {
      const olderMessages = await db.select({ role: schema.messages.role, content: schema.messages.content }).from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.sequence)).limit(totalMessages - 6);
      if (olderMessages.length > 0) {
        const historyText = olderMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
        const summaryPrompt = `In 2-3 sentences, summarise the key points from this financial advice conversation:\n\n${historyText}\n\nSummary:`;
        const summary = await callClaude(summaryPrompt, 30000);
        await db.update(schema.conversations).set({ summary: summary.trim() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));
      }
    } catch { /* non-critical */ }
  }

  await db.update(schema.conversations).set({ updatedAt: new Date().toISOString() }).where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)));

  res.json({ userMessage, assistantMessage, newTitle });
});

export default router;
