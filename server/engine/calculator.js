'use strict';

/**
 * Normalise an income amount to monthly equivalent.
 * Uses precise multipliers to avoid 13th-month errors.
 */
function toMonthly(amount, frequency) {
  switch (frequency) {
    case 'weekly':      return (amount * 52) / 12;
    case 'fortnightly': return (amount * 26) / 12;
    case 'four_weekly': return amount * 13;       // 4-weekly = 13 periods/year
    case 'annual':      return amount / 12;
    case 'monthly':
    default:            return amount;
  }
}

/**
 * For a debt with no stated minimum payment, use the first month's interest
 * across all its tranches as the effective minimum (break-even payment).
 */
function effectiveMinimumFromTranches(tranches) {
  return tranches.reduce((sum, t) => sum + t.balance * (t.apr / 12), 0);
}

/**
 * Compute the monthly financial summary from raw DB rows.
 *
 * @param {Array} incomeSources - rows from income_sources table
 * @param {Array} expenses      - rows from expenses table
 * @param {Array} debts         - rows from debts table (each with .minimum_payment)
 * @param {Array} tranches      - rows from tranches table (used when minimum_payment = 0)
 * @returns {Object} summary
 */
function computeSummary(incomeSources, expenses, debts, tranches = []) {
  const totalIncome = incomeSources.reduce((sum, s) => sum + s.monthly_equivalent, 0);

  const essentialExpenses = expenses
    .filter(e => e.is_essential === 1)
    .reduce((sum, e) => sum + e.amount, 0);

  const discretionaryExpenses = expenses
    .filter(e => e.is_essential === 0)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = essentialExpenses + discretionaryExpenses;
  const surplusAfterExpenses = totalIncome - totalExpenses;

  const totalMinimums = debts.reduce((sum, d) => {
    if (d.min_payment_pct != null) {
      // Percentage-based minimum: MAX(floor, balance * pct) using current balances
      const debtTranches = tranches.filter(t => t.debt_id === d.id);
      const totalBalance = debtTranches.reduce((s, t) => s + t.balance, 0);
      const pctMin = totalBalance * d.min_payment_pct;
      return sum + Math.max(d.min_payment_floor || 0, pctMin);
    }
    if (d.minimum_payment > 0) return sum + d.minimum_payment;
    // No stated minimum — treat first month's interest as the floor
    const debtTranches = tranches.filter(t => t.debt_id === d.id);
    return sum + effectiveMinimumFromTranches(debtTranches);
  }, 0);
  const availableForDebt = surplusAfterExpenses - totalMinimums;

  return {
    totalIncome,
    essentialExpenses,
    discretionaryExpenses,
    totalExpenses,
    surplusAfterExpenses,
    totalMinimums,
    availableForDebt,
    hasDeficit: availableForDebt < 0,
  };
}

/**
 * Group tranches by debt_id, attaching a debtName and debtMinimum.
 * Returns a Map<debtId, { debtId, debtName, debtType, minimum, tranches[] }>
 */
function groupTranchsByDebt(debts, tranches) {
  const debtMap = new Map();
  for (const debt of debts) {
    debtMap.set(debt.id, {
      debtId: debt.id,
      debtName: debt.name,
      debtType: debt.debt_type,
      minimum: debt.minimum_payment,
      minPaymentPct:   debt.min_payment_pct   ?? null,
      minPaymentFloor: debt.min_payment_floor ?? null,
      tranches: [],
    });
  }
  for (const tranche of tranches) {
    const group = debtMap.get(tranche.debt_id);
    if (group) group.tranches.push({ ...tranche });
  }
  // Remove debts with no tranches
  for (const [id, group] of debtMap) {
    if (group.tranches.length === 0) debtMap.delete(id);
  }
  return debtMap;
}

module.exports = { toMonthly, computeSummary, groupTranchsByDebt, effectiveMinimumFromTranches };
