'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { computeSummary, groupTranchsByDebt } = require('../engine/calculator');
const { simulate } = require('../engine/amortisation');
const { recommend } = require('../engine/strategy');
const { buildGuide } = require('../engine/guide');

// Helper: format a debt-free date string from months offset
function formatDebtFreeDate(startDate, months) {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

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

  // Compute debt-free dates using helper
  const debtFreeDateStr = formatDebtFreeDate(startDate, winning.payoffMonths);
  const altResult = recommended === 'avalanche' ? snowball : avalanche;
  const altDateStr = formatDebtFreeDate(startDate, altResult.payoffMonths);

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
        debtFreeDate: formatDebtFreeDate(startDate, avalanche.payoffMonths),
      },
      snowball: {
        payoffMonths: snowball.payoffMonths,
        totalInterest: snowball.totalInterest,
        debtFreeDate: formatDebtFreeDate(startDate, snowball.payoffMonths),
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
      fundCompleteDate: fundingDelay > 0 ? formatDebtFreeDate(startDate, fundingDelay) : null,
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

  res.json({
    baseline: {
      payoffMonths:  baseline.payoffMonths,
      totalInterest: baseline.totalInterest,
    },
    scenario: {
      payoffMonths:  scenario.payoffMonths,
      totalInterest: scenario.totalInterest,
      debtFreeDate:  formatDebtFreeDate(startDate, scenario.payoffMonths),
    },
    monthsSaved:   baseline.payoffMonths  - scenario.payoffMonths,
    interestSaved: baseline.totalInterest - scenario.totalInterest,
  });
});

// POST /api/plan/lumpsum — ephemeral: where should I put a lump sum to pay off debt fastest?
router.post('/lumpsum', (req, res) => {
  const db = getDb();
  let { amount, applyMonth } = req.body;

  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (applyMonth == null) applyMonth = 1;
  if (!Number.isInteger(applyMonth) || applyMonth < 1) {
    return res.status(400).json({ error: 'applyMonth must be a positive integer' });
  }

  const debts     = db.prepare('SELECT * FROM debts').all();
  const tranches  = db.prepare('SELECT * FROM tranches').all();
  const income    = db.prepare('SELECT * FROM income_sources').all();
  const expenses  = db.prepare('SELECT * FROM expenses').all();
  const windfalls = db.prepare('SELECT * FROM windfalls ORDER BY apply_month ASC').all();

  if (debts.length === 0) return res.status(400).json({ error: 'No debts entered' });
  if (income.length === 0) return res.status(400).json({ error: 'No income entered' });

  const summary = computeSummary(income, expenses, debts, tranches);
  if (summary.hasDeficit) return res.status(422).json({ error: 'deficit' });

  const settings = db.prepare('SELECT key, value FROM settings').all();
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, Number(s.value)]));
  const efTarget  = settingsMap.emergency_fund_target  || 0;
  const efCurrent = settingsMap.emergency_fund_current || 0;
  const efNeeded  = Math.max(0, efTarget - efCurrent);
  const fundingDelay = (summary.availableForDebt > 0 && efNeeded > 0)
    ? Math.ceil(efNeeded / summary.availableForDebt)
    : 0;

  const debtMap   = groupTranchsByDebt(debts, tranches);
  const startDate = new Date();

  // Baseline simulation (no lump sum)
  const baseline = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay);
  const baselineDateStr = formatDebtFreeDate(startDate, baseline.payoffMonths);

  // Use projected debt balances at applyMonth-1 so targets reflect which debts are still active then.
  // monthlyStates[i].balances = {[debtId]: totalBalance} after processing month i+1.
  // stateIdx = applyMonth-2 gives the state after month applyMonth-1 (just before lump sum arrives).
  const stateIdx = applyMonth - 2;
  const projectedBals = stateIdx >= 0 && baseline.monthlyStates[stateIdx]
    ? baseline.monthlyStates[stateIdx].balances
    : null;

  function balAtApply(id, g) {
    if (projectedBals && projectedBals[id] !== undefined) return projectedBals[id];
    return g.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0);
  }

  // Identify strategy targets using projected balances at applyMonth
  let avalancheTargetId = null, highestApr = -1;
  for (const [id, g] of debtMap) {
    if (balAtApply(id, g) > 0) {
      for (const t of g.tranches) {
        if (t.apr > highestApr) { highestApr = t.apr; avalancheTargetId = id; }
      }
    }
  }

  let snowballTargetId = null, smallestBalance = Infinity;
  for (const [id, g] of debtMap) {
    const bal = balAtApply(id, g);
    if (bal > 0 && bal < smallestBalance) { smallestBalance = bal; snowballTargetId = id; }
  }

  const options = [];

  // Option 1: Avalanche — apply to highest-APR debt
  if (avalancheTargetId !== null) {
    const avSim = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate,
      [...windfalls, { apply_month: applyMonth, amount }], fundingDelay);
    const avGroup = debtMap.get(avalancheTargetId);
    options.push({
      id: 'avalanche',
      name: 'Highest Rate First',
      targetDebtId: avalancheTargetId,
      targetDebtName: avGroup.debtName,
      targetApr: highestApr,
      payoffMonths: avSim.payoffMonths,
      totalInterest: avSim.totalInterest,
      monthsSaved: Math.max(0, baseline.payoffMonths - avSim.payoffMonths),
      interestSaved: Math.max(0, baseline.totalInterest - avSim.totalInterest),
      debtFreeDate: formatDebtFreeDate(startDate, avSim.payoffMonths),
      recommended: false,
      reasoning: 'Attacking your highest-interest debt first reduces the total interest you pay.',
    });
  }

  // Option 2: Snowball — apply to smallest-balance debt (only if different from avalanche target)
  if (snowballTargetId !== null && snowballTargetId !== avalancheTargetId) {
    const sbSim = simulate(debtMap, summary.availableForDebt, 'snowball', startDate,
      [...windfalls, { apply_month: applyMonth, amount }], fundingDelay);
    const sbGroup = debtMap.get(snowballTargetId);
    options.push({
      id: 'snowball',
      name: 'Smallest Debt First',
      targetDebtId: snowballTargetId,
      targetDebtName: sbGroup.debtName,
      targetApr: sbGroup.tranches.length > 0 ? Math.max(...sbGroup.tranches.map(t => t.apr)) : 0,
      payoffMonths: sbSim.payoffMonths,
      totalInterest: sbSim.totalInterest,
      monthsSaved: Math.max(0, baseline.payoffMonths - sbSim.payoffMonths),
      interestSaved: Math.max(0, baseline.totalInterest - sbSim.totalInterest),
      debtFreeDate: formatDebtFreeDate(startDate, sbSim.payoffMonths),
      recommended: false,
      reasoning: 'Clearing a smaller debt first frees its minimum payment for immediate snowball rollover.',
    });
  }

  // Option 3: Clear & Continue — only if amount covers smallest projected debt and ≥2 debts still active
  const sortedByBalance = [...debtMap.entries()]
    .map(([id, g]) => ({ id, name: g.debtName, balance: balAtApply(id, g) }))
    .filter(e => e.balance > 0)
    .sort((a, b) => a.balance - b.balance);

  if (sortedByBalance.length > 1 && amount >= sortedByBalance[0].balance) {

    // Compute which debts would be cleared using projected balances at applyMonth
    let remaining = amount;
    const cleared = [];
    let remainderTarget = null;

    for (const entry of sortedByBalance) {
      if (remaining <= 0) break;
      if (entry.balance <= remaining) {
        cleared.push({ debtId: entry.id, debtName: entry.name, amount: entry.balance });
        remaining -= entry.balance;
      } else {
        remainderTarget = { debtId: entry.id, debtName: entry.name };
        remaining = 0;
        break;
      }
    }

    if (cleared.length > 0) {
      const ccSim = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate,
        [...windfalls, { apply_month: applyMonth, amount }], fundingDelay);

      const clearedNames = cleared.map(c => c.debtName);
      options.push({
        id: 'clearAndContinue',
        name: 'Clear & Continue',
        targetDebtId: null,
        targetDebtName: null,
        targetApr: null,
        payoffMonths: ccSim.payoffMonths,
        totalInterest: ccSim.totalInterest,
        monthsSaved: Math.max(0, baseline.payoffMonths - ccSim.payoffMonths),
        interestSaved: Math.max(0, baseline.totalInterest - ccSim.totalInterest),
        debtFreeDate: formatDebtFreeDate(startDate, ccSim.payoffMonths),
        recommended: false,
        reasoning: `Eliminating ${clearedNames.length === 1 ? 'a debt' : 'multiple debts'} completely frees up their minimum payments immediately.`,
        clearDetail: {
          cleared,
          remainderTarget,
        },
      });
    }
  }

  // Pick winner: most monthsSaved, tiebreak interestSaved
  const winner = options.reduce((best, opt) => {
    if (!best) return opt;
    if (opt.monthsSaved > best.monthsSaved) return opt;
    if (opt.monthsSaved === best.monthsSaved && opt.interestSaved > best.interestSaved) return opt;
    return best;
  }, null);

  options.forEach(opt => { opt.recommended = winner ? opt.id === winner.id : false; });

  res.json({
    amount,
    applyMonth,
    baseline: {
      payoffMonths: baseline.payoffMonths,
      totalInterest: baseline.totalInterest,
      debtFreeDate: baselineDateStr,
    },
    options,
    winner: winner ? winner.id : null,
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
