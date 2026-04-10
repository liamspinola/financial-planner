'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { computeSummary, groupTranchsByDebt } = require('../engine/calculator');
const { simulate } = require('../engine/amortisation');
const { recommend } = require('../engine/strategy');
const { buildGuide } = require('../engine/guide');

// POST /api/plan — calculate and return full payoff plan
router.post('/', (req, res) => {
  const db = getDb();

  const debts     = db.prepare('SELECT * FROM debts').all();
  const tranches  = db.prepare('SELECT * FROM tranches').all();
  const income    = db.prepare('SELECT * FROM income_sources').all();
  const expenses  = db.prepare('SELECT * FROM expenses').all();
  const windfalls = db.prepare('SELECT * FROM windfalls ORDER BY apply_month ASC').all();

  if (debts.length === 0) return res.status(400).json({ error: 'No debts entered' });
  if (income.length === 0) return res.status(400).json({ error: 'No income entered' });

  const summary = computeSummary(income, expenses, debts, tranches);

  if (summary.hasDeficit) {
    return res.status(422).json({
      error: 'deficit',
      message: `Your monthly surplus after expenses and minimum debt payments is -£${Math.abs(summary.availableForDebt).toFixed(2)}. Reduce expenses or increase income before generating a plan.`,
      summary,
    });
  }

  // Emergency fund: compute how many months to redirect extra payments to savings
  const settings = db.prepare('SELECT key, value FROM settings').all();
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, Number(s.value)]));
  const efTarget  = settingsMap.emergency_fund_target  || 0;
  const efCurrent = settingsMap.emergency_fund_current || 0;
  const efNeeded  = Math.max(0, efTarget - efCurrent);
  const fundingDelay = (summary.availableForDebt > 0 && efNeeded > 0)
    ? Math.ceil(efNeeded / summary.availableForDebt)
    : 0;

  const debtMap = groupTranchsByDebt(debts, tranches);
  const startDate = new Date();

  const avalanche = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay);
  const snowball  = simulate(debtMap, summary.availableForDebt, 'snowball',  startDate, windfalls, fundingDelay);
  const { recommended, reason, interestSaved, monthsSaved } = recommend(avalanche, snowball);

  const winning = recommended === 'avalanche' ? avalanche : snowball;
  const guide = buildGuide(winning.monthlyStates, debtMap, summary);

  // Build chart data: one data point per month, one series per debt
  const debtIds = [...debtMap.keys()];
  const debtNames = Object.fromEntries([...debtMap.entries()].map(([id, g]) => [id, g.debtName]));
  const chartData = winning.monthlyStates.map(state => {
    const point = { month: state.month, date: state.date };
    for (const id of debtIds) {
      point[`debt_${id}`] = state.balances[id] || 0;
    }
    return point;
  });

  // Compute debt-free date
  const debtFreeDate = new Date(startDate);
  debtFreeDate.setMonth(debtFreeDate.getMonth() + winning.payoffMonths);
  const debtFreeDateStr = `${String(debtFreeDate.getMonth() + 1).padStart(2, '0')}/${debtFreeDate.getFullYear()}`;

  const altResult = recommended === 'avalanche' ? snowball : avalanche;
  const altDebtFreeDate = new Date(startDate);
  altDebtFreeDate.setMonth(altDebtFreeDate.getMonth() + altResult.payoffMonths);
  const altDateStr = `${String(altDebtFreeDate.getMonth() + 1).padStart(2, '0')}/${altDebtFreeDate.getFullYear()}`;

  const result = {
    summary,
    recommendation: {
      strategy: recommended,
      reason,
      interestSaved,
      monthsSaved,
    },
    comparison: {
      avalanche: {
        payoffMonths: avalanche.payoffMonths,
        totalInterest: avalanche.totalInterest,
        debtFreeDate: (() => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + avalanche.payoffMonths);
          return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        })(),
      },
      snowball: {
        payoffMonths: snowball.payoffMonths,
        totalInterest: snowball.totalInterest,
        debtFreeDate: (() => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + snowball.payoffMonths);
          return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        })(),
      },
    },
    debtNames,
    debtIds,
    chartData,
    guide,
    debtFreeDate: debtFreeDateStr,
    totalInterest: winning.totalInterest,
    payoffMonths: winning.payoffMonths,
    emergencyFund: efTarget > 0 ? {
      target:        efTarget,
      current:       efCurrent,
      needed:        efNeeded,
      fundingMonths: fundingDelay,
      fundCompleteDate: (() => {
        if (fundingDelay === 0) return null;
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + fundingDelay);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      })(),
    } : null,
  };

  // Cache the calculation result
  const crypto = require('crypto');
  const sortById = arr => arr.slice().sort((a, b) => a.id - b.id);
  const inputHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      debts: sortById(debts),
      tranches: sortById(tranches),
      income: sortById(income),
      expenses: sortById(expenses),
      windfalls: sortById(windfalls),
    }))
    .digest('hex');

  db.prepare(`
    INSERT OR REPLACE INTO plan_cache (id, input_hash, strategy, calc_result, generated_at, ai_mode)
    VALUES (1, ?, ?, ?, datetime('now'), 'A')
  `).run(inputHash, recommended, JSON.stringify(result));

  res.json(result);
});

// POST /api/plan/whatif — ephemeral scenario: what if I paid £X extra/month?
router.post('/whatif', (req, res) => {
  const db = getDb();
  const { extraMonthly } = req.body;

  if (typeof extraMonthly !== 'number' || !isFinite(extraMonthly) || extraMonthly < 0) {
    return res.status(400).json({ error: 'extraMonthly must be a non-negative number' });
  }

  const debts    = db.prepare('SELECT * FROM debts').all();
  const tranches = db.prepare('SELECT * FROM tranches').all();
  const income   = db.prepare('SELECT * FROM income_sources').all();
  const expenses = db.prepare('SELECT * FROM expenses').all();

  if (debts.length === 0) return res.status(400).json({ error: 'No debts entered' });
  if (income.length === 0) return res.status(400).json({ error: 'No income entered' });

  const summary = computeSummary(income, expenses, debts, tranches);
  if (summary.hasDeficit) return res.status(422).json({ error: 'deficit' });

  const debtMap   = groupTranchsByDebt(debts, tranches);
  const startDate = new Date();

  const baseline = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate);
  const scenario = simulate(debtMap, summary.availableForDebt + extraMonthly, 'avalanche', startDate);

  const scenarioDate = new Date(startDate);
  scenarioDate.setMonth(scenarioDate.getMonth() + scenario.payoffMonths);

  res.json({
    baseline: {
      payoffMonths:  baseline.payoffMonths,
      totalInterest: baseline.totalInterest,
    },
    scenario: {
      payoffMonths:  scenario.payoffMonths,
      totalInterest: scenario.totalInterest,
      debtFreeDate:  `${String(scenarioDate.getMonth() + 1).padStart(2, '0')}/${scenarioDate.getFullYear()}`,
    },
    monthsSaved:   baseline.payoffMonths  - scenario.payoffMonths,
    interestSaved: baseline.totalInterest - scenario.totalInterest,
  });
});

// GET /api/plan/cached — return cached plan if available
router.get('/cached', (req, res) => {
  const db = getDb();
  const cached = db.prepare('SELECT * FROM plan_cache WHERE id = 1').get();
  if (!cached) return res.json(null);

  const result = JSON.parse(cached.calc_result);
  result.aiNarrative = cached.ai_narrative || null;
  result.aiBudgetTips = cached.ai_budget_tips || null;
  result.aiMode = cached.ai_mode;
  result.generatedAt = cached.generated_at;
  res.json(result);
});

module.exports = router;
