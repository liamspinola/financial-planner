import jwt from 'jsonwebtoken';
import express, { type Request, type Response } from 'express';
import request from 'supertest';

const TEST_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long';
process.env['SUPABASE_JWT_SECRET'] = TEST_SECRET;

import { requireAuth } from '../../middleware/auth';

function makeApp() {
  const app = express();
  app.use(requireAuth);
  app.get('/ping', (req: Request, res: Response) => {
    res.json({ userId: req.auth.userId });
  });
  return app;
}

function makeToken(payload: object, secret = TEST_SECRET, options?: jwt.SignOptions): string {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

describe('requireAuth middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(makeApp()).get('/ping');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('returns 401 when scheme is not Bearer', async () => {
    const res = await request(makeApp()).get('/ping').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/bearer/i);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const token = makeToken({ sub: 'user-123' }, 'wrong-secret-value-here-xxxxxxxxxxxx');
    const res = await request(makeApp()).get('/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 for an expired token', async () => {
    const token = makeToken({ sub: 'user-123' }, TEST_SECRET, { expiresIn: '-1s' });
    const res = await request(makeApp()).get('/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token (not valid JWT)', async () => {
    const res = await request(makeApp()).get('/ping').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('attaches userId from sub claim for a valid token', async () => {
    const token = makeToken({ sub: 'user-abc-123' });
    const res = await request(makeApp()).get('/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-abc-123');
  });

  it('returns 401 for a token with no sub claim', async () => {
    const token = makeToken({ email: 'test@example.com' }); // no sub
    const res = await request(makeApp()).get('/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sub/i);
  });
});
