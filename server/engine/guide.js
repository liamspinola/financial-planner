'use strict';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatGbp(amount) {
  return `£${Math.round(amount / 100).toLocaleString('en-GB')}`;
}

/**
 * Build the step-by-step monthly action guide from simulation output.
 *
 * @param {Array}  monthlyStates   - from simulate()
 * @param {Map}    debtMap         - original debt groups (for promo data)
 * @param {Object} summary         - from computeSummary()
 * @returns {Array} guide entries
 */
function buildGuide(monthlyStates, debtMap, summary) {
  const totalMonths = monthlyStates.length;
  const halfwayMonth = Math.ceil(totalMonths / 2);
  const guide = [];

  // Build promo expiry lookup: { debtId: [{ trancheId, label, endDate, postApr }] }
  const promoMap = new Map();
  for (const [debtId, group] of debtMap) {
    const promos = group.tranches.filter(t => t.promo_end_date);
    if (promos.length > 0) promoMap.set(debtId, promos);
  }

  for (const state of monthlyStates) {
    const { month, date, payments, debtsCleared, balances, windfall, expenseHit, isFundingPhase, fundingSaving } = state;
    const entry = {
      month,
      dateLabel: formatDate(date),
      isoDate: date,
      actions: [],
      milestones: [],
      balances,
    };

    // Payment actions
    for (const p of payments) {
      entry.actions.push({
        debtId: p.debtId,
        debtName: p.debtName,
        amount: p.amount,
        formatted: formatGbp(p.amount),
        isTarget: p.isTarget,
        label: p.isTarget
          ? `Pay ${formatGbp(p.amount)} to ${p.debtName} — TARGET`
          : `Pay ${formatGbp(p.amount)} to ${p.debtName} (minimum)`,
      });
    }

    // Emergency fund phase: note the saving amount as an action
    if (isFundingPhase && fundingSaving > 0) {
      entry.actions.push({
        debtId: null,
        debtName: 'Emergency Fund',
        amount: fundingSaving,
        formatted: formatGbp(fundingSaving),
        isTarget: false,
        label: `Save ${formatGbp(fundingSaving)} toward emergency fund`,
      });
    }

    // Milestones: windfall applied
    if (windfall) {
      entry.milestones.push({
        type: 'windfall',
        amount: windfall,
        message: `Windfall of ${formatGbp(windfall)} applied to target debt this month`,
      });
    }

    // Milestones: expense hit
    if (expenseHit) {
      entry.milestones.push({
        type: 'expense_hit',
        amount: expenseHit,
        message: `Expense of ${formatGbp(expenseHit)} this month — extra debt payment reduced accordingly`,
      });
    }

    // Milestones: debt cleared
    for (const cleared of debtsCleared) {
      const nextTarget = payments.find(p => p.isTarget && p.debtId !== cleared.debtId);
      const msg = nextTarget
        ? `${cleared.debtName} PAID OFF — redirect payments to ${nextTarget.debtName} next month`
        : `${cleared.debtName} PAID OFF — you're debt free!`;
      entry.milestones.push({ type: 'paid_off', debtName: cleared.debtName, message: msg });
    }

    // Milestones: halfway
    if (month === halfwayMonth) {
      entry.milestones.push({
        type: 'halfway',
        message: `Halfway there! ${totalMonths - month} months to go.`,
      });
    }

    // Milestones: promo expiry warnings (60 days = ~2 months ahead)
    const futureDate = new Date(date + 'T00:00:00');
    futureDate.setMonth(futureDate.getMonth() + 2);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    for (const [debtId, promos] of promoMap) {
      for (const promo of promos) {
        if (promo.promo_end_date >= date && promo.promo_end_date <= futureDateStr) {
          const currentBalance = balances[debtId] || 0;
          if (currentBalance > 0) {
            entry.milestones.push({
              type: 'promo_warning',
              debtId,
              message: `⚠ Promo rate expires ${formatDate(promo.promo_end_date)} — ${formatGbp(currentBalance)} balance will move to ${(promo.post_promo_apr * 100).toFixed(1)}% APR`,
            });
          }
        }
      }
    }

    // Final payment
    if (month === totalMonths) {
      entry.milestones.push({ type: 'final', message: 'Final payment — you are debt free!' });
    }

    guide.push(entry);
  }

  return guide;
}

module.exports = { buildGuide };
