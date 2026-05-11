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

import actualsRouter from '../../routes/actuals';

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
  chain.groupBy = jest.fn().mockReturnValue(chain);
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

const ACTUAL = {
  id: 1, userId: 'uid-1', expenseId: 1,
  category: 'housing', label: 'Rent', amountActual: 95000, recordMonth: '2025-01',
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/actuals', actualsRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/actuals', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns all actuals for user when no month filter', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([ACTUAL]));
    const res = await request(makeApp()).get('/api/v1/actuals');
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(1);
  });

  it('filters actuals by month when ?month= is provided', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([ACTUAL]));
    const res = await request(makeApp()).get('/api/v1/actuals?month=2025-01');
    expect(res.status).toBe(200);
    expect(res.body[0].recordMonth).toBe('2025-01');
  });

  it('returns 400 when month format is invalid', async () => {
    const res = await request(makeApp()).get('/api/v1/actuals?month=01-2025');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/actuals/summary', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when month is missing', async () => {
    const res = await request(makeApp()).get('/api/v1/actuals/summary');
    expect(res.status).toBe(400);
  });

  it('returns 400 when month format is invalid', async () => {
    const res = await request(makeApp()).get('/api/v1/actuals/summary?month=jan-2025');
    expect(res.status).toBe(400);
  });

  it('returns merged category summary', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ category: 'housing', actual: 95000 }]))
      .mockReturnValueOnce(makeSelectChain([{ category: 'housing', budgeted: 100000 }, { category: 'food', budgeted: 30000 }]));
    const res = await request(makeApp()).get('/api/v1/actuals/summary?month=2025-01');
    expect(res.status).toBe(200);
    const housing = res.body.find((r: any) => r.category === 'housing');
    expect(housing.actual).toBe(95000);
    expect(housing.budgeted).toBe(100000);
    expect(housing.delta).toBe(-5000);
    const food = res.body.find((r: any) => r.category === 'food');
    expect(food.actual).toBe(0);
    expect(food.budgeted).toBe(30000);
  });
});

describe('POST /api/v1/actuals', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when category is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/actuals').send({ label: 'Rent', amountActual: 95000, recordMonth: '2025-01' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when recordMonth format is invalid', async () => {
    const res = await request(makeApp()).post('/api/v1/actuals').send({ category: 'housing', label: 'Rent', amountActual: 95000, recordMonth: '01-2025' });
    expect(res.status).toBe(400);
  });

  it('creates actual and returns 201', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([ACTUAL]));
    const res = await request(makeApp()).post('/api/v1/actuals').send({
      category: 'housing', label: 'Rent', amountActual: 95000, recordMonth: '2025-01',
    });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Rent');
  });
});

describe('PUT /api/v1/actuals/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).put('/api/v1/actuals/99').send({ amountActual: 90000 });
    expect(res.status).toBe(404);
  });

  it('updates amountActual', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: 1 }]))
      .mockReturnValueOnce(makeSelectChain([{ ...ACTUAL, amountActual: 90000 }]));
    mockDb.update.mockReturnValue(makeUpdateChain());
    const res = await request(makeApp()).put('/api/v1/actuals/1').send({ amountActual: 90000 });
    expect(res.status).toBe(200);
    expect(res.body.amountActual).toBe(90000);
  });
});

describe('DELETE /api/v1/actuals/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/actuals/99');
    expect(res.status).toBe(404);
  });

  it('deletes actual', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).delete('/api/v1/actuals/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
