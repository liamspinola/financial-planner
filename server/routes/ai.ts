import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { toEngineDebt, toEngineTranche, toEngineIncome } from '../db/mappers';
import { getProvider } from '../ai/router';
import type { FinancialContext } from '../../shared/types/ai';

const router = Router();
router.use(requireAuth);

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { mode = 'C' } = req.body as { mode?: string };
  if (!['A', 'B', 'C'].includes(mode)) {
    res.status(400).json({ error: 'Invalid mode — must be A, B, or C' });
    return;
  }

  // Mode A: return empty result immediately — no AI call needed.
  if (mode === 'A') {
    res.json({ narrative: null, budgetTips: null, cached: false });
    return;
  }

  const userId = req.auth!.userId;

  const [debts, tranches, income, expenses] = await Promise.all([
    db.select().from(schema.debts).where(eq(schema.debts.userId, userId)),
    db.select().from(schema.tranches).where(eq(schema.tranches.userId, userId)),
    db.select().from(schema.incomeSources).where(eq(schema.incomeSources.userId, userId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.userId, userId)),
  ]);

  if (debts.length === 0) {
    res.status(400).json({ error: 'No data to analyse' });
    return;
  }

  const [cached] = await db.select().from(schema.planCache).where(eq(schema.planCache.userId, userId));
  if (!cached) {
    res.status(400).json({ error: 'Generate the plan first before requesting AI analysis' });
    return;
  }

  const planResult = JSON.parse(cached.calcResult);

  // Resolve the provider before opening the SSE stream so we can return 502
  // cleanly if provider resolution fails (e.g. missing GEMINI_API_KEY).
  let provider;
  try {
    provider = await getProvider(userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'AI provider unavailable: ' + msg });
    return;
  }

  // Build FinancialContext — NO userId, email, or displayName.
  const engineDebts    = debts.map(toEngineDebt);
  const engineTranches = tranches.map(toEngineTranche);
  const engineIncome   = income.map(toEngineIncome);

  const totalIncomePence    = engineIncome.reduce((sum, i) => sum + i.monthly_equivalent, 0);
  const totalExpensesPence  = expenses.filter(e => e.isEssential).reduce((sum, e) => sum + e.amount, 0);

  const context: FinancialContext = {
    debts: engineDebts.map(d => ({
      id: d.id,
      name: d.name,
      debtType: d.debt_type,
      tranches: engineTranches
        .filter(t => t.debt_id === d.id)
        .map(t => ({
          label: t.label,
          balance: t.balance,
          apr: t.apr,
          promoEndDate: t.promo_end_date,
          postPromoApr: t.post_promo_apr,
        })),
    })),
    monthlyIncomePence:   totalIncomePence,
    monthlyExpensesPence: totalExpensesPence,
    strategy: (planResult.recommendation?.strategy ?? planResult.recommended) as 'avalanche' | 'snowball',
    debtFreeDateEstimate: (planResult.comparison?.avalanche ?? planResult.avalanche)?.debtFreeDate ?? '',
    totalInterestPence:   Math.round(((planResult.comparison?.avalanche ?? planResult.avalanche)?.totalInterest ?? 0) * 100),
    windfalls: [],
  };

  // The user message for the AI is a mode-aware summary request.
  const userMessage = mode === 'C'
    ? 'Please analyse my financial position and provide a payoff plan explanation with specific budget recommendations.'
    : 'Please analyse my financial position and provide a payoff plan explanation.';

  // Open SSE stream.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const token of provider.streamAnalysis(context, userMessage, [])) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // SSE headers already sent — send an error event instead of HTTP 5xx.
    res.write(`data: ${JSON.stringify({ error: 'AI provider error: ' + msg })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
