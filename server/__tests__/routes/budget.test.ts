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

// calculator.toMonthly is a frozen JS engine file — mock it simply
jest.mock('../../engine/calculator', () => ({
  toMonthly: (_amount: number, freq: string) => {
    const map: Record<string, number> = {
      monthly: 1, weekly: 52 / 12, fortnightly: 26 / 12,
      four_weekly: 13, annual: 1 / 12,
    };
    return (_amount * (map[freq] ?? 1));
  },
}));

import budgetRouter from '../../routes/budget';

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock;
};

// ── Chain builders ─────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
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

function makeDeleteChain() {
  return { where: jest.fn().mockResolvedValue([]) };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const INCOME = { id: 1, userId: 'uid-1', label: 'Salary', amount: 300000, frequency: 'monthly', monthlyEquivalent: 300000 };
const EXPENSE = { id: 1, userId: 'uid-1', label: 'Rent', amount: 100000, category: 'housing', isEssential: true };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/budget', budgetRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/budget', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns income and expenses', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([INCOME]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]));
    const res = await request(makeApp()).get('/api/v1/budget');
    expect(res.status).toBe(200);
    expect(res.body.income[0].id).toBe(1);
    expect(res.body.expenses[0].id).toBe(1);
  });
});

describe('POST /api/v1/budget/income', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when label is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/budget/income').send({ amount: 300000, frequency: 'monthly' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/budget/income').send({ label: 'Salary', frequency: 'monthly' });
    expect(res.status).toBe(400);
  });

  it('creates income and clears plan cache', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([INCOME]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).post('/api/v1/budget/income').send({ label: 'Salary', amount: 300000, frequency: 'monthly' });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Salary');
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/v1/budget/income/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when income source not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).put('/api/v1/budget/income/99').send({ label: 'Salary', amount: 300000, frequency: 'monthly' });
    expect(res.status).toBe(404);
  });

  it('updates income and returns updated record', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: 1 }]))   // ownership check
      .mockReturnValueOnce(makeSelectChain([INCOME]));      // re-fetch
    mockDb.update.mockReturnValue(makeUpdateChain());
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).put('/api/v1/budget/income/1').send({ label: 'Salary', amount: 300000, frequency: 'monthly' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });
});

describe('DELETE /api/v1/budget/income/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/budget/income/99');
    expect(res.status).toBe(404);
  });

  it('deletes income and clears plan cache', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).delete('/api/v1/budget/income/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/v1/budget/expenses', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when label is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/budget/expenses').send({ amount: 100000, category: 'housing' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when category is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/budget/expenses').send({ label: 'Rent', amount: 100000 });
    expect(res.status).toBe(400);
  });

  it('creates expense and clears plan cache', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([EXPENSE]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).post('/api/v1/budget/expenses').send({ label: 'Rent', amount: 100000, category: 'housing', isEssential: true });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Rent');
  });
});

describe('PUT /api/v1/budget/expenses/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).put('/api/v1/budget/expenses/99').send({ label: 'Rent', amount: 100000, category: 'housing' });
    expect(res.status).toBe(404);
  });

  it('updates expense', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: 1 }]))
      .mockReturnValueOnce(makeSelectChain([EXPENSE]));
    mockDb.update.mockReturnValue(makeUpdateChain());
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).put('/api/v1/budget/expenses/1').send({ label: 'Rent', amount: 100000, category: 'housing' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });
});

describe('DELETE /api/v1/budget/expenses/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/budget/expenses/99');
    expect(res.status).toBe(404);
  });

  it('deletes expense and clears plan cache', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).delete('/api/v1/budget/expenses/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
