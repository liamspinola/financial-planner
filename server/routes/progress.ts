import { Router, type Request, type Response } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { CreateProgressSnapshotSchema } from '../../shared/types/api';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const rows = await db.select().from(schema.progressSnapshots).where(eq(schema.progressSnapshots.userId, userId)).orderBy(asc(schema.progressSnapshots.snapshotMonth));
  res.json(rows.map(r => ({ ...r, balances: JSON.parse(r.balancesJson) })));
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateProgressSnapshotSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }); return; }
  const { snapshotMonth, balances, notes } = parsed.data;
  const userId = req.auth!.userId;
  const totalBalance = Object.values(balances).reduce((s, v) => s + v, 0);
  const balancesJson = JSON.stringify(balances);

  const existing = await db.select({ id: schema.progressSnapshots.id }).from(schema.progressSnapshots).where(and(eq(schema.progressSnapshots.userId, userId), eq(schema.progressSnapshots.snapshotMonth, snapshotMonth)));

  if (existing.length > 0 && existing[0]) {
    await db.update(schema.progressSnapshots).set({ totalBalance, balancesJson, notes: notes ?? null }).where(and(eq(schema.progressSnapshots.id, existing[0].id), eq(schema.progressSnapshots.userId, userId)));
    const [row] = await db.select().from(schema.progressSnapshots).where(and(eq(schema.progressSnapshots.id, existing[0].id), eq(schema.progressSnapshots.userId, userId)));
    res.json({ ...row, balances: JSON.parse(row!.balancesJson) });
  } else {
    const [row] = await db.insert(schema.progressSnapshots).values({ userId, snapshotMonth, totalBalance, balancesJson, notes: notes ?? null }).returning();
    if (!row) { res.status(500).json({ error: 'Insert returned no rows' }); return; }
    res.status(201).json({ ...row, balances: JSON.parse(row.balancesJson) });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const existing = await db.select({ id: schema.progressSnapshots.id }).from(schema.progressSnapshots).where(and(eq(schema.progressSnapshots.id, id), eq(schema.progressSnapshots.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Snapshot not found' }); return; }
  await db.delete(schema.progressSnapshots).where(and(eq(schema.progressSnapshots.id, id), eq(schema.progressSnapshots.userId, userId)));
  res.json({ ok: true });
});

export default router;
