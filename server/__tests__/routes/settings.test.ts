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
  },
}));

import settingsRouter from '../../routes/settings';

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock;
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

function makeInsertChain() {
  const chain: any = {};
  chain.values = jest.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = jest.fn().mockResolvedValue([]);
  return chain;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const SETTINGS_ROWS = [
  { key: 'strategy', value: 'avalanche' },
  { key: 'fundingDelay', value: '0' },
];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/settings', settingsRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/settings', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns settings as key-value object', async () => {
    mockDb.select.mockReturnValue(makeSelectChain(SETTINGS_ROWS));
    const res = await request(makeApp()).get('/api/v1/settings');
    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe('avalanche');
    expect(res.body.fundingDelay).toBe('0');
  });

  it('returns empty object when user has no settings', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('PUT /api/v1/settings', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when body has non-string/number/boolean value', async () => {
    const res = await request(makeApp()).put('/api/v1/settings').send({ strategy: null });
    expect(res.status).toBe(400);
  });

  it('upserts settings and returns updated object', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain());
    mockDb.select.mockReturnValue(makeSelectChain(SETTINGS_ROWS));
    const res = await request(makeApp()).put('/api/v1/settings').send({ strategy: 'avalanche', fundingDelay: 0 });
    expect(res.status).toBe(200);
    expect(res.body.strategy).toBe('avalanche');
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('upserts a single boolean setting', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain());
    mockDb.select.mockReturnValue(makeSelectChain([{ key: 'showAdvanced', value: 'true' }]));
    const res = await request(makeApp()).put('/api/v1/settings').send({ showAdvanced: true });
    expect(res.status).toBe(200);
    expect(res.body.showAdvanced).toBe('true');
  });
});
