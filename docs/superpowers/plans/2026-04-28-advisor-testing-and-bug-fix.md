# Advisor Bug Fix & Full Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two AI advisor bugs (delete silently fails, send produces no output) using TDD, then achieve comprehensive unit + API + E2E test coverage with a pre-commit gate.

**Architecture:** Three-layer test pyramid — Vitest unit tests (client utils/components), Jest + supertest API route tests (server, in-memory SQLite), Playwright E2E tests (live server). Fast layers (unit + API) run on every commit via pre-commit hook. E2E runs manually or on push.

**Tech Stack:** Jest 29 + supertest (server API tests), Vitest + React Testing Library + jsdom (client unit tests), Playwright (E2E, already configured)

---

## File Map

**Modified:**
- `client/src/lib/api.js` — 1-line 204 fix
- `client/vite.config.js` — add `test` block for Vitest
- `client/package.json` — add Vitest + RTL devDependencies + test scripts
- `server/package.json` — add Jest config + supertest devDependency + scripts
- `server/routes/advisor.js` — add empty Claude response guard
- `tests/e2e/specs/advisor.spec.js` — add error-path tests
- `tests/e2e/specs/bugs.spec.js` — add delete regression tests
- `tests/e2e/pages/AdvisorPage.js` — add `errorResponse` option to `mockMessages`
- `package.json` (root) — new test runner scripts
- `.claude/settings.json` — pre-commit hook

**Created:**
- `server/lib/__mocks__/claude.js` — Jest manual mock
- `server/tests/helpers/env.js` — sets `DB_PATH=:memory:`
- `server/tests/helpers/db.js` — `clearAll`, `seedDebt`, `seedIncome`, `seedExpense`
- `server/tests/routes/advisor.test.js`
- `server/tests/routes/actuals.test.js`
- `server/tests/routes/ai.test.js`
- `server/tests/routes/budget.test.js`
- `server/tests/routes/debts.test.js`
- `server/tests/routes/expense-events.test.js`
- `server/tests/routes/health.test.js`
- `server/tests/routes/plan.test.js`
- `server/tests/routes/progress.test.js`
- `server/tests/routes/settings.test.js`
- `server/tests/routes/windfalls.test.js`
- `server/tests/security/injection.test.js`
- `server/engine/__tests__/advisor.test.js`
- `client/src/test/setup.js`
- `client/src/lib/__tests__/api.test.js`
- `client/src/lib/__tests__/format.test.js`
- `client/src/views/__tests__/Advisor.test.jsx`

---

## Task 1: Server API Test Infrastructure

**Files:**
- Create: `server/lib/__mocks__/claude.js`
- Create: `server/tests/helpers/env.js`
- Create: `server/tests/helpers/db.js`
- Modify: `server/package.json`

- [ ] **Step 1: Create the Jest manual mock for Claude**

Create `server/lib/__mocks__/claude.js`:

```js
'use strict';

const callClaude = jest.fn().mockResolvedValue('Mock AI response for testing.');

module.exports = { callClaude, CLAUDE_EXE: 'mock-claude' };
```

- [ ] **Step 2: Create the env setup file**

Create `server/tests/helpers/env.js`:

```js
'use strict';
// Must run before any require() — sets DB_PATH before database.js is evaluated
process.env.DB_PATH = ':memory:';
```

- [ ] **Step 3: Create the DB seed helpers**

Create `server/tests/helpers/db.js`:

```js
'use strict';

function seedDebt(db, overrides = {}) {
  const { lastInsertRowid: debtId } = db.prepare(
    `INSERT INTO debts (name, lender, debt_type, minimum_payment)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.name || 'Test Credit Card',
    overrides.lender || null,
    overrides.debt_type || 'credit_card',
    overrides.minimum_payment ?? 50
  );

  const { lastInsertRowid: trancheId } = db.prepare(
    `INSERT INTO tranches (debt_id, label, balance, apr, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    debtId,
    overrides.trancheLabel || 'Main Balance',
    overrides.balance ?? 1000,
    overrides.apr ?? 0.20,
    overrides.sort_order ?? 0
  );

  return { debtId, trancheId };
}

function seedIncome(db, overrides = {}) {
  const amount = overrides.amount ?? 3000;
  const frequency = overrides.frequency || 'monthly';
  const FREQ_MAP = {
    weekly: (52 / 12),
    fortnightly: (26 / 12),
    four_weekly: 13,
    monthly: 1,
    annual: (1 / 12),
  };
  const monthly_equivalent = overrides.monthly_equivalent ?? amount * (FREQ_MAP[frequency] || 1);

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO income_sources (label, amount, frequency, monthly_equivalent)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.label || 'Salary',
    amount,
    frequency,
    monthly_equivalent
  );
  return lastInsertRowid;
}

function seedExpense(db, overrides = {}) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO expenses (label, amount, category, is_essential)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.label || 'Rent',
    overrides.amount ?? 800,
    overrides.category || 'housing',
    overrides.is_essential ?? 1
  );
  return lastInsertRowid;
}

function clearAll(db) {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM conversations');
  db.exec('DELETE FROM spending_actuals');
  db.exec('DELETE FROM progress_snapshots');
  db.exec('DELETE FROM plan_cache');
  db.exec('DELETE FROM expense_events');
  db.exec('DELETE FROM windfalls');
  db.exec('DELETE FROM expenses');
  db.exec('DELETE FROM income_sources');
  db.exec('DELETE FROM tranches');
  db.exec('DELETE FROM debts');
  db.exec('DELETE FROM settings');
}

module.exports = { seedDebt, seedIncome, seedExpense, clearAll };
```

- [ ] **Step 4: Update server/package.json**

Replace the entire contents of `server/package.json` with:

```json
{
  "name": "server",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest --runInBand",
    "test:api": "jest --runInBand"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "cors": "^2.8.6",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.2.2"
  },
  "jest": {
    "testEnvironment": "node",
    "setupFiles": ["./tests/helpers/env.js"],
    "testMatch": [
      "**/engine/__tests__/**/*.test.js",
      "**/tests/**/*.test.js"
    ],
    "testTimeout": 10000,
    "clearMocks": true
  }
}
```

- [ ] **Step 5: Install supertest**

```bash
npm install --prefix server --save-dev supertest
```

Expected: `supertest` appears in `server/node_modules`.

- [ ] **Step 6: Verify existing engine tests still pass**

```bash
npm test --prefix server -- --testPathPattern=engine
```

Expected: All engine tests pass. If anything breaks, the Jest config is wrong — check `testMatch` patterns.

- [ ] **Step 7: Commit**

```bash
git add server/lib/__mocks__/claude.js server/tests/helpers/env.js server/tests/helpers/db.js server/package.json server/package-lock.json
git commit -m "test: add server API test infrastructure (Jest config, supertest, helpers, claude mock)"
```

---

## Task 2: Advisor API Route Tests (TDD — write before fixing bug)

**Files:**
- Create: `server/tests/routes/advisor.test.js`

This is the TDD step for Bug 2 (empty Claude response). The test for empty-string Claude response **will fail** until Task 5 fixes `advisor.js`.

- [ ] **Step 1: Create server/tests/routes/advisor.test.js**

```js
'use strict';

const { clearAll, seedDebt, seedIncome, seedExpense } = require('../helpers/db');

let request, db, callClaude;

beforeAll(() => {
  jest.resetModules();
  jest.mock('../../lib/claude');
  const app = require('../../index');
  request = require('supertest')(app);
  db = require('../../db/database').getDb();
  callClaude = require('../../lib/claude').callClaude;
});

beforeEach(() => clearAll(db));

// ---------------------------------------------------------------------------
// POST /api/advisor/conversations
// ---------------------------------------------------------------------------
describe('POST /api/advisor/conversations', () => {
  it('creates a conversation → 201 with id, use_context: 1', async () => {
    const res = await request.post('/api/advisor/conversations');
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.use_context).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/advisor/conversations
// ---------------------------------------------------------------------------
describe('GET /api/advisor/conversations', () => {
  it('returns [] when no conversations exist', async () => {
    const res = await request.get('/api/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns both conversations after creating two', async () => {
    await request.post('/api/advisor/conversations');
    await request.post('/api/advisor/conversations');
    const res = await request.get('/api/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns only the non-deleted conversation after soft-deleting one', async () => {
    const c1 = await request.post('/api/advisor/conversations');
    const c2 = await request.post('/api/advisor/conversations');
    await request.delete(`/api/advisor/conversations/${c1.body.id}`);
    const res = await request.get('/api/advisor/conversations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(c2.body.id);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/advisor/conversations/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/advisor/conversations/:id', () => {
  it('renames title → 200 with updated title', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ title: 'My New Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('My New Title');
  });

  it('returns 400 when title is whitespace only', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('toggles useContext: 0 on conversation with no messages → 200, use_context: 0', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ useContext: 0 });
    expect(res.status).toBe(200);
    expect(res.body.use_context).toBe(0);
  });

  it('returns 409 when toggling useContext on conversation WITH messages', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Hello there' });
    const res = await request.patch(`/api/advisor/conversations/${conv.id}`)
      .send({ useContext: 0 });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await request.patch('/api/advisor/conversations/99999')
      .send({ title: 'Whatever' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/advisor/conversations/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/advisor/conversations/:id', () => {
  it('soft-deletes conversation → 204', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.delete(`/api/advisor/conversations/${conv.id}`);
    expect(res.status).toBe(204);
  });

  it('subsequent GET does not include the deleted conversation', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.delete(`/api/advisor/conversations/${conv.id}`);
    const res = await request.get('/api/advisor/conversations');
    expect(res.body.find(c => c.id === conv.id)).toBeUndefined();
  });

  it('returns 404 when deleting non-existent conversation', async () => {
    const res = await request.delete('/api/advisor/conversations/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/advisor/conversations/:id/messages
// ---------------------------------------------------------------------------
describe('GET /api/advisor/conversations/:id/messages', () => {
  it('returns [] for empty conversation', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.get(`/api/advisor/conversations/${conv.id}/messages`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await request.get('/api/advisor/conversations/99999/messages');
    expect(res.status).toBe(404);
  });

  it('returns 404 for soft-deleted conversation', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.delete(`/api/advisor/conversations/${conv.id}`);
    const res = await request.get(`/api/advisor/conversations/${conv.id}/messages`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/advisor/conversations/:id/messages
// ---------------------------------------------------------------------------
describe('POST /api/advisor/conversations/:id/messages', () => {
  it('first message → 200 with userMessage, assistantMessage, newTitle', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Hello, help me with my debt' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('userMessage');
    expect(res.body).toHaveProperty('assistantMessage');
    expect(res.body.userMessage.role).toBe('user');
    expect(res.body.assistantMessage.role).toBe('assistant');
    expect(res.body.newTitle).not.toBeNull();
    // callClaude called twice: reply + title generation
    expect(callClaude).toHaveBeenCalledTimes(2);
  });

  it('second message → callClaude called once, newTitle is null', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Hello' });
    callClaude.mockClear();
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'What is the avalanche method?' });
    expect(res.status).toBe(200);
    expect(callClaude).toHaveBeenCalledTimes(1);
    expect(res.body.newTitle).toBeNull();
  });

  it('returns 400 when content is whitespace only', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await request.post('/api/advisor/conversations/99999/messages')
      .send({ content: 'Hello' });
    expect(res.status).toBe(404);
  });

  it('Claude timeout → 504 with error field', async () => {
    callClaude.mockRejectedValueOnce(new Error('Claude CLI timed out'));
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Help me please' });
    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty('error');
  });

  it('Claude unavailable → 502 with error field', async () => {
    callClaude.mockRejectedValueOnce(new Error('exit code 1'));
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Help me please' });
    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  // ── TDD: Bug 2 — empty Claude response ──────────────────────────────────
  it('Claude returns empty string → 502 with error field (Bug 2)', async () => {
    callClaude.mockResolvedValueOnce('');
    const conv = (await request.post('/api/advisor/conversations')).body;
    const res = await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Help me please' });
    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/empty/i);
  });

  it('messages after posting ordered by sequence ASC, alternating roles', async () => {
    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'First' });
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'Second' });
    const res = await request.get(`/api/advisor/conversations/${conv.id}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].sequence).toBeGreaterThan(res.body[i - 1].sequence);
    }
    expect(res.body[0].role).toBe('user');
    expect(res.body[1].role).toBe('assistant');
  });
});

// ---------------------------------------------------------------------------
// Context snapshot
// ---------------------------------------------------------------------------
describe('Context snapshot', () => {
  it('sets context_snapshot after first message when financial data present', async () => {
    seedDebt(db, { name: 'Test Card', balance: 1000, apr: 0.20, minimum_payment: 50 });
    seedIncome(db, { label: 'Salary', amount: 3000, frequency: 'monthly' });
    seedExpense(db, { label: 'Rent', amount: 800, category: 'housing' });

    const conv = (await request.post('/api/advisor/conversations')).body;
    await request.post(`/api/advisor/conversations/${conv.id}/messages`)
      .send({ content: 'What should I do about my debt?' });

    const row = db.prepare('SELECT context_snapshot FROM conversations WHERE id = ?').get(conv.id);
    expect(typeof row.context_snapshot).toBe('string');
    expect(row.context_snapshot.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the advisor tests — confirm the "empty string → 502" test FAILS**

```bash
npm test --prefix server -- --testPathPattern=advisor --verbose 2>&1 | tail -30
```

Expected: Most tests pass (the mock returns `'Mock AI response for testing.'`). The `Claude returns empty string → 502` test **FAILS** with something like `expected 200 to equal 502`. This confirms the bug exists and the test is correctly written.

- [ ] **Step 3: Commit the failing test**

```bash
git add server/tests/routes/advisor.test.js
git commit -m "test(advisor): add API route tests including failing empty-Claude-response test (TDD Bug 2)"
```

---

## Task 3: Add Remaining 12 API Route Test Files

**Files:** `server/tests/routes/*.test.js` (×11) + `server/tests/security/injection.test.js`

Copy each file from the `api-tests` worktree into the main repo. Do NOT modify the content — copy exactly.

- [ ] **Step 1: Copy the route test files**

Run these copy commands one at a time. Check each file exists after copying.

```bash
cp ".worktrees/api-tests/server/tests/routes/actuals.test.js"         "server/tests/routes/actuals.test.js"
cp ".worktrees/api-tests/server/tests/routes/ai.test.js"              "server/tests/routes/ai.test.js"
cp ".worktrees/api-tests/server/tests/routes/budget.test.js"          "server/tests/routes/budget.test.js"
cp ".worktrees/api-tests/server/tests/routes/debts.test.js"           "server/tests/routes/debts.test.js"
cp ".worktrees/api-tests/server/tests/routes/expense-events.test.js"  "server/tests/routes/expense-events.test.js"
cp ".worktrees/api-tests/server/tests/routes/health.test.js"          "server/tests/routes/health.test.js"
cp ".worktrees/api-tests/server/tests/routes/plan.test.js"            "server/tests/routes/plan.test.js"
cp ".worktrees/api-tests/server/tests/routes/progress.test.js"        "server/tests/routes/progress.test.js"
cp ".worktrees/api-tests/server/tests/routes/settings.test.js"        "server/tests/routes/settings.test.js"
cp ".worktrees/api-tests/server/tests/routes/windfalls.test.js"       "server/tests/routes/windfalls.test.js"
cp ".worktrees/api-tests/server/tests/security/injection.test.js"     "server/tests/security/injection.test.js"
```

- [ ] **Step 2: Run all API tests**

```bash
npm test --prefix server 2>&1 | tail -40
```

Expected: The suite runs. The `Claude returns empty string → 502` test in `advisor.test.js` still fails. Everything else passes. If other tests fail, diagnose — likely a missing route or schema mismatch.

- [ ] **Step 3: Commit**

```bash
git add server/tests/
git commit -m "test: consolidate all API route tests from api-tests worktree into main repo"
```

---

## Task 4: Fix Bug 2 — Empty Claude Response Guard

**Files:**
- Modify: `server/routes/advisor.js`

- [ ] **Step 1: Open server/routes/advisor.js and locate the callClaude block (around line 149)**

Find this block:

```js
  let assistantContent;
  try {
    assistantContent = await callClaude(prompt, 60000);
  } catch (err) {
    if (err.message.includes('timed out')) {
      return res.status(504).json({ error: 'Claude took too long — please try again' });
    }
    return res.status(502).json({ error: 'Claude is unavailable: ' + err.message });
  }

  // Insert assistant message
  const assistantSeq = userSeq + 1;
```

- [ ] **Step 2: Add the empty-response guard immediately after the try/catch**

Replace the above with:

```js
  let assistantContent;
  try {
    assistantContent = await callClaude(prompt, 60000);
  } catch (err) {
    if (err.message.includes('timed out')) {
      return res.status(504).json({ error: 'Claude took too long — please try again' });
    }
    return res.status(502).json({ error: 'Claude is unavailable: ' + err.message });
  }

  if (!assistantContent || !assistantContent.trim()) {
    return res.status(502).json({ error: 'Claude returned an empty response — please try again.' });
  }

  // Insert assistant message
  const assistantSeq = userSeq + 1;
```

- [ ] **Step 3: Run advisor tests — confirm the TDD test now passes**

```bash
npm test --prefix server -- --testPathPattern=advisor --verbose 2>&1 | tail -20
```

Expected: ALL advisor tests pass, including `Claude returns empty string → 502`.

- [ ] **Step 4: Run full server test suite to confirm no regressions**

```bash
npm test --prefix server 2>&1 | tail -10
```

Expected: All test suites pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/advisor.js
git commit -m "fix(advisor): return 502 when Claude returns empty response (Bug 2)"
```

---

## Task 5: Engine Advisor Unit Tests

**Files:**
- Create: `server/engine/__tests__/advisor.test.js`

- [ ] **Step 1: Create the test file**

```js
'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { buildContextSnapshot, buildAdvisorPrompt } = require('../advisor');

// Load real schema into an in-memory DB for each test suite
function makeDb() {
  const db = new Database(':memory:');
  const schema = fs.readFileSync(
    path.join(__dirname, '../../db/schema.sql'),
    'utf8'
  );
  db.exec(schema);
  return db;
}

// ---------------------------------------------------------------------------
// buildContextSnapshot
// ---------------------------------------------------------------------------
describe('buildContextSnapshot', () => {
  it('returns null when no debts exist', () => {
    const db = makeDb();
    expect(buildContextSnapshot(db)).toBeNull();
  });

  it('returns a non-empty string when debts, income, and expenses are present', () => {
    const db = makeDb();

    const { lastInsertRowid: debtId } = db.prepare(
      `INSERT INTO debts (name, lender, debt_type, minimum_payment) VALUES (?, ?, ?, ?)`
    ).run('Test Card', null, 'credit_card', 50);

    db.prepare(
      `INSERT INTO tranches (debt_id, label, balance, apr, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(debtId, 'Main', 1000, 0.20, 0);

    db.prepare(
      `INSERT INTO income_sources (label, amount, frequency, monthly_equivalent) VALUES (?, ?, ?, ?)`
    ).run('Salary', 3000, 'monthly', 3000);

    db.prepare(
      `INSERT INTO expenses (label, amount, category, is_essential) VALUES (?, ?, ?, ?)`
    ).run('Rent', 800, 'housing', 1);

    const snapshot = buildContextSnapshot(db);
    expect(typeof snapshot).toBe('string');
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot).toContain('Test Card');
    expect(snapshot).toContain('£1000');
    expect(snapshot).toContain('20.0%');
  });

  it('includes monthly take-home and surplus in the snapshot', () => {
    const db = makeDb();

    const { lastInsertRowid: debtId } = db.prepare(
      `INSERT INTO debts (name, lender, debt_type, minimum_payment) VALUES (?, ?, ?, ?)`
    ).run('Card', null, 'credit_card', 100);

    db.prepare(
      `INSERT INTO tranches (debt_id, label, balance, apr, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).run(debtId, 'Main', 500, 0.15, 0);

    db.prepare(
      `INSERT INTO income_sources (label, amount, frequency, monthly_equivalent) VALUES (?, ?, ?, ?)`
    ).run('Salary', 2000, 'monthly', 2000);

    db.prepare(
      `INSERT INTO expenses (label, amount, category, is_essential) VALUES (?, ?, ?, ?)`
    ).run('Rent', 600, 'housing', 1);

    const snapshot = buildContextSnapshot(db);
    expect(snapshot).toContain('£2000'); // take-home
    // surplus = 2000 - 600 - 100 = 1300
    expect(snapshot).toContain('£1300');
  });
});

// ---------------------------------------------------------------------------
// buildAdvisorPrompt
// ---------------------------------------------------------------------------
describe('buildAdvisorPrompt', () => {
  const baseConv = {
    use_context: 0,
    context_snapshot: null,
    summary: null,
  };

  it('returns a valid non-empty string with no messages', () => {
    const prompt = buildAdvisorPrompt(baseConv, []);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Respond as the adviser:');
  });

  it('includes context snapshot when use_context=1 and snapshot is set', () => {
    const conv = {
      use_context: 1,
      context_snapshot: 'FINANCIAL SNAPSHOT: income £2000',
      summary: null,
    };
    const prompt = buildAdvisorPrompt(conv, []);
    expect(prompt).toContain('FINANCIAL SNAPSHOT: income £2000');
  });

  it('excludes context snapshot when use_context=0 even if snapshot is set', () => {
    const conv = {
      use_context: 0,
      context_snapshot: 'FINANCIAL SNAPSHOT: income £2000',
      summary: null,
    };
    const prompt = buildAdvisorPrompt(conv, []);
    expect(prompt).not.toContain('FINANCIAL SNAPSHOT');
  });

  it('includes rolling summary when present', () => {
    const conv = {
      use_context: 0,
      context_snapshot: null,
      summary: 'User is focused on paying off their credit card.',
    };
    const prompt = buildAdvisorPrompt(conv, []);
    expect(prompt).toContain('User is focused on paying off their credit card.');
  });

  it('includes message history formatted as User/Assistant turns', () => {
    const messages = [
      { role: 'user',      content: 'How do I start?' },
      { role: 'assistant', content: 'Begin with the highest APR.' },
    ];
    const prompt = buildAdvisorPrompt(baseConv, messages);
    expect(prompt).toContain('User: How do I start?');
    expect(prompt).toContain('Assistant: Begin with the highest APR.');
  });

  it('does not crash with empty messages array', () => {
    expect(() => buildAdvisorPrompt(baseConv, [])).not.toThrow();
  });
});
```

- [ ] **Step 2: Find the schema.sql path**

```bash
ls server/db/
```

Expected: `database.js  schema.sql` (or similar). The test above uses `../../db/schema.sql` relative to `server/engine/__tests__/`. If the schema is elsewhere, update the path.

- [ ] **Step 3: Run the advisor engine tests**

```bash
npm test --prefix server -- --testPathPattern="engine/__tests__/advisor" --verbose
```

Expected: All 8 tests pass.

- [ ] **Step 4: Run full server suite to confirm nothing broken**

```bash
npm test --prefix server 2>&1 | tail -10
```

Expected: All suites pass.

- [ ] **Step 5: Commit**

```bash
git add server/engine/__tests__/advisor.test.js
git commit -m "test(engine): add unit tests for buildContextSnapshot and buildAdvisorPrompt"
```

---

## Task 6: Write Failing E2E Test for Delete Bug (TDD Bug 1)

**Files:**
- Modify: `tests/e2e/specs/bugs.spec.js`

Write the E2E test first. It will fail because `api.js` still has the 204 bug.

- [ ] **Step 1: Read the current bugs.spec.js to see what's there**

Open `tests/e2e/specs/bugs.spec.js` and check its current contents before modifying.

- [ ] **Step 2: Add delete regression tests to bugs.spec.js**

Add the following test block. If the file already imports `AdvisorPage`, add only the new `describe` block; otherwise add the full snippet:

```js
import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { AdvisorPage } from '../pages/AdvisorPage.js';

// ── Existing tests (keep them) ──────────────────────────────────────────────
// ... (existing content)

// ── Delete session regression (Bug 1: 204 No Content fix) ──────────────────

test.describe('Delete session regression', () => {
  let advisor;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    await AdvisorPage.mockMessages(page);
    advisor = new AdvisorPage(page);
    await advisor.goto();
  });

  test('confirming delete removes session from sidebar (Bug 1 regression)', async ({ page }) => {
    await advisor.newSessionButton.click();
    await page.waitForTimeout(300);
    const row = advisor.sessionRow('New conversation');
    await row.hover();
    await row.getByRole('button', { name: /Delete/i }).first().click();
    await page.getByRole('button', { name: /Confirm|Yes/i }).first().click();
    // Session must be gone — NOT silently stuck
    await expect(advisor.emptyStateMessage).toBeVisible({ timeout: 5000 });
  });

  test('deleting second of two sessions keeps first session active', async ({ page }) => {
    // Create two sessions
    await advisor.newSessionButton.click();
    await page.waitForTimeout(200);
    await advisor.newSessionButton.click();
    await page.waitForTimeout(200);

    // The sidebar should show two sessions
    const rows = page.locator('[class*="border-l-2"]');
    await expect(rows).toHaveCount(2);

    // Delete the active (top) session
    const firstRow = rows.first();
    await firstRow.hover();
    await firstRow.getByRole('button', { name: /Delete/i }).first().click();
    await page.getByRole('button', { name: /Confirm|Yes/i }).first().click();

    // One session should remain — NOT empty state
    await expect(advisor.emptyStateMessage).not.toBeVisible({ timeout: 5000 });
    await expect(advisor.chatTextarea).toBeVisible({ timeout: 5000 });
  });

  test('creating then immediately deleting shows empty state', async ({ page }) => {
    await advisor.newSessionButton.click();
    await page.waitForTimeout(300);
    await advisor.deleteSession('New conversation');
    await expect(advisor.emptyStateMessage).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 3: Run the delete regression test — confirm it FAILS**

```bash
npx playwright test tests/e2e/specs/bugs.spec.js --grep "Bug 1 regression" --headed 2>&1 | tail -20
```

Expected: Test FAILS. The session stays in the sidebar after confirm-delete because the 204 bug is not fixed yet.

- [ ] **Step 4: Commit the failing test**

```bash
git add tests/e2e/specs/bugs.spec.js
git commit -m "test(e2e): add failing delete-session regression test (TDD Bug 1)"
```

---

## Task 7: Fix Bug 1 — 204 No Content in api.js

**Files:**
- Modify: `client/src/lib/api.js`

- [ ] **Step 1: Open client/src/lib/api.js and find the request function (line 15-19)**

Current code (lines 14-19):

```js
  try {
    const res = await fetch(BASE + path, opts);
    clearTimeout(timer);
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
    return data;
```

- [ ] **Step 2: Apply the fix — skip res.json() for 204 responses**

Replace lines 14-19 with:

```js
  try {
    const res = await fetch(BASE + path, opts);
    clearTimeout(timer);
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Request failed'), { status: res.status, data });
    return data;
```

- [ ] **Step 3: Run the E2E delete regression test — confirm it now passes**

```bash
npx playwright test tests/e2e/specs/bugs.spec.js --grep "Bug 1 regression" --headed 2>&1 | tail -10
```

Expected: PASS. The session disappears from the sidebar after confirm-delete.

- [ ] **Step 4: Run all advisor E2E tests to confirm no regressions**

```bash
npx playwright test tests/e2e/specs/advisor.spec.js 2>&1 | tail -15
```

Expected: All advisor E2E tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/api.js
git commit -m "fix(api): handle 204 No Content without calling res.json() (Bug 1)"
```

---

## Task 8: Client Unit Test Infrastructure (Vitest + RTL)

**Files:**
- Modify: `client/package.json`
- Modify: `client/vite.config.js`
- Create: `client/src/test/setup.js`

- [ ] **Step 1: Install Vitest and React Testing Library**

```bash
npm install --prefix client --save-dev vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom @vitest/coverage-v8 jsdom
```

Expected: Packages installed, `client/package.json` devDependencies updated.

- [ ] **Step 2: Update client/package.json scripts**

Add test scripts. Open `client/package.json` and add to `"scripts"`:

```json
{
  "name": "client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  ...
}
```

- [ ] **Step 3: Add test block to client/vite.config.js**

Replace the full contents of `client/vite.config.js` with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
```

- [ ] **Step 4: Create the RTL setup file**

Create `client/src/test/setup.js`:

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Verify the Vitest setup works with a smoke test**

```bash
npm test --prefix client 2>&1 | tail -10
```

Expected: `No test files found` or `0 tests passed` — no errors. The test runner itself started correctly.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/vite.config.js client/src/test/setup.js client/package-lock.json
git commit -m "test(client): add Vitest + React Testing Library infrastructure"
```

---

## Task 9: Client Unit Tests — api.js (TDD proof of Bug 1 fix)

**Files:**
- Create: `client/src/lib/__tests__/api.test.js`

- [ ] **Step 1: Create the test file**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api.js'

// Stub global fetch before any tests run
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Stub AbortController so timeouts don't interfere
vi.stubGlobal('AbortController', class {
  constructor() { this.signal = {}; }
  abort() {}
})

describe('api request helper', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.clearAllTimers()
  })

  // ── Bug 1 TDD proof ────────────────────────────────────────────────────────
  it('204 No Content resolves to null without throwing (Bug 1 regression)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 204,
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    })
    const result = await api.deleteConversation(1)
    expect(result).toBeNull()
  })

  // ── Non-ok responses ───────────────────────────────────────────────────────
  it('throws with status and error message when server returns non-ok', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Not found' }),
    })
    await expect(api.getConversations()).rejects.toMatchObject({
      message: 'Not found',
      status: 404,
    })
  })

  it('throws "Request failed" when non-ok response has no error field', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    })
    await expect(api.getConversations()).rejects.toMatchObject({
      message: 'Request failed',
      status: 500,
    })
  })

  // ── Successful JSON responses ──────────────────────────────────────────────
  it('returns parsed JSON body on 200 response', async () => {
    const fakeConvs = [{ id: 1, title: 'Test' }]
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(fakeConvs),
    })
    const result = await api.getConversations()
    expect(result).toEqual(fakeConvs)
  })

  it('sends JSON body on POST requests', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 1 }),
    })
    await api.createConversation()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/advisor/conversations',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

- [ ] **Step 2: Run the client unit tests**

```bash
npm test --prefix client 2>&1 | tail -20
```

Expected: All 5 api tests pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/__tests__/api.test.js
git commit -m "test(client): add api.js unit tests including Bug 1 TDD regression proof"
```

---

## Task 10: Client Unit Tests — format.js

**Files:**
- Create: `client/src/lib/__tests__/format.test.js`

- [ ] **Step 1: Create the test file**

```js
import { describe, it, expect } from 'vitest'
import { gbp, ukDate, aprPct, daysUntil, monthsLabel, formatMonthLabel } from '../format.js'

describe('gbp', () => {
  it('formats positive integer as £ currency', () => {
    expect(gbp(1234)).toBe('£1,234')
  })

  it('formats with decimal places when specified', () => {
    expect(gbp(1234.5, 2)).toBe('£1,234.50')
  })

  it('returns £0 for null', () => {
    expect(gbp(null)).toBe('£0')
  })

  it('returns £0 for NaN', () => {
    expect(gbp(NaN)).toBe('£0')
  })

  it('formats zero as £0', () => {
    expect(gbp(0)).toBe('£0')
  })

  it('formats negative numbers', () => {
    expect(gbp(-500)).toBe('-£500')
  })
})

describe('ukDate', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(ukDate('2026-04-28')).toBe('28/04/2026')
  })

  it('returns empty string for null/undefined', () => {
    expect(ukDate(null)).toBe('')
    expect(ukDate(undefined)).toBe('')
    expect(ukDate('')).toBe('')
  })
})

describe('aprPct', () => {
  it('formats 0.229 as 22.9%', () => {
    expect(aprPct(0.229)).toBe('22.9%')
  })

  it('formats 0 as 0.0%', () => {
    expect(aprPct(0)).toBe('0.0%')
  })

  it('returns em dash for null', () => {
    expect(aprPct(null)).toBe('—')
  })

  it('formats 1 (100%) correctly', () => {
    expect(aprPct(1)).toBe('100.0%')
  })
})

describe('daysUntil', () => {
  it('returns null for empty/null input', () => {
    expect(daysUntil(null)).toBeNull()
    expect(daysUntil('')).toBeNull()
  })

  it('returns a number for a valid future date', () => {
    // Pick a date far in the future to avoid test flakiness
    const future = '2099-01-01'
    const result = daysUntil(future)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(0)
  })

  it('returns a negative number for a past date', () => {
    const past = '2000-01-01'
    const result = daysUntil(past)
    expect(result).toBeLessThan(0)
  })
})

describe('monthsLabel', () => {
  it('shows just months for 12 or fewer', () => {
    expect(monthsLabel(12)).toBe('12 months')
    expect(monthsLabel(1)).toBe('1 months')
  })

  it('shows months and years breakdown for > 12', () => {
    expect(monthsLabel(14)).toBe('14 months (1 yr 2 mo)')
    expect(monthsLabel(24)).toBe('24 months (2 yrs)')
    expect(monthsLabel(25)).toBe('25 months (2 yrs 1 mo)')
  })
})

describe('formatMonthLabel', () => {
  it('formats YYYY-MM as Mon YYYY', () => {
    expect(formatMonthLabel('2026-04')).toBe('Apr 2026')
    expect(formatMonthLabel('2026-01')).toBe('Jan 2026')
    expect(formatMonthLabel('2026-12')).toBe('Dec 2026')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatMonthLabel(null)).toBe('')
    expect(formatMonthLabel('')).toBe('')
  })
})
```

- [ ] **Step 2: Run the client unit tests**

```bash
npm test --prefix client 2>&1 | tail -20
```

Expected: All format tests pass alongside the api tests.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/__tests__/format.test.js
git commit -m "test(client): add unit tests for format.js utilities"
```

---

## Task 11: Client Unit Tests — Advisor Components

**Files:**
- Create: `client/src/views/__tests__/Advisor.test.jsx`

- [ ] **Step 1: Create the test file**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the api module — must be before importing Advisor
vi.mock('../../lib/api.js', () => ({
  api: {
    getConversations: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    patchConversation: vi.fn(),
  },
}))

import { api } from '../../lib/api.js'
import Advisor from '../Advisor.jsx'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeConv = (overrides = {}) => ({
  id: 1,
  title: 'New conversation',
  use_context: 1,
  context_snapshot: null,
  summary: null,
  updated_at: new Date().toISOString(),
  message_count: 0,
  ...overrides,
})

const makeMsg = (role, content, seq) => ({
  id: seq,
  conversation_id: 1,
  role,
  content,
  sequence: seq,
  created_at: new Date().toISOString(),
})

// ── relativeDate helper (tested via rendered output) ─────────────────────────

describe('relativeDate (via SessionRow)', () => {
  beforeEach(() => {
    api.getConversations.mockResolvedValue([])
    api.getMessages.mockResolvedValue([])
  })

  it('shows "Today" for a timestamp from today', async () => {
    const todayIso = new Date().toISOString()
    api.getConversations.mockResolvedValue([makeConv({ updated_at: todayIso })])
    render(<Advisor />)
    await screen.findByText('Today')
  })

  it('shows "Yesterday" for a timestamp from yesterday', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    api.getConversations.mockResolvedValue([makeConv({ updated_at: yesterday })])
    render(<Advisor />)
    await screen.findByText('Yesterday')
  })
})

// ── Advisor main component ────────────────────────────────────────────────────

describe('Advisor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getConversations.mockResolvedValue([])
    api.getMessages.mockResolvedValue([])
  })

  it('shows empty state when no conversations exist', async () => {
    render(<Advisor />)
    await screen.findByText(/No session selected|Start a new session/i)
  })

  it('shows conversation title in sidebar after loading', async () => {
    api.getConversations.mockResolvedValue([makeConv({ title: 'My Chat' })])
    render(<Advisor />)
    await screen.findByText('My Chat')
  })

  it('calls api.createConversation when New session button clicked', async () => {
    api.createConversation.mockResolvedValue(makeConv({ id: 99, title: 'New conversation' }))
    render(<Advisor />)
    const btn = await screen.findByRole('button', { name: /New session/i })
    await userEvent.click(btn)
    expect(api.createConversation).toHaveBeenCalledTimes(1)
  })

  it('adds new conversation to sidebar after creating', async () => {
    api.createConversation.mockResolvedValue(makeConv({ id: 5, title: 'New conversation' }))
    render(<Advisor />)
    const btn = await screen.findByRole('button', { name: /New session/i })
    await userEvent.click(btn)
    await screen.findByText('New conversation')
  })

  it('calls api.deleteConversation when delete confirmed', async () => {
    api.getConversations.mockResolvedValue([makeConv({ id: 7, title: 'My Chat' })])
    api.deleteConversation.mockResolvedValue(null)
    render(<Advisor />)
    await screen.findByText('My Chat')

    // Hover to reveal delete button
    const row = screen.getByText('My Chat').closest('[class*="group"]')
    fireEvent.mouseEnter(row)

    const trashBtn = await screen.findByTitle(/Delete conversation/i)
    await userEvent.click(trashBtn)

    // Confirm
    const confirmBtn = await screen.findByTitle(/Confirm delete/i)
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(api.deleteConversation).toHaveBeenCalledWith(7)
    })
  })

  it('removes deleted conversation from sidebar', async () => {
    api.getConversations.mockResolvedValue([makeConv({ id: 7, title: 'My Chat' })])
    api.deleteConversation.mockResolvedValue(null)
    render(<Advisor />)
    await screen.findByText('My Chat')

    const row = screen.getByText('My Chat').closest('[class*="group"]')
    fireEvent.mouseEnter(row)
    const trashBtn = await screen.findByTitle(/Delete conversation/i)
    await userEvent.click(trashBtn)
    const confirmBtn = await screen.findByTitle(/Confirm delete/i)
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.queryByText('My Chat')).toBeNull()
    })
  })
})

// ── ChatPanel ─────────────────────────────────────────────────────────────────

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getConversations.mockResolvedValue([makeConv()])
    api.getMessages.mockResolvedValue([])
  })

  it('renders the chat textarea when a conversation is active', async () => {
    render(<Advisor />)
    await screen.findByPlaceholderText(/Ask anything/i)
  })

  it('shows suggestion pills when chat is empty', async () => {
    render(<Advisor />)
    await screen.findByText(/fastest way to clear my debt/i)
  })

  it('loads and displays existing messages on mount', async () => {
    api.getMessages.mockResolvedValue([
      makeMsg('user', 'Hello', 1),
      makeMsg('assistant', 'Hi there!', 2),
    ])
    render(<Advisor />)
    await screen.findByText('Hello')
    await screen.findByText('Hi there!')
  })

  it('calls api.sendMessage when Send clicked', async () => {
    api.sendMessage.mockResolvedValue({
      userMessage: makeMsg('user', 'Test question', 1),
      assistantMessage: makeMsg('assistant', 'Test answer', 2),
      newTitle: null,
    })
    render(<Advisor />)
    const textarea = await screen.findByPlaceholderText(/Ask anything/i)
    await userEvent.type(textarea, 'Test question')
    const sendBtn = screen.getByTitle(/Send/i)
    await userEvent.click(sendBtn)
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(1, 'Test question'))
  })

  it('shows user message bubble after sending', async () => {
    api.sendMessage.mockResolvedValue({
      userMessage: makeMsg('user', 'My question', 1),
      assistantMessage: makeMsg('assistant', 'My answer here', 2),
      newTitle: null,
    })
    render(<Advisor />)
    const textarea = await screen.findByPlaceholderText(/Ask anything/i)
    await userEvent.type(textarea, 'My question')
    await userEvent.click(screen.getByTitle(/Send/i))
    await screen.findByText('My question')
  })

  it('shows error message when sendMessage rejects', async () => {
    api.sendMessage.mockRejectedValue(new Error('Claude is unavailable'))
    render(<Advisor />)
    const textarea = await screen.findByPlaceholderText(/Ask anything/i)
    await userEvent.type(textarea, 'This will fail')
    await userEvent.click(screen.getByTitle(/Send/i))
    await screen.findByText(/Claude is unavailable/i)
  })
})

// ── MessageBubble alignment ───────────────────────────────────────────────────

describe('MessageBubble alignment classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getConversations.mockResolvedValue([makeConv()])
    api.getMessages.mockResolvedValue([
      makeMsg('user', 'User message', 1),
      makeMsg('assistant', 'Assistant message', 2),
    ])
  })

  it('user message has blue styling', async () => {
    render(<Advisor />)
    await screen.findByText('User message')
    const bubble = screen.getByText('User message').parentElement
    expect(bubble.className).toMatch(/blue/)
  })

  it('assistant message does not have blue styling', async () => {
    render(<Advisor />)
    await screen.findByText('Assistant message')
    const bubble = screen.getByText('Assistant message').parentElement
    expect(bubble.className).not.toMatch(/blue-600/)
  })
})
```

- [ ] **Step 2: Run the client unit tests**

```bash
npm test --prefix client 2>&1 | tail -30
```

Expected: All tests pass. If `api` mock fails to load, check the `vi.mock` path resolves correctly from `client/src/views/__tests__/` to `client/src/lib/api.js` (relative path `../../lib/api.js`).

- [ ] **Step 3: Commit**

```bash
git add client/src/views/__tests__/Advisor.test.jsx
git commit -m "test(client): add unit tests for Advisor component, ChatPanel, MessageBubble"
```

---

## Task 12: Expand E2E Tests — Error Paths

**Files:**
- Modify: `tests/e2e/pages/AdvisorPage.js`
- Modify: `tests/e2e/specs/advisor.spec.js`

- [ ] **Step 1: Update AdvisorPage.mockMessages to support error responses**

Open `tests/e2e/pages/AdvisorPage.js`. Replace the `mockMessages` static method:

```js
  /**
   * Intercepts advisor POST /messages.
   * @param {import('@playwright/test').Page} page
   * @param {{ response?: string, newTitle?: string, errorResponse?: { status: number, message: string } }} [overrides]
   */
  static async mockMessages(page, overrides = {}) {
    let seq = 1;
    await page.route('**/api/advisor/conversations/*/messages', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      if (overrides.errorResponse) {
        await route.fulfill({
          status: overrides.errorResponse.status,
          contentType: 'application/json',
          body: JSON.stringify({ error: overrides.errorResponse.message }),
        });
        return;
      }

      const body = route.request().postDataJSON();
      const userSeq = seq;
      const assistantSeq = seq + 1;
      seq += 2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userMessage: {
            id: 9000 + userSeq,
            conversation_id: 1,
            role: 'user',
            content: body.content,
            sequence: userSeq,
            created_at: new Date().toISOString(),
          },
          assistantMessage: {
            id: 9000 + assistantSeq,
            conversation_id: 1,
            role: 'assistant',
            content: overrides.response ?? 'This is a mocked advisor response for E2E testing.',
            sequence: assistantSeq,
            created_at: new Date().toISOString(),
          },
          newTitle: overrides.newTitle ?? 'Mocked Chat Title',
        }),
      });
    });
  }
```

- [ ] **Step 2: Add error-path tests to advisor.spec.js**

Append the following `describe` block to the end of `tests/e2e/specs/advisor.spec.js` (before the closing `}`):

```js
  // ── Error paths ─────────────────────────────────────────────────────────────

  test('502 response shows error banner with Claude unavailable message', async ({ page }) => {
    await resetDb(request);
    await AdvisorPage.mockMessages(page, {
      errorResponse: { status: 502, message: 'Claude is unavailable' },
    });
    advisor = new AdvisorPage(page);
    await advisor.goto();
    await advisor.newSessionButton.click();
    await advisor.sendMessage('Will this error?');
    await expect(page.getByText(/Claude is unavailable/i)).toBeVisible({ timeout: 10_000 });
  });

  test('504 response shows error banner with timeout message', async ({ page, request }) => {
    await resetDb(request);
    await AdvisorPage.mockMessages(page, {
      errorResponse: { status: 504, message: 'Claude took too long — please try again' },
    });
    advisor = new AdvisorPage(page);
    await advisor.goto();
    await advisor.newSessionButton.click();
    await advisor.sendMessage('Will this timeout?');
    await expect(page.getByText(/took too long/i)).toBeVisible({ timeout: 10_000 });
  });

  test('successful send after prior error clears the error banner', async ({ page, request }) => {
    await resetDb(request);
    // First call errors, second call succeeds
    let callCount = 0;
    await page.route('**/api/advisor/conversations/*/messages', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary error' }),
        });
      } else {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userMessage: { id: 1, conversation_id: 1, role: 'user', content: body.content, sequence: 1, created_at: new Date().toISOString() },
            assistantMessage: { id: 2, conversation_id: 1, role: 'assistant', content: 'Recovery response.', sequence: 2, created_at: new Date().toISOString() },
            newTitle: null,
          }),
        });
      }
    });
    advisor = new AdvisorPage(page);
    await advisor.goto();
    await advisor.newSessionButton.click();

    // First send — errors
    await advisor.sendMessage('First attempt');
    await expect(page.getByText(/Temporary error/i)).toBeVisible({ timeout: 10_000 });

    // Second send — succeeds, error should clear
    await advisor.sendMessage('Second attempt');
    await expect(page.getByText('Recovery response.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Temporary error/i)).not.toBeVisible();
  });
```

Note: `test.describe` in the existing spec already has `{ page, request }` in `beforeEach`. The new error-path tests need their own `resetDb` + mock setup, so they override those in their own test body.

- [ ] **Step 3: Run the new error-path E2E tests**

```bash
npx playwright test tests/e2e/specs/advisor.spec.js --grep "error" --headed 2>&1 | tail -20
```

Expected: All three error-path tests pass.

- [ ] **Step 4: Run full advisor E2E suite**

```bash
npx playwright test tests/e2e/specs/advisor.spec.js 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/pages/AdvisorPage.js tests/e2e/specs/advisor.spec.js
git commit -m "test(e2e): add error-path tests for 502/504 advisor responses"
```

---

## Task 13: Wire Root Scripts + Pre-commit Hook

**Files:**
- Modify: `package.json` (root)
- Modify: `.claude/settings.json`

- [ ] **Step 1: Update root package.json with new scripts**

Open `package.json` (root). Replace the `"scripts"` block with:

```json
  "scripts": {
    "start": "concurrently \"npm run server\" \"npm run client\" --names \"api,ui\" --prefix-colors \"cyan,magenta\"",
    "server": "npm start --prefix server",
    "client": "npm run dev --prefix client",
    "install:all": "npm install && npm install --prefix client && npm install --prefix server",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:spec": "playwright test --grep",
    "test:unit:server": "npm test --prefix server",
    "test:api": "npm run test:api --prefix server",
    "test:unit:client": "npm test --prefix client",
    "test:fast": "npm run test:unit:server && npm run test:api && npm run test:unit:client",
    "test:all": "npm run test:fast && npm run test:e2e"
  },
```

- [ ] **Step 2: Verify test:fast works end to end**

```bash
npm run test:fast 2>&1 | tail -15
```

Expected: All three suites run sequentially and all pass. Total time should be under 30 seconds.

- [ ] **Step 3: Configure pre-commit hook in .claude/settings.json**

Check if `.claude/settings.json` already exists:

```bash
ls .claude/
```

If `settings.json` exists, read it first and merge the `hooks` block into the existing JSON. If it doesn't exist, create it:

```json
{
  "hooks": {
    "PreCommit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npm run test:fast"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Verify the pre-commit hook fires**

Make a trivial change and attempt a commit:

```bash
echo "# test" >> /tmp/hook-test.txt
git add /tmp/hook-test.txt 2>/dev/null || true
git stash
git commit --allow-empty -m "test: verify pre-commit hook"
```

Expected: The hook runs `npm run test:fast` before the commit completes. If tests pass, the commit goes through. Roll back:

```bash
git reset --soft HEAD~1
```

- [ ] **Step 5: Commit**

```bash
git add package.json .claude/settings.json
git commit -m "chore: add test:fast, test:all scripts and pre-commit hook running fast tests"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run full server test suite with verbose output**

```bash
npm run test:unit:server -- --verbose 2>&1 | tail -40
```

Expected: Engine tests + all 13 route test files + advisor engine tests pass. Zero failures.

- [ ] **Step 2: Run full client test suite**

```bash
npm run test:unit:client -- --reporter=verbose 2>&1 | tail -30
```

Expected: api.js, format.js, and Advisor component tests all pass.

- [ ] **Step 3: Run complete E2E suite**

```bash
npm run test:e2e 2>&1 | tail -20
```

Expected: All E2E specs pass including the new error-path and delete-regression tests.

- [ ] **Step 4: Run test:all to confirm everything green together**

```bash
npm run test:all 2>&1 | tail -20
```

Expected: All suites pass end to end.

- [ ] **Step 5: Final commit if any loose files remain uncommitted**

```bash
git status
```

If clean: done. If any test or config files are unstaged, commit them now.

---

## Quick Reference: Test Commands

| Command | What runs | When |
|---|---|---|
| `npm run test:fast` | Server unit + API + client unit | Pre-commit, anytime |
| `npm run test:unit:server` | Engine + all API route tests | After server changes |
| `npm run test:api` | API route tests only | After route changes |
| `npm run test:unit:client` | Vitest client tests | After client changes |
| `npm run test:e2e` | Full Playwright suite | Manual / push |
| `npm run test:all` | Everything | Pre-release |
| `npx playwright test --grep "advisor"` | Advisor E2E only | Debugging advisor UI |
