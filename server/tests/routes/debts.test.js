'use strict';

const { clearAll, seedDebt } = require('../helpers/db');

let request, db;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
});

beforeEach(() => clearAll(db));

// ---------------------------------------------------------------------------
// GET /api/debts
// ---------------------------------------------------------------------------
describe('GET /api/debts', () => {
  it('returns empty arrays when DB is empty', async () => {
    const res = await request.get('/api/debts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ debts: [], tranches: [] });
  });

  it('returns seeded debt and its tranches', async () => {
    const { debtId, trancheId } = seedDebt(db);
    const res = await request.get('/api/debts');
    expect(res.status).toBe(200);
    expect(res.body.debts).toHaveLength(1);
    expect(res.body.debts[0].id).toBe(debtId);
    expect(res.body.tranches).toHaveLength(1);
    expect(res.body.tranches[0].id).toBe(trancheId);
    expect(res.body.tranches[0].debt_id).toBe(debtId);
  });
});

// ---------------------------------------------------------------------------
// POST /api/debts — happy paths
// ---------------------------------------------------------------------------
describe('POST /api/debts', () => {
  it('creates a debt with one tranche and returns 201 with { debt, tranches }', async () => {
    const res = await request.post('/api/debts').send({
      name: 'My Visa',
      lender: 'Big Bank',
      debt_type: 'credit_card',
      minimum_payment: 25,
      tranches: [{ label: 'Main', balance: 500, apr: 0.18 }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('debt');
    expect(res.body).toHaveProperty('tranches');
    expect(res.body.debt.name).toBe('My Visa');
    expect(res.body.tranches).toHaveLength(1);
    expect(res.body.tranches[0].label).toBe('Main');
  });

  it('creates a debt with no tranches (empty array) and returns 201 with tranches: []', async () => {
    const res = await request.post('/api/debts').send({
      name: 'Empty Debt',
      debt_type: 'personal_loan',
      minimum_payment: 100,
      tranches: [],
    });
    expect(res.status).toBe(201);
    expect(res.body.tranches).toEqual([]);
  });

  it('accepts tranche with apr: 2.0 (boundary max is valid)', async () => {
    const res = await request.post('/api/debts').send({
      name: 'Max APR Debt',
      minimum_payment: 0,
      tranches: [{ label: 'T', balance: 100, apr: 2.0 }],
    });
    expect(res.status).toBe(201);
  });

  it('accepts tranche with apr: 0.0 (boundary min is valid)', async () => {
    const res = await request.post('/api/debts').send({
      name: 'Zero APR Debt',
      minimum_payment: 0,
      tranches: [{ label: 'T', balance: 100, apr: 0.0 }],
    });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /api/debts — negative paths
// ---------------------------------------------------------------------------
describe('POST /api/debts — validation errors', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request.post('/api/debts').send({
      debt_type: 'credit_card',
      minimum_payment: 25,
      tranches: [],
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when name is whitespace only', async () => {
    const res = await request.post('/api/debts').send({
      name: '   ',
      minimum_payment: 25,
      tranches: [],
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when tranche apr exceeds 2.0', async () => {
    const res = await request.post('/api/debts').send({
      name: 'Bad APR Debt',
      minimum_payment: 0,
      tranches: [{ label: 'T', balance: 100, apr: 2.01 }],
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when tranche apr is negative', async () => {
    const res = await request.post('/api/debts').send({
      name: 'Negative APR Debt',
      minimum_payment: 0,
      tranches: [{ label: 'T', balance: 100, apr: -0.01 }],
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when tranche balance is negative', async () => {
    const res = await request.post('/api/debts').send({
      name: 'Negative Balance Debt',
      minimum_payment: 0,
      tranches: [{ label: 'T', balance: -1, apr: 0.1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/debts/:id
// ---------------------------------------------------------------------------
describe('PUT /api/debts/:id', () => {
  it('updates an existing debt and returns updated fields', async () => {
    const { debtId } = seedDebt(db, { name: 'Old Name' });
    const res = await request.put(`/api/debts/${debtId}`).send({
      name: 'New Name',
      lender: 'New Lender',
      debt_type: 'personal_loan',
      minimum_payment: 75,
      tranches: [{ label: 'Updated', balance: 800, apr: 0.12 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.debt.name).toBe('New Name');
    expect(res.body.debt.lender).toBe('New Lender');
    expect(res.body.tranches).toHaveLength(1);
    expect(res.body.tranches[0].label).toBe('Updated');
  });

  it('returns 404 when debt does not exist', async () => {
    const res = await request.put('/api/debts/99999').send({
      name: 'Ghost Debt',
      minimum_payment: 0,
      tranches: [],
    });
    expect(res.status).toBe(404);
  });

  it('invalidates plan_cache on PUT', async () => {
    const { debtId } = seedDebt(db);
    db.prepare(
      "INSERT INTO plan_cache (id, input_hash, strategy, calc_result, generated_at) VALUES (1, 'abc', 'avalanche', '{}', datetime('now'))"
    ).run();

    await request.put(`/api/debts/${debtId}`).send({
      name: 'Updated Debt',
      minimum_payment: 50,
      tranches: [{ label: 'T', balance: 500, apr: 0.15 }],
    });

    const cacheRows = db.prepare('SELECT * FROM plan_cache').all();
    expect(cacheRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/debts/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/debts/:id', () => {
  it('returns { ok: true } and removes the debt from subsequent GET', async () => {
    const { debtId } = seedDebt(db);
    const delRes = await request.delete(`/api/debts/${debtId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ ok: true });

    const getRes = await request.get('/api/debts');
    expect(getRes.body.debts).toHaveLength(0);
  });

  it('cascade deletes tranches when debt is deleted', async () => {
    const { debtId } = seedDebt(db);
    await request.delete(`/api/debts/${debtId}`);
    const trancheRows = db.prepare('SELECT * FROM tranches WHERE debt_id = ?').all(debtId);
    expect(trancheRows).toHaveLength(0);
  });

  it('returns 404 when debt does not exist', async () => {
    const res = await request.delete('/api/debts/99999');
    expect(res.status).toBe(404);
  });
});
