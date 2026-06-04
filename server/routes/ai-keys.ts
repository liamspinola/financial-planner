import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { encryptKey, decryptKey } from '../lib/encryption';

const router = Router();
router.use(requireAuth);

const SaveKeySchema = z.object({
  apiKey: z.string().min(20, 'API key must be at least 20 characters'),
  provider: z.enum(['anthropic']).default('anthropic'),
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.auth;
  const [existing] = await db.select({
    provider: schema.userAiKeys.provider,
    createdAt: schema.userAiKeys.createdAt,
  }).from(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));

  if (!existing) {
    res.json({ hasKey: false, provider: null, createdAt: null });
    return;
  }
  res.json({ hasKey: true, provider: existing.provider, createdAt: existing.createdAt });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = SaveKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }
  const { apiKey, provider } = parsed.data;
  const { userId } = req.auth;

  // Always delete existing key first (one key per user per provider)
  await db.delete(schema.userAiKeys).where(
    and(eq(schema.userAiKeys.userId, userId), eq(schema.userAiKeys.provider, provider)),
  );

  const { encryptedKey, iv } = encryptKey(apiKey);
  await db.insert(schema.userAiKeys).values({ userId, encryptedKey, iv, provider }).returning();

  res.status(201).json({ ok: true, provider });
});

router.delete('/', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.auth;
  const [existing] = await db.select({ id: schema.userAiKeys.id })
    .from(schema.userAiKeys)
    .where(eq(schema.userAiKeys.userId, userId));

  if (!existing) {
    res.status(404).json({ error: 'No API key stored' });
    return;
  }
  await db.delete(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));
  res.json({ ok: true });
});

/**
 * Internal helper — called by the AI router in Phase 4 to retrieve the decrypted key.
 * Returns null if no key is stored or decryption fails.
 */
export async function getDecryptedUserKey(userId: string): Promise<string | null> {
  const [row] = await db.select({
    encryptedKey: schema.userAiKeys.encryptedKey,
    iv: schema.userAiKeys.iv,
  }).from(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));

  if (!row) return null;
  try {
    return decryptKey(row.encryptedKey, row.iv);
  } catch {
    return null;
  }
}

export default router;
