'use strict';

const MAX_MONTHS = 360; // 30-year safety cap

/**
 * Effective minimum for a group this month.
 * - Percentage-based: MAX(floor, currentBalance * pct)
 * - Fixed: stated minimum_payment
 * - Zero stated minimum: first month's interest across active tranches (break-even)
 */
function effectiveMin(group) {
  if (group.minPaymentPct != null) {
    const currentBalance = group.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0);
    const pctMin = currentBalance * group.minPaymentPct;
    return Math.max(group.minPaymentFloor || 0, pctMin);
  }
  if (group.minimum > 0) return group.minimum;
  return group.tranches.reduce((sum, t) => {
    if (t.balance <= 0) return sum;
    return sum + t.balance * (t.apr / 12);
  }, 0);
}

/**
 * Deep-clone the debt groups so simulations don't mutate each other.
 */
function cloneGroups(debtMap) {
  const clone = new Map();
  for (const [id, group] of debtMap) {
    clone.set(id, {
      ...group,
      tranches: group.tranches.map(t => ({ ...t })),
    });
  }
  return clone;
}

/**
 * Apply payment to an account's tranches following FCA CONC 6.7:
 * all payments (including minimum) go to highest-APR tranche first.
 *
 * @param {Array} tranches  - mutable array of tranche objects for one account
 * @param {number} payment  - total payment to apply (£)
 * @param {string} simMonth - ISO date string for promo expiry checks
 * @returns {number} total interest accrued this month across all tranches
 */
function applyPaymentToAccount(tranches, payment, simMonth) {
  // Accrue interest first (interest accrues before payment is applied)
  let totalInterest = 0;
  for (const t of tranches) {
    if (t.balance <= 0) continue;
    // Check promo expiry
    if (t.promo_end_date && simMonth >= t.promo_end_date && t.post_promo_apr != null) {
      t.apr = t.post_promo_apr;
      t.promo_end_date = null; // clear so we don't re-convert
    }
    const monthlyRate = t.apr / 12;
    const interest = t.balance * monthlyRate;
    t.balance += interest;
    totalInterest += interest;
  }

  // Sort tranches highest APR first for payment allocation (FCA rules)
  const sorted = [...tranches]
    .filter(t => t.balance > 0)
    .sort((a, b) => b.apr - a.apr);

  let remaining = payment;
  for (const t of sorted) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, t.balance);
    // Find and update the original tranche object
    const original = tranches.find(x => x.id === t.id);
    original.balance -= applied;
    if (original.balance < 0.005) original.balance = 0; // floating point cleanup
    remaining -= applied;
  }

  return totalInterest;
}

/**
 * Run a full month-by-month payoff simulation.
 *
 * @param {Map}    debtMap      - output of groupTranchsByDebt (will be cloned)
 * @param {number} available    - monthly amount available above all minimums (£)
 * @param {string} strategy     - 'avalanche' | 'snowball'
 * @param {Date}   startDate    - simulation start date
 * @param {Array}  [windfalls]  - optional [{ apply_month, amount }] lump sums
 * @param {number} [fundingDelay] - months to redirect extra payments to savings (emergency fund)
 * @returns {Object} { months, totalInterest, payoffMonths, monthlyStates }
 */
function simulate(debtMap, available, strategy, startDate, windfalls = [], fundingDelay = 0) {
  const groups = cloneGroups(debtMap);
  const monthlyStates = [];
  let totalInterest = 0;
  let payoffMonths = MAX_MONTHS;
  let freedMinimums = 0; // minimums freed as debts clear

  for (let m = 0; m < MAX_MONTHS; m++) {
    const simDate = new Date(startDate);
    simDate.setMonth(simDate.getMonth() + m);
    const simMonth = simDate.toISOString().slice(0, 10); // YYYY-MM-DD

    // Collect active groups
    const activeGroups = [...groups.values()].filter(g =>
      g.tranches.some(t => t.balance > 0)
    );

    if (activeGroups.length === 0) {
      payoffMonths = m;
      break;
    }

    // Add any windfalls scheduled for this month
    const windfall = windfalls
      .filter(w => w.apply_month === m + 1)
      .reduce((s, w) => s + w.amount, 0);

    // During emergency fund phase, redirect extra payments to savings (no extra on debts)
    const inFundingPhase = m < fundingDelay;

    // Extra payment this month = surplus above all effective minimums + any freed minimums + windfalls
    const monthlyExtra = inFundingPhase ? 0 : (available + freedMinimums + windfall);

    // Snapshot pre-payment balances BEFORE any interest accrual or payment application.
    // Used below to detect which debts clear THIS month — we can't rely on post-payment
    // balances because applyPaymentToAccount mutates the tranche objects in place.
    const prePaymentBalances = new Map();
    for (const g of activeGroups) {
      prePaymentBalances.set(g.debtId, g.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0));
    }

    // Determine the target tranche/account for the extra payment
    let targetGroup;
    if (strategy === 'avalanche') {
      // Highest APR tranche across all accounts
      let highestApr = -1;
      for (const g of activeGroups) {
        for (const t of g.tranches) {
          if (t.balance > 0 && t.apr > highestApr) {
            highestApr = t.apr;
            targetGroup = g;
          }
        }
      }
    } else {
      // Snowball: debt with smallest total remaining balance
      let smallest = Infinity;
      for (const g of activeGroups) {
        const total = g.tranches.reduce((s, t) => s + Math.max(0, t.balance), 0);
        if (total < smallest) {
          smallest = total;
          targetGroup = g;
        }
      }
    }

    const monthState = {
      month: m + 1,
      date: simMonth,
      payments: [],
      totalInterestThisMonth: 0,
      debtsCleared: [],
      windfall: windfall > 0 ? windfall : null,
      isFundingPhase: inFundingPhase,
      fundingSaving: inFundingPhase ? available : 0,
    };

    // Apply effective minimum payments to all non-target accounts.
    // effectiveMin() uses the current month's interest when stated minimum is 0,
    // so interest-only debts (no stated minimum) never silently grow.
    for (const g of activeGroups) {
      if (g === targetGroup) continue;
      const minPayment = effectiveMin(g);
      const interest = applyPaymentToAccount(g.tranches, minPayment, simMonth);
      totalInterest += interest;
      monthState.totalInterestThisMonth += interest;
      monthState.payments.push({
        debtId: g.debtId,
        debtName: g.debtName,
        amount: minPayment,
        isTarget: false,
      });
    }

    // Apply effective minimum + extra to target account
    if (targetGroup) {
      const targetPayment = effectiveMin(targetGroup) + monthlyExtra;
      const interest = applyPaymentToAccount(targetGroup.tranches, targetPayment, simMonth);
      totalInterest += interest;
      monthState.totalInterestThisMonth += interest;
      monthState.payments.push({
        debtId: targetGroup.debtId,
        debtName: targetGroup.debtName,
        amount: targetPayment,
        isTarget: true,
      });
    }

    // Detect newly cleared debts and free their minimums.
    // Use prePaymentBalances (snapshotted before payments) to determine whether
    // each debt was active at the START of this month — post-payment balances are
    // already zeroed by applyPaymentToAccount so can't be used for this check.
    for (const g of activeGroups) {
      const cleared = g.tranches.every(t => t.balance <= 0);
      if (cleared) {
        const hadBalance = (prePaymentBalances.get(g.debtId) || 0) > 0.005;
        if (hadBalance) {
          // Debt just cleared this month — free its minimum for the snowball rollover
          freedMinimums += g.minimum;
          monthState.debtsCleared.push({ debtId: g.debtId, debtName: g.debtName });
        }
        // Ensure all tranches are definitively zeroed
        g.tranches.forEach(t => { t.balance = 0; });
      }
    }

    // Snapshot balances
    monthState.balances = {};
    for (const g of groups.values()) {
      monthState.balances[g.debtId] = g.tranches.reduce((s, t) => s + t.balance, 0);
    }

    monthlyStates.push(monthState);
  }

  // Final payoff month if we hit the cap
  if (payoffMonths === MAX_MONTHS) {
    const stillActive = [...groups.values()].some(g => g.tranches.some(t => t.balance > 0));
    if (!stillActive) payoffMonths = monthlyStates.length;
  }

  return {
    totalInterest,
    payoffMonths,
    monthlyStates,
  };
}

module.exports = { simulate };
