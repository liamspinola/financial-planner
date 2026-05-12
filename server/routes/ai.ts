import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { callClaude } from '../lib/claude';
import { toEngineDebt, toEngineTranche, toEngineIncome, toEngineExpense } from '../db/mappers';

const router = Router();
router.use(requireAuth);

function buildPrompt(data: {
  summary: Record<string, number>;
  debts: Array<{ name: string; minimum_payment: number }>;
  tranches: Array<{ debt_id: number; label: string; balance: number; apr: number; promo_end_date: string | null }>;
  income: unknown[];
  expenses: Array<{ amount: number; category: string; is_essential: boolean }>;
  recommendation: { strategy: string };
  comparison: Record<string, { debtFreeDate: string; totalInterest: number }>;
}, mode: string): string {
  const { summary, debts, tranches, recommendation, comparison, expenses } = data;

  const debtList = debts.map(d => {
    const dTranches = tranches.filter(t => t.debt_id === d.id);
    const trancheDesc = dTranches.map(t => {
      const aprPct = (t.apr * 100).toFixed(1);
      const promoNote = t.promo_end_date ? ` (0% promo until ${t.promo_end_date})` : '';
      return `${t.label}: £${t.balance.toFixed(0)} @ ${aprPct}% APR${promoNote}`;
    }).join(', ');
    return `- ${(d as any).name}: ${trancheDesc} | Min payment: £${d.minimum_payment}/month`;
  }).join('\n');

  const stratLabel = recommendation.strategy === 'avalanche' ? 'Avalanche (highest APR first)' : 'Snowball (lowest balance first)';
  const altLabel   = recommendation.strategy === 'avalanche' ? 'Snowball' : 'Avalanche';
  const winComp    = comparison[recommendation.strategy]!;
  const altComp    = comparison[recommendation.strategy === 'avalanche' ? 'snowball' : 'avalanche']!;

  let prompt = `You are an experienced UK financial adviser. Analyse this person's financial position and write a clear, encouraging payoff plan explanation.

FINANCIAL SUMMARY:
- Monthly take-home income: £${summary['totalIncome']!.toFixed(0)}
- Monthly essential expenses: £${summary['essentialExpenses']!.toFixed(0)}
- Monthly discretionary expenses: £${summary['discretionaryExpenses']!.toFixed(0)}
- Monthly surplus after expenses: £${summary['surplusAfterExpenses']!.toFixed(0)}
- Monthly surplus after all debt minimums: £${summary['availableForDebt']!.toFixed(0)}

DEBTS (${stratLabel} order recommended):
${debtList}

PAYOFF PROJECTION:
- Recommended strategy: ${stratLabel}
- Debt-free date: ${winComp.debtFreeDate}
- Total interest: £${winComp.totalInterest.toFixed(0)}
- Alternative (${altLabel}): debt-free ${altComp.debtFreeDate}, total interest £${altComp.totalInterest.toFixed(0)}`;

  if (mode === 'C') {
    const discMap: Record<string, number> = {};
    for (const e of expenses) {
      if (!e.is_essential) discMap[e.category] = (discMap[e.category] ?? 0) + e.amount;
    }
    const topDisc = Object.entries(discMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amt]) => `- ${cat}: £${(amt as number).toFixed(0)}/month`).join('\n');
    if (topDisc) prompt += `\n\nTOP DISCRETIONARY SPENDING:\n${topDisc}`;
    prompt += `\n\nWrite:\n1. A 3-paragraph plain-English explanation of the plan and why this strategy was chosen. Tone: experienced, direct, encouraging. No jargon. No bullet points in the paragraphs.\n2. A bullet list of 3-5 specific budget recommendations with exact £ amounts and their impact on payoff speed. Focus on highest-leverage cuts only. Format each as: "• [Category]: Cut from £X to £Y/month — saves £Z in interest / speeds up payoff by N months"`;
  } else {
    prompt += `\n\nWrite a 3-paragraph plain-English explanation of this payoff plan and why this strategy was recommended. Tone: experienced, direct, encouraging. No jargon.`;
  }

  return prompt;
}

function parseResponse(text: string, mode: string): { narrative: string; budgetTips: string | null } {
  if (mode !== 'C') return { narrative: text.trim(), budgetTips: null };
  const bulletStart = text.search(/\n[•\-\*] /);
  if (bulletStart === -1) return { narrative: text.trim(), budgetTips: null };
  return { narrative: text.slice(0, bulletStart).trim(), budgetTips: text.slice(bulletStart).trim() };
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { mode = 'C' } = req.body as { mode?: string };
  if (!['A', 'B', 'C'].includes(mode)) { res.status(400).json({ error: 'Invalid mode — must be A, B, or C' }); return; }
  if (mode === 'A') { res.json({ narrative: null, budgetTips: null, cached: false }); return; }

  const userId = req.auth!.userId;

  const [debts, tranches, income, expenses] = await Promise.all([
    db.select().from(schema.debts).where(eq(schema.debts.userId, userId)),
    db.select().from(schema.tranches).where(eq(schema.tranches.userId, userId)),
    db.select().from(schema.incomeSources).where(eq(schema.incomeSources.userId, userId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.userId, userId)),
  ]);

  if (debts.length === 0) { res.status(400).json({ error: 'No data to analyse' }); return; }

  const [cached] = await db.select().from(schema.planCache).where(eq(schema.planCache.userId, userId));
  if (!cached) { res.status(400).json({ error: 'Generate the plan first before requesting AI analysis' }); return; }

  const planResult = JSON.parse(cached.calcResult);
  const engineDebts    = debts.map(toEngineDebt);
  const engineTranches = tranches.map(toEngineTranche);
  const engineIncome   = income.map(toEngineIncome);
  const engineExpenses = expenses.map(toEngineExpense);

  const prompt = buildPrompt({
    summary:        planResult.summary,
    debts:          engineDebts,
    tranches:       engineTranches,
    income:         engineIncome,
    expenses:       engineExpenses,
    recommendation: planResult.recommendation ?? { strategy: planResult.recommended },
    comparison:     planResult.comparison ?? { avalanche: planResult.avalanche, snowball: planResult.snowball },
  }, mode);

  let stdout: string;
  try {
    stdout = await callClaude(prompt, 180000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'Claude is unavailable: ' + msg });
    return;
  }

  const { narrative, budgetTips } = parseResponse(stdout, mode);
  await db.update(schema.planCache).set({ aiNarrative: narrative, aiBudgetTips: budgetTips ?? null, aiMode: mode }).where(eq(schema.planCache.userId, userId));
  res.json({ narrative, budgetTips, cached: false });
});

export default router;
