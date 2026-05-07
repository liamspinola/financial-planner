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

import windallsRouter from '../../routes/windfalls';

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

const WINDFALL = { id: 1, userId: 'uid-1', label: 'Bonus', amount: 200000, applyMonth: 3 };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/windfalls', windallsRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/windfalls', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns windfalls for authenticated user', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([WINDFALL]));
    const res = await request(makeApp()).get('/api/v1/windfalls');
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(1);
  });

  it('returns empty array when user has no windfalls', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/windfalls');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/v1/windfalls', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when label is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/windfalls').send({ amount: 200000, applyMonth: 3 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/windfalls').send({ label: 'Bonus', applyMonth: 3 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when applyMonth is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/windfalls').send({ label: 'Bonus', amount: 200000 });
    expect(res.status).toBe(400);
  });

  it('creates windfall and clears plan cache', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([WINDFALL]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).post('/api/v1/windfalls').send({ label: 'Bonus', amount: 200000, applyMonth: 3 });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Bonus');
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/v1/windfalls/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 for non-numeric id', async () => {
    const res = await request(makeApp()).put('/api/v1/windfalls/abc').send({ label: 'Bonus', amount: 200000, applyMonth: 3 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when windfall not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).put('/api/v1/windfalls/99').send({ label: 'Bonus', amount: 200000, applyMonth: 3 });
    expect(res.status).toBe(404);
  });

  it('updates windfall and returns updated record', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: 1 }]))
      .mockReturnValueOnce(makeSelectChain([WINDFALL]));
    mockDb.update.mockReturnValue(makeUpdateChain());
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).put('/api/v1/windfalls/1').send({ label: 'Bonus', amount: 200000, applyMonth: 3 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });
});

describe('DELETE /api/v1/windfalls/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/windfalls/99');
    expect(res.status).toBe(404);
  });

  it('deletes windfall and clears plan cache', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).delete('/api/v1/windfalls/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });
});
