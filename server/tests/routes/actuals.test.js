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
// GET /api/actuals
// ---------------------------------------------------------------------------
describe('GET /api/actuals', () => {
  it('returns empty array when DB is empty', async () => {
    const res = await request.get('/api/actuals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all records when no month filter is given', async () => {
    await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent March',
      amount_actual: 850,
      record_month: '2024-03',
    });
    await request.post('/api/actuals').send({
      category: 'food',
      label: 'Groceries April',
      amount_actual: 300,
      record_month: '2024-04',
    });

    const res = await request.get('/api/actuals');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters records by month when ?month= is provided', async () => {
    await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent March',
      amount_actual: 850,
      record_month: '2024-03',
    });
    await request.post('/api/actuals').send({
      category: 'food',
      label: 'Groceries April',
      amount_actual: 300,
      record_month: '2024-04',
    });

    const res = await request.get('/api/actuals?month=2024-03');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].record_month).toBe('2024-03');
    expect(res.body[0].label).toBe('Rent March');
  });

  it('returns empty array when no records match the given month', async () => {
    await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent March',
      amount_actual: 850,
      record_month: '2024-03',
    });

    const res = await request.get('/api/actuals?month=2024-04');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/actuals — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/actuals', () => {
  it('creates an actual record and returns 201 with id', async () => {
    const res = await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent actual',
      amount_actual: 850,
      record_month: '2024-03',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.category).toBe('housing');
    expect(res.body.label).toBe('Rent actual');
    expect(res.body.amount_actual).toBe(850);
    expect(res.body.record_month).toBe('2024-03');
  });

  it('creates an actual linked to a seeded expense via expense_id', async () => {
    const expenseId = seedExpense(db, { label: 'Rent', amount: 800, category: 'housing' });

    const res = await request.post('/api/actuals').send({
      expense_id: expenseId,
      category: 'housing',
      label: 'Rent actual linked',
      amount_actual: 820,
      record_month: '2024-03',
    });
    expect(res.status).toBe(201);
    expect(res.body.expense_id).toBe(expenseId);
  });
});

// ---------------------------------------------------------------------------
// GET /api/actuals/summary
// ---------------------------------------------------------------------------
describe('GET /api/actuals/summary', () => {
  it('returns category summary with budgeted, actual, and delta', async () => {
    seedExpense(db, { label: 'Rent', amount: 800, category: 'housing' });
    await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent actual',
      amount_actual: 900,
      record_month: '2024-03',
    });

    const res = await request.get('/api/actuals/summary?month=2024-03');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const row = res.body[0];
    expect(row.category).toBe('housing');
    expect(row.budgeted).toBe(800);
    expect(row.actual).toBe(900);
    expect(row.delta).toBe(100); // actual - budgeted
  });

  it('returns budgeted: 0 for categories with no budgeted expenses', async () => {
    await request.post('/api/actuals').send({
      category: 'misc',
      label: 'Random spend',
      amount_actual: 50,
      record_month: '2024-03',
    });

    const res = await request.get('/api/actuals/summary?month=2024-03');
    expect(res.status).toBe(200);
    const row = res.body.find(r => r.category === 'misc');
    expect(row).toBeDefined();
    expect(row.budgeted).toBe(0);
    expect(row.actual).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/actuals/:id
// ---------------------------------------------------------------------------
describe('PUT /api/actuals/:id', () => {
  it('updates amount_actual and returns 200 with updated value', async () => {
    const postRes = await request.post('/api/actuals').send({
      category: 'utilities',
      label: 'Electric bill',
      amount_actual: 120,
      record_month: '2024-03',
    });
    const id = postRes.body.id;

    const putRes = await request.put(`/api/actuals/${id}`).send({
      amount_actual: 145,
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.amount_actual).toBe(145);
    expect(putRes.body.id).toBe(id);
  });

  it('returns 404 for non-existent actual', async () => {
    const res = await request.put('/api/actuals/99999').send({
      amount_actual: 100,
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/actuals/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/actuals/:id', () => {
  it('returns { ok: true } and record is gone from GET', async () => {
    const postRes = await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent to delete',
      amount_actual: 800,
      record_month: '2024-05',
    });
    const id = postRes.body.id;

    const delRes = await request.delete(`/api/actuals/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ ok: true });

    const getRes = await request.get('/api/actuals');
    expect(getRes.body).toHaveLength(0);
  });

  it('returns 404 for non-existent actual', async () => {
    const res = await request.delete('/api/actuals/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/actuals/summary — negative paths
// ---------------------------------------------------------------------------
describe('GET /api/actuals/summary — validation errors', () => {
  it('returns 400 when month query param is missing', async () => {
    const res = await request.get('/api/actuals/summary');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for month=2024-3 (not zero-padded — fails YYYY-MM regex)', async () => {
    const res = await request.get('/api/actuals/summary?month=2024-3');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for month=2024-13 (invalid calendar month)', async () => {
    const res = await request.get('/api/actuals/summary?month=2024-13');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/actuals — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/actuals — validation errors', () => {
  it('returns 400 for record_month: "2024-3" (not zero-padded)', async () => {
    const res = await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent',
      amount_actual: 800,
      record_month: '2024-3',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for record_month: "2024-13" (invalid calendar month)', async () => {
    const res = await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent',
      amount_actual: 800,
      record_month: '2024-13',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for amount_actual: -1 (negative)', async () => {
    const res = await request.post('/api/actuals').send({
      category: 'housing',
      label: 'Rent',
      amount_actual: -1,
      record_month: '2024-03',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when category is missing', async () => {
    const res = await request.post('/api/actuals').send({
      label: 'Rent',
      amount_actual: 800,
      record_month: '2024-03',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when label is missing', async () => {
    const res = await request.post('/api/actuals').send({
      category: 'housing',
      amount_actual: 800,
      record_month: '2024-03',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
