'use strict';

const { toMonthly, computeSummary, groupTranchsByDebt } = require('../calculator');
const { simulate } = require('../amortisation');
const { recommend } = require('../strategy');

// ---------------------------------------------------------------------------
// toMonthly
// ---------------------------------------------------------------------------
describe('toMonthly', () => {
  test('monthly passes through unchanged', () => {
    expect(toMonthly(1000, 'monthly')).toBe(1000);
  });

  test('weekly: 52 weeks / 12', () => {
    expect(toMonthly(100, 'weekly')).toBeCloseTo((100 * 52) / 12, 5);
  });

  test('fortnightly: 26 periods / 12', () => {
    expect(toMonthly(200, 'fortnightly')).toBeCloseTo((200 * 26) / 12, 5);
  });

  test('four_weekly: 13 periods/year', () => {
    expect(toMonthly(100, 'four_weekly')).toBe(1300);
  });

  test('annual: divide by 12', () => {
    expect(toMonthly(12000, 'annual')).toBeCloseTo(1000, 5);
  });
});

// ---------------------------------------------------------------------------
// computeSummary
// ---------------------------------------------------------------------------
describe('computeSummary', () => {
  const income = [{ monthly_equivalent: 2000 }, { monthly_equivalent: 500 }];
  const expenses = [
    { amount: 800, is_essential: 1 },
    { amount: 200, is_essential: 0 },
  ];
  const debts = [{ id: 1, minimum_payment: 100 }];

  test('calculates surplus correctly', () => {
    const s = computeSummary(income, expenses, debts, []);
    expect(s.totalIncome).toBe(2500);
    expect(s.totalExpenses).toBe(1000);
    expect(s.surplusAfterExpenses).toBe(1500);
    expect(s.availableForDebt).toBe(1400); // 1500 - 100 minimum
    expect(s.hasDeficit).toBe(false);
  });

  test('detects deficit', () => {
    const highExpenses = [{ amount: 2600, is_essential: 1 }];
    const s = computeSummary(income, highExpenses, debts, []);
    expect(s.hasDeficit).toBe(true);
    expect(s.availableForDebt).toBeLessThan(0);
  });

  test('uses tranche interest as minimum when minimum_payment = 0', () => {
    const noMinDebts = [{ id: 1, minimum_payment: 0 }];
    const tranches = [{ debt_id: 1, balance: 1200, apr: 0.12 }]; // 1% per month = £12
    const s = computeSummary(income, expenses, noMinDebts, tranches);
    expect(s.totalMinimums).toBeCloseTo(12, 2);
  });
});

// ---------------------------------------------------------------------------
// simulate — avalanche vs snowball
// ---------------------------------------------------------------------------
describe('simulate: avalanche vs snowball', () => {
  // Two debts: high-APR large balance vs low-APR small balance.
  // Avalanche targets the high-APR large debt first → less total interest.
  // Snowball targets the small-balance low-APR debt first → more total interest.
  const debts = [
    { id: 1, name: 'High APR Card', minimum_payment: 50 },
    { id: 2, name: 'Low APR Loan',  minimum_payment: 20 },
  ];
  const tranches = [
    { id: 10, debt_id: 1, label: 'Balance', balance: 4000, apr: 0.25, promo_end_date: null, post_promo_apr: null },
    { id: 20, debt_id: 2, label: 'Balance', balance: 500,  apr: 0.05, promo_end_date: null, post_promo_apr: null },
  ];
  const debtMap = groupTranchsByDebt(debts, tranches);
  const available = 200; // extra payment above minimums
  const startDate = new Date('2025-01-01');

  test('avalanche pays less total interest than snowball', () => {
    const av = simulate(debtMap, available, 'avalanche', startDate);
    const sw = simulate(debtMap, available, 'snowball', startDate);
    expect(av.totalInterest).toBeLessThan(sw.totalInterest);
  });

  test('both strategies eventually reach zero balance', () => {
    const av = simulate(debtMap, available, 'avalanche', startDate);
    expect(av.payoffMonths).toBeLessThan(360);
  });

  test('monthlyStates snapshots all debt balances', () => {
    const av = simulate(debtMap, available, 'avalanche', startDate);
    const firstState = av.monthlyStates[0];
    expect(firstState).toHaveProperty('balances');
    expect(firstState).toHaveProperty('payments');
    expect(firstState.month).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// simulate — promo APR conversion
// ---------------------------------------------------------------------------
describe('simulate: promo APR conversion', () => {
  test('converts to post_promo_apr when promo_end_date is reached', () => {
    const debts = [{ id: 1, name: 'Promo Card', minimum_payment: 50 }];
    // Promo ends after month 1 (set end date to next month)
    const promoEnd = new Date('2025-01-01');
    promoEnd.setMonth(promoEnd.getMonth() + 1);
    const promoEndStr = promoEnd.toISOString().slice(0, 10);

    const tranches = [{
      id: 1, debt_id: 1, label: 'Promo', balance: 2000,
      apr: 0.0, promo_end_date: promoEndStr, post_promo_apr: 0.20,
    }];
    const debtMap = groupTranchsByDebt(debts, tranches);

    const av = simulate(debtMap, 100, 'avalanche', new Date('2025-01-01'));

    // Month 1: APR = 0%, so interest should be 0
    expect(av.monthlyStates[0].totalInterestThisMonth).toBeCloseTo(0, 2);
    // Month 2+: APR = 20% → non-zero interest
    expect(av.monthlyStates[1].totalInterestThisMonth).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// simulate — snowball freed-minimum rollover
// ---------------------------------------------------------------------------
describe('simulate: snowball freed-minimum rollover', () => {
  test('freed minimums accelerate payoff of remaining debt', () => {
    // Debt A: small balance, clears quickly
    // Debt B: large balance, benefits from A's freed minimum
    const debts = [
      { id: 1, name: 'Small Debt', minimum_payment: 50 },
      { id: 2, name: 'Large Debt', minimum_payment: 100 },
    ];
    const tranches = [
      { id: 1, debt_id: 1, label: 'B', balance: 300,  apr: 0.10, promo_end_date: null, post_promo_apr: null },
      { id: 2, debt_id: 2, label: 'B', balance: 5000, apr: 0.10, promo_end_date: null, post_promo_apr: null },
    ];
    const debtMap = groupTranchsByDebt(debts, tranches);

    const sw = simulate(debtMap, 50, 'snowball', new Date('2025-01-01'));

    // Debt 1 should clear (appear in debtsCleared)
    const clearEvent = sw.monthlyStates.find(s => s.debtsCleared.some(d => d.debtId === 1));
    expect(clearEvent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// recommend
// ---------------------------------------------------------------------------
describe('recommend', () => {
  test('recommends avalanche when interest saved >= £500', () => {
    const av = { totalInterest: 1000, payoffMonths: 24, monthlyStates: [] };
    const sw = { totalInterest: 1600, payoffMonths: 26, monthlyStates: [] };
    const result = recommend(av, sw);
    expect(result.recommended).toBe('avalanche');
    expect(result.interestSaved).toBe(600);
  });

  test('recommends snowball when interest diff is small and snowball has quick wins', () => {
    // Pad monthlyStates with 6 months, each with a cleared debt for snowball
    const mkStates = (cleared) => Array.from({ length: 6 }, (_, i) => ({
      debtsCleared: i === 1 && cleared ? [{ debtId: 99 }] : [],
    }));
    const av = { totalInterest: 1000, payoffMonths: 20, monthlyStates: mkStates(false) };
    const sw = { totalInterest: 1050, payoffMonths: 21, monthlyStates: mkStates(true) };
    const result = recommend(av, sw);
    expect(result.recommended).toBe('snowball');
  });

  test('defaults to avalanche when differences are minimal', () => {
    const av = { totalInterest: 1000, payoffMonths: 20, monthlyStates: [] };
    const sw = { totalInterest: 1010, payoffMonths: 20, monthlyStates: [] };
    const result = recommend(av, sw);
    expect(result.recommended).toBe('avalanche');
  });
});
