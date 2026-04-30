'use strict';

jest.mock('../../lib/claude');

const { clearAll, seedDebt, seedIncome, seedExpense } = require('../helpers/db');

let request, db, callClaude;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
  callClaude = require('../../lib/claude').callClaude;
});

beforeEach(() => clearAll(db));

/**
 * Seeds a standard scenario and POSTs /api/plan to populate plan_cache.
 * Returns the plan response body.
 */
async function seedAndRunPlan() {
  seedDebt(db, { balance: 5000, apr: 0.20, minimum_payment: 100 });
  seedIncome(db, { amount: 3000, frequency: 'monthly' });
  seedExpense(db, { amount: 1000, category: 'housing', is_essential: 1 });
  const res = await request.post('/api/plan');
  return res.body;
}

// ---------------------------------------------------------------------------
// Mode A — no Claude call
// ---------------------------------------------------------------------------
describe("POST /api/ai mode 'A'", () => {
  it("returns { narrative: null, budgetTips: null, cached: false } and does not call Claude", async () => {
    const res = await request.post('/api/ai').send({ mode: 'A' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ narrative: null, budgetTips: null, cached: false });
    expect(callClaude).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// Invalid mode
// ---------------------------------------------------------------------------
describe("POST /api/ai invalid mode", () => {
  it("returns 400 with error for mode 'X'", async () => {
    const res = await request.post('/api/ai').send({ mode: 'X' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// No plan cached
// ---------------------------------------------------------------------------
describe("POST /api/ai — no plan cached", () => {
  it("returns 400 when plan has not been generated yet", async () => {
    // Seed debt so we pass the "no data" check, but do NOT run /api/plan
    seedDebt(db, { balance: 5000, apr: 0.20, minimum_payment: 100 });
    seedIncome(db, { amount: 3000, frequency: 'monthly' });
    seedExpense(db, { amount: 1000, category: 'housing', is_essential: 1 });

    const res = await request.post('/api/ai').send({ mode: 'B' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/generate.*plan|plan.*first/i);
  });
});

// ---------------------------------------------------------------------------
// No debts seeded
// ---------------------------------------------------------------------------
describe("POST /api/ai — no debts", () => {
  it("returns 400 with error: 'No data to analyse'", async () => {
    const res = await request.post('/api/ai').send({ mode: 'B' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'No data to analyse');
  });
});

// ---------------------------------------------------------------------------
// Happy path mode B
// ---------------------------------------------------------------------------
describe("POST /api/ai mode 'B' — happy path", () => {
  it("returns narrative with mock response, budgetTips null, cached false; Claude called once", async () => {
    await seedAndRunPlan();

    const res = await request.post('/api/ai').send({ mode: 'B' });

    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Mock AI response for testing.');
    expect(res.body.budgetTips).toBeNull();
    expect(res.body.cached).toBe(false);
    expect(callClaude).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Happy path mode C
// ---------------------------------------------------------------------------
describe("POST /api/ai mode 'C' — happy path", () => {
  it("returns non-null budgetTips and non-null narrative when response contains bullet list", async () => {
    await seedAndRunPlan();

    // Queue the mock AFTER seedAndRunPlan so it's consumed by the /api/ai call, not /api/plan
    callClaude.mockResolvedValueOnce(
      'Paragraph 1.\n\nParagraph 2.\n\n• Housing: Cut from £1000 to £800/month — saves £500'
    );

    const res = await request.post('/api/ai').send({ mode: 'C' });

    expect(res.status).toBe(200);
    expect(res.body.narrative).not.toBeNull();
    expect(res.body.budgetTips).not.toBeNull();
    expect(res.body.cached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cache hit
// ---------------------------------------------------------------------------
describe("POST /api/ai — cache hit", () => {
  it("second call with same data returns cached: true and Claude is NOT called again", async () => {
    await seedAndRunPlan();

    // First call
    const res1 = await request.post('/api/ai').send({ mode: 'B' });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);

    // Second call — same data, same mode
    const res2 = await request.post('/api/ai').send({ mode: 'B' });
    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(true);

    // Claude should only have been called once total across both requests
    expect(callClaude.mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Claude 502
// ---------------------------------------------------------------------------
describe("POST /api/ai — Claude 502", () => {
  it("returns 502 with error when Claude throws", async () => {
    callClaude.mockRejectedValueOnce(new Error('CLI exit 1'));

    await seedAndRunPlan();

    const res = await request.post('/api/ai').send({ mode: 'B' });

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Bug 1 regression: AI cache staleness after windfall change
// ---------------------------------------------------------------------------
describe("Bug 1 regression: AI cache invalidated after windfall → re-plan", () => {
  it("re-calls Claude after windfall added and plan re-run (cached: false on second AI call)", async () => {
    // Step 1: seed + run plan
    await seedAndRunPlan();

    // Step 2: first AI call — should hit Claude (cached: false)
    const res1 = await request.post('/api/ai').send({ mode: 'B' });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    const callsAfterFirst = callClaude.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Step 3: add a windfall — this clears plan_cache
    const wfRes = await request.post('/api/windfalls')
      .send({ label: 'Bonus', amount: 2000, apply_month: 3 });
    expect(wfRes.status).toBe(201);

    // Step 4: re-run plan to repopulate plan_cache with new input hash
    await request.post('/api/plan');

    // Step 5: second AI call — input hash has changed, must call Claude again
    const res2 = await request.post('/api/ai').send({ mode: 'B' });
    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(false);
    expect(callClaude.mock.calls.length).toBe(2);
  });
});
