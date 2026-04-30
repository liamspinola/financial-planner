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
// SQL Injection
// ---------------------------------------------------------------------------
describe('SQL Injection', () => {
  it("POST /api/debts with SQL injection name → 201, stored literally, table still works", async () => {
    const maliciousName = "'; DROP TABLE debts; --";

    const res = await request.post('/api/debts').send({
      name: maliciousName,
      minimum_payment: 50,
      debt_type: 'credit_card',
    });

    expect(res.status).toBe(201);
    expect(res.body.debt.name).toBe(maliciousName);

    // Table still works — GET returns the record
    const listRes = await request.get('/api/debts');
    expect(listRes.status).toBe(200);
    expect(listRes.body.debts.some(d => d.name === maliciousName)).toBe(true);
  });

  it("POST /api/budget/income with SQL injection label → 201, stored literally", async () => {
    const maliciousLabel = "' OR '1'='1";

    const res = await request.post('/api/budget/income').send({
      label: maliciousLabel,
      amount: 2000,
      frequency: 'monthly',
    });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe(maliciousLabel);
  });
});

// ---------------------------------------------------------------------------
// XSS Payloads
// ---------------------------------------------------------------------------
describe('XSS Payloads', () => {
  it("POST /api/budget/expenses with XSS label → 201, label round-trips unchanged", async () => {
    const xssLabel = '<script>alert(1)</script>';

    const res = await request.post('/api/budget/expenses').send({
      label: xssLabel,
      amount: 500,
      category: 'entertainment',
    });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe(xssLabel);
  });

  it("PUT /api/settings with XSS value → 200, GET returns literal string unchanged", async () => {
    const xssValue = '<img src=x onerror=alert(1)>';

    const putRes = await request.put('/api/settings').send({
      test_key: xssValue,
    });
    expect(putRes.status).toBe(200);

    const getRes = await request.get('/api/settings');
    expect(getRes.status).toBe(200);
    expect(getRes.body.test_key).toBe(xssValue);
  });
});

// ---------------------------------------------------------------------------
// Oversized Payloads
// ---------------------------------------------------------------------------
describe('Oversized Payloads', () => {
  it("POST /api/debts with 200kb name → 413 (Express body limit exceeded)", async () => {
    const bigName = 'x'.repeat(200 * 1024);

    const res = await request.post('/api/debts').send({
      name: bigName,
      minimum_payment: 50,
      debt_type: 'credit_card',
    });

    expect(res.status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// Prototype Pollution
// ---------------------------------------------------------------------------
describe('Prototype Pollution', () => {
  it("PUT /api/settings with __proto__ key → 200, Object.prototype not polluted", async () => {
    const res = await request.put('/api/settings')
      .send({ '__proto__': { polluted: true } });

    expect(res.status).toBe(200);

    // Object prototype must NOT be polluted
    expect(({}).polluted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Null Bytes
// ---------------------------------------------------------------------------
describe('Null Bytes', () => {
  it("POST /api/windfalls with null byte in label → 201 or 400, no 500 crash", async () => {
    const res = await request.post('/api/windfalls').send({
      label: 'Test\x00Name',
      amount: 100,
      apply_month: 1,
    });

    expect([201, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Type Confusion
// ---------------------------------------------------------------------------
describe('Type Confusion', () => {
  it("POST /api/actuals with amount_actual as string → 400", async () => {
    const res = await request.post('/api/actuals').send({
      category: 'food',
      label: 'Groceries',
      amount_actual: '100',  // string instead of number
      record_month: '2026-04',
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it("POST /api/budget/income with amount as boolean → 400", async () => {
    const res = await request.post('/api/budget/income').send({
      label: 'Salary',
      amount: true,  // boolean instead of number
      frequency: 'monthly',
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
