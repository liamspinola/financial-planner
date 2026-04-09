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

  const debts = db.prepare('SELECT * FROM debts').all();
  const tranches = db.prepare('SELECT * FROM tranches').all();
  const income = db.prepare('SELECT * FROM income_sources').all();
  const expenses = db.prepare('SELECT * FROM expenses').all();

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

  const debtMap = groupTranchsByDebt(debts, tranches);
  const startDate = new Date();

  const avalanche = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate);
  const snowball  = simulate(debtMap, summary.availableForDebt, 'snowball',  startDate);
  const { recommended, reason, interestSaved, monthsSaved } = recommend(avalanche, snowball);

  const winning = recommended === 'avalanche' ? avalanche : snowball;
  const guide = buildGuide(winning.monthlyStates, debtMap, summary);

  // Build chart data: one data point per month, one series per debt
  const debtIds = [...debtMap.keys()];
  const debtNames = Object.fromEntries([...debtMap.entries()].map(([id, g]) => [id, g.debtName]));
  const chartData = winning.monthlyStates.map(state => {
    const point = { month: state.month, date: state.isoDate };
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
  };

  // Cache the calculation result
  const crypto = require('crypto');
  const inputHash = crypto.createHash('sha256')
    .update(JSON.stringify({ debts, tranches, income, expenses }))
    .digest('hex');

  db.prepare(`
    INSERT OR REPLACE INTO plan_cache (id, input_hash, strategy, calc_result, generated_at, ai_mode)
    VALUES (1, ?, ?, ?, datetime('now'), 'A')
  `).run(inputHash, recommended, JSON.stringify(result));

  res.json(result);
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
