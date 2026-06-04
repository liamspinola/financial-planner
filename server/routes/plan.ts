import { Router, type Request, type Response } from 'express';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { toEngineDebt, toEngineTranche, toEngineIncome, toEngineExpense, toEngineWindfall, toEngineExpEvent } from '../db/mappers';
import { WhatIfSchema, LumpSumSchema } from '../../shared/types/api';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { computeSummary, groupTranchsByDebt } = require('../engine/calculator') as typeof import('../engine/calculator');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { simulate } = require('../engine/amortisation') as typeof import('../engine/amortisation');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recommend } = require('../engine/strategy') as typeof import('../engine/strategy');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildGuide } = require('../engine/guide') as typeof import('../engine/guide');

const router = Router();
router.use(requireAuth);

async function fetchPlanData(userId: string) {
  const [debts, tranches, income, expenses, windfalls, expenseEvents, settingsRows] = await Promise.all([
    db.select().from(schema.debts).where(eq(schema.debts.userId, userId)),
    db.select().from(schema.tranches).where(eq(schema.tranches.userId, userId)),
    db.select().from(schema.incomeSources).where(eq(schema.incomeSources.userId, userId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.userId, userId)),
    db.select().from(schema.windfalls).where(eq(schema.windfalls.userId, userId)).orderBy(asc(schema.windfalls.applyMonth)),
    db.select().from(schema.expenseEvents).where(eq(schema.expenseEvents.userId, userId)).orderBy(asc(schema.expenseEvents.applyMonth)),
    db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.userId, userId)),
  ]);
  return {
    engineDebts:     debts.map(toEngineDebt),
    engineTranches:  tranches.map(toEngineTranche),
    engineIncome:    income.map(toEngineIncome),
    engineExpenses:  expenses.map(toEngineExpense),
    engineWindfalls: windfalls.map(toEngineWindfall),
    engineExpEvents: expenseEvents.map(toEngineExpEvent),
    settings: Object.fromEntries(settingsRows.map(r => [r.key, r.value])),
  };
}

function formatDebtFreeDate(startDate: Date, months: number): string {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// GET /plan/cached must be before /:anything
router.get('/cached', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const [cached] = await db.select().from(schema.planCache).where(eq(schema.planCache.userId, userId));
  if (!cached) { res.json(null); return; }
  const result = JSON.parse(cached.calcResult);
  result.aiNarrative  = cached.aiNarrative  ?? null;
  result.aiBudgetTips = cached.aiBudgetTips ?? null;
  result.aiMode       = cached.aiMode;
  result.generatedAt  = cached.generatedAt;
  res.json(result);
});

router.get('/whatif', async (req: Request, res: Response): Promise<void> => {
  const parsed = WhatIfSchema.safeParse({ extraMonthly: Number(req.query['extraMonthly']) });
  if (!parsed.success || isNaN(Number(req.query['extraMonthly']))) {
    res.status(400).json({ error: 'extraMonthly must be a non-negative integer in pence' });
    return;
  }
  const userId = req.auth!.userId;
  const data = await fetchPlanData(userId);
  if (data.engineDebts.length === 0) { res.json({ empty: true }); return; }
  const summary  = computeSummary(data.engineIncome, data.engineExpenses, data.engineDebts, data.engineTranches);
  const debtMap  = groupTranchsByDebt(data.engineDebts, data.engineTranches);
  const extra    = parsed.data.extraMonthly;
  const startDate = new Date();
  const fundingDelay = Number(data.settings['fundingDelay'] ?? 0) || 0;
  const [avalanche, snowball] = await Promise.all([
    simulate(debtMap, summary.availableForDebt + extra, 'avalanche', startDate, data.engineWindfalls, fundingDelay, data.engineExpEvents),
    simulate(debtMap, summary.availableForDebt + extra, 'snowball',  startDate, data.engineWindfalls, fundingDelay, data.engineExpEvents),
  ]);
  const { recommended } = recommend(avalanche, snowball);
  res.json({ summary, avalanche, snowball, recommended, extraMonthly: extra });
});

router.get('/lumpsum', async (req: Request, res: Response): Promise<void> => {
  const parsed = LumpSumSchema.safeParse({
    amount: Number(req.query['amount']),
    applyMonth: req.query['applyMonth'] !== undefined ? Number(req.query['applyMonth']) : undefined,
  });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }); return; }
  const { amount, applyMonth } = parsed.data;
  const userId = req.auth!.userId;
  const data = await fetchPlanData(userId);
  if (data.engineDebts.length === 0) { res.json({ empty: true }); return; }
  const summary = computeSummary(data.engineIncome, data.engineExpenses, data.engineDebts, data.engineTranches);
  const debtMap = groupTranchsByDebt(data.engineDebts, data.engineTranches);
  const startDate = new Date();
  const fundingDelay = Number(data.settings['fundingDelay'] ?? 0) || 0;
  const baseline = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, data.engineWindfalls, fundingDelay, data.engineExpEvents);
  const withLump = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, [...data.engineWindfalls, { id: 0, amount, apply_month: applyMonth }], fundingDelay, data.engineExpEvents);
  res.json({
    amount, applyMonth,
    baseline: { payoffMonths: baseline.payoffMonths, totalInterest: baseline.totalInterest, debtFreeDate: formatDebtFreeDate(startDate, baseline.payoffMonths) },
    scenario: { payoffMonths: withLump.payoffMonths, totalInterest: withLump.totalInterest, debtFreeDate: formatDebtFreeDate(startDate, withLump.payoffMonths) },
    monthsSaved: Math.max(0, baseline.payoffMonths - withLump.payoffMonths),
    interestSaved: Math.max(0, baseline.totalInterest - withLump.totalInterest),
  });
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth!.userId;
  const data = await fetchPlanData(userId);
  if (data.engineDebts.length === 0) { res.json({ empty: true }); return; }
  const summary  = computeSummary(data.engineIncome, data.engineExpenses, data.engineDebts, data.engineTranches);
  const debtMap  = groupTranchsByDebt(data.engineDebts, data.engineTranches);
  const startDate = new Date();
  const fundingDelay = Number(data.settings['fundingDelay'] ?? 0) || 0;
  const [avalanche, snowball] = await Promise.all([
    simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, data.engineWindfalls, fundingDelay, data.engineExpEvents),
    simulate(debtMap, summary.availableForDebt, 'snowball',  startDate, data.engineWindfalls, fundingDelay, data.engineExpEvents),
  ]);
  const { recommended, reason, interestSaved, monthsSaved } = recommend(avalanche, snowball);
  const best  = recommended === 'avalanche' ? avalanche : snowball;
  const guide = buildGuide(best.monthlyStates, debtMap, summary);

  // Fields expected by Plan.jsx
  const debtIds = [...debtMap.keys()];
  const debtNames: Record<number, string> = {};
  for (const [id, group] of debtMap) debtNames[id] = group.debtName;

  const chartData = best.monthlyStates.map(state => {
    const point: Record<string, number | string> = { month: state.month, date: state.date };
    for (const id of debtIds) point[`debt_${id}`] = state.balances[id] ?? 0;
    return point;
  });

  const result = {
    summary,
    guide,
    generatedAt: new Date().toISOString(),
    payoffMonths: best.payoffMonths,
    debtFreeDate: formatDebtFreeDate(startDate, best.payoffMonths),
    totalInterest: best.totalInterest,
    recommendation: { strategy: recommended },
    comparison: {
      avalanche: { debtFreeDate: formatDebtFreeDate(startDate, avalanche.payoffMonths), totalInterest: avalanche.totalInterest },
      snowball:  { debtFreeDate: formatDebtFreeDate(startDate, snowball.payoffMonths),  totalInterest: snowball.totalInterest  },
    },
    chartData,
    debtIds,
    debtNames,
    // kept for backward compat (AI routes, cached plan reader)
    avalanche,
    snowball,
    recommended,
    reason,
    interestSaved,
    monthsSaved,
  };

  // Upsert plan cache
  const [existing] = await db.select({ id: schema.planCache.id }).from(schema.planCache).where(eq(schema.planCache.userId, userId));
  const cachePayload = { calcResult: JSON.stringify(result), strategy: recommended, inputHash: '', generatedAt: result.generatedAt, aiMode: 'A' as const };
  if (existing) {
    await db.update(schema.planCache).set(cachePayload).where(eq(schema.planCache.id, existing.id));
  } else {
    await db.insert(schema.planCache).values({ userId, ...cachePayload });
  }
  res.json(result);
});

export default router;
