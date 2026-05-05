'use strict';

jest.mock('../../lib/claude');

const { clearAll, seedDebt, seedIncome, seedExpense } = require('../helpers/db');

let request, db, callClaude;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
  callClaude = require('../../lib/claude').callClaude;
});

beforeEach(() => clearAll(db));

// ---------------------------------------------------------------------------
// POST /api/advisor/conversations
// ---------------------------------------------------------------------------
describe('POST /api/advisor/conversations', () => {
  it('creates a conversation → 201 with id, use_context: 1', async () => {
    const res = await request.post('/api/advisor/conversations');
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.use_context).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/advisor/conversations
// ---------------------------------------------------------------------------
describe('GET /api/advisor/conversations', () => {
  it('returns [] when no conversations exist', async () => {
    const res = await request.get('/api/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns both conversations after creating two', async () => {
    await request.post('/api/advisor/conversations');
    await request.post('/api/advisor/conversations');
    const res = await request.get('/api/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns only the non-deleted conversation after soft-deleting one', async () => {
    const c1 = await request.post('/api/advisor/conversations');
    const c2 = await request.post('/api/advisor/conversations');
    await request.delete(`/api/advisor/conversations/${c1.body.id}`);
    const res = await request.get('/api/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(c2.body.id);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/advisor/conversations/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/advisor/conversations/:id', () => {
  it('renames title → 200 with updated title', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ title: 'My New Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('My New Title');
  });

  it('returns 400 when title is whitespace only', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('toggles useContext: 0 on conversation with no messages → 200, use_context: 0', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ useContext: 0 });
    expect(res.status).toBe(200);
    expect(res.body.use_context).toBe(0);
  });

  it('returns 409 when toggling useContext on conversation WITH messages', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Hello there' });
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ useContext: 0 });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await request.patch('/api/advisor/conversations/99999')
      .send({ title: 'Whatever' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/advisor/conversations/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/advisor/conversations/:id', () => {
  it('soft-deletes conversation → 204', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.delete(`/api/advisor/conversations/${conv.id}`);
    expect(res.status).toBe(204);
  });

  it('subsequent GET does not include the deleted conversation', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.delete(`/api/advisor/conversations/${conv.id}`);
    const res = await request.get('/api/advisor/conversations');
    expect(res.body.find(c => c.id === conv.id)).toBeUndefined();
  });

  it('returns 404 when deleting non-existent conversation', async () => {
    const res = await request.delete('/api/advisor/conversations/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/advisor/conversations/:id/messages
// ---------------------------------------------------------------------------
describe('GET /api/advisor/conversations/:id/messages', () => {
  it('returns [] for empty conversation', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.get(`/api/advisor/conversations/${conv.id}/messages`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await request.get('/api/advisor/conversations/99999/messages');
    expect(res.status).toBe(404);
  });

  it('returns 404 for soft-deleted conversation', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.delete(`/api/advisor/conversations/${conv.id}`);
    const res = await request.get(`/api/advisor/conversations/${conv.id}/messages`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/advisor/conversations/:id/messages
// ---------------------------------------------------------------------------
describe('POST /api/advisor/conversations/:id/messages', () => {
  it('first message → 200 with userMessage, assistantMessage, newTitle', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Hello, help me with my debt' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('userMessage');
    expect(res.body).toHaveProperty('assistantMessage');
    expect(res.body.userMessage.role).toBe('user');
    expect(res.body.assistantMessage.role).toBe('assistant');
    expect(res.body.newTitle).not.toBeNull();
    // callClaude called twice: reply + title generation
    expect(callClaude).toHaveBeenCalledTimes(2);
  });

  it('second message → callClaude called once, newTitle is null', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Hello' });
    callClaude.mockClear();
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'What is the avalanche method?' });
    expect(res.status).toBe(200);
    expect(callClaude).toHaveBeenCalledTimes(1);
    expect(res.body.newTitle).toBeNull();
  });

  it('returns 400 when content is whitespace only', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await request.post('/api/advisor/conversations/99999/messages')
      .send({ content: 'Hello' });
    expect(res.status).toBe(404);
  });

  it('Claude timeout → 504 with error field', async () => {
    callClaude.mockRejectedValueOnce(new Error('Claude CLI timed out'));
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Help me please' });
    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty('error');
  });

  it('Claude unavailable → 502 with error field', async () => {
    callClaude.mockRejectedValueOnce(new Error('exit code 1'));
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Help me please' });
    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  // ── Bug 2: empty Claude response ──────────────────────────────────
  it('Claude returns empty string → 502 with error field', async () => {
    callClaude.mockResolvedValueOnce('');
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Help me please' });
    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/empty/i);
  });

  it('messages after posting ordered by sequence ASC, alternating roles', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'First' });
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Second' });
    const res = await request.get(`/api/advisor/conversations/${conv.id}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].sequence).toBeGreaterThan(res.body[i - 1].sequence);
    }
    expect(res.body[0].role).toBe('user');
    expect(res.body[1].role).toBe('assistant');
  });
});

// ---------------------------------------------------------------------------
// Context snapshot
// ---------------------------------------------------------------------------
describe('Context snapshot', () => {
  it('sets context_snapshot after first message when financial data present', async () => {
    seedDebt(db, { name: 'Test Card', balance: 1000, apr: 0.20, minimum_payment: 50 });
    seedIncome(db, { label: 'Salary', amount: 3000, frequency: 'monthly' });
    seedExpense(db, { label: 'Rent', amount: 800, category: 'housing' });

    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'What should I do about my debt?' });

    const row = db.prepare('SELECT context_snapshot FROM conversations WHERE id = ?').get(conv.id);
    expect(typeof row.context_snapshot).toBe('string');
    expect(row.context_snapshot.length).toBeGreaterThan(0);
  });
});
