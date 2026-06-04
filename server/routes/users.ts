import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/me', (req: Request, res: Response): void => {
  res.json({ userId: req.auth!.userId });
});

router.delete('/me', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.auth!;

  // Delete all user data in dependency order (children before parents due to FK constraints)
  try {
    await db.delete(schema.messages).where(eq(schema.messages.userId, userId));
    await db.delete(schema.conversations).where(eq(schema.conversations.userId, userId));
    await db.delete(schema.tranches).where(eq(schema.tranches.userId, userId));
    await db.delete(schema.debts).where(eq(schema.debts.userId, userId));
    await db.delete(schema.spendingActuals).where(eq(schema.spendingActuals.userId, userId));
    await db.delete(schema.expenses).where(eq(schema.expenses.userId, userId));
    await db.delete(schema.incomeSources).where(eq(schema.incomeSources.userId, userId));
    await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
    await db.delete(schema.progressSnapshots).where(eq(schema.progressSnapshots.userId, userId));
    await db.delete(schema.windfalls).where(eq(schema.windfalls.userId, userId));
    await db.delete(schema.expenseEvents).where(eq(schema.expenseEvents.userId, userId));
    await db.delete(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));
    await db.delete(schema.settings).where(eq(schema.settings.userId, userId));
  } catch (err) {
    console.error('[DELETE /users/me] DB error:', err);
    res.status(500).json({ error: 'Failed to delete user data' });
    return;
  }

  // Delete the Supabase auth user (permanently removes login capability)
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Server misconfiguration: Supabase admin credentials missing' });
    return;
  }
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    res.status(502).json({ error: `Supabase user deletion failed: ${error.message}` });
    return;
  }

  res.json({ ok: true });
});

export default router;
