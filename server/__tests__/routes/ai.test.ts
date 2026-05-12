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
  },
}));

jest.mock('../../lib/claude', () => ({
  callClaude: jest.fn(),
}));

import aiRouter from '../../routes/ai';

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock; update: jest.Mock;
};
const { callClaude } = jest.requireMock('../../lib/claude') as { callClaude: jest.Mock };

// ── Chain builders ─────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  return chain;
}

function makeUpdateChain() {
  const chain: any = {};
  chain.set = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockResolvedValue([]);
  return chain;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const PLAN_RESULT = {
  summary: { totalIncome: 300000, essentialExpenses: 100000, discretionaryExpenses: 0, totalExpenses: 100000, surplusAfterExpenses: 200000, totalMinimums: 2500, availableForDebt: 197500, hasDeficit: false },
  recommendation: { strategy: 'avalanche', reason: '', interestSaved: 200, monthsSaved: 1 },
  comparison: { avalanche: { payoffMonths: 12, totalInterest: 5000, debtFreeDate: '01/2026' }, snowball: { payoffMonths: 13, totalInterest: 5200, debtFreeDate: '02/2026' } },
};

const CACHE_ROW = {
  id: 1, userId: 'uid-1', calcResult: JSON.stringify(PLAN_RESULT),
  aiNarrative: null, aiBudgetTips: null, aiMode: 'A',
  strategy: 'avalanche', inputHash: 'abc123', generatedAt: '2025-01-01',
};

const DEBT = { id: 1, userId: 'uid-1', name: 'Visa', debtType: 'credit_card', minimumPayment: 2500, minPaymentPct: null, minPaymentFloor: null };
const TRANCHE = { id: 1, debtId: 1, label: 'Main', balance: 150000, apr: 0.2149, promoEndDate: null, postPromoApr: null, sortOrder: 0 };
const INCOME = { id: 1, monthlyEquivalent: 300000 };
const EXPENSE = { id: 1, amount: 100000, category: 'housing', isEssential: true };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/ai', aiRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/ai', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 for invalid mode', async () => {
    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'X' });
    expect(res.status).toBe(400);
  });

  it('returns null narrative immediately in mode A', async () => {
    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'A' });
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBeNull();
    expect(res.body.budgetTips).toBeNull();
  });

  it('returns 400 when no plan cache exists', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([])); // no plan cache
    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/plan/i);
  });

  it('calls Claude and stores narrative', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([CACHE_ROW])); // plan cache
    mockDb.update.mockReturnValue(makeUpdateChain());
    callClaude.mockResolvedValue('Great plan! Your debt will be gone soon.');

    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'B' });
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Great plan! Your debt will be gone soon.');
    expect(callClaude).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when Claude fails', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([CACHE_ROW]));
    callClaude.mockRejectedValue(new Error('API error'));

    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'B' });
    expect(res.status).toBe(502);
  });
});
