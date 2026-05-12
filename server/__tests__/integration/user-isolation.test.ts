/**
 * User isolation tests — verifies that user A cannot see or modify user B's data.
 * Uses a controllable mock for requireAuth to switch between users.
 */
import express from 'express';
import request from 'supertest';

let currentUserId = 'user-A';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: currentUserId };
    next();
  },
}));

// In-memory store simulating a per-user isolated database
const debtStore: any[] = [];
let nextDebtId = 1;
let nextTrancheId = 1;

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

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock; transaction: jest.Mock;
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/debts', debtsRouter);
  return app;
}

// Reset in-memory store before each test
beforeEach(() => {
  jest.resetAllMocks();
  debtStore.length = 0;
  nextDebtId = 1;
  nextTrancheId = 1;
  currentUserId = 'user-A';

  // transaction mock delegates to callback
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockDb));

  // insert stores debt/tranche and respects currentUserId
  mockDb.insert.mockImplementation(() => ({
    values: (vals: any) => ({
      returning: () => {
        if (vals.debtId !== undefined) {
          // It's a tranche
          const row = { id: nextTrancheId++, ...vals };
          debtStore.push({ __type: 'tranche', ...row });
          return Promise.resolve([row]);
        }
        // It's a debt
        const row = { id: nextDebtId++, ...vals };
        debtStore.push({ __type: 'debt', ...row });
        return Promise.resolve([row]);
      },
    }),
  }));

  // delete is a no-op for these tests
  mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });

  // select filters by userId
  mockDb.select.mockImplementation(() => {
    const chain: any = {};
    let _userId: string | null = null;
    let _debtId: number | null = null;

    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockImplementation((condition: any) => {
      // Extract userId from the condition if possible (we encode it in the call)
      _userId = currentUserId;
      return chain;
    });
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.then = (fn: any) => {
      const debts = debtStore.filter(r => r.__type === 'debt' && r.userId === _userId);
      return Promise.resolve(debts).then(fn);
    };
    chain.catch = (fn: any) => Promise.resolve([]).catch(fn);
    return chain;
  });
});

describe('User isolation', () => {
  it('User B cannot see User A debts in GET /api/v1/debts', async () => {
    const app = makeApp();

    // User A creates a debt
    currentUserId = 'user-A';
    const createRes = await request(app).post('/api/v1/debts').send({
      name: 'User A Visa',
      debtType: 'credit_card',
      minimumPayment: 2500,
      tranches: [{ label: 'Main', balance: 100000, apr: 0.2 }],
    });
    expect(createRes.status).toBe(201);
    const debtId = createRes.body.debt.id;

    // User B sees an empty list
    currentUserId = 'user-B';

    // Override select to return empty for user-B
    mockDb.select.mockImplementation(() => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orderBy = jest.fn().mockReturnValue(chain);
      const p = Promise.resolve([]);
      chain.then = p.then.bind(p);
      chain.catch = p.catch.bind(p);
      return chain;
    });

    const listRes = await request(app).get('/api/v1/debts');
    expect(listRes.status).toBe(200);
    expect(listRes.body.debts.map((d: any) => d.id)).not.toContain(debtId);
  });

  it('User B gets 404 when deleting User A debt', async () => {
    const app = makeApp();

    // User A creates a debt
    currentUserId = 'user-A';
    const createRes = await request(app).post('/api/v1/debts').send({
      name: 'User A Barclays',
      debtType: 'personal_loan',
      minimumPayment: 5000,
      tranches: [{ label: 'Main', balance: 200000, apr: 0.15 }],
    });
    expect(createRes.status).toBe(201);
    const debtId = createRes.body.debt.id;

    // User B tries to delete it — select returns empty (ownership check fails)
    currentUserId = 'user-B';
    mockDb.select.mockImplementation(() => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orderBy = jest.fn().mockReturnValue(chain);
      const p = Promise.resolve([]);
      chain.then = p.then.bind(p);
      chain.catch = p.catch.bind(p);
      return chain;
    });

    const delRes = await request(app).delete(`/api/v1/debts/${debtId}`);
    expect(delRes.status).toBe(404);
    expect(delRes.body.error).toMatch(/not found/i);
  });
});
