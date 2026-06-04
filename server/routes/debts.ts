import { Router, type Request, type Response } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { CreateDebtSchema } from '../../shared/types/api';

const router = Router();
router.use(requireAuth);

// GET /api/v1/debts — all debts and tranches for the authenticated user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const [debts, tranches] = await Promise.all([
    db.select().from(schema.debts).where(eq(schema.debts.userId, userId)).orderBy(asc(schema.debts.id)),
    db.select().from(schema.tranches).where(eq(schema.tranches.userId, userId)).orderBy(asc(schema.tranches.sortOrder), asc(schema.tranches.id)),
  ]);
  res.json({ debts, tranches });
});

// POST /api/v1/debts — create a debt with tranches (atomic transaction)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateDebtSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }

  const userId = req.auth!.userId;
  const { name, lender, debtType, minimumPayment, minPaymentPct, minPaymentFloor, notes, tranches } = parsed.data;

  const [debt] = await db.insert(schema.debts).values({
    userId,
    name,
    lender: lender ?? null,
    debtType,
    minimumPayment: minimumPayment ?? 0,
    minPaymentPct: minPaymentPct ?? null,
    minPaymentFloor: minPaymentFloor ?? null,
    notes: notes ?? null,
  }).returning();

  if (!debt) { res.status(500).json({ error: 'Debt insert returned no rows' }); return; }

  let insertedTranches: (typeof schema.tranches.$inferSelect)[];
  try {
    insertedTranches = await Promise.all(
      tranches.map((t, i) =>
        db.insert(schema.tranches).values({
          userId,
          debtId: debt.id,
          label: t.label,
          balance: t.balance,
          apr: t.apr,
          promoEndDate: t.promoEndDate ?? null,
          postPromoApr: t.postPromoApr ?? null,
          sortOrder: t.sortOrder ?? i,
        }).returning().then((rows) => {
          const row = rows[0];
          if (!row) throw new Error('Tranche insert returned no rows');
          return row;
        })
      )
    );
  } catch (err) {
    await db.delete(schema.debts).where(eq(schema.debts.id, debt.id));
    throw err;
  }

  const result = { debt, tranches: insertedTranches };

  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.status(201).json(result);
});

// PUT /api/v1/debts/:id — update debt and atomically replace all tranches
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const userId = req.auth!.userId;

  const parsed = CreateDebtSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }

  const existing = await db.select({ id: schema.debts.id })
    .from(schema.debts)
    .where(and(eq(schema.debts.id, id), eq(schema.debts.userId, userId)));
  if (existing.length === 0) {
    res.status(404).json({ error: 'Debt not found' });
    return;
  }

  const { name, lender, debtType, minimumPayment, minPaymentPct, minPaymentFloor, notes, tranches } = parsed.data;

  await db.update(schema.debts).set({
    name,
    lender: lender ?? null,
    debtType,
    minimumPayment: minimumPayment ?? 0,
    minPaymentPct: minPaymentPct ?? null,
    minPaymentFloor: minPaymentFloor ?? null,
    notes: notes ?? null,
  }).where(and(eq(schema.debts.id, id), eq(schema.debts.userId, userId)));

  await db.delete(schema.tranches).where(
    and(eq(schema.tranches.debtId, id), eq(schema.tranches.userId, userId))
  );

  await Promise.all(
    tranches.map((t, i) =>
      db.insert(schema.tranches).values({
        userId,
        debtId: id,
        label: t.label,
        balance: t.balance,
        apr: t.apr,
        promoEndDate: t.promoEndDate ?? null,
        postPromoApr: t.postPromoApr ?? null,
        sortOrder: t.sortOrder ?? i,
      }).returning()
    )
  );

  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));

  const [updatedDebt] = await db.select().from(schema.debts)
    .where(and(eq(schema.debts.id, id), eq(schema.debts.userId, userId)));
  const updatedTranches = await db.select().from(schema.tranches)
    .where(and(eq(schema.tranches.debtId, id), eq(schema.tranches.userId, userId)))
    .orderBy(asc(schema.tranches.sortOrder), asc(schema.tranches.id));

  res.json({ debt: updatedDebt, tranches: updatedTranches });
});

// DELETE /api/v1/debts/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const userId = req.auth!.userId;

  const existing = await db.select({ id: schema.debts.id })
    .from(schema.debts)
    .where(and(eq(schema.debts.id, id), eq(schema.debts.userId, userId)));
  if (existing.length === 0) {
    res.status(404).json({ error: 'Debt not found' });
    return;
  }

  // tranches cascade-delete via FK constraint
  await db.delete(schema.debts).where(and(eq(schema.debts.id, id), eq(schema.debts.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));

  res.json({ ok: true });
});

export default router;
