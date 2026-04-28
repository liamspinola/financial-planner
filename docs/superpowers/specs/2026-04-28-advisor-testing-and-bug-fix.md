# Advisor Testing & Bug Fix — Design Spec

**Date:** 2026-04-28
**Status:** Approved

---

## Context

Two bugs make the AI Advisor unusable:

1. **Delete does nothing.** Clicking confirm-delete appears to work but the session stays in the sidebar. Root cause: `client/src/lib/api.js:17` always calls `res.json()` regardless of HTTP status. `DELETE /api/advisor/conversations/:id` returns `204 No Content` (empty body). Parsing an empty body throws `SyntaxError`. `handleDelete` in `Advisor.jsx` has no `try/catch`, so the error propagates silently, `setConversations` is never called, and the session is never removed.

2. **Send does nothing.** The Claude CLI wrapper (`server/lib/claude.js`) spawns `claude.exe` and reads stdout. If the CLI exits with code 0 but emits empty stdout (e.g., quota exhausted, Claude desktop not running), `assistantContent` becomes an empty string. An empty assistant message is inserted, the typewriter runs to zero duration, and the user sees the "thinking" indicator flash and disappear with nothing rendered. There is no server-side guard against empty Claude responses.

Beyond the bugs, the test coverage is critically incomplete:

- API route tests exist only in the isolated `api-tests` worktree — not wired into the main repo
- Zero client unit tests (no Vitest/RTL setup)
- E2E advisor tests only cover happy paths — no error paths
- No pre-commit or CI enforcement

The goal is to fix both bugs using TDD discipline (write failing test → fix → green), then achieve comprehensive three-layer test coverage so regressions are caught automatically on every commit.

---

## Approach: TDD + Full Three-Layer Coverage

Combine Approach B (unit + API + E2E, all consolidated into the main repo) with Approach C (TDD discipline: write the failing test first to prove the bug, then fix). Slow tests (E2E) are a manual/push gate; fast tests (unit + API) run automatically on every git commit via a pre-commit hook.

---

## Section 1: Bug Fixes (TDD)

### Bug 1 — 204 Delete Fix

**TDD sequence:**
1. Write a failing Vitest test: `api.deleteConversation(id)` against a mock that returns `204` with empty body — assert it resolves to `null` without throwing
2. Write a failing Playwright E2E test: create session → hover → click delete → confirm → assert sidebar shows empty state
3. Apply fix in `client/src/lib/api.js` line 17:
   ```js
   // Before
   const data = await res.json();
   // After
   const data = res.status === 204 ? null : await res.json();
   ```
4. Both tests go green

**Files modified:** `client/src/lib/api.js` (1 line)

### Bug 2 — Empty Claude Response Guard

**TDD sequence:**
1. Write a failing API route test: mock `callClaude` to resolve with `''` → POST message → assert 502 with `{ error: 'Claude returned an empty response' }`
2. Apply fix in `server/routes/advisor.js` after `callClaude` resolves:
   ```js
   if (!assistantContent || !assistantContent.trim()) {
     return res.status(502).json({ error: 'Claude returned an empty response — please try again.' });
   }
   ```
3. Write a failing Playwright E2E test: mock server to return 502 → send message → assert error banner visible
4. All tests go green

**Files modified:** `server/routes/advisor.js` (~3 lines)

---

## Section 2: API Route Test Consolidation

Move the full `api-tests` worktree test suite into the main repo's `server/` directory.

**New structure in `server/`:**
```
server/
  lib/
    __mocks__/
      claude.js          ← Jest manual mock: resolves to 'Mock AI response for testing.'
  tests/
    helpers/
      env.js             ← sets DB_PATH=:memory: before any require()
      db.js              ← clearAll(), seedDebt(), seedIncome(), seedExpense()
    routes/
      actuals.test.js
      advisor.test.js    ← 14 tests covering all advisor endpoints + edge cases
      ai.test.js
      budget.test.js
      debts.test.js
      expense-events.test.js
      health.test.js
      plan.test.js
      progress.test.js
      settings.test.js
      windfalls.test.js
    security/
      injection.test.js
```

**Coverage per route:** happy path (200/201/204), 400 bad input, 404 not found, domain-specific edge cases (Claude timeout → 504, Claude unavailable → 502, context-lock → 409, empty Claude response → 502).

**`server/package.json` changes:**
- Add `"supertest": "^7.2.2"` to devDependencies
- Update Jest config:
  ```json
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
  ```
- Add script: `"test:api": "jest --runInBand"`

---

## Section 3: Engine Unit Test Expansion

**New file:** `server/engine/__tests__/advisor.test.js`

Tests for `buildContextSnapshot(db)` and `buildAdvisorPrompt(conv, messages)` — both are pure / near-pure functions with no external side effects:

| Test | Assertion |
|---|---|
| `buildContextSnapshot` with no debts | returns `null` |
| `buildContextSnapshot` with seeded debts/income/expenses | returns non-empty string containing debt name, balance, APR |
| `buildAdvisorPrompt` with context snapshot | returned string includes snapshot content |
| `buildAdvisorPrompt` without context | returned string excludes context block |
| `buildAdvisorPrompt` with rolling summary | returned string includes summary |
| `buildAdvisorPrompt` with empty message array | no crash, returns valid string |

---

## Section 4: Client Unit Tests (Vitest + RTL)

**Setup additions to `client/`:**
- devDependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`
- `vite.config.ts`: add `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], globals: true }`
- `client/src/test/setup.ts`: `import '@testing-library/jest-dom'`
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

**Test files and coverage:**

| File | Tests |
|---|---|
| `src/lib/__tests__/api.test.js` | 204 → resolves null (TDD proof of fix), non-ok response throws with status, AbortError → timeout message, body correctly serialised |
| `src/lib/__tests__/format.test.js` | All formatting functions (currency, date, percent, abbreviations) across edge cases including zero and negative values |
| `src/views/__tests__/Advisor.test.jsx` | `relativeDate()` (today/yesterday/N days/week+); `SessionRow` renders title, delete flow, rename flow; `MessageBubble` alignment classes; `ChatPanel` empty state, loads messages on mount, send happy path, send error shown; `Advisor` creates session, deletes session, auto-selects first |

**TDD rule:** The `api.test.js` 204 test is written before the fix is applied. It must fail first, then go green after the one-line change to `api.js`.

**Coverage target:** 85%+ lines on client `src/`. Pure utilities (`format.js`, `constants.js`) aim for 100%.

---

## Section 5: E2E Expansion (Playwright)

All new tests use the existing mock infrastructure (`AdvisorPage.mockMessages()`).

**`AdvisorPage.js` addition:** `mockMessages` gains an `errorResponse` option:
```js
static async mockMessages(page, { response, newTitle, errorResponse } = {}) {
  await page.route('**/api/advisor/conversations/*/messages', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    if (errorResponse) {
      await route.fulfill({ status: errorResponse.status, contentType: 'application/json',
        body: JSON.stringify({ error: errorResponse.message }) });
      return;
    }
    // ... existing happy-path mock
  });
}
```

**New tests in `tests/e2e/specs/advisor.spec.js`:**

| Test | What it proves |
|---|---|
| Send → 502 → error banner "Claude is unavailable" | Error path renders, not silent |
| Send → 504 → error banner "took too long" | Timeout error surfaced to user |
| Send after prior error → second send succeeds | Error clears; not a permanent broken state |
| Long AI response (500 words) → layout intact | No overflow/clipping |

**New tests in `tests/e2e/specs/bugs.spec.js`:**

| Test | What it proves |
|---|---|
| Delete session → session removed from sidebar (TDD) | 204 fix regression guard |
| Delete second of two sessions → other session remains active | State management correct |
| Create then immediately delete → empty state shown | Edge case |

**Existing tests confirmed:** Rename (Enter/Escape), context lock, suggestion pills, multi-session — all kept and verified.

---

## Section 6: Pre-commit Hook & Runner Scripts

**Root `package.json` — new/updated scripts:**
```json
"test:unit:server":  "npm test --prefix server",
"test:api":          "npm run test:api --prefix server",
"test:unit:client":  "npm test --prefix client",
"test:fast":         "npm run test:unit:server && npm run test:api && npm run test:unit:client",
"test:all":          "npm run test:fast && npm run test:e2e"
```

**Pre-commit hook (`.claude/settings.json` hooks):**
Runs `npm run test:fast` from the repo root on every commit. If any test fails, the commit is blocked. Target execution time: < 30 seconds (unit + API are in-memory, no browser).

**What does NOT run on pre-commit:** `test:e2e` — requires live server + browser, takes 60-120s. Run manually via `npm run test:e2e` or `npm run test:all`.

---

## Verification Plan

1. **Bug 1 (delete):** Run `tests/e2e/specs/bugs.spec.js` — "Delete session → session removed" must pass.
2. **Bug 2 (empty response):** Run `server/tests/routes/advisor.test.js` — "Claude returns empty string → 502" must pass. Also run the Playwright 502 error banner test.
3. **API coverage:** `npm run test:api` — all 13 route files pass.
4. **Engine coverage:** `npm test --prefix server` — engine + advisor engine tests pass with `--coverage` showing 100% on engine files.
5. **Client coverage:** `npm test --prefix client` — Vitest run shows 85%+ lines.
6. **Pre-commit gate:** Make a test commit and confirm the hook runs and blocks on a broken test.
7. **Full suite:** `npm run test:all` — all tests green end to end.

---

## Files Created / Modified

| Path | Change |
|---|---|
| `client/src/lib/api.js` | 1-line 204 fix |
| `server/routes/advisor.js` | ~3 lines: empty Claude response guard |
| `server/lib/__mocks__/claude.js` | New — Jest manual mock |
| `server/tests/helpers/env.js` | New |
| `server/tests/helpers/db.js` | New |
| `server/tests/routes/*.test.js` (×13) | New — moved from api-tests worktree |
| `server/tests/security/injection.test.js` | New |
| `server/engine/__tests__/advisor.test.js` | New |
| `server/package.json` | Jest config + supertest devDep + scripts |
| `client/package.json` | Vitest + RTL devDeps + test scripts |
| `client/vite.config.ts` | Add `test` block |
| `client/src/test/setup.ts` | New — RTL jest-dom import |
| `client/src/lib/__tests__/api.test.js` | New |
| `client/src/lib/__tests__/format.test.js` | New |
| `client/src/views/__tests__/Advisor.test.jsx` | New |
| `tests/e2e/specs/advisor.spec.js` | Expanded with error-path tests |
| `tests/e2e/specs/bugs.spec.js` | Expanded with delete regression tests |
| `tests/e2e/pages/AdvisorPage.js` | `mockMessages` errorResponse option |
| `package.json` (root) | New test runner scripts |
| `.claude/settings.json` | Pre-commit hook calling `test:fast` |
