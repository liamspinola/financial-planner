import express from 'express';
import request from 'supertest';

// env vars set in jest.setup.ts via setupFiles

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: 'uid-1' };
    next();
  },
}));

// Mock must be self-contained — no external variable references.
// Retrieve the mock instances via jest.requireMock after this.
jest.mock('../../db/connection', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(),
  },
}));

import debtsRouter from '../../routes/debts';

// Get typed handles to the mocked db functions
const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  transaction: jest.Mock;
};

// ── Mock chain builders ───────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  // Chain is thenable so it resolves whether the caller awaits after
  // .where() (ownership checks) or .orderBy() (list queries).
  const p = Promise.resolve(result);
  const chain: any = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
  };
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  return chain;
}

function makeInsertChain(result: unknown[]) {
  return {
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue(result),
    }),
  };
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEBT = {
  id: 1, userId: 'uid-1', name: 'Visa', lender: null,
  debtType: 'credit_card', minimumPayment: 2500,
  minPaymentPct: null, minPaymentFloor: null, notes: null, createdAt: '2025-01-01',
};

const TRANCHE = {
  id: 1, userId: 'uid-1', debtId: 1, label: 'Main',
  balance: 150000, apr: 0.2149, promoEndDate: null, postPromoApr: null, sortOrder: 0,
};

// ── App factory ───────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/debts', debtsRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/debts', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns debts and tranches for the authenticated user', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([DEBT]))
      .mockReturnValueOnce(makeSelectChain([TRANCHE]));

    const res = await request(makeApp()).get('/api/v1/debts');
    expect(res.status).toBe(200);
    expect(res.body.debts).toHaveLength(1);
    expect(res.body.debts[0].id).toBe(1);
    expect(res.body.tranches).toHaveLength(1);
    expect(res.body.tranches[0].debtId).toBe(1);
  });

  it('returns empty arrays when user has no data', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await request(makeApp()).get('/api/v1/debts');
    expect(res.status).toBe(200);
    expect(res.body.debts).toHaveLength(0);
    expect(res.body.tranches).toHaveLength(0);
  });
});

describe('POST /api/v1/debts', () => {
  beforeEach(() => jest.resetAllMocks());

  const validBody = {
    name: 'Visa', debtType: 'credit_card', minimumPayment: 2500,
    tranches: [{ label: 'Main', balance: 150000, apr: 0.2149 }],
  };

  it('returns 400 when name is missing', async () => {
    const res = await request(makeApp())
      .post('/api/v1/debts')
      .send({ tranches: [{ label: 'Main', balance: 100, apr: 0.2 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when tranches array is empty', async () => {
    const res = await request(makeApp())
      .post('/api/v1/debts')
      .send({ name: 'Visa', tranches: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when a tranche has no balance', async () => {
    const res = await request(makeApp())
      .post('/api/v1/debts')
      .send({ name: 'Visa', tranches: [{ label: 'Main', apr: 0.2 }] });
    expect(res.status).toBe(400);
  });

  it('creates debt with tranches using a transaction and returns 201', async () => {
    mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));
    mockDb.insert
      .mockReturnValueOnce(makeInsertChain([DEBT]))
      .mockReturnValueOnce(makeInsertChain([TRANCHE]));
    mockDb.delete.mockReturnValue(makeDeleteChain());

    const res = await request(makeApp()).post('/api/v1/debts').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.debt.name).toBe('Visa');
    expect(res.body.tranches).toHaveLength(1);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/v1/debts/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  const validBody = {
    name: 'Visa Updated', debtType: 'credit_card', minimumPayment: 3000,
    tranches: [{ label: 'Main', balance: 100000, apr: 0.19 }],
  };

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(makeApp()).put('/api/v1/debts/abc').send(validBody);
    expect(res.status).toBe(400);
  });

  it('returns 404 when debt does not exist for this user', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await request(makeApp()).put('/api/v1/debts/99').send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('updates debt and replaces tranches atomically', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: 1 }]))        // ownership check
      .mockReturnValueOnce(makeSelectChain([{ ...DEBT, name: 'Visa Updated' }])) // re-fetch debt
      .mockReturnValueOnce(makeSelectChain([TRANCHE]));           // re-fetch tranches
    mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));
    mockDb.update.mockReturnValue(makeUpdateChain());
    mockDb.delete.mockReturnValue(makeDeleteChain());
    mockDb.insert.mockReturnValueOnce(makeInsertChain([TRANCHE]));

    const res = await request(makeApp()).put('/api/v1/debts/1').send(validBody);

    expect(res.status).toBe(200);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(res.body.debt.name).toBe('Visa Updated');
  });
});

describe('DELETE /api/v1/debts/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when debt does not exist for this user', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/debts/99');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('deletes the debt and clears plan cache', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 1 }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());

    const res = await request(makeApp()).delete('/api/v1/debts/1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
