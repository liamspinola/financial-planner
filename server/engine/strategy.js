'use strict';

/**
 * Count how many debts are fully cleared within the first N months.
 */
function debtsCleared(monthlyStates, withinMonths) {
  let count = 0;
  for (const state of monthlyStates.slice(0, withinMonths)) {
    count += state.debtsCleared.length;
  }
  return count;
}

/**
 * Compare avalanche vs snowball results and recommend one.
 *
 * @param {Object} avalanche - { totalInterest, payoffMonths, monthlyStates }
 * @param {Object} snowball  - { totalInterest, payoffMonths, monthlyStates }
 * @returns {Object} { recommended, reason, interestSaved, monthsSaved }
 */
function recommend(avalanche, snowball) {
  const interestSaved = snowball.totalInterest - avalanche.totalInterest; // +ve = avalanche saves money
  const monthsSaved   = snowball.payoffMonths  - avalanche.payoffMonths;  // +ve = avalanche is faster
  const quickWinsSnow = debtsCleared(snowball.monthlyStates, 6);
  const quickWinsAval = debtsCleared(avalanche.monthlyStates, 6);
  const extraQuickWins = quickWinsSnow - quickWinsAval;

  let recommended;
  let reason;

  if (interestSaved >= 500 || monthsSaved >= 3) {
    recommended = 'avalanche';
    const parts = [];
    if (interestSaved >= 500) parts.push(`saving £${interestSaved.toFixed(0)} in interest`);
    if (monthsSaved >= 3) parts.push(`${monthsSaved} months sooner`);
    reason = `Avalanche is the clear winner here — it pays off your debt ${parts.join(' and ')}.`;
  } else if (interestSaved < 200 && extraQuickWins >= 1) {
    recommended = 'snowball';
    reason = `The difference in total interest is small (£${Math.abs(interestSaved).toFixed(0)}), but Snowball clears ${extraQuickWins} debt${extraQuickWins > 1 ? 's' : ''} faster — those early wins tend to keep people on track.`;
  } else {
    recommended = 'avalanche';
    reason = `Avalanche saves £${interestSaved.toFixed(0)} in interest. Both strategies are close, so we default to the mathematically optimal choice.`;
  }

  return { recommended, reason, interestSaved, monthsSaved };
}

module.exports = { recommend };
