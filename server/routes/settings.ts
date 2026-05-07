import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { PutSettingsSchema } from '../../shared/types/api';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const rows = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.userId, userId));
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.put('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = PutSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation error' }); return; }
  const userId = req.auth!.userId;
  await Promise.all(
    Object.entries(parsed.data).map(([key, val]) =>
      db.insert(schema.settings)
        .values({ userId, key, value: String(val) })
        .onConflictDoUpdate({ target: [schema.settings.key, schema.settings.userId], set: { value: String(val) } }),
    ),
  );
  const rows = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.userId, userId));
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

export default router;
