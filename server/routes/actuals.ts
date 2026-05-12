import { Router, type Request, type Response } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { CreateActualSchema, UpdateActualSchema } from '../../shared/types/api';

const router = Router();
router.use(requireAuth);

// GET /actuals/summary must be registered BEFORE /:id to avoid routing conflict
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const { month } = req.query;
  if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month param must be YYYY-MM' });
    return;
  }
  const userId = req.auth!.userId;

  const [actuals, budgeted] = await Promise.all([
    db.select({
      category: schema.spendingActuals.category,
      actual: sql<number>`SUM(${schema.spendingActuals.amountActual})`.as('actual'),
    }).from(schema.spendingActuals).where(and(eq(schema.spendingActuals.userId, userId), eq(schema.spendingActuals.recordMonth, month))).groupBy(schema.spendingActuals.category),
    db.select({
      category: schema.expenses.category,
      budgeted: sql<number>`SUM(${schema.expenses.amount})`.as('budgeted'),
    }).from(schema.expenses).where(eq(schema.expenses.userId, userId)).groupBy(schema.expenses.category),
  ]);

  const map: Record<string, { category: string; budgeted: number; actual: number }> = {};
  for (const b of budgeted) map[b.category] = { category: b.category, budgeted: Number(b.budgeted), actual: 0 };
  for (const a of actuals) {
    if (map[a.category]) { map[a.category]!.actual = Number(a.actual); }
    else { map[a.category] = { category: a.category, budgeted: 0, actual: Number(a.actual) }; }
  }

  const rows = Object.values(map)
    .map(r => ({ ...r, delta: r.actual - r.budgeted }))
    .sort((a, b) => a.category.localeCompare(b.category));

  res.json(rows);
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { month } = req.query;
  const userId = req.auth!.userId;

  if (month !== undefined) {
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: 'month param must be YYYY-MM' });
      return;
    }
    const rows = await db.select().from(schema.spendingActuals).where(and(eq(schema.spendingActuals.userId, userId), eq(schema.spendingActuals.recordMonth, month))).orderBy(asc(schema.spendingActuals.category), asc(schema.spendingActuals.id));
    res.json(rows);
  } else {
    const rows = await db.select().from(schema.spendingActuals).where(eq(schema.spendingActuals.userId, userId)).orderBy(desc(schema.spendingActuals.recordMonth), asc(schema.spendingActuals.category));
    res.json(rows);
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateActualSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }); return; }
  const { expenseId, category, label, amountActual, recordMonth } = parsed.data;
  const userId = req.auth!.userId;
  const [row] = await db.insert(schema.spendingActuals).values({ userId, expenseId: expenseId ?? null, category, label, amountActual, recordMonth }).returning();
  if (!row) { res.status(500).json({ error: 'Insert returned no rows' }); return; }
  res.status(201).json(row);
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const parsed = UpdateActualSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }); return; }
  const existing = await db.select({ id: schema.spendingActuals.id }).from(schema.spendingActuals).where(and(eq(schema.spendingActuals.id, id), eq(schema.spendingActuals.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Actual not found' }); return; }
  await db.update(schema.spendingActuals).set({ amountActual: parsed.data.amountActual }).where(and(eq(schema.spendingActuals.id, id), eq(schema.spendingActuals.userId, userId)));
  const [row] = await db.select().from(schema.spendingActuals).where(and(eq(schema.spendingActuals.id, id), eq(schema.spendingActuals.userId, userId)));
  res.json(row);
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const existing = await db.select({ id: schema.spendingActuals.id }).from(schema.spendingActuals).where(and(eq(schema.spendingActuals.id, id), eq(schema.spendingActuals.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Actual not found' }); return; }
  await db.delete(schema.spendingActuals).where(and(eq(schema.spendingActuals.id, id), eq(schema.spendingActuals.userId, userId)));
  res.json({ ok: true });
});

export default router;
