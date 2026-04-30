'use strict';

const { clearAll, seedExpense } = require('../helpers/db');

let request, db;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
});

beforeEach(() => clearAll(db));

// ---------------------------------------------------------------------------
// GET /api/progress
// ---------------------------------------------------------------------------
describe('GET /api/progress', () => {
  it('returns empty array when DB is empty', async () => {
    const res = await request.get('/api/progress');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns items sorted ascending by snapshot_month', async () => {
    // Seed out-of-order
    await request.post('/api/progress').send({
      snapshot_month: '2024-06',
      balances: { '1': 200 },
    });
    await request.post('/api/progress').send({
      snapshot_month: '2024-02',
      balances: { '1': 100 },
    });
    await request.post('/api/progress').send({
      snapshot_month: '2024-04',
      balances: { '1': 150 },
    });

    const res = await request.get('/api/progress');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].snapshot_month).toBe('2024-02');
    expect(res.body[1].snapshot_month).toBe('2024-04');
    expect(res.body[2].snapshot_month).toBe('2024-06');
  });

  it('returns balances as a parsed object, not a JSON string', async () => {
    await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: { '1': 500, '2': 300 },
    });

    const res = await request.get('/api/progress');
    expect(res.status).toBe(200);
    expect(typeof res.body[0].balances).toBe('object');
    expect(res.body[0].balances).toEqual({ '1': 500, '2': 300 });
  });
});

// ---------------------------------------------------------------------------
// POST /api/progress — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/progress', () => {
  it('creates a snapshot and returns 200 with correct fields', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: { '1': 500, '2': 300 },
      notes: 'March update',
    });
    expect(res.status).toBe(200);
    expect(res.body.snapshot_month).toBe('2024-03');
    expect(res.body.notes).toBe('March update');
    expect(typeof res.body.balances).toBe('object');
    expect(res.body.balances).toEqual({ '1': 500, '2': 300 });
    expect(typeof res.body.total_balance).toBe('number');
  });

  it('GET after POST returns array with 1 item', async () => {
    const postRes = await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: { '1': 500 },
    });
    expect(postRes.status).toBe(200);

    const res = await request.get('/api/progress');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('computes total_balance as sum of all balance values', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: { '1': 500, '2': 300 },
    });
    expect(res.status).toBe(200);
    expect(res.body.total_balance).toBe(800);
  });

  it('upsert: second POST with same snapshot_month updates the row, DB still has 1 row', async () => {
    await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: { '1': 500 },
      notes: 'first',
    });

    const secondRes = await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: { '1': 999, '2': 1 },
      notes: 'second',
    });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.balances).toEqual({ '1': 999, '2': 1 });
    expect(secondRes.body.notes).toBe('second');
    expect(secondRes.body.total_balance).toBe(1000);

    const count = db.prepare('SELECT COUNT(*) AS n FROM progress_snapshots').get().n;
    expect(count).toBe(1);
  });

  it('accepts snapshot_month: 2024-12 (valid boundary — month 12)', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-12',
      balances: { '1': 100 },
    });
    expect(res.status).toBe(200);
  });

  it('accepts snapshot_month: 2024-01 (valid boundary — month 01)', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-01',
      balances: { '1': 100 },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/progress/:id
// ---------------------------------------------------------------------------
describe('PUT /api/progress/:id', () => {
  it('updates balances and notes and returns 200 with updated values', async () => {
    const postRes = await request.post('/api/progress').send({
      snapshot_month: '2024-05',
      balances: { '1': 400 },
      notes: 'original',
    });
    const id = postRes.body.id;

    const putRes = await request.put(`/api/progress/${id}`).send({
      balances: { '1': 750, '2': 250 },
      notes: 'updated notes',
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.balances).toEqual({ '1': 750, '2': 250 });
    expect(putRes.body.notes).toBe('updated notes');
    expect(putRes.body.total_balance).toBe(1000);
  });

  it('returns 404 for non-existent snapshot', async () => {
    const res = await request.put('/api/progress/99999').send({
      balances: { '1': 100 },
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/progress/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/progress/:id', () => {
  it('returns { ok: true } and snapshot is gone from GET', async () => {
    const postRes = await request.post('/api/progress').send({
      snapshot_month: '2024-07',
      balances: { '1': 600 },
    });
    const id = postRes.body.id;

    const delRes = await request.delete(`/api/progress/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ ok: true });

    const getRes = await request.get('/api/progress');
    expect(getRes.body).toHaveLength(0);
  });

  it('returns 404 for non-existent snapshot', async () => {
    const res = await request.delete('/api/progress/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/progress — negative paths (validation)
// ---------------------------------------------------------------------------
describe('POST /api/progress — validation errors', () => {
  it('returns 400 for snapshot_month: "2024-1" (not zero-padded)', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-1',
      balances: { '1': 100 },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for snapshot_month: "2024-13" (invalid month > 12)', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-13',
      balances: { '1': 100 },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for snapshot_month: "2024-00" (invalid month 00)', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-00',
      balances: { '1': 100 },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when balances is missing', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-03',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when balances is a string (not an object)', async () => {
    const res = await request.post('/api/progress').send({
      snapshot_month: '2024-03',
      balances: 'not-an-object',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
