import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: 'uid-byok-test' };
    next();
  },
}));

// Mock encryption — deterministic for tests
jest.mock('../../lib/encryption', () => ({
  encryptKey: jest.fn((key: string) => ({
    encryptedKey: `encrypted:${key}`,
    iv: 'deadbeef000000000000000000000000',
  })),
  decryptKey: jest.fn((encrypted: string) => encrypted.replace('encrypted:', '')),
}));

const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
};
jest.mock('../../db/connection', () => ({ db: mockDb }));

import aiKeysRouter from '../../routes/ai-keys';

const app = express();
app.use(express.json());
app.use('/api/v1/ai-keys', aiKeysRouter);

const EXISTING_KEY = {
  id: 1,
  userId: 'uid-byok-test',
  encryptedKey: 'encrypted:sk-ant-api03-abc',
  iv: 'deadbeef000000000000000000000000',
  provider: 'anthropic',
  createdAt: '2026-05-01T00:00:00Z',
};

function makeSelectChain(result: unknown[]) {
  const c: any = {};
  ['from', 'where'].forEach(m => { c[m] = jest.fn().mockReturnValue(c); });
  const p = Promise.resolve(result);
  c.then = p.then.bind(p);
  c.catch = p.catch.bind(p);
  return c;
}

function makeInsertChain() {
  const c: any = {};
  c.values = jest.fn().mockReturnValue(c);
  c.returning = jest.fn().mockResolvedValue([EXISTING_KEY]);
  return c;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/ai-keys', () => {
  it('returns hasKey: false when no key is stored', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(app).get('/api/v1/ai-keys');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasKey: false, provider: null });
  });

  it('returns hasKey: true when a key exists (does NOT return the key)', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EXISTING_KEY]));
    const res = await request(app).get('/api/v1/ai-keys');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasKey: true, provider: 'anthropic' });
    expect(JSON.stringify(res.body)).not.toContain('sk-ant');
    expect(JSON.stringify(res.body)).not.toContain('encryptedKey');
  });
});

describe('POST /api/v1/ai-keys', () => {
  it('returns 400 if apiKey is missing', async () => {
    const res = await request(app).post('/api/v1/ai-keys').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 if apiKey is too short', async () => {
    const res = await request(app).post('/api/v1/ai-keys').send({ apiKey: 'short' });
    expect(res.status).toBe(400);
  });

  it('encrypts and stores the key on first save', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    mockDb.insert.mockReturnValue(makeInsertChain());

    const res = await request(app).post('/api/v1/ai-keys').send({
      apiKey: 'sk-ant-api03-valid-key-here-abc123',
      provider: 'anthropic',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, provider: 'anthropic' });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('replaces an existing key (delete + insert)', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EXISTING_KEY]));
    mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    mockDb.insert.mockReturnValue(makeInsertChain());

    const res = await request(app).post('/api/v1/ai-keys').send({
      apiKey: 'sk-ant-api03-new-key-abc123456789',
    });
    expect(res.status).toBe(201);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/ai-keys', () => {
  it('returns 404 when no key exists', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(app).delete('/api/v1/ai-keys');
    expect(res.status).toBe(404);
  });

  it('deletes existing key and returns ok', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EXISTING_KEY]));
    mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const res = await request(app).delete('/api/v1/ai-keys');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
