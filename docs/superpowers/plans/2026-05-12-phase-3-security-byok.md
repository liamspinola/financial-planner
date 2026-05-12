# Phase 3: Security + BYOK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rate limiting, user account management (GET/DELETE /users/me), AES-256-GCM BYOK key encryption, and AI key CRUD routes — completing all Phase 3 spec requirements on top of the Phase 2 foundation.

**Architecture:** Three parallel concerns: (A) rate limiting middleware wired globally in index.ts, (B) user management route handling JWT-verified identity and cascade-deletes via Drizzle, (C) BYOK key encryption using Node.js built-in `crypto` module with AES-256-GCM. All three are tested independently before being wired into `server/index.ts`. No new npm packages except `express-rate-limit`.

**Tech Stack:** TypeScript strict, Drizzle ORM, `express-rate-limit`, Node.js `crypto` (built-in), `@supabase/supabase-js` admin client (already installed), Jest + supertest

---

## What Phase 2 Already Completed (do not repeat)

- `helmet` ✅ — already in `server/index.ts`
- CORS with `CLIENT_ORIGIN` guard ✅ — already in `server/index.ts`
- Zod validation on all routes ✅ — every route uses `safeParse`
- Health route `GET /api/v1/health` ✅ — already in `server/index.ts`
- Cross-user isolation tests ✅ — `server/__tests__/integration/user-isolation.test.ts`
- `user_ai_keys` table ✅ — already in `drizzle/schema.ts`
- `requireAuth` middleware ✅ — `server/middleware/auth.ts`

---

## File Map

| File | Action |
|------|--------|
| `server/middleware/rateLimit.ts` | Create — general (100/min) + AI (10/min) limiters |
| `server/__tests__/middleware/rateLimit.test.ts` | Create — tests for 429 behaviour |
| `server/lib/encryption.ts` | Create — AES-256-GCM encrypt/decrypt for BYOK keys |
| `server/__tests__/lib/encryption.test.ts` | Create — roundtrip, bad-key, IV uniqueness tests |
| `server/routes/users.ts` | Create — GET /me, DELETE /me (cascade all tables) |
| `server/__tests__/routes/users.test.ts` | Create |
| `server/routes/ai-keys.ts` | Create — GET (exists?), POST (store encrypted), DELETE |
| `server/__tests__/routes/ai-keys.test.ts` | Create |
| `server/index.ts` | Modify — mount rateLimit, usersRouter, aiKeysRouter |
| `.env.example` | Modify — add BYOK_ENCRYPTION_KEY, GEMINI_API_KEY |

---

## Task 1: Install express-rate-limit

**Files:** `server/package.json`, `server/package-lock.json`

- [ ] Run in `server/` directory:
  ```bash
  npm install express-rate-limit
  npm install --save-dev @types/express-rate-limit
  ```

- [ ] Verify it's listed in `server/package.json` dependencies.

- [ ] Commit:
  ```bash
  git add server/package.json server/package-lock.json
  git commit -m "chore: install express-rate-limit"
  ```

---

## Task 2: Rate limiting middleware

**Files:**
- Create: `server/middleware/rateLimit.ts`
- Create: `server/__tests__/middleware/rateLimit.test.ts`

### Step 1: Write the failing test

- [ ] Create `server/__tests__/middleware/rateLimit.test.ts`:

```typescript
import express, { type Request, type Response } from 'express';
import request from 'supertest';

// Import AFTER mocking so the limiters use our fake windowMs
jest.mock('../middleware/rateLimit', () => {
  const rateLimit = jest.requireActual('express-rate-limit').default ?? jest.requireActual('express-rate-limit');
  return {
    generalLimiter: rateLimit({ windowMs: 1000, max: 3, standardHeaders: true, legacyHeaders: false }),
    aiLimiter:      rateLimit({ windowMs: 1000, max: 2, standardHeaders: true, legacyHeaders: false }),
  };
});

import { generalLimiter, aiLimiter } from '../middleware/rateLimit';

function makeApp(limiter: ReturnType<typeof import('express-rate-limit').default>) {
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
    expect(res.body).toMatchObject({ error: expect.stringMatching(/too many/i) });
  });
});
```

- [ ] Run: `cd server && npm test -- --testPathPattern=rateLimit.test.ts`
- [ ] Expected: **FAIL** — `../middleware/rateLimit` not found

### Step 2: Implement the middleware

- [ ] Create `server/middleware/rateLimit.ts`:

```typescript
import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down and try again in a minute.' },
});

export const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests — limit is 10 per minute. Please wait before trying again.' },
});
```

### Step 3: Run tests

- [ ] Run: `cd server && npm test -- --testPathPattern=rateLimit.test.ts`
- [ ] Expected: **4 passing**

### Step 4: Commit

```bash
git add server/middleware/rateLimit.ts server/__tests__/middleware/rateLimit.test.ts
git commit -m "feat: add rate limiting middleware (100/min general, 10/min AI)"
```

---

## Task 3: BYOK encryption utilities

**Files:**
- Create: `server/lib/encryption.ts`
- Create: `server/__tests__/lib/encryption.test.ts`

### Step 1: Write the failing test

- [ ] Create `server/__tests__/lib/encryption.test.ts`:

```typescript
// Set a valid 64-char hex test key before importing the module
process.env['BYOK_ENCRYPTION_KEY'] = 'a'.repeat(64);

import { encryptKey, decryptKey } from '../../lib/encryption';

describe('encryptKey / decryptKey', () => {
  it('roundtrip: decryptKey(encryptKey(x)) === x', () => {
    const plaintext = 'sk-ant-api03-abc123';
    const { encryptedKey, iv } = encryptKey(plaintext);
    expect(decryptKey(encryptedKey, iv)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'sk-ant-api03-same-key';
    const r1 = encryptKey(plaintext);
    const r2 = encryptKey(plaintext);
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.encryptedKey).not.toBe(r2.encryptedKey);
  });

  it('produces a different IV each call', () => {
    const ivs = Array.from({ length: 5 }, () => encryptKey('test').iv);
    const unique = new Set(ivs);
    expect(unique.size).toBe(5);
  });

  it('throws on decryption with wrong key', () => {
    const { encryptedKey, iv } = encryptKey('secret');
    // Temporarily swap key
    const originalKey = process.env['BYOK_ENCRYPTION_KEY'];
    process.env['BYOK_ENCRYPTION_KEY'] = 'b'.repeat(64);
    expect(() => decryptKey(encryptedKey, iv)).toThrow();
    process.env['BYOK_ENCRYPTION_KEY'] = originalKey;
  });

  it('throws if BYOK_ENCRYPTION_KEY is missing', () => {
    const originalKey = process.env['BYOK_ENCRYPTION_KEY'];
    delete process.env['BYOK_ENCRYPTION_KEY'];
    expect(() => encryptKey('test')).toThrow(/BYOK_ENCRYPTION_KEY/);
    process.env['BYOK_ENCRYPTION_KEY'] = originalKey;
  });

  it('throws if BYOK_ENCRYPTION_KEY is wrong length', () => {
    process.env['BYOK_ENCRYPTION_KEY'] = 'tooshort';
    expect(() => encryptKey('test')).toThrow(/64-char hex/);
    process.env['BYOK_ENCRYPTION_KEY'] = 'a'.repeat(64);
  });
});
```

- [ ] Run: `cd server && npm test -- --testPathPattern=encryption.test.ts`
- [ ] Expected: **FAIL** — `../../lib/encryption` not found

### Step 2: Implement encryption

- [ ] Create `server/lib/encryption.ts`:

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;

function getMasterKey(): Buffer {
  const keyHex = process.env['BYOK_ENCRYPTION_KEY'];
  if (!keyHex) throw new Error('BYOK_ENCRYPTION_KEY environment variable is required');
  if (keyHex.length !== 64) throw new Error('BYOK_ENCRYPTION_KEY must be 64-char hex (32 bytes)');
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plaintext API key with AES-256-GCM.
 * Returns hex-encoded ciphertext (includes GCM auth tag) and hex-encoded IV.
 */
export function encryptKey(plaintext: string): { encryptedKey: string; iv: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedKey: Buffer.concat([encrypted, tag]).toString('hex'),
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypts a hex-encoded ciphertext produced by encryptKey.
 * Throws if the key is wrong or the ciphertext has been tampered with.
 */
export function decryptKey(encryptedKey: string, iv: string): string {
  const key = getMasterKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const data = Buffer.from(encryptedKey, 'hex');
  const tag = data.subarray(data.length - AUTH_TAG_BYTES);
  const ciphertext = data.subarray(0, data.length - AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
```

### Step 3: Run tests

- [ ] Run: `cd server && npm test -- --testPathPattern=encryption.test.ts`
- [ ] Expected: **6 passing**

### Step 4: Commit

```bash
git add server/lib/encryption.ts server/__tests__/lib/encryption.test.ts
git commit -m "feat: add AES-256-GCM BYOK key encryption utilities"
```

---

## Task 4: Users route (GET /me + DELETE /me)

**Files:**
- Create: `server/routes/users.ts`
- Create: `server/__tests__/routes/users.test.ts`

### Step 1: Write the failing test

- [ ] Create `server/__tests__/routes/users.test.ts`:

```typescript
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
    // Each table deletion is one db.delete() call
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
    // Override the mock to simulate Supabase failure
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
```

- [ ] Run: `cd server && npm test -- --testPathPattern=users.test.ts`
- [ ] Expected: **FAIL** — `../../routes/users` not found

### Step 2: Implement users route

- [ ] Create `server/routes/users.ts`:

```typescript
import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/me', (req: Request, res: Response): void => {
  res.json({ userId: req.auth.userId });
});

router.delete('/me', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.auth;

  // Delete all user data in dependency order (children before parents)
  await db.delete(schema.messages).where(eq(schema.messages.userId, userId));
  await db.delete(schema.conversations).where(eq(schema.conversations.userId, userId));
  await db.delete(schema.tranches).where(eq(schema.tranches.userId, userId));
  await db.delete(schema.debts).where(eq(schema.debts.userId, userId));
  await db.delete(schema.spendingActuals).where(eq(schema.spendingActuals.userId, userId));
  await db.delete(schema.expenses).where(eq(schema.expenses.userId, userId));
  await db.delete(schema.incomeSources).where(eq(schema.incomeSources.userId, userId));
  await db.delete(schema.planCache).where(eq(schema.planCache.userId, userId));
  await db.delete(schema.progressSnapshots).where(eq(schema.progressSnapshots.userId, userId));
  await db.delete(schema.windfalls).where(eq(schema.windfalls.userId, userId));
  await db.delete(schema.expenseEvents).where(eq(schema.expenseEvents.userId, userId));
  await db.delete(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));
  await db.delete(schema.settings).where(eq(schema.settings.userId, userId));

  // Delete the Supabase auth user (permanently removes login capability)
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Server misconfiguration: Supabase admin credentials missing' });
    return;
  }
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    res.status(502).json({ error: `Supabase user deletion failed: ${error.message}` });
    return;
  }

  res.json({ ok: true });
});

export default router;
```

### Step 3: Run tests

- [ ] Run: `cd server && npm test -- --testPathPattern=users.test.ts`
- [ ] Expected: **5 passing**

### Step 4: Commit

```bash
git add server/routes/users.ts server/__tests__/routes/users.test.ts
git commit -m "feat: add users route — GET/DELETE /api/v1/users/me with cascade delete"
```

---

## Task 5: AI keys route (BYOK CRUD)

**Files:**
- Create: `server/routes/ai-keys.ts`
- Create: `server/__tests__/routes/ai-keys.test.ts`

### Step 1: Write the failing test

- [ ] Create `server/__tests__/routes/ai-keys.test.ts`:

```typescript
import express from 'express';
import request from 'supertest';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: 'uid-byok-test' };
    next();
  },
}));

// Mock encryption — deterministic for tests
jest.mock('../../lib/encryption', () => ({
  encryptKey: jest.fn((key: string) => ({
    encryptedKey: `encrypted:${key}`,
    iv: 'deadbeef000000000000000000000000',
  })),
  decryptKey: jest.fn((encrypted: string) => encrypted.replace('encrypted:', '')),
}));

const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
};
jest.mock('../../db/connection', () => ({ db: mockDb }));

import aiKeysRouter from '../../routes/ai-keys';

const app = express();
app.use(express.json());
app.use('/api/v1/ai-keys', aiKeysRouter);

const EXISTING_KEY = {
  id: 1,
  userId: 'uid-byok-test',
  encryptedKey: 'encrypted:sk-ant-api03-abc',
  iv: 'deadbeef000000000000000000000000',
  provider: 'anthropic',
  createdAt: '2026-05-01T00:00:00Z',
};

function makeSelectChain(result: unknown[]) {
  const c: any = {};
  ['from', 'where'].forEach(m => { c[m] = jest.fn().mockReturnValue(c); });
  const p = Promise.resolve(result);
  c.then = p.then.bind(p);
  c.catch = p.catch.bind(p);
  return c;
}

function makeInsertChain() {
  const c: any = {};
  c.values = jest.fn().mockReturnValue(c);
  c.returning = jest.fn().mockResolvedValue([EXISTING_KEY]);
  return c;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/ai-keys', () => {
  it('returns hasKey: false when no key is stored', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(app).get('/api/v1/ai-keys');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasKey: false, provider: null });
  });

  it('returns hasKey: true when a key exists (does NOT return the key)', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EXISTING_KEY]));
    const res = await request(app).get('/api/v1/ai-keys');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasKey: true, provider: 'anthropic' });
    expect(JSON.stringify(res.body)).not.toContain('sk-ant');
    expect(JSON.stringify(res.body)).not.toContain('encryptedKey');
  });
});

describe('POST /api/v1/ai-keys', () => {
  it('returns 400 if apiKey is missing', async () => {
    const res = await request(app).post('/api/v1/ai-keys').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 if apiKey is too short', async () => {
    const res = await request(app).post('/api/v1/ai-keys').send({ apiKey: 'short' });
    expect(res.status).toBe(400);
  });

  it('encrypts and stores the key on first save', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    mockDb.insert.mockReturnValue(makeInsertChain());

    const res = await request(app).post('/api/v1/ai-keys').send({
      apiKey: 'sk-ant-api03-valid-key-here-abc123',
      provider: 'anthropic',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, provider: 'anthropic' });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('replaces an existing key (delete + insert)', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EXISTING_KEY]));
    mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    mockDb.insert.mockReturnValue(makeInsertChain());

    const res = await request(app).post('/api/v1/ai-keys').send({
      apiKey: 'sk-ant-api03-new-key-abc123456789',
    });
    expect(res.status).toBe(201);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/ai-keys', () => {
  it('returns 404 when no key exists', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await request(app).delete('/api/v1/ai-keys');
    expect(res.status).toBe(404);
  });

  it('deletes existing key and returns ok', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([EXISTING_KEY]));
    mockDb.delete.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const res = await request(app).delete('/api/v1/ai-keys');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
```

- [ ] Run: `cd server && npm test -- --testPathPattern=ai-keys.test.ts`
- [ ] Expected: **FAIL** — `../../routes/ai-keys` not found

### Step 2: Implement the AI keys route

- [ ] Create `server/routes/ai-keys.ts`:

```typescript
import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection';
import * as schema from '../../drizzle/schema';
import { requireAuth } from '../middleware/auth';
import { encryptKey, decryptKey } from '../lib/encryption';

const router = Router();
router.use(requireAuth);

const SaveKeySchema = z.object({
  apiKey: z.string().min(20, 'API key must be at least 20 characters'),
  provider: z.enum(['anthropic']).default('anthropic'),
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.auth;
  const [existing] = await db.select({
    provider: schema.userAiKeys.provider,
    createdAt: schema.userAiKeys.createdAt,
  }).from(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));

  if (!existing) {
    res.json({ hasKey: false, provider: null, createdAt: null });
    return;
  }
  res.json({ hasKey: true, provider: existing.provider, createdAt: existing.createdAt });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = SaveKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation error' });
    return;
  }
  const { apiKey, provider } = parsed.data;
  const { userId } = req.auth;

  // Always delete existing key first (one key per user per provider)
  await db.delete(schema.userAiKeys).where(
    and(eq(schema.userAiKeys.userId, userId), eq(schema.userAiKeys.provider, provider)),
  );

  const { encryptedKey, iv } = encryptKey(apiKey);
  await db.insert(schema.userAiKeys).values({ userId, encryptedKey, iv, provider }).returning();

  res.status(201).json({ ok: true, provider });
});

router.delete('/', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.auth;
  const [existing] = await db.select({ id: schema.userAiKeys.id })
    .from(schema.userAiKeys)
    .where(eq(schema.userAiKeys.userId, userId));

  if (!existing) {
    res.status(404).json({ error: 'No API key stored' });
    return;
  }
  await db.delete(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));
  res.json({ ok: true });
});

/**
 * Internal helper — called by the AI router to retrieve the decrypted key.
 * Returns null if no key is stored.
 */
export async function getDecryptedUserKey(userId: string): Promise<string | null> {
  const [row] = await db.select({
    encryptedKey: schema.userAiKeys.encryptedKey,
    iv: schema.userAiKeys.iv,
  }).from(schema.userAiKeys).where(eq(schema.userAiKeys.userId, userId));

  if (!row) return null;
  try {
    return decryptKey(row.encryptedKey, row.iv);
  } catch {
    return null;
  }
}

export default router;
```

### Step 3: Run tests

- [ ] Run: `cd server && npm test -- --testPathPattern=ai-keys.test.ts`
- [ ] Expected: **9 passing**

### Step 4: Commit

```bash
git add server/routes/ai-keys.ts server/__tests__/routes/ai-keys.test.ts
git commit -m "feat: add AI keys route — encrypted BYOK key storage (AES-256-GCM)"
```

---

## Task 6: Wire everything into server/index.ts

**Files:**
- Modify: `server/index.ts`

- [ ] Read `server/index.ts` (currently 57 lines)

- [ ] Replace the entire file with:

```typescript
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { generalLimiter, aiLimiter } from './middleware/rateLimit';
import debtsRouter         from './routes/debts';
import budgetRouter        from './routes/budget';
import planRouter          from './routes/plan';
import aiRouter            from './routes/ai';
import windfallsRouter     from './routes/windfalls';
import expenseEventsRouter from './routes/expense-events';
import settingsRouter      from './routes/settings';
import progressRouter      from './routes/progress';
import actualsRouter       from './routes/actuals';
import advisorRouter       from './routes/advisor';
import usersRouter         from './routes/users';
import aiKeysRouter        from './routes/ai-keys';

const app = express();
const PORT = Number(process.env['PORT'] ?? 3001);

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigin = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:3000';
if (!allowedOrigin && process.env['NODE_ENV'] === 'production') {
  throw new Error('CLIENT_ORIGIN must be set in production');
}
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));

// General rate limit applies to all routes
app.use('/api/v1/', generalLimiter);

app.use('/api/v1/debts',          debtsRouter);
app.use('/api/v1/budget',         budgetRouter);
app.use('/api/v1/plan',           planRouter);
// AI route uses a stricter per-minute limit
app.use('/api/v1/ai',             aiLimiter, aiRouter);
app.use('/api/v1/windfalls',      windfallsRouter);
app.use('/api/v1/expense-events', expenseEventsRouter);
app.use('/api/v1/settings',       settingsRouter);
app.use('/api/v1/progress',       progressRouter);
app.use('/api/v1/actuals',        actualsRouter);
// Advisor also uses AI under the hood — apply AI rate limit
app.use('/api/v1/advisor',        aiLimiter, advisorRouter);
app.use('/api/v1/users',          usersRouter);
app.use('/api/v1/ai-keys',        aiKeysRouter);

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  const status = (err as any).status ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Financial Planner API running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] Run full test suite: `cd server && npm test`
- [ ] Expected: **all 128+ tests pass** (none of the existing tests hit the rate limiter because each supertest app instance has its own in-memory store)

- [ ] Commit:
  ```bash
  git add server/index.ts
  git commit -m "feat: wire rate limiters, users route, and ai-keys route into index.ts"
  ```

---

## Task 7: Update environment variable examples

**Files:**
- Modify: `.env.example`
- Modify: `client/.env.example` (create if it doesn't exist)

- [ ] Read `.env.example`

- [ ] Add the following missing variables:

```bash
# ── BYOK Encryption ───────────────────────────────────────────────────────────
# 32-byte random hex string — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BYOK_ENCRYPTION_KEY=<generate-with-command-above>

# ── Google Gemini AI ─────────────────────────────────────────────────────────
# Get from Google AI Studio: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza...

# ── Sentry ───────────────────────────────────────────────────────────────────
SENTRY_DSN=https://...@sentry.io/...
```

- [ ] Create/update `client/.env.example`:

```bash
# ── Supabase (client-side, safe to expose) ────────────────────────────────────
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# ── Sentry ───────────────────────────────────────────────────────────────────
VITE_SENTRY_DSN=https://...@sentry.io/...
```

- [ ] Commit:
  ```bash
  git add .env.example client/.env.example
  git commit -m "chore: add BYOK_ENCRYPTION_KEY, GEMINI_API_KEY, SENTRY_DSN to env examples"
  ```

---

## Final Verification

- [ ] Run full server test suite: `cd server && npm test`
- [ ] Expected output:
  ```
  Test Suites: 16 passed, 16 total
  Tests:       142+ passed, 0 failed
  ```

- [ ] Run TypeScript check: `cd server && npx tsc --noEmit`
- [ ] Expected: zero errors

- [ ] Smoke-test rate limiting manually:
  ```bash
  # Start server (requires real env vars)
  # Then in another terminal:
  for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/ai; done
  # First 10 should be 401 (no auth), 11th should be 429
  ```

---

## Notes for Implementer

1. **`express-rate-limit` v7** — the `message` option accepts a plain object which will be JSON-serialised automatically. Do not use a string if you want `res.body.error` to work in tests.

2. **`trust proxy`** — `app.set('trust proxy', 1)` is required in production (Vercel passes `X-Forwarded-For`). Without it, all requests appear to come from the same IP and the rate limiter blocks everyone after the first 100 requests.

3. **`getDecryptedUserKey` is a named export** — Phase 4 (AI layer) will import this from `ai-keys.ts` to retrieve the BYOK key when selecting the AI provider. Do not make it the default export.

4. **Key format validation** — the `SaveKeySchema` validates minimum length (20 chars) but not the Anthropic key prefix (`sk-ant-`). This is intentional — don't add prefix validation, as Anthropic may change their key format.

5. **Cascade delete order** — `messages` must be deleted before `conversations` (FK: `conversation_id` references `conversations.id`). `tranches` before `debts`. `spending_actuals` before `expenses`. The order in `users.ts` is correct — do not reorder.

6. **No test needs real encryption** — the `encryption.test.ts` sets `process.env['BYOK_ENCRYPTION_KEY']` to `'a'.repeat(64)` at the top of the file. This is valid because `Buffer.from('a'.repeat(64), 'hex')` produces a 32-byte key. The character `'a'` is valid hex.

7. **`decryptKey` exports not used by tests** — `ai-keys.test.ts` mocks `../../lib/encryption` entirely, so `decryptKey` is never called in tests. This is correct — we trust the unit tests in `encryption.test.ts` for the crypto logic.
