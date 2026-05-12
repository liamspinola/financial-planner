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

import progressRouter from '../../routes/progress';

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

const BALANCES = { '1': 150000, '2': 50000 };
const SNAPSHOT_ROW = {
  id: 1, userId: 'uid-1', snapshotMonth: '2025-01',
  totalBalance: 200000, balancesJson: JSON.stringify(BALANCES),
  notes: null, recordedAt: '2025-01-15',
};
const SNAPSHOT_OUT = { ...SNAPSHOT_ROW, balances: BALANCES };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/progress', progressRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/progress', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns snapshots with parsed balances', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([SNAPSHOT_ROW]));
    const res = await request(makeApp()).get('/api/v1/progress');
    expect(res.status).toBe(200);
    expect(res.body[0].balances).toEqual(BALANCES);
    expect(res.body[0].id).toBe(1);
  });

  it('returns empty array when no snapshots', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/progress');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/v1/progress (upsert)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when snapshotMonth is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/progress').send({ balances: BALANCES });
    expect(res.status).toBe(400);
  });

  it('returns 400 when snapshotMonth has wrong format', async () => {
    const res = await request(makeApp()).post('/api/v1/progress').send({ snapshotMonth: '2025-1', balances: BALANCES });
    expect(res.status).toBe(400);
  });

  it('returns 400 when balances is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/progress').send({ snapshotMonth: '2025-01' });
    expect(res.status).toBe(400);
  });

  it('inserts new snapshot when month does not exist', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    mockDb.insert.mockReturnValue(makeInsertChain([SNAPSHOT_ROW]));
    const res = await request(makeApp()).post('/api/v1/progress').send({ snapshotMonth: '2025-01', balances: BALANCES });
    expect(res.status).toBe(201);
    expect(res.body.balances).toEqual(BALANCES);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it('updates existing snapshot when month already exists', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([SNAPSHOT_ROW]))  // existence check
      .mockReturnValueOnce(makeSelectChain([SNAPSHOT_ROW])); // re-fetch
    mockDb.update.mockReturnValue(makeUpdateChain());
    const res = await request(makeApp()).post('/api/v1/progress').send({ snapshotMonth: '2025-01', balances: BALANCES });
    expect(res.status).toBe(200);
    expect(res.body.balances).toEqual(BALANCES);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/v1/progress/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/progress/99');
    expect(res.status).toBe(404);
  });

  it('deletes snapshot', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await request(makeApp()).delete('/api/v1/progress/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
