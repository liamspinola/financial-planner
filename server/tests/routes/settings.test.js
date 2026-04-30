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
// GET /api/settings
// ---------------------------------------------------------------------------
describe('GET /api/settings', () => {
  it('returns empty object when DB is empty', async () => {
    const res = await request.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns all keys after PUT', async () => {
    await request.put('/api/settings').send({
      emergency_fund_target: 5000,
      monthly_buffer: 500,
    });
    const res = await request.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('emergency_fund_target');
    expect(res.body).toHaveProperty('monthly_buffer');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/settings
// ---------------------------------------------------------------------------
describe('PUT /api/settings', () => {
  it('stores emergency_fund_target as a string "5000" (values are stringified)', async () => {
    const res = await request.put('/api/settings').send({
      emergency_fund_target: 5000,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('emergency_fund_target');
    expect(res.body.emergency_fund_target).toBe('5000');
  });

  it('updates an existing key when PUT again with a new value', async () => {
    await request.put('/api/settings').send({ emergency_fund_target: 5000 });
    await request.put('/api/settings').send({ emergency_fund_target: 10000 });

    const res = await request.get('/api/settings');
    expect(res.body.emergency_fund_target).toBe('10000');
  });

  it('stores multiple keys in a single PUT and all appear in response', async () => {
    const res = await request.put('/api/settings').send({
      emergency_fund_target: 5000,
      strategy: 'avalanche',
      monthly_buffer: 200,
    });
    expect(res.status).toBe(200);
    expect(res.body.emergency_fund_target).toBe('5000');
    expect(res.body.strategy).toBe('avalanche');
    expect(res.body.monthly_buffer).toBe('200');
  });

  it('handles empty object PUT without crashing and returns 200', async () => {
    const res = await request.put('/api/settings').send({});
    expect(res.status).toBe(200);
  });
});
