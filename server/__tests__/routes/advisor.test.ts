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

jest.mock('../../lib/claude', () => ({
  callClaude: jest.fn(),
}));

jest.mock('../../engine/advisor', () => ({
  buildAdvisorPrompt: jest.fn(),
}));

import advisorRouter from '../../routes/advisor';

const mockDb = jest.requireMock('../../db/connection').db as {
  select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock;
};
const { callClaude } = jest.requireMock('../../lib/claude') as { callClaude: jest.Mock };
const { buildAdvisorPrompt } = jest.requireMock('../../engine/advisor') as { buildAdvisorPrompt: jest.Mock };

// ── Chain builders ─────────────────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
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

const CONV = {
  id: 1, userId: 'uid-1', title: 'New conversation', useContext: true,
  contextSnapshot: null, summary: null, deletedAt: null,
  createdAt: '2025-01-01', updatedAt: '2025-01-01',
};

const USER_MSG   = { id: 1, userId: 'uid-1', conversationId: 1, role: 'user',      content: 'Help me!', sequence: 1, createdAt: '2025-01-01' };
const ASSIST_MSG = { id: 2, userId: 'uid-1', conversationId: 1, role: 'assistant', content: 'Sure!',    sequence: 2, createdAt: '2025-01-01' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/advisor', advisorRouter);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/advisor/conversations', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns list of conversations', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([CONV]));
    const res = await request(makeApp()).get('/api/v1/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(1);
  });

  it('returns empty array when no conversations', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/v1/advisor/conversations', () => {
  beforeEach(() => jest.resetAllMocks());

  it('creates a new conversation', async () => {
    mockDb.insert.mockReturnValue(makeInsertChain([CONV]));
    const res = await request(makeApp()).post('/api/v1/advisor/conversations');
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });
});

describe('PATCH /api/v1/advisor/conversations/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when conversation not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).patch('/api/v1/advisor/conversations/99').send({ title: 'New title' });
    expect(res.status).toBe(404);
  });

  it('updates title', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([CONV]))  // find conv
      .mockReturnValueOnce(makeSelectChain([{ ...CONV, title: 'New title' }])); // re-fetch
    mockDb.update.mockReturnValue(makeUpdateChain());
    const res = await request(makeApp()).patch('/api/v1/advisor/conversations/1').send({ title: 'New title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New title');
  });

  it('returns 400 for empty title', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([CONV]));
    const res = await request(makeApp()).patch('/api/v1/advisor/conversations/1').send({ title: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/advisor/conversations/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).delete('/api/v1/advisor/conversations/99');
    expect(res.status).toBe(404);
  });

  it('soft-deletes the conversation', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([CONV]));
    mockDb.update.mockReturnValue(makeUpdateChain());
    const res = await request(makeApp()).delete('/api/v1/advisor/conversations/1');
    expect(res.status).toBe(204);
  });
});

describe('GET /api/v1/advisor/conversations/:id/messages', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when conversation not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).get('/api/v1/advisor/conversations/99/messages');
    expect(res.status).toBe(404);
  });

  it('returns messages for conversation', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([CONV]))
      .mockReturnValueOnce(makeSelectChain([USER_MSG]));
    const res = await request(makeApp()).get('/api/v1/advisor/conversations/1/messages');
    expect(res.status).toBe(200);
    expect(res.body[0].role).toBe('user');
  });
});

describe('POST /api/v1/advisor/conversations/:id/messages', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 400 when content is missing', async () => {
    const res = await request(makeApp()).post('/api/v1/advisor/conversations/1/messages').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when conversation not found', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(makeApp()).post('/api/v1/advisor/conversations/1/messages').send({ content: 'Help me' });
    expect(res.status).toBe(404);
  });

  it('inserts user and assistant messages and returns both', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([CONV]))        // find conv
      .mockReturnValueOnce(makeSelectChain([]))            // max sequence (no prior messages)
      .mockReturnValueOnce(makeSelectChain([]))            // context data: debts
      .mockReturnValueOnce(makeSelectChain([]))            // context data: income
      .mockReturnValueOnce(makeSelectChain([]))            // context data: expenses
      .mockReturnValueOnce(makeSelectChain([]))            // context data: planCache
      .mockReturnValueOnce(makeSelectChain([USER_MSG]))    // recent messages for prompt
      .mockReturnValueOnce(makeSelectChain([USER_MSG]))    // fetch user msg
      .mockReturnValueOnce(makeSelectChain([ASSIST_MSG])); // fetch assistant msg
    mockDb.insert
      .mockReturnValueOnce(makeInsertChain([USER_MSG]))
      .mockReturnValueOnce(makeInsertChain([ASSIST_MSG]));
    mockDb.update.mockReturnValue(makeUpdateChain());

    buildAdvisorPrompt.mockReturnValue('test prompt');
    callClaude.mockResolvedValue('Sure!');

    const res = await request(makeApp()).post('/api/v1/advisor/conversations/1/messages').send({ content: 'Help me' });
    expect(res.status).toBe(200);
    expect(res.body.userMessage.role).toBe('user');
    expect(res.body.assistantMessage.role).toBe('assistant');
  });
});
