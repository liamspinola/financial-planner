import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: 'user-test-123' };
    next();
  },
}));

// Mock Supabase admin client used for user deletion
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        deleteUser: jest.fn().mockResolvedValue({ error: null }),
      },
    },
  })),
}));

import { createClient } from '@supabase/supabase-js';

function getAdminDeleteUser(): jest.Mock {
  return (createClient as jest.Mock).mock.results[0]?.value.auth.admin.deleteUser as jest.Mock;
}

// Mock Drizzle db — all deletes succeed
const mockDb = {
  delete: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue([]),
  }),
};
jest.mock('../../db/connection', () => ({ db: mockDb }));

import usersRouter from '../../routes/users';

const app = express();
app.use(express.json());
app.use('/api/v1/users', usersRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
  process.env['SUPABASE_URL'] = 'https://fake.supabase.co';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'fake-service-key';
});

describe('GET /api/v1/users/me', () => {
  it('returns userId from JWT', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'user-test-123' });
  });
});

describe('DELETE /api/v1/users/me', () => {
  it('returns 200 on successful deletion', async () => {
    const res = await request(app).delete('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it('calls db.delete for every user table', async () => {
    await request(app).delete('/api/v1/users/me');
    // Tables: messages, conversations, tranches, debts, expenses,
    //   income_sources, plan_cache, progress_snapshots, windfalls,
    //   expense_events, spending_actuals, user_ai_keys, settings
    expect(mockDb.delete.mock.calls.length).toBeGreaterThanOrEqual(13);
  });

  it('calls Supabase admin deleteUser with the correct userId', async () => {
    await request(app).delete('/api/v1/users/me');
    const deleteUser = getAdminDeleteUser();
    expect(deleteUser).toHaveBeenCalledWith('user-test-123');
  });

  it('returns 502 if Supabase admin deleteUser fails', async () => {
    (createClient as jest.Mock).mockReturnValueOnce({
      auth: {
        admin: {
          deleteUser: jest.fn().mockResolvedValue({ error: { message: 'User not found in Supabase' } }),
        },
      },
    });
    const res = await request(app).delete('/api/v1/users/me');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/supabase/i);
  });
});
