import { Router, type Request, type Response } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { CreateIncomeSourceSchema, CreateExpenseSchema } from '../../shared/types/api';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toMonthly } = require('../engine/calculator') as { toMonthly: (amount: number, frequency: string) => number };

const router = Router();
router.use(requireAuth);

// GET /budget — income sources and expenses for authenticated user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const [income, expenses] = await Promise.all([
    db.select().from(schema.incomeSources).where(eq(schema.incomeSources.userId, userId)).orderBy(asc(schema.incomeSources.id)),
    db.select().from(schema.expenses).where(eq(schema.expenses.userId, userId)).orderBy(asc(schema.expenses.category), asc(schema.expenses.id)),
  ]);
  res.json({ income, expenses });
});

// POST /budget/income
router.post('/income', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateIncomeSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }
  const userId = req.auth!.userId;
  const { label, amount, frequency } = parsed.data;
  const monthlyEquivalent = Math.round(toMonthly(amount, frequency));
  const [row] = await db.insert(schema.incomeSources).values({ userId, label, amount, frequency, monthlyEquivalent }).returning();
  if (!row) { res.status(500).json({ error: 'Insert returned no rows' }); return; }
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.status(201).json(row);
});

// PUT /budget/income/:id
router.put('/income/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const parsed = CreateIncomeSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }
  const existing = await db.select({ id: schema.incomeSources.id }).from(schema.incomeSources).where(and(eq(schema.incomeSources.id, id), eq(schema.incomeSources.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Income source not found' }); return; }
  const { label, amount, frequency } = parsed.data;
  const monthlyEquivalent = Math.round(toMonthly(amount, frequency));
  await db.update(schema.incomeSources).set({ label, amount, frequency, monthlyEquivalent }).where(and(eq(schema.incomeSources.id, id), eq(schema.incomeSources.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  const [row] = await db.select().from(schema.incomeSources).where(and(eq(schema.incomeSources.id, id), eq(schema.incomeSources.userId, userId)));
  res.json(row);
});

// DELETE /budget/income/:id
router.delete('/income/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const existing = await db.select({ id: schema.incomeSources.id }).from(schema.incomeSources).where(and(eq(schema.incomeSources.id, id), eq(schema.incomeSources.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Income source not found' }); return; }
  await db.delete(schema.incomeSources).where(and(eq(schema.incomeSources.id, id), eq(schema.incomeSources.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.json({ ok: true });
});

// POST /budget/expenses
router.post('/expenses', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }
  const userId = req.auth!.userId;
  const { label, amount, category, isEssential } = parsed.data;
  const [row] = await db.insert(schema.expenses).values({ userId, label, amount, category, isEssential: isEssential ?? true }).returning();
  if (!row) { res.status(500).json({ error: 'Insert returned no rows' }); return; }
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.status(201).json(row);
});

// PUT /budget/expenses/:id
router.put('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const parsed = CreateExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }
  const existing = await db.select({ id: schema.expenses.id }).from(schema.expenses).where(and(eq(schema.expenses.id, id), eq(schema.expenses.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Expense not found' }); return; }
  const { label, amount, category, isEssential } = parsed.data;
  await db.update(schema.expenses).set({ label, amount, category, isEssential: isEssential ?? true }).where(and(eq(schema.expenses.id, id), eq(schema.expenses.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  const [row] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.id, id), eq(schema.expenses.userId, userId)));
  res.json(row);
});

// DELETE /budget/expenses/:id
router.delete('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const existing = await db.select({ id: schema.expenses.id }).from(schema.expenses).where(and(eq(schema.expenses.id, id), eq(schema.expenses.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Expense not found' }); return; }
  await db.delete(schema.expenses).where(and(eq(schema.expenses.id, id), eq(schema.expenses.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.json({ ok: true });
});

export default router;
