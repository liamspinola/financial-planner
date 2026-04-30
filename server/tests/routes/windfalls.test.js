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
// GET /api/windfalls
// ---------------------------------------------------------------------------
describe('GET /api/windfalls', () => {
  it('returns empty array when DB is empty', async () => {
    const res = await request.get('/api/windfalls');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/windfalls — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/windfalls', () => {
  it('creates a windfall and returns 201 with an id', async () => {
    const res = await request.post('/api/windfalls').send({
      label: 'Tax return',
      amount: 1500,
      apply_month: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.label).toBe('Tax return');
    expect(res.body.amount).toBe(1500);
    expect(res.body.apply_month).toBe(3);
  });

  it('GET after POST returns the windfall', async () => {
    await request.post('/api/windfalls').send({
      label: 'Bonus',
      amount: 2000,
      apply_month: 6,
    });
    const res = await request.get('/api/windfalls');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].label).toBe('Bonus');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/windfalls/:id
// ---------------------------------------------------------------------------
describe('PUT /api/windfalls/:id', () => {
  it('updates windfall fields and returns updated values', async () => {
    const postRes = await request.post('/api/windfalls').send({
      label: 'Original',
      amount: 500,
      apply_month: 1,
    });
    const id = postRes.body.id;

    const putRes = await request.put(`/api/windfalls/${id}`).send({
      label: 'Updated',
      amount: 999,
      apply_month: 12,
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.label).toBe('Updated');
    expect(putRes.body.amount).toBe(999);
    expect(putRes.body.apply_month).toBe(12);
  });

  it('returns 404 for non-existent windfall', async () => {
    const res = await request.put('/api/windfalls/99999').send({
      label: 'Ghost',
      amount: 100,
      apply_month: 1,
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/windfalls/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/windfalls/:id', () => {
  it('returns { ok: true } and windfall is gone from GET', async () => {
    const postRes = await request.post('/api/windfalls').send({
      label: 'Goodbye',
      amount: 300,
      apply_month: 2,
    });
    const id = postRes.body.id;

    const delRes = await request.delete(`/api/windfalls/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ ok: true });

    const getRes = await request.get('/api/windfalls');
    expect(getRes.body).toHaveLength(0);
  });

  it('returns 404 for non-existent windfall', async () => {
    const res = await request.delete('/api/windfalls/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/windfalls — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/windfalls — validation errors', () => {
  it('returns 400 when apply_month is 0', async () => {
    const res = await request.post('/api/windfalls').send({
      label: 'Tax',
      amount: 100,
      apply_month: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when apply_month is a float', async () => {
    const res = await request.post('/api/windfalls').send({
      label: 'Tax',
      amount: 100,
      apply_month: 1.5,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when amount is 0 (must be positive, not non-negative)', async () => {
    const res = await request.post('/api/windfalls').send({
      label: 'Tax',
      amount: 0,
      apply_month: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when amount is negative', async () => {
    const res = await request.post('/api/windfalls').send({
      label: 'Tax',
      amount: -100,
      apply_month: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when label is missing', async () => {
    const res = await request.post('/api/windfalls').send({
      amount: 500,
      apply_month: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when label is whitespace only', async () => {
    const res = await request.post('/api/windfalls').send({
      label: '   ',
      amount: 500,
      apply_month: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
