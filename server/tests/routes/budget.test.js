'use strict';

const { clearAll, seedIncome, seedExpense } = require('../helpers/db');

let request, db;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
});

beforeEach(() => clearAll(db));

// ---------------------------------------------------------------------------
// GET /api/budget
// ---------------------------------------------------------------------------
describe('GET /api/budget', () => {
  it('returns empty arrays when DB is empty', async () => {
    const res = await request.get('/api/budget');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ income: [], expenses: [] });
  });
});

// ---------------------------------------------------------------------------
// POST /api/budget/income — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/budget/income', () => {
  const validFrequencies = ['weekly', 'fortnightly', 'four_weekly', 'monthly', 'annual'];

  for (const freq of validFrequencies) {
    it(`accepts frequency: '${freq}' and returns 201`, async () => {
      const res = await request.post('/api/budget/income').send({
        label: `${freq} pay`,
        amount: 1000,
        frequency: freq,
      });
      expect(res.status).toBe(201);
    });
  }

  it('stores correct monthly_equivalent for four_weekly amount 1200', async () => {
    const res = await request.post('/api/budget/income').send({
      label: 'Four Weekly Pay',
      amount: 1200,
      frequency: 'four_weekly',
    });
    expect(res.status).toBe(201);
    // four_weekly: amount * 13 (13 four-weekly periods per year)
    expect(res.body.monthly_equivalent).toBeCloseTo(1200 * 13, 5);
  });

  it('stores correct monthly_equivalent for weekly amount 1200', async () => {
    const res = await request.post('/api/budget/income').send({
      label: 'Weekly Pay',
      amount: 1200,
      frequency: 'weekly',
    });
    expect(res.status).toBe(201);
    // weekly: amount * 52 / 12
    expect(res.body.monthly_equivalent).toBeCloseTo((1200 * 52) / 12, 5);
  });

  it('stores is_essential as 0 when expense posted with is_essential: false', async () => {
    const res = await request.post('/api/budget/expenses').send({
      label: 'Netflix',
      amount: 15,
      category: 'entertainment',
      is_essential: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.is_essential).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/budget/income/:id
// ---------------------------------------------------------------------------
describe('PUT /api/budget/income/:id', () => {
  it('updates record and recalculates monthly_equivalent (weekly → monthly, amount 2000)', async () => {
    const id = seedIncome(db, { label: 'Old Income', amount: 500, frequency: 'weekly' });
    const res = await request.put(`/api/budget/income/${id}`).send({
      label: 'New Income',
      amount: 2000,
      frequency: 'monthly',
    });
    expect(res.status).toBe(200);
    expect(res.body.monthly_equivalent).toBe(2000);
    expect(res.body.label).toBe('New Income');
  });

  it('returns 404 for non-existent income', async () => {
    const res = await request.put('/api/budget/income/99999').send({
      label: 'Ghost',
      amount: 100,
      frequency: 'monthly',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/budget/income/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/budget/income/:id', () => {
  it('removes income and it is gone from GET', async () => {
    const id = seedIncome(db);
    const delRes = await request.delete(`/api/budget/income/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ ok: true });

    const getRes = await request.get('/api/budget');
    expect(getRes.body.income).toHaveLength(0);
  });

  it('returns 404 for non-existent income', async () => {
    const res = await request.delete('/api/budget/income/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/budget/expenses — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/budget/expenses', () => {
  it('creates an expense and returns 201', async () => {
    const res = await request.post('/api/budget/expenses').send({
      label: 'Rent',
      amount: 1200,
      category: 'housing',
      is_essential: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Rent');
    expect(res.body.is_essential).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/budget/expenses/:id
// ---------------------------------------------------------------------------
describe('PUT /api/budget/expenses/:id', () => {
  it('updates expense record and returns updated values', async () => {
    const id = seedExpense(db, { label: 'Old Expense', amount: 100, category: 'food' });
    const res = await request.put(`/api/budget/expenses/${id}`).send({
      label: 'Updated Expense',
      amount: 200,
      category: 'transport',
      is_essential: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Expense');
    expect(res.body.amount).toBe(200);
    expect(res.body.category).toBe('transport');
  });

  it('returns 404 for non-existent expense', async () => {
    const res = await request.put('/api/budget/expenses/99999').send({
      label: 'Ghost',
      amount: 50,
      category: 'misc',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/budget/expenses/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/budget/expenses/:id', () => {
  it('removes expense and it is gone from GET', async () => {
    const id = seedExpense(db);
    const delRes = await request.delete(`/api/budget/expenses/${id}`);
    expect(delRes.status).toBe(200);

    const getRes = await request.get('/api/budget');
    expect(getRes.body.expenses).toHaveLength(0);
  });

  it('returns 404 for non-existent expense', async () => {
    const res = await request.delete('/api/budget/expenses/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/budget/income — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/budget/income — validation errors', () => {
  it('returns 400 when frequency is invalid (bi-monthly)', async () => {
    const res = await request.post('/api/budget/income').send({
      label: 'Pay',
      amount: 1000,
      frequency: 'bi-monthly',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when amount is negative', async () => {
    const res = await request.post('/api/budget/income').send({
      label: 'Pay',
      amount: -1,
      frequency: 'monthly',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when label is null', async () => {
    const res = await request.post('/api/budget/income').send({
      label: null,
      amount: 1000,
      frequency: 'monthly',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when label is empty string', async () => {
    const res = await request.post('/api/budget/income').send({
      label: '',
      amount: 1000,
      frequency: 'monthly',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/budget/expenses — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/budget/expenses — validation errors', () => {
  it('returns 400 when category is missing', async () => {
    const res = await request.post('/api/budget/expenses').send({
      label: 'Mystery',
      amount: 50,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when amount is negative', async () => {
    const res = await request.post('/api/budget/expenses').send({
      label: 'Bad Expense',
      amount: -1,
      category: 'food',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/budget/expenses — negative paths
// ---------------------------------------------------------------------------
describe('PUT /api/budget/expenses — validation errors', () => {
  it('returns 404 for non-existent expense (duplicate coverage as separate describe)', async () => {
    const res = await request.put('/api/budget/expenses/88888').send({
      label: 'Nope',
      amount: 10,
      category: 'misc',
    });
    expect(res.status).toBe(404);
  });
});
