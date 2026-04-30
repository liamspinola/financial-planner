'use strict';

let request;

beforeAll(() => {
  jest.resetModules();
  const app = require('../../index');
  request = require('supertest')(app);
});

describe('GET /api/health', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
