import { Router, type Request, type Response } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { CreateWindfallSchema } from '../../shared/types/api';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const rows = await db.select().from(schema.windfalls).where(eq(schema.windfalls.userId, userId)).orderBy(asc(schema.windfalls.applyMonth), asc(schema.windfalls.id));
  res.json(rows);
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateWindfallSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }); return; }
  const { label, amount, applyMonth } = parsed.data;
  const userId = req.auth!.userId;
  const [row] = await db.insert(schema.windfalls).values({ userId, label: label.trim(), amount, applyMonth }).returning();
  if (!row) { res.status(500).json({ error: 'Insert returned no rows' }); return; }
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.status(201).json(row);
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const parsed = CreateWindfallSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }); return; }
  const existing = await db.select({ id: schema.windfalls.id }).from(schema.windfalls).where(and(eq(schema.windfalls.id, id), eq(schema.windfalls.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Windfall not found' }); return; }
  const { label, amount, applyMonth } = parsed.data;
  await db.update(schema.windfalls).set({ label: label.trim(), amount, applyMonth }).where(and(eq(schema.windfalls.id, id), eq(schema.windfalls.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  const [row] = await db.select().from(schema.windfalls).where(and(eq(schema.windfalls.id, id), eq(schema.windfalls.userId, userId)));
  res.json(row);
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Invalid id' }); return; }
  const userId = req.auth!.userId;
  const existing = await db.select({ id: schema.windfalls.id }).from(schema.windfalls).where(and(eq(schema.windfalls.id, id), eq(schema.windfalls.userId, userId)));
  if (existing.length === 0) { res.status(404).json({ error: 'Windfall not found' }); return; }
  await db.delete(schema.windfalls).where(and(eq(schema.windfalls.id, id), eq(schema.windfalls.userId, userId)));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  res.json({ ok: true });
});

export default router;
