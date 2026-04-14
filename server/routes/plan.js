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

  // Deep-clone the debt map (mirrors cloneGroups in amortisation.js, which is not exported)
  function cloneDebtMap(map) {
    const clone = new Map();
    for (const [id, group] of map) {
      clone.set(id, { ...group, tranches: group.tranches.map(t => ({ ...t })) });
    }
    return clone;
  }

  // Apply lump sum to a specific debt's tranches, highest-APR first (FCA CONC 6.7)
  function applyLump(map, targetDebtId, lumpAmount) {
    const group = map.get(targetDebtId);
    if (!group) return;
    let remaining = lumpAmount;
    const sorted = [...group.tranches]
      .filter(t => t.balance > 0)
      .sort((a, b) => b.apr - a.apr);
    for (const t of sorted) {
      if (remaining <= 0) break;
      const original = group.tranches.find(x => x.id === t.id);
      const applied = Math.min(remaining, original.balance);
      original.balance -= applied;
      if (original.balance < 0.005) original.balance = 0;
      remaining -= applied;
    }
  }

  // Baseline simulation (no lump sum)
  const baseline = simulate(debtMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay);
  const baselineDate = new Date(startDate);
  baselineDate.setMonth(baselineDate.getMonth() + baseline.payoffMonths);
  const baselineDateStr = `${String(baselineDate.getMonth() + 1).padStart(2, '0')}/${baselineDate.getFullYear()}`;

  // Identify strategy targets from current debtMap
  let avalancheTargetId = null, highestApr = -1;
  for (const [id, g] of debtMap) {
    for (const t of g.tranches) {
      if (t.balance > 0 && t.apr > highestApr) { highestApr = t.apr; avalancheTargetId = id; }
    }
  }

  let snowballTargetId = null, smallestBalance = Infinity;
  for (const [id, g] of debtMap) {
    const total = g.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0);
    if (total > 0 && total < smallestBalance) { smallestBalance = total; snowballTargetId = id; }
  }

  // Helper: format a debt-free date string from months offset
  function debtFreeStr(months) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + months);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  const options = [];

  // Option 1: Avalanche — apply to highest-APR debt
  if (avalancheTargetId !== null) {
    const avMap = cloneDebtMap(debtMap);
    applyLump(avMap, avalancheTargetId, amount);
    const avSim = simulate(avMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay);
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
      debtFreeDate: debtFreeStr(avSim.payoffMonths),
      recommended: false,
      reasoning: 'Attacking your highest-interest debt first reduces the total interest you pay.',
    });
  }

  // Option 2: Snowball — apply to smallest-balance debt (only if different from avalanche target)
  if (snowballTargetId !== null && snowballTargetId !== avalancheTargetId) {
    const sbMap = cloneDebtMap(debtMap);
    applyLump(sbMap, snowballTargetId, amount);
    const sbSim = simulate(sbMap, summary.availableForDebt, 'snowball', startDate, windfalls, fundingDelay);
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
      debtFreeDate: debtFreeStr(sbSim.payoffMonths),
      recommended: false,
      reasoning: 'Clearing a smaller debt first frees its minimum payment for immediate snowball rollover.',
    });
  }

  // Option 3: Clear & Continue — only if amount covers at least the smallest debt and there are multiple debts
  if (amount >= smallestBalance && debtMap.size > 1) {
    const sortedByBalance = [...debtMap.entries()]
      .filter(([, g]) => g.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0) > 0)
      .map(([id, g]) => ({
        id,
        name: g.debtName,
        balance: g.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0),
      }))
      .sort((a, b) => a.balance - b.balance);

    const ccMap = cloneDebtMap(debtMap);
    let remaining = amount;
    const cleared = [];

    for (const entry of sortedByBalance) {
      if (remaining <= 0) break;
      if (entry.balance <= remaining) {
        ccMap.get(entry.id).tranches.forEach(t => { t.balance = 0; });
        cleared.push({ debtId: entry.id, debtName: entry.name, amount: entry.balance });
        remaining -= entry.balance;
      } else {
        applyLump(ccMap, entry.id, remaining);
        remaining = 0;
        break;
      }
    }

    // Apply any leftover remainder to the highest-APR debt still with a balance
    if (remaining > 0) {
      let maxApr = -1, remainderTargetId = null;
      for (const [id, g] of ccMap) {
        for (const t of g.tranches) {
          if (t.balance > 0 && t.apr > maxApr) { maxApr = t.apr; remainderTargetId = id; }
        }
      }
      if (remainderTargetId) applyLump(ccMap, remainderTargetId, remaining);
    }

    if (cleared.length > 0) {
      const ccSim = simulate(ccMap, summary.availableForDebt, 'avalanche', startDate, windfalls, fundingDelay);

      // Find where the remainder went (first debt with reduced-but-nonzero balance)
      let remainderTarget = null;
      for (const entry of sortedByBalance) {
        const orig = debtMap.get(entry.id);
        const after = ccMap.get(entry.id);
        const origBal = orig.tranches.reduce((s, t) => s + t.balance, 0);
        const afterBal = after.tranches.reduce((s, t) => s + t.balance, 0);
        if (afterBal > 0 && afterBal < origBal) {
          remainderTarget = { debtId: entry.id, debtName: entry.name };
          break;
        }
      }

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
        debtFreeDate: debtFreeStr(ccSim.payoffMonths),
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
