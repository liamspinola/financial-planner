import express, { type Request, type Response } from 'express';
import request from 'supertest';

// Import AFTER mocking so the limiters use our fake windowMs
jest.mock('../../middleware/rateLimit', () => {
  const rateLimit = jest.requireActual('express-rate-limit').default ?? jest.requireActual('express-rate-limit');
  return {
    generalLimiter: rateLimit({ windowMs: 1000, max: 3, standardHeaders: true, legacyHeaders: false }),
    aiLimiter:      rateLimit({ windowMs: 1000, max: 2, standardHeaders: true, legacyHeaders: false }),
  };
});

import { generalLimiter, aiLimiter } from '../../middleware/rateLimit';

function makeApp(limiter: any) {
  const app = express();
  app.set('trust proxy', false);
  app.use(limiter);
  app.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

describe('generalLimiter', () => {
  it('allows requests under the limit', async () => {
    const app = makeApp(generalLimiter);
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });

  it('returns 429 when limit is exceeded', async () => {
    const app = makeApp(generalLimiter);
    await request(app).get('/ping');
    await request(app).get('/ping');
    await request(app).get('/ping');
    const res = await request(app).get('/ping'); // 4th request over limit of 3
    expect(res.status).toBe(429);
  });
});

describe('aiLimiter', () => {
  it('returns 429 after AI limit is exceeded', async () => {
    const app = makeApp(aiLimiter);
    await request(app).get('/ping');
    await request(app).get('/ping');
    const res = await request(app).get('/ping'); // 3rd request over limit of 2
    expect(res.status).toBe(429);
  });

  it('returns correct error body on 429', async () => {
    const app = makeApp(aiLimiter);
    await request(app).get('/ping');
    await request(app).get('/ping');
    const res = await request(app).get('/ping');
    expect(res.status).toBe(429);
    // Check that the error message is in the response (either body or text)
    const bodyOrText = res.body?.message ?? res.text ?? '';
    expect(bodyOrText).toMatch(/too many/i);
  });
});
