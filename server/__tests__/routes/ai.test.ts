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

// Mock the AI router — all route tests use MockAIProvider via this mock
jest.mock('../../ai/router', () => ({
  getProvider: jest.fn(),
}));

import aiRouter from '../../routes/ai';
import { getProvider } from '../../ai/router';
import { MockAIProvider } from '../../ai/providers/mock';

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock; update: jest.Mock;
};
const mockGetProvider = getProvider as jest.Mock;

// ── Chain builders ─────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
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

  it('returns null narrative immediately in mode A (no SSE)', async () => {
    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'A' });
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBeNull();
    expect(res.body.budgetTips).toBeNull();
    expect(mockGetProvider).not.toHaveBeenCalled();
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

  it('streams SSE tokens for mode B', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([CACHE_ROW]));

    mockGetProvider.mockResolvedValue(new MockAIProvider('Great plan!'));

    const res = await request(makeApp())
      .post('/api/v1/ai')
      .send({ mode: 'B' })
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.body as string).toContain('data:');
    expect(res.body as string).toContain('[DONE]');
  });

  it('uses getProvider with the authenticated userId', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([CACHE_ROW]));

    mockGetProvider.mockResolvedValue(new MockAIProvider('ok'));

    await request(makeApp())
      .post('/api/v1/ai')
      .send({ mode: 'B' })
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(mockGetProvider).toHaveBeenCalledWith('uid-1');
  });

  it('returns 400 when no debts exist', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))    // no debts
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([CACHE_ROW]));
    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'B' });
    expect(res.status).toBe(400);
  });

  it('returns 502 when getProvider throws', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]))
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]))
      .mockReturnValueOnce(makeSelectChain([CACHE_ROW]));
    mockGetProvider.mockRejectedValue(new Error('GEMINI_API_KEY not set'));

    const res = await request(makeApp()).post('/api/v1/ai').send({ mode: 'B' });
    expect(res.status).toBe(502);
  });
});
