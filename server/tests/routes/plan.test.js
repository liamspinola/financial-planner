'use strict';

const { clearAll, seedDebt, seedIncome, seedExpense } = require('../helpers/db');

let request, db;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
});

beforeEach(() => clearAll(db));

/**
 * Seeds a minimal valid scenario:
 *   - 1 debt:    balance 1000, apr 0.20, minimum_payment 50
 *   - 1 income:  amount 2000, frequency 'monthly' → monthly_equivalent 2000
 *   - 1 expense: amount 800, category 'housing', is_essential 1
 *   - surplus = 2000 - 800 - 50 = 1150/month available for extra debt payoff
 */
function seedMinimalScenario() {
  seedDebt(db, { balance: 1000, apr: 0.20, minimum_payment: 50 });
  seedIncome(db, { amount: 2000, frequency: 'monthly' });
  seedExpense(db, { amount: 800, category: 'housing', is_essential: 1 });
}

// ---------------------------------------------------------------------------
// POST /api/plan — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/plan — happy paths', () => {
  it('returns 200 with expected top-level fields for a valid scenario', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan');

    expect(res.status).toBe(200);

    // recommendation object
    expect(res.body).toHaveProperty('recommendation');
    expect(res.body.recommendation).toHaveProperty('strategy');
    expect(['avalanche', 'snowball']).toContain(res.body.recommendation.strategy);

    // comparison shapes
    expect(res.body).toHaveProperty('comparison');
    expect(res.body.comparison).toHaveProperty('avalanche');
    expect(res.body.comparison.avalanche).toHaveProperty('totalInterest');
    expect(res.body.comparison.avalanche).toHaveProperty('payoffMonths');
    expect(res.body.comparison.avalanche).toHaveProperty('debtFreeDate');
    expect(res.body.comparison).toHaveProperty('snowball');
    expect(res.body.comparison.snowball).toHaveProperty('totalInterest');
    expect(res.body.comparison.snowball).toHaveProperty('payoffMonths');
    expect(res.body.comparison.snowball).toHaveProperty('debtFreeDate');

    // other required fields
    expect(res.body).toHaveProperty('chartData');
    expect(Array.isArray(res.body.chartData)).toBe(true);
    expect(res.body).toHaveProperty('guide');
    expect(Array.isArray(res.body.guide)).toBe(true);
    expect(res.body).toHaveProperty('debtFreeDate');
    expect(typeof res.body.debtFreeDate).toBe('string');
    expect(res.body).toHaveProperty('summary');
    expect(typeof res.body.summary).toBe('object');
  });

  it('populates plan_cache after POST /api/plan', async () => {
    seedMinimalScenario();

    await request.post('/api/plan');

    const row = db.prepare('SELECT * FROM plan_cache').get();
    expect(row).not.toBeNull();
    expect(row).toHaveProperty('calc_result');
    expect(typeof row.calc_result).toBe('string');
    // Ensure the stored JSON is valid and non-empty
    const parsed = JSON.parse(row.calc_result);
    expect(parsed).toHaveProperty('recommendation');
  });

  it('GET /api/plan/cached returns 200 with plan data after POST /api/plan', async () => {
    seedMinimalScenario();
    await request.post('/api/plan');

    const res = await request.get('/api/plan/cached');

    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    // Should have either generatedAt or generated_at
    const hasTimestamp =
      res.body.generatedAt !== undefined || res.body.generated_at !== undefined;
    expect(hasTimestamp).toBe(true);
    // Should contain core plan data
    expect(res.body).toHaveProperty('recommendation');
  });

  it('POST /api/plan with emergency fund settings returns emergencyFund object with target and monthsToFund', async () => {
    seedMinimalScenario();

    // Seed emergency fund settings directly
    db.prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)").run('emergency_fund_target', '5000');
    db.prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)").run('emergency_fund_current', '0');

    const res = await request.post('/api/plan');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('emergencyFund');
    expect(res.body.emergencyFund).not.toBeNull();
    expect(res.body.emergencyFund).toHaveProperty('target');
    expect(res.body.emergencyFund.target).toBe(5000);
    // Route returns fundingMonths (months to redirect surplus to savings before attacking debt)
    expect(res.body.emergencyFund).toHaveProperty('fundingMonths');
    expect(typeof res.body.emergencyFund.fundingMonths).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// POST /api/plan — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/plan — negative paths', () => {
  it('returns 400 with error field when no debts are seeded', async () => {
    // Only income and expense, no debt
    seedIncome(db, { amount: 2000, frequency: 'monthly' });
    seedExpense(db, { amount: 800, category: 'housing', is_essential: 1 });

    const res = await request.post('/api/plan');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 with error field when no income is seeded', async () => {
    // Only debt, no income
    seedDebt(db, { balance: 1000, apr: 0.20, minimum_payment: 50 });

    const res = await request.post('/api/plan');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 422 with error: deficit and summary field when surplus is negative', async () => {
    // income 600, expense 200, debt minimum 500 → surplus = 600 - 200 - 500 = -100
    seedDebt(db, { balance: 2000, apr: 0.20, minimum_payment: 500 });
    seedIncome(db, { amount: 600, frequency: 'monthly' });
    seedExpense(db, { amount: 200, category: 'food', is_essential: 1 });

    const res = await request.post('/api/plan');

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error', 'deficit');
    expect(res.body).toHaveProperty('summary');
  });
});

// ---------------------------------------------------------------------------
// GET /api/plan/cached
// ---------------------------------------------------------------------------
describe('GET /api/plan/cached', () => {
  it('returns 200 with null body when no plan has been calculated', async () => {
    const res = await request.get('/api/plan/cached');

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/plan/whatif — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/plan/whatif — happy paths', () => {
  it('returns baseline, scenario, monthsSaved, interestSaved; scenario.payoffMonths < baseline.payoffMonths', async () => {
    // Use a larger debt so payoff takes multiple months and extra £500 makes a visible difference
    seedDebt(db, { balance: 5000, apr: 0.20, minimum_payment: 100 });
    seedIncome(db, { amount: 2000, frequency: 'monthly' });
    seedExpense(db, { amount: 800, category: 'housing', is_essential: 1 });
    // surplus = 2000 - 800 - 100 = 1100/month available; baseline ~5 months; +500 => ~4 months

    const res = await request.post('/api/plan/whatif').send({ extraMonthly: 500 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('baseline');
    expect(res.body).toHaveProperty('scenario');
    expect(res.body).toHaveProperty('monthsSaved');
    expect(res.body).toHaveProperty('interestSaved');

    expect(res.body.baseline).toHaveProperty('payoffMonths');
    expect(res.body.scenario).toHaveProperty('payoffMonths');

    // Paying extra should pay off faster
    expect(res.body.scenario.payoffMonths).toBeLessThan(res.body.baseline.payoffMonths);
  });

  it('returns 200 with monthsSaved === 0 when extraMonthly is 0', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/whatif').send({ extraMonthly: 0 });

    expect(res.status).toBe(200);
    expect(res.body.monthsSaved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/plan/whatif — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/plan/whatif — negative paths', () => {
  it('returns 400 with error when extraMonthly is -1', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/whatif').send({ extraMonthly: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 with error when extraMonthly is a string', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/whatif').send({ extraMonthly: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when no debts are seeded', async () => {
    // Only seed income, no debts
    seedIncome(db, { amount: 2000, frequency: 'monthly' });

    const res = await request.post('/api/plan/whatif').send({ extraMonthly: 100 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/plan/lumpsum — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/plan/lumpsum — happy paths', () => {
  it('returns amount, applyMonth, baseline, options (array), winner for a valid request', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/lumpsum').send({ amount: 500, applyMonth: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('amount', 500);
    expect(res.body).toHaveProperty('applyMonth', 1);
    expect(res.body).toHaveProperty('baseline');
    expect(res.body.baseline).toHaveProperty('payoffMonths');
    expect(res.body.baseline).toHaveProperty('totalInterest');
    expect(res.body.baseline).toHaveProperty('debtFreeDate');
    expect(res.body).toHaveProperty('options');
    expect(Array.isArray(res.body.options)).toBe(true);
    expect(res.body).toHaveProperty('winner');
  });
});

// ---------------------------------------------------------------------------
// POST /api/plan/lumpsum — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/plan/lumpsum — negative paths', () => {
  it('returns 400 with error when amount is 0', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/lumpsum').send({ amount: 0, applyMonth: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 with error when amount is -1', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/lumpsum').send({ amount: -1, applyMonth: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 with error when applyMonth is 0', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/lumpsum').send({ amount: 500, applyMonth: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 with error when applyMonth is a float (1.5)', async () => {
    seedMinimalScenario();

    const res = await request.post('/api/plan/lumpsum').send({ amount: 500, applyMonth: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 with error when no debts are seeded', async () => {
    // Only seed income, no debts
    seedIncome(db, { amount: 2000, frequency: 'monthly' });

    const res = await request.post('/api/plan/lumpsum').send({ amount: 500, applyMonth: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------
describe('Cache invalidation', () => {
  it('clears plan_cache when a new income source is POSTed after plan generation', async () => {
    seedMinimalScenario();

    // Generate and cache a plan
    await request.post('/api/plan');

    // Confirm cache is populated
    const cacheRowBefore = db.prepare('SELECT * FROM plan_cache').get();
    expect(cacheRowBefore).not.toBeNull();

    // POST a new income source — budget route deletes plan_cache
    await request.post('/api/budget/income').send({
      label: 'Bonus Income',
      amount: 500,
      frequency: 'monthly',
    });

    // Cache should now be cleared
    const cacheRowAfter = db.prepare('SELECT * FROM plan_cache').get();
    expect(cacheRowAfter).toBeUndefined();
  });
});
