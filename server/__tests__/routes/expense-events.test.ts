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

import expenseEventsRouter from '../../routes/expense-events';

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

const EVENT = { id: 1, userId: 'uid-1', label: 'Car repair', amount: 50000, applyMonth: 6, category: 'unexpected' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/expense-events', expenseEventsRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/expense-events', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns expense events for authenticated user', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EVENT]));
    const res = await request(makeApp()).get('/api/v1/expense-events');
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(1);
  });

  it('returns empty array when user has no events', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/expense-events');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/v1/expense-events', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when label is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/expense-events').send({ amount: 50000, applyMonth: 6, category: 'unexpected' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/expense-events').send({ label: 'Car repair', applyMonth: 6, category: 'unexpected' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when applyMonth is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/expense-events').send({ label: 'Car repair', amount: 50000, category: 'unexpected' });
    expect(res.status).toBe(400);
  });

  it('creates event with default category and clears plan cache', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([{ ...EVENT, category: 'expected' }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).post('/api/v1/expense-events').send({ label: 'Car repair', amount: 50000, applyMonth: 6 });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Car repair');
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });

  it('creates event with explicit unexpected category', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([EVENT]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).post('/api/v1/expense-events').send({ label: 'Car repair', amount: 50000, applyMonth: 6, category: 'unexpected' });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('unexpected');
  });
});

describe('PUT /api/v1/expense-events/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 for non-numeric id', async () => {
    const res = await request(makeApp()).put('/api/v1/expense-events/abc').send({ label: 'Car repair', amount: 50000, applyMonth: 6, category: 'unexpected' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when event not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).put('/api/v1/expense-events/99').send({ label: 'Car repair', amount: 50000, applyMonth: 6, category: 'unexpected' });
    expect(res.status).toBe(404);
  });

  it('updates event and returns updated record', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: 1 }]))
      .mockReturnValueOnce(makeSelectChain([EVENT]));
    mockDb.update.mockReturnValue(makeUpdateChain());
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).put('/api/v1/expense-events/1').send({ label: 'Car repair', amount: 50000, applyMonth: 6, category: 'unexpected' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });
});

describe('DELETE /api/v1/expense-events/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/expense-events/99');
    expect(res.status).toBe(404);
  });

  it('deletes event and clears plan cache', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).delete('/api/v1/expense-events/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });
});
