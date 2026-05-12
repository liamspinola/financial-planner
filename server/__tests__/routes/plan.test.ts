import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: 'uid-1' };
    next();
  },
}));

jest.mock('../../db/connection', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock all engine modules
jest.mock('../../engine/calculator', () => ({
  computeSummary: jest.fn(),
  groupTranchsByDebt: jest.fn(),
}));
jest.mock('../../engine/amortisation', () => ({ simulate: jest.fn() }));
jest.mock('../../engine/strategy', () => ({ recommend: jest.fn() }));
jest.mock('../../engine/guide', () => ({ buildGuide: jest.fn() }));

import planRouter from '../../routes/plan';

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock;
};
const { computeSummary, groupTranchsByDebt } = jest.requireMock('../../engine/calculator') as {
  computeSummary: jest.Mock; groupTranchsByDebt: jest.Mock;
};
const { simulate } = jest.requireMock('../../engine/amortisation') as { simulate: jest.Mock };
const { recommend } = jest.requireMock('../../engine/strategy') as { recommend: jest.Mock };
const { buildGuide } = jest.requireMock('../../engine/guide') as { buildGuide: jest.Mock };

// ── Chain builders ─────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  return chain;
}

function makeInsertChain(result: unknown[]) {
  return { values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue(result) }) };
}

function makeUpdateChain() {
  const chain: any = {};
  chain.set = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockResolvedValue([]);
  return chain;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const DEBT = { id: 1, userId: 'uid-1', name: 'Visa', debtType: 'credit_card', minimumPayment: 2500, minPaymentPct: null, minPaymentFloor: null };
const TRANCHE = { id: 1, userId: 'uid-1', debtId: 1, label: 'Main', balance: 150000, apr: 0.2149, promoEndDate: null, postPromoApr: null, sortOrder: 0 };
const INCOME = { id: 1, userId: 'uid-1', label: 'Salary', amount: 300000, frequency: 'monthly', monthlyEquivalent: 300000 };
const EXPENSE = { id: 1, userId: 'uid-1', label: 'Rent', amount: 100000, category: 'housing', isEssential: true };
const SUMMARY = { totalIncome: 300000, essentialExpenses: 100000, discretionaryExpenses: 0, totalExpenses: 100000, surplusAfterExpenses: 200000, totalMinimums: 2500, availableForDebt: 197500, hasDeficit: false };
const SIM_RESULT = { payoffMonths: 12, totalInterest: 5000, monthlyStates: [] };
const CACHE_ROW = { id: 1, userId: 'uid-1', calcResult: JSON.stringify({ summary: SUMMARY }), aiNarrative: null, aiBudgetTips: null, aiMode: 'A', generatedAt: '2025-01-01T00:00:00.000Z', strategy: 'avalanche', inputHash: 'abc' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/plan', planRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/plan/cached', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns null when no cache exists', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/plan/cached');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns cached result with AI fields when cache exists', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([CACHE_ROW]));
    const res = await request(makeApp()).get('/api/v1/plan/cached');
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.aiNarrative).toBeNull();
    expect(res.body.aiMode).toBe('A');
  });
});

describe('GET /api/v1/plan', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns empty flag when user has no debts', async () => {
    // 7 selects: debts, tranches, income, expenses, windfalls, expenseEvents, settings
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))       // debts = empty
      .mockReturnValueOnce(makeSelectChain([]))       // tranches
      .mockReturnValueOnce(makeSelectChain([INCOME])) // income
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))// expenses
      .mockReturnValueOnce(makeSelectChain([]))       // windfalls
      .mockReturnValueOnce(makeSelectChain([]))       // expenseEvents
      .mockReturnValueOnce(makeSelectChain([]));      // settings
    const res = await request(makeApp()).get('/api/v1/plan');
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
  });

  it('runs plan computation and caches result', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]))        // settings
      .mockReturnValueOnce(makeSelectChain([]));       // plan cache check (no existing)

    computeSummary.mockReturnValue(SUMMARY);
    groupTranchsByDebt.mockReturnValue(new Map([[1, { debtName: 'Visa', tranches: [TRANCHE] }]]));
    simulate.mockReturnValue(SIM_RESULT);
    recommend.mockReturnValue({ recommended: 'avalanche', reason: 'Lower interest', interestSaved: 200, monthsSaved: 1 });
    buildGuide.mockReturnValue([]);
    mockDb.insert.mockReturnValue(makeInsertChain([CACHE_ROW]));

    const res = await request(makeApp()).get('/api/v1/plan');
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.recommended).toBe('avalanche');
    expect(computeSummary).toHaveBeenCalledTimes(1);
    expect(simulate).toHaveBeenCalledTimes(2); // avalanche + snowball
  });
});

describe('GET /api/v1/plan/whatif', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when extraMonthly is missing', async () => {
    const res = await request(makeApp()).get('/api/v1/plan/whatif');
    expect(res.status).toBe(400);
  });

  it('returns 400 when extraMonthly is negative', async () => {
    const res = await request(makeApp()).get('/api/v1/plan/whatif?extraMonthly=-100');
    expect(res.status).toBe(400);
  });

  it('runs whatif computation with extra payment', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([])); // settings

    computeSummary.mockReturnValue(SUMMARY);
    groupTranchsByDebt.mockReturnValue(new Map([[1, { debtName: 'Visa', tranches: [TRANCHE] }]]));
    simulate.mockReturnValue(SIM_RESULT);
    recommend.mockReturnValue({ recommended: 'avalanche', reason: '', interestSaved: 0, monthsSaved: 0 });

    const res = await request(makeApp()).get('/api/v1/plan/whatif?extraMonthly=5000');
    expect(res.status).toBe(200);
    expect(res.body.extraMonthly).toBe(5000);
    expect(simulate).toHaveBeenCalledTimes(2);
  });
});
