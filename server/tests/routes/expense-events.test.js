'use strict';

const { clearAll } = require('../helpers/db');

let request, db;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
});

beforeEach(() => clearAll(db));

// ---------------------------------------------------------------------------
// GET /api/expense-events
// ---------------------------------------------------------------------------
describe('GET /api/expense-events', () => {
  it('returns empty array when DB is empty', async () => {
    const res = await request.get('/api/expense-events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/expense-events — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/expense-events', () => {
  it('creates an event with category: expected and returns 201', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Car service',
      amount: 400,
      apply_month: 3,
      category: 'expected',
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('expected');
  });

  it('creates an event with category: unexpected and returns 201', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Emergency repair',
      amount: 800,
      apply_month: 5,
      category: 'unexpected',
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('unexpected');
  });

  it('defaults to category: expected when category is omitted', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Annual fee',
      amount: 120,
      apply_month: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('expected');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/expense-events/:id
// ---------------------------------------------------------------------------
describe('PUT /api/expense-events/:id', () => {
  it('updates all fields including category and returns new values', async () => {
    const postRes = await request.post('/api/expense-events').send({
      label: 'Original',
      amount: 100,
      apply_month: 1,
      category: 'expected',
    });
    const id = postRes.body.id;

    const putRes = await request.put(`/api/expense-events/${id}`).send({
      label: 'Updated Event',
      amount: 500,
      apply_month: 8,
      category: 'unexpected',
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.label).toBe('Updated Event');
    expect(putRes.body.amount).toBe(500);
    expect(putRes.body.apply_month).toBe(8);
    expect(putRes.body.category).toBe('unexpected');
  });

  it('returns 404 for non-existent expense event', async () => {
    const res = await request.put('/api/expense-events/99999').send({
      label: 'Ghost',
      amount: 100,
      apply_month: 1,
      category: 'expected',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/expense-events/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/expense-events/:id', () => {
  it('returns { ok: true } and event is gone from GET', async () => {
    const postRes = await request.post('/api/expense-events').send({
      label: 'Goodbye',
      amount: 200,
      apply_month: 2,
      category: 'expected',
    });
    const id = postRes.body.id;

    const delRes = await request.delete(`/api/expense-events/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ ok: true });

    const getRes = await request.get('/api/expense-events');
    expect(getRes.body).toHaveLength(0);
  });

  it('returns 404 for non-existent expense event', async () => {
    const res = await request.delete('/api/expense-events/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/expense-events — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/expense-events — validation errors', () => {
  it('returns 400 when category is an invalid value (scheduled)', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Bad Category',
      amount: 100,
      apply_month: 1,
      category: 'scheduled',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when amount is negative', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Bad Amount',
      amount: -1,
      apply_month: 1,
      category: 'expected',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when amount is 0 (must be positive)', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Zero Amount',
      amount: 0,
      apply_month: 1,
      category: 'expected',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when apply_month is 0', async () => {
    const res = await request.post('/api/expense-events').send({
      label: 'Bad Month',
      amount: 100,
      apply_month: 0,
      category: 'expected',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when label is missing', async () => {
    const res = await request.post('/api/expense-events').send({
      amount: 100,
      apply_month: 1,
      category: 'expected',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
