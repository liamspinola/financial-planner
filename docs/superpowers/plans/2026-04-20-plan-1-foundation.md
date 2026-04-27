# Plan 1 of 5: Foundation — TypeScript + Neon PostgreSQL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the project to TypeScript with shared domain types, set up Neon PostgreSQL with a Drizzle schema matching the existing SQLite schema (with `user_id` added to every table), and write a migration harness that validates data transfer from SQLite to Neon.

**Architecture:** Shared types live in `shared/types/` and `shared/utils/`, imported by both `client/` and `server/` via a `@shared/*` path alias. The server targets CommonJS TypeScript (matching its existing module format). The client targets ESNext via Vite's bundler resolver. Drizzle ORM replaces `better-sqlite3` for all database access. All monetary values are stored as integer pence.

**Tech Stack:** TypeScript 5 (strict), ts-jest, Drizzle ORM, `@neondatabase/serverless`, `drizzle-kit`, Zod, `tsx` (dev server runner)

**This is Plan 1 of 5.** Plans 2–5 cover Auth + Security, AI Layer, PWA + Mobile UI, and GDPR + Deployment respectively.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/future-work.md` | Create | Catalogued backlog from expert panel |
| `shared/utils/money.ts` | Create | `toPence`, `fromPence`, `formatGBP` |
| `shared/utils/__tests__/money.test.ts` | Create | Unit tests for money utilities |
| `shared/types/debt.ts` | Create | `Debt`, `Tranche`, `DebtWithTranches` interfaces |
| `shared/types/plan.ts` | Create | `PlanResult`, `StrategyComparison`, `PlanMonth` interfaces |
| `shared/types/ai.ts` | Create | `AIProvider` interface, `FinancialContext`, `AIMessage` |
| `shared/types/api.ts` | Create | API request/response Zod schemas + inferred types |
| `tsconfig.json` | Create | Root base TypeScript options (strict, esModuleInterop) |
| `server/tsconfig.json` | Create | CommonJS, ES2022, paths: `@shared` |
| `server/jest.config.js` | Create | ts-jest preset, roots include `shared/`, `@shared` moduleNameMapper |
| `server/db/connection.ts` | Create | Neon HTTP connection + Drizzle instance |
| `client/tsconfig.json` | Create | ESNext, bundler moduleResolution, jsx: react-jsx |
| `client/vite.config.ts` | Modify (rename from .js) | Add `@shared` resolve alias |
| `drizzle/schema.ts` | Create | All 12 tables with `user_id` + integer pence columns |
| `drizzle.config.ts` | Create | Drizzle Kit config pointing to schema + Neon |
| `drizzle/migrations/` | Create | Generated SQL migration files (do not hand-edit) |
| `scripts/test-migration.ts` | Create | Reads SQLite, writes to Neon branch, verifies counts |
| `package.json` (root) | Modify | Add `typecheck`, `audit:ci`, `test:migration` scripts |
| `server/package.json` | Modify | Add `tsx`, TypeScript deps, `ts-jest`, `drizzle-orm`, Neon |

---

### Task 1: Write docs/future-work.md

**Files:**
- Create: `docs/future-work.md`

- [ ] **Step 1: Create the file**

```markdown
# Future Work

Items identified during design (6 expert panel rounds) that are out of scope for v1.
Pick these up as discrete sessions. Each section is priority-ordered.

---

## High Priority — v2 (after first real user)

- **Onboarding wizard:** 3-step guided setup (income → first debt → see plan). Non-technical
  users have no idea where to start. Build after getting real feedback on where the brother
  gets stuck. Empty states (shipped in v1) provide minimum viable guidance.

- **iOS "Add to Home Screen" in-app guide:** Apple Safari does not show an install banner
  automatically. Need an overlay that detects iOS + Safari + not-standalone and shows
  a visual guide: "Tap the Share icon, then Add to Home Screen."

- **AI conversation history retention policy:** 90-day auto-delete + a "Clear AI history"
  button in Settings, separate from account deletion. Both a storage cost and GDPR
  consideration — data you don't store can't be breached.

- **Data export (JSON):** GDPR right to access. One button in Settings that downloads
  all of the user's data as a single JSON file. Must cascade across all tables.

- **Staging environment with Neon branching:** Neon branch per PR, Vercel preview
  auto-deploys against it. Set up before a second developer joins the project.

---

## Medium Priority — v2/v3

- **BYOK token usage display:** When a user supplies their own Anthropic API key, show
  them approximate token usage per AI call (Anthropic SDK returns usage metadata on every
  response). Prevents surprise bills.

- **In-app feedback button:** Pre-filled email to developer. Non-technical users will not
  file GitHub issues. Tap → opens mail app with subject pre-filled. Low effort, high value.

- **TypeScript strict coverage tracking:** Add `typescript-coverage-report` to CI.
  Fail below 95% typed coverage. Prevents gradual `any` drift.

- **Lighthouse CI automation:** Run Lighthouse audit on every Vercel preview deployment
  automatically. Fail below 90 Performance / 100 PWA. Currently manual.

- **Real device testing:** BrowserStack free trial — test PWA install on physical Android
  and iOS before major releases. Emulators miss safe-area and keyboard behaviour.

- **tRPC evaluation:** If API surface grows significantly, evaluate tRPC for end-to-end
  type safety without a separate OpenAPI spec. Particularly valuable if a second client
  (e.g. a native app) is added.

---

## Low Priority — v3+

- **PWA push notifications:** Debt milestone reminders ("You're 50% paid off!").
  Requires a notification permission flow and a background job to send them.

- **Neon storage monitoring:** Alert when approaching 400MB (80% of 500MB free tier).
  Plan upgrade path to Neon paid ($19/mo). AI conversation history is the fastest-growing
  table.

- **Gemini model upgrade procedure:** Document how to test `gemini-2.0-flash-001` →
  next stable version. Steps: update version string in GeminiProvider, run golden scenario
  comparison, verify no regression, merge. Never use "latest" alias.

- **FCA authorisation awareness:** If the app grows to a large user base, seek legal
  advice on whether the AI financial narrative feature crosses into regulated advice
  territory under the Financial Services and Markets Act 2000.

- **Monorepo tooling:** If `shared/` grows complex, evaluate Turborepo or pnpm workspaces
  for a proper monorepo setup with shared build caching.

- **AI conversation history encryption at rest:** Currently stored as plaintext in Neon.
  For a regulated-adjacent app, consider encrypting conversation content with a
  per-user key (similar to the BYOK key pattern).

---

## Operational — Set Up Once, Runs Forever

- UptimeRobot monitoring on `/api/v1/health` — set up in Plan 5 (Deployment)
- GitHub Dependabot — enable in Plan 5 (Deployment)
- Sentry error monitoring — set up in Plan 3 (AI Layer / Security)
```

- [ ] **Step 2: Commit**

```bash
git add docs/future-work.md
git commit -m "docs: add future-work backlog from expert panel review"
```

---

### Task 2: Install TypeScript root dependencies

**Files:**
- Modify: `package.json` (root)
- Modify: `server/package.json`

- [ ] **Step 1: Install root TypeScript tooling**

```bash
npm install -D typescript
```

- [ ] **Step 2: Install server TypeScript dependencies**

```bash
npm install --prefix server -D typescript ts-jest @types/node @types/express @types/cors @types/better-sqlite3 tsx
```

- [ ] **Step 3: Verify tsx works**

```bash
echo "console.log('tsx ok')" > /tmp/tsx-test.ts && npx tsx /tmp/tsx-test.ts
```

Expected output: `tsx ok`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server/package.json
git commit -m "chore: install TypeScript and ts-jest dependencies"
```

---

### Task 3: Money utilities (TDD)

**Files:**
- Create: `shared/utils/__tests__/money.test.ts`
- Create: `shared/utils/money.ts`

These utilities are the foundation for the pence convention. Write the test first.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p shared/utils/__tests__
```

- [ ] **Step 2: Write the failing test**

Create `shared/utils/__tests__/money.test.ts`:

```typescript
import { toPence, fromPence, formatGBP } from '../money';

describe('toPence', () => {
  it('converts whole pounds', () => {
    expect(toPence(10)).toBe(1000);
  });
  it('converts pounds and pence', () => {
    expect(toPence(10.99)).toBe(1099);
  });
  it('rounds floating point imprecision', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS floats
    expect(toPence(0.1 + 0.2)).toBe(30);
  });
  it('handles zero', () => {
    expect(toPence(0)).toBe(0);
  });
  it('handles large values', () => {
    expect(toPence(99999.99)).toBe(9999999);
  });
});

describe('fromPence', () => {
  it('converts pence to pounds', () => {
    expect(fromPence(1099)).toBe(10.99);
  });
  it('converts zero', () => {
    expect(fromPence(0)).toBe(0);
  });
  it('handles whole pounds', () => {
    expect(fromPence(1000)).toBe(10);
  });
});

describe('formatGBP', () => {
  it('formats zero', () => {
    expect(formatGBP(0)).toBe('£0.00');
  });
  it('formats whole pounds', () => {
    expect(formatGBP(1000)).toBe('£10.00');
  });
  it('formats pence only', () => {
    expect(formatGBP(1)).toBe('£0.01');
  });
  it('formats thousands with comma', () => {
    expect(formatGBP(100000)).toBe('£1,000.00');
  });
  it('formats large values', () => {
    expect(formatGBP(9999999)).toBe('£99,999.99');
  });
});
```

- [ ] **Step 3: Configure Jest to handle TypeScript and shared path**

Create `server/jest.config.js`:

```javascript
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>', '<rootDir>/../shared'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
};
```

- [ ] **Step 4: Run the test to confirm it fails**

```bash
npm run test:unit
```

Expected: FAIL — `Cannot find module '../money'`

- [ ] **Step 5: Write the implementation**

Create `shared/utils/money.ts`:

```typescript
/**
 * Convert a pound amount (float) to integer pence.
 * Rounds to handle float imprecision (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
export const toPence = (pounds: number): number => Math.round(pounds * 100);

/**
 * Convert integer pence to a pound float.
 */
export const fromPence = (pence: number): number => pence / 100;

/**
 * Format integer pence as a GBP currency string (e.g. 1234 → "£12.34").
 */
export const formatGBP = (pence: number): string =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    fromPence(pence),
  );
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
npm run test:unit
```

Expected: PASS — all 12 tests pass

- [ ] **Step 7: Commit**

```bash
git add shared/utils/money.ts shared/utils/__tests__/money.test.ts server/jest.config.js
git commit -m "feat: add shared money utilities (toPence, fromPence, formatGBP)"
```

---

### Task 4: Write shared/types/debt.ts

**Files:**
- Create: `shared/types/debt.ts`

No tests — these are TypeScript interfaces. Correctness is verified by `tsc --noEmit` in Task 9.

- [ ] **Step 1: Create the file**

```bash
mkdir -p shared/types
```

Create `shared/types/debt.ts`:

```typescript
/**
 * Debt domain types.
 * Monetary values are in INTEGER PENCE throughout (e.g. £12.34 = 1234).
 * APR / rate values are decimal ratios (e.g. 21.49% = 0.2149).
 */

export type DebtType =
  | 'credit_card'
  | 'personal_loan'
  | 'overdraft'
  | 'student_loan'
  | 'mortgage'
  | 'other';

export interface Tranche {
  id: number;
  debtId: number;
  label: string;
  /** Current balance in pence */
  balance: number;
  /** APR as a decimal ratio, e.g. 0.2149 for 21.49% */
  apr: number;
  promoEndDate: string | null;
  /** APR after promo period ends, as a decimal ratio */
  postPromoApr: number | null;
  sortOrder: number;
}

export interface Debt {
  id: number;
  userId: string | null;
  name: string;
  lender: string | null;
  debtType: DebtType;
  /** Fixed monthly minimum payment in pence, or 0 if percentage-based */
  minimumPayment: number;
  /** Percentage-based minimum as a decimal, e.g. 0.02 for 2% */
  minPaymentPct: number | null;
  /** Minimum floor for percentage-based minimums, in pence */
  minPaymentFloor: number | null;
  notes: string | null;
  createdAt: string;
}

export interface DebtWithTranches extends Debt {
  tranches: Tranche[];
}
```

---

### Task 5: Write shared/types/plan.ts

**Files:**
- Create: `shared/types/plan.ts`

- [ ] **Step 1: Create the file**

Create `shared/types/plan.ts`:

```typescript
/**
 * Plan calculation result types.
 * Monetary values are in INTEGER PENCE.
 */

export type PayoffStrategy = 'avalanche' | 'snowball';

export interface PlanMonth {
  month: number;
  /** ISO date string of this month's payment date */
  date: string;
  /** Total debt balance remaining at end of month, in pence */
  totalBalance: number;
  /** Total interest accrued this month, in pence */
  interestPaid: number;
  /** Total principal paid this month, in pence */
  principalPaid: number;
  /** Total payment made this month, in pence */
  totalPayment: number;
  /** Per-debt breakdown */
  debtBreakdown: Array<{
    debtId: number;
    name: string;
    balance: number;
    payment: number;
    interestPaid: number;
  }>;
}

export interface PlanResult {
  strategy: PayoffStrategy;
  months: PlanMonth[];
  /** Total interest paid over the life of the plan, in pence */
  totalInterestPaid: number;
  /** Total amount paid over the life of the plan, in pence */
  totalPaid: number;
  /** ISO date string when debt is cleared */
  debtFreeDate: string;
  /** Number of months to debt freedom */
  monthCount: number;
}

export interface StrategyComparison {
  avalanche: PlanResult;
  snowball: PlanResult;
  /** Interest saved by choosing avalanche over snowball, in pence */
  interestSavedByAvalanche: number;
  /** Months saved by choosing avalanche over snowball */
  monthsSavedByAvalanche: number;
}
```

---

### Task 6: Write shared/types/ai.ts

**Files:**
- Create: `shared/types/ai.ts`

- [ ] **Step 1: Create the file**

Create `shared/types/ai.ts`:

```typescript
/**
 * AI provider abstraction types.
 *
 * FinancialContext is the PII-exclusion contract: it MUST NOT contain
 * userId, email, or displayName. TypeScript enforces this at compile time.
 * The full implementation will include additional fields beyond this
 * illustrative subset (tranches, windfalls, expense events, etc.) —
 * all financial figures, none personally identifying.
 */

export type AIProviderName = 'gemini' | 'anthropic';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface FinancialContext {
  // ── NO userId, email, or displayName below this line ──
  /** All debts with their tranches. Monetary values in pence. */
  debts: Array<{
    id: number;
    name: string;
    debtType: string;
    tranches: Array<{
      label: string;
      /** Balance in pence */
      balance: number;
      /** APR as decimal ratio, e.g. 0.2149 */
      apr: number;
      promoEndDate: string | null;
      postPromoApr: number | null;
    }>;
  }>;
  /** Total monthly take-home income in pence */
  monthlyIncomePence: number;
  /** Total monthly essential expenses in pence */
  monthlyExpensesPence: number;
  /** Chosen payoff strategy */
  strategy: 'avalanche' | 'snowball';
  /** Estimated debt-free date as ISO string */
  debtFreeDateEstimate: string;
  /** Total interest to be paid under current plan, in pence */
  totalInterestPence: number;
  /** Windfalls scheduled */
  windfalls: Array<{
    label: string;
    /** Amount in pence */
    amount: number;
    applyMonth: number;
  }>;
}

/**
 * All AI providers implement this interface.
 * - GeminiProvider: uses Gemini 2.0 Flash (free, default)
 * - AnthropicProvider: uses claude-sonnet-4-6 (BYOK)
 * - MockAIProvider: deterministic, no network calls (tests only)
 */
export interface AIProvider {
  readonly providerName: AIProviderName;
  /**
   * Stream an AI analysis response token by token.
   * The async iterable yields string tokens as they arrive.
   */
  streamAnalysis(
    context: FinancialContext,
    userMessage: string,
    history: AIMessage[],
  ): AsyncIterable<string>;
}
```

---

### Task 7: Write shared/types/api.ts

**Files:**
- Create: `shared/types/api.ts`

- [ ] **Step 1: Install Zod in server**

```bash
npm install --prefix server zod
```

- [ ] **Step 2: Create the file**

Create `shared/types/api.ts`:

```typescript
/**
 * API request/response shapes.
 * Zod schemas provide runtime validation; z.infer<> gives TypeScript types.
 * Import the schema for server-side validation, the type for type annotations.
 */
import { z } from 'zod';

// ── Debt ──────────────────────────────────────────────────────────────────

export const CreateTrancheSchema = z.object({
  label: z.string().min(1).max(100),
  /** Balance in pence */
  balance: z.number().int().min(1),
  /** APR as decimal ratio, e.g. 0.2149 for 21.49% */
  apr: z.number().min(0).max(10),
  promoEndDate: z.string().nullable().optional(),
  postPromoApr: z.number().min(0).max(10).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateTrancheRequest = z.infer<typeof CreateTrancheSchema>;

export const CreateDebtSchema = z.object({
  name: z.string().min(1).max(200),
  lender: z.string().max(200).nullable().optional(),
  debtType: z.enum([
    'credit_card', 'personal_loan', 'overdraft',
    'student_loan', 'mortgage', 'other',
  ]).default('credit_card'),
  /** Fixed minimum payment in pence, or 0 if percentage-based */
  minimumPayment: z.number().int().min(0).default(0),
  /** Percentage-based minimum as decimal (e.g. 0.02 for 2%) */
  minPaymentPct: z.number().min(0).max(1).nullable().optional(),
  /** Minimum floor for percentage payments, in pence */
  minPaymentFloor: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tranches: z.array(CreateTrancheSchema).min(1),
});
export type CreateDebtRequest = z.infer<typeof CreateDebtSchema>;

// ── Income ────────────────────────────────────────────────────────────────

export const CreateIncomeSourceSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(1),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'annual']).default('monthly'),
  /** Pre-calculated monthly equivalent in pence */
  monthlyEquivalent: z.number().int().min(1),
});
export type CreateIncomeSourceRequest = z.infer<typeof CreateIncomeSourceSchema>;

// ── Expense ───────────────────────────────────────────────────────────────

export const CreateExpenseSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(0),
  category: z.string().min(1).max(100),
  isEssential: z.boolean().default(true),
});
export type CreateExpenseRequest = z.infer<typeof CreateExpenseSchema>;

// ── Windfall ──────────────────────────────────────────────────────────────

export const CreateWindfallSchema = z.object({
  label: z.string().min(1).max(200),
  /** Amount in pence */
  amount: z.number().int().min(1),
  applyMonth: z.number().int().min(1).max(360),
});
export type CreateWindfallRequest = z.infer<typeof CreateWindfallSchema>;

// ── AI ────────────────────────────────────────────────────────────────────

export const AIMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  message: z.string().min(1).max(4000),
});
export type AIMessageRequest = z.infer<typeof AIMessageSchema>;

// ── Common ────────────────────────────────────────────────────────────────

export interface APIError {
  error: string;
  code?: string;
}

export interface APISuccess<T> {
  data: T;
}
```

- [ ] **Step 3: Commit all shared types**

```bash
git add shared/
git commit -m "feat: add shared TypeScript types (debt, plan, ai, api) and Zod schemas"
```

---

### Task 8: Create root tsconfig.json

**Files:**
- Create: `tsconfig.json` (root)

- [ ] **Step 1: Create the file**

Create `tsconfig.json` at the project root:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

This is a base config only — it has no `include`, no `outDir`, no `module`. Each sub-project's tsconfig extends this and adds those fields.

---

### Task 9: Configure server TypeScript

**Files:**
- Create: `server/tsconfig.json`
- Modify: `server/package.json`

- [ ] **Step 1: Create server/tsconfig.json**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": ".",
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["./**/*.ts", "../shared/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Update server/package.json scripts**

Add to the `"scripts"` block in `server/package.json`:

```json
"typecheck": "tsc --noEmit",
"dev": "tsx --watch index.ts",
"build": "tsc"
```

The existing `"start": "node index.js"` stays for production (runs compiled JS).

- [ ] **Step 3: Verify tsc finds no errors on the current JS files**

```bash
cd server && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors about missing types on `.js` files — that's expected. We'll fix them as we migrate route files to `.ts` in later plans. For now, verify the tsconfig itself loads without a config error.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json server/tsconfig.json server/package.json
git commit -m "chore: add TypeScript config for root and server"
```

---

### Task 10: Configure client TypeScript and Vite alias

**Files:**
- Create: `client/tsconfig.json`
- Rename + Modify: `client/vite.config.js` → `client/vite.config.ts`

- [ ] **Step 1: Create client/tsconfig.json**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "../shared/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Rename vite.config.js to vite.config.ts and add @shared alias**

Delete `client/vite.config.js` and create `client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Verify Vite still starts**

```bash
cd client && npm run dev
```

Expected: Vite dev server starts on port 3000 with no errors. Stop it with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add client/tsconfig.json client/vite.config.ts
git rm client/vite.config.js
git commit -m "chore: add TypeScript config for client and @shared Vite alias"
```

---

### Task 11: Add typecheck and audit scripts to root

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update root package.json scripts**

Add to the `"scripts"` block in the root `package.json`:

```json
"typecheck": "tsc --noEmit --project client/tsconfig.json && tsc --noEmit --project server/tsconfig.json",
"audit:ci": "npm audit --audit-level=high && npm audit --audit-level=high --prefix client && npm audit --audit-level=high --prefix server"
```

- [ ] **Step 2: Run typecheck to confirm it executes**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: May show type errors in existing `.jsx` files (these will be fixed when components are migrated to TypeScript in Plan 4). The important thing is the command runs without a config error.

- [ ] **Step 3: Run audit:ci**

```bash
npm run audit:ci
```

Expected: either passes or shows which packages have vulnerabilities. Fix any HIGH or CRITICAL ones before proceeding:

```bash
npm audit fix
npm audit fix --prefix client
npm audit fix --prefix server
```

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add typecheck and audit:ci npm scripts"
```

---

### Task 12: Capture golden Claude CLI outputs

**Files:**
- Create: `server/ai/prompts/golden-outputs/scenario-1.txt`
- Create: `server/ai/prompts/golden-outputs/scenario-2.txt`
- Create: `server/ai/prompts/golden-outputs/scenario-3.txt`

These are the quality baseline. Gemini output must match this quality in Plan 3 before the AI migration is considered complete.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p server/ai/prompts/golden-outputs
```

- [ ] **Step 2: Start the app with your real data**

```bash
npm start
```

Open `http://localhost:3000` in your browser.

- [ ] **Step 3: Run 3 AI analyses and save outputs**

For each scenario below, use the AI advisor in the app and copy the full response text into the corresponding file:

**Scenario 1** (`scenario-1.txt`): Ask "What's my best strategy for paying off my debts?" with your current real data loaded.

**Scenario 2** (`scenario-2.txt`): Ask "How much interest will I save using the avalanche strategy compared to minimum payments?" with current data.

**Scenario 3** (`scenario-3.txt`): Ask "If I put an extra £200 a month toward debt, when will I be debt-free?" with current data.

Copy each AI response in full (including any formatting) into the respective file.

- [ ] **Step 4: Add a README in the golden-outputs directory**

Create `server/ai/prompts/golden-outputs/README.md`:

```markdown
# Golden Outputs

These files capture AI responses from the existing Claude CLI integration,
used as a quality baseline when migrating to Gemini (Plan 3).

During Plan 3 prompt regression testing, run the same 3 questions through
the new Gemini provider and compare output quality manually. Gemini output
should be comparable in accuracy, depth, and tone before Plan 3 is marked done.

Do NOT gitignore this directory — these files are the regression baseline.

Scenarios:
- scenario-1.txt: "Best strategy for paying off my debts?"
- scenario-2.txt: "Interest savings with avalanche vs minimum payments?"
- scenario-3.txt: "Debt-free date with extra £200/month?"
```

- [ ] **Step 5: Commit**

```bash
git add server/ai/prompts/golden-outputs/
git commit -m "chore: save golden AI output scenarios for Gemini regression testing"
```

---

### Task 13: Install Drizzle and Neon dependencies

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install Drizzle ORM and Neon serverless driver**

```bash
npm install --prefix server drizzle-orm @neondatabase/serverless ws
npm install --prefix server -D drizzle-kit @types/ws
```

- [ ] **Step 2: Verify drizzle-kit is available**

```bash
cd server && npx drizzle-kit --version
```

Expected: prints a version number like `0.x.x`

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: install drizzle-orm, @neondatabase/serverless, drizzle-kit"
```

---

### Task 14: Write Drizzle config and Neon connection module

**Files:**
- Create: `drizzle.config.ts` (project root)
- Create: `server/db/connection.ts`

- [ ] **Step 1: Create drizzle.config.ts at project root**

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
} satisfies Config;
```

- [ ] **Step 2: Create server/db/connection.ts**

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../drizzle/schema';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(databaseUrl);

/**
 * Drizzle database instance connected to Neon via HTTP.
 * HTTP transport is used because:
 * - Vercel serverless functions are stateless (no persistent connections)
 * - Neon HTTP driver handles connection pooling automatically
 */
export const db = drizzle(sql, { schema });
```

- [ ] **Step 3: Commit**

```bash
git add drizzle.config.ts server/db/connection.ts
git commit -m "chore: add Drizzle config and Neon HTTP connection module"
```

---

### Task 15: Write Drizzle schema

**Files:**
- Create: `drizzle/schema.ts`

This is the most critical file in Plan 1. It defines all 12 tables with `user_id` added and monetary values as integer pence. Read carefully — column names must match what the migration script in Task 17 uses.

- [ ] **Step 1: Create the directory and schema file**

```bash
mkdir -p drizzle
```

Create `drizzle/schema.ts`:

```typescript
/**
 * Drizzle schema for Liam's Wicked Financial Planner.
 *
 * Key conventions:
 * - All monetary columns are INTEGER (pence). e.g. £12.34 → 1234
 * - All APR / rate columns are DOUBLE PRECISION (decimal ratio). e.g. 21.49% → 0.2149
 * - user_id is TEXT (Supabase UUID) and nullable in Plan 1.
 *   Plan 2 adds NOT NULL after auth is wired and existing data is backfilled.
 * - No FK from user_id to auth.users — Neon and Supabase are separate services.
 *   Isolation is enforced at the application layer (middleware + WHERE clauses).
 */

import {
  pgTable,
  serial,
  integer,
  text,
  doublePrecision,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Debts ─────────────────────────────────────────────────────────────────

export const debts = pgTable('debts', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  lender: text('lender'),
  debtType: text('debt_type').notNull().default('credit_card'),
  /** Fixed monthly minimum payment in pence */
  minimumPayment: integer('minimum_payment').notNull().default(0),
  /** Percentage-based minimum as decimal (e.g. 0.02 = 2%) */
  minPaymentPct: doublePrecision('min_payment_pct'),
  /** Floor for percentage minimums, in pence */
  minPaymentFloor: integer('min_payment_floor'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`current_date::text`),
});

export const tranches = pgTable('tranches', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  debtId: integer('debt_id')
    .notNull()
    .references(() => debts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  /** Current balance in pence */
  balance: integer('balance').notNull(),
  /** APR as decimal ratio (e.g. 0.2149 for 21.49%) */
  apr: doublePrecision('apr').notNull(),
  promoEndDate: text('promo_end_date'),
  postPromoApr: doublePrecision('post_promo_apr'),
  sortOrder: integer('sort_order').default(0),
});

// ── Income ────────────────────────────────────────────────────────────────

export const incomeSources = pgTable('income_sources', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  frequency: text('frequency').notNull().default('monthly'),
  /** Pre-calculated monthly equivalent in pence */
  monthlyEquivalent: integer('monthly_equivalent').notNull(),
});

// ── Expenses ──────────────────────────────────────────────────────────────

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  category: text('category').notNull(),
  isEssential: boolean('is_essential').notNull().default(true),
});

// ── Plan cache ────────────────────────────────────────────────────────────

export const planCache = pgTable('plan_cache', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  inputHash: text('input_hash').notNull(),
  strategy: text('strategy').notNull(),
  calcResult: text('calc_result').notNull(),
  aiNarrative: text('ai_narrative'),
  aiBudgetTips: text('ai_budget_tips'),
  generatedAt: text('generated_at').notNull(),
  aiMode: text('ai_mode').notNull().default('C'),
});

// ── Windfalls ─────────────────────────────────────────────────────────────

export const windfalls = pgTable('windfalls', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  applyMonth: integer('apply_month').notNull(),
  createdAt: text('created_at').default(sql`current_date::text`),
});

// ── Settings ──────────────────────────────────────────────────────────────
// Note: Plan 2 adds composite unique (key, user_id) when user_id becomes NOT NULL.

export const settings = pgTable(
  'settings',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id'),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    keyUserUnique: unique('uq_settings_key_user').on(table.key, table.userId),
  }),
);

// ── Progress snapshots ────────────────────────────────────────────────────

export const progressSnapshots = pgTable('progress_snapshots', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  snapshotMonth: text('snapshot_month').notNull(),
  recordedAt: text('recorded_at').default(sql`now()::text`),
  /** Total remaining balance in pence */
  totalBalance: integer('total_balance').notNull(),
  balancesJson: text('balances_json').notNull(),
  notes: text('notes'),
});

// ── Spending actuals ──────────────────────────────────────────────────────

export const spendingActuals = pgTable(
  'spending_actuals',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id'),
    expenseId: integer('expense_id').references(() => expenses.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    label: text('label').notNull(),
    /** Actual amount spent in pence */
    amountActual: integer('amount_actual').notNull(),
    recordMonth: text('record_month').notNull(),
  },
  (table) => ({
    monthIdx: index('idx_spending_actuals_month').on(table.recordMonth),
  }),
);

// ── Expense events ────────────────────────────────────────────────────────

export const expenseEvents = pgTable('expense_events', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  label: text('label').notNull(),
  /** Amount in pence */
  amount: integer('amount').notNull(),
  applyMonth: integer('apply_month').notNull(),
  category: text('category').notNull().default('expected'),
  createdAt: text('created_at').default(sql`current_date::text`),
});

// ── Conversations ─────────────────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  title: text('title').notNull().default('New conversation'),
  useContext: boolean('use_context').notNull().default(true),
  contextSnapshot: text('context_snapshot'),
  summary: text('summary'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()::text`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`now()::text`),
});

// ── Messages ──────────────────────────────────────────────────────────────

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id'),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    sequence: integer('sequence').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`now()::text`),
  },
  (table) => ({
    convSeqIdx: index('idx_messages_conv_seq').on(
      table.conversationId,
      table.sequence,
    ),
    convSeqUnique: unique('uq_messages_conv_seq').on(
      table.conversationId,
      table.sequence,
    ),
  }),
);

// ── User AI keys (new table — for BYOK Anthropic key storage) ─────────────
// Added here so Plan 3 (AI layer) can use it without a separate migration.

export const userAiKeys = pgTable('user_ai_keys', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  /** AES-256-GCM ciphertext of the API key */
  encryptedKey: text('encrypted_key').notNull(),
  /** Random 12-byte IV (hex-encoded), unique per key */
  iv: text('iv').notNull(),
  provider: text('provider').notNull().default('anthropic'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()::text`),
});
```

- [ ] **Step 2: Commit the schema**

```bash
git add drizzle/schema.ts
git commit -m "feat: add Drizzle schema (all 12 tables + user_id + integer pence columns)"
```

---

### Task 16: Generate initial migration

**Files:**
- Create: `drizzle/migrations/` (auto-generated by drizzle-kit)

Prerequisite: You need a Neon account and project set up before this step.

**Set up Neon (one-time manual steps):**
1. Go to [neon.tech](https://neon.tech) and sign up / log in
2. Create a new project — name it "liams-wicked-financial-planner"
3. Select region: **eu-west-1** (Ireland) or **eu-central-1** (Frankfurt)
4. On the project dashboard, click "Connect" → copy the **Pooled connection** string
5. It looks like: `postgresql://username:password@ep-xxx.eu-west-1.aws.neon.tech/neondb?sslmode=require`

- [ ] **Step 1: Create .env file with your Neon connection string**

```bash
cp .env.example .env
```

Edit `.env` and add:

```
DATABASE_URL=postgresql://your-user:your-password@ep-xxx.eu-west-1.aws.neon.tech/neondb?sslmode=require
```

Confirm `.env` is in `.gitignore` — never commit credentials.

- [ ] **Step 2: Generate the migration SQL**

```bash
cd server && DATABASE_URL=$(cat ../.env | grep DATABASE_URL | cut -d= -f2-) npx drizzle-kit generate --config ../drizzle.config.ts
```

Or on Windows PowerShell:

```powershell
$env:DATABASE_URL = (Get-Content ../.env | Select-String "DATABASE_URL").ToString().Split("=", 2)[1]
npx drizzle-kit generate --config ../drizzle.config.ts
```

Expected: Creates `drizzle/migrations/0000_initial.sql` (name may vary).

- [ ] **Step 3: Review the generated SQL**

Open `drizzle/migrations/0000_initial.sql` and verify:
- All 13 tables are present (including `user_ai_keys`)
- `user_id` column appears on every table except `user_ai_keys` (where it's required)
- Monetary columns are `INTEGER` not `REAL`/`FLOAT`
- `SERIAL` primary keys (not AUTOINCREMENT)
- Indexes match the schema

- [ ] **Step 4: Apply the migration to Neon**

```bash
cd server && DATABASE_URL=$(cat ../.env | grep DATABASE_URL | cut -d= -f2-) npx drizzle-kit migrate --config ../drizzle.config.ts
```

Expected output:
```
Running migrations...
  → 0000_initial.sql
  ✓ Applied 0000_initial.sql
```

- [ ] **Step 5: Commit the generated migration**

```bash
git add drizzle/migrations/
git commit -m "feat: generate initial Neon PostgreSQL migration (all tables + user_id)"
```

---

### Task 17: Write the migration harness

**Files:**
- Create: `scripts/test-migration.ts`
- Modify: `package.json` (root) — add `test:migration` script

This script reads existing SQLite data, migrates it to Neon, verifies row counts, and spot-checks amortisation totals. It is the acceptance test for Phase 1.

- [ ] **Step 1: Add test:migration script to root package.json**

Add to the `"scripts"` block in the root `package.json`:

```json
"test:migration": "tsx scripts/test-migration.ts"
```

- [ ] **Step 2: Create scripts directory and harness**

```bash
mkdir -p scripts
```

Create `scripts/test-migration.ts`:

```typescript
/**
 * Migration harness: SQLite → Neon PostgreSQL
 *
 * Run with: npm run test:migration
 *
 * Requires environment variables:
 *   DATABASE_URL  — Neon pooled connection string
 *   SQLITE_PATH   — path to finance.db (defaults to ./finance.db)
 *
 * What this does:
 * 1. Opens SQLite (read-only)
 * 2. Reads all rows from all tables
 * 3. Converts monetary values (SQLite REAL pounds → Neon INTEGER pence)
 * 4. Inserts into Neon (wiping existing data first for idempotency)
 * 5. Verifies row counts match across all tables
 * 6. Spot-checks: verifies total balance sum matches between sources
 *
 * Re-running is safe: it truncates Neon tables before inserting.
 */

import Database from 'better-sqlite3';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql as sqlHelper } from 'drizzle-orm';
import * as schema from '../drizzle/schema';
import { toPence } from '../shared/utils/money';
import path from 'path';

// ── Setup ─────────────────────────────────────────────────────────────────

const SQLITE_PATH = process.env['SQLITE_PATH'] ?? path.join(__dirname, '../finance.db');
const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const httpSql = neon(DATABASE_URL);
const db = drizzle(httpSql, { schema });

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[migration] ${msg}`);
}

function pass(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string): void {
  console.error(`  ✗ FAIL: ${msg}`);
  process.exit(1);
}

async function assertCount(
  tableName: string,
  sqliteCount: number,
  neonRows: unknown[],
): Promise<void> {
  if (neonRows.length !== sqliteCount) {
    fail(`${tableName}: SQLite has ${sqliteCount} rows, Neon has ${neonRows.length}`);
  }
  pass(`${tableName}: ${neonRows.length} rows match`);
}

// ── Truncate Neon tables (for idempotent re-runs) ─────────────────────────

async function truncateAll(): Promise<void> {
  log('Truncating Neon tables (order matters for FK constraints)...');
  // Messages first (FK → conversations), conversations second, etc.
  await db.delete(schema.messages);
  await db.delete(schema.conversations);
  await db.delete(schema.spendingActuals);
  await db.delete(schema.progressSnapshots);
  await db.delete(schema.planCache);
  await db.delete(schema.expenseEvents);
  await db.delete(schema.windfalls);
  await db.delete(schema.expenses);
  await db.delete(schema.incomeSources);
  await db.delete(schema.tranches);
  await db.delete(schema.debts);
  await db.delete(schema.settings);
  await db.delete(schema.userAiKeys);
  log('Neon tables cleared.');
}

// ── Migrate each table ────────────────────────────────────────────────────

async function migrateDebts(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM debts').all() as any[];
  if (rows.length === 0) { pass('debts: 0 rows (empty)'); return; }

  await db.insert(schema.debts).values(
    rows.map((r) => ({
      name: r.name,
      lender: r.lender ?? null,
      debtType: r.debt_type,
      minimumPayment: toPence(r.minimum_payment ?? 0),
      minPaymentPct: r.min_payment_pct ?? null,
      minPaymentFloor: r.min_payment_floor != null ? toPence(r.min_payment_floor) : null,
      notes: r.notes ?? null,
      createdAt: r.created_at ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.debts);
  await assertCount('debts', rows.length, neonRows);
}

async function migrateTranches(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM tranches').all() as any[];
  if (rows.length === 0) { pass('tranches: 0 rows (empty)'); return; }

  // Map old SQLite IDs to new Neon IDs
  const sqliteDebts = sqlite.prepare('SELECT id, name FROM debts').all() as any[];
  const neonDebts = await db.select({ id: schema.debts.id, name: schema.debts.name }).from(schema.debts);
  const debtIdMap = new Map<number, number>();
  for (const sd of sqliteDebts) {
    const nd = neonDebts.find((d) => d.name === sd.name);
    if (nd) debtIdMap.set(sd.id, nd.id);
  }

  await db.insert(schema.tranches).values(
    rows.map((r) => ({
      debtId: debtIdMap.get(r.debt_id) ?? r.debt_id,
      label: r.label,
      balance: toPence(r.balance),
      apr: r.apr,
      promoEndDate: r.promo_end_date ?? null,
      postPromoApr: r.post_promo_apr ?? null,
      sortOrder: r.sort_order ?? 0,
    })),
  );

  const neonRows = await db.select().from(schema.tranches);
  await assertCount('tranches', rows.length, neonRows);
}

async function migrateIncomeSources(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM income_sources').all() as any[];
  if (rows.length === 0) { pass('income_sources: 0 rows (empty)'); return; }

  await db.insert(schema.incomeSources).values(
    rows.map((r) => ({
      label: r.label,
      amount: toPence(r.amount),
      frequency: r.frequency,
      monthlyEquivalent: toPence(r.monthly_equivalent),
    })),
  );

  const neonRows = await db.select().from(schema.incomeSources);
  await assertCount('income_sources', rows.length, neonRows);
}

async function migrateExpenses(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM expenses').all() as any[];
  if (rows.length === 0) { pass('expenses: 0 rows (empty)'); return; }

  await db.insert(schema.expenses).values(
    rows.map((r) => ({
      label: r.label,
      amount: toPence(r.amount),
      category: r.category,
      isEssential: r.is_essential === 1,
    })),
  );

  const neonRows = await db.select().from(schema.expenses);
  await assertCount('expenses', rows.length, neonRows);
}

async function migrateWindfalls(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM windfalls').all() as any[];
  if (rows.length === 0) { pass('windfalls: 0 rows (empty)'); return; }

  await db.insert(schema.windfalls).values(
    rows.map((r) => ({
      label: r.label,
      amount: toPence(r.amount),
      applyMonth: r.apply_month,
      createdAt: r.created_at ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.windfalls);
  await assertCount('windfalls', rows.length, neonRows);
}

async function migrateSettings(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM settings').all() as any[];
  if (rows.length === 0) { pass('settings: 0 rows (empty)'); return; }

  await db.insert(schema.settings).values(
    rows.map((r) => ({
      key: r.key,
      value: r.value,
    })),
  );

  const neonRows = await db.select().from(schema.settings);
  await assertCount('settings', rows.length, neonRows);
}

async function migrateExpenseEvents(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM expense_events').all() as any[];
  if (rows.length === 0) { pass('expense_events: 0 rows (empty)'); return; }

  await db.insert(schema.expenseEvents).values(
    rows.map((r) => ({
      label: r.label,
      amount: toPence(r.amount),
      applyMonth: r.apply_month,
      category: r.category ?? 'expected',
      createdAt: r.created_at ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.expenseEvents);
  await assertCount('expense_events', rows.length, neonRows);
}

async function migrateProgressSnapshots(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM progress_snapshots').all() as any[];
  if (rows.length === 0) { pass('progress_snapshots: 0 rows (empty)'); return; }

  await db.insert(schema.progressSnapshots).values(
    rows.map((r) => ({
      snapshotMonth: r.snapshot_month,
      recordedAt: r.recorded_at ?? null,
      totalBalance: toPence(r.total_balance),
      balancesJson: r.balances_json,
      notes: r.notes ?? null,
    })),
  );

  const neonRows = await db.select().from(schema.progressSnapshots);
  await assertCount('progress_snapshots', rows.length, neonRows);
}

async function migrateConversations(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM conversations').all() as any[];
  if (rows.length === 0) { pass('conversations: 0 rows (empty)'); return; }

  await db.insert(schema.conversations).values(
    rows.map((r) => ({
      title: r.title,
      useContext: r.use_context === 1,
      contextSnapshot: r.context_snapshot ?? null,
      summary: r.summary ?? null,
      deletedAt: r.deleted_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  );

  const neonRows = await db.select().from(schema.conversations);
  await assertCount('conversations', rows.length, neonRows);
}

async function migrateMessages(): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM messages').all() as any[];
  if (rows.length === 0) { pass('messages: 0 rows (empty)'); return; }

  const sqliteConvs = sqlite.prepare('SELECT id FROM conversations').all() as any[];
  const neonConvs = await db.select({ id: schema.conversations.id }).from(schema.conversations);
  // Map by position (conversations migrated in order)
  const convIdMap = new Map<number, number>();
  sqliteConvs.forEach((sc, i) => {
    const nc = neonConvs[i];
    if (nc) convIdMap.set(sc.id, nc.id);
  });

  await db.insert(schema.messages).values(
    rows.map((r) => ({
      conversationId: convIdMap.get(r.conversation_id) ?? r.conversation_id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      sequence: r.sequence,
      createdAt: r.created_at,
    })),
  );

  const neonRows = await db.select().from(schema.messages);
  await assertCount('messages', rows.length, neonRows);
}

// ── Spot checks ───────────────────────────────────────────────────────────

async function spotCheckBalances(): Promise<void> {
  log('Running spot check: total debt balance...');

  const sqliteTotal = (sqlite
    .prepare('SELECT COALESCE(SUM(balance), 0) as total FROM tranches')
    .get() as any).total as number;

  const neonResult = await db
    .select({ total: sqlHelper`COALESCE(SUM(${schema.tranches.balance}), 0)` })
    .from(schema.tranches);

  const neonTotalPence = Number((neonResult[0] as any).total);
  const sqliteTotalPence = toPence(sqliteTotal);

  if (Math.abs(neonTotalPence - sqliteTotalPence) > 1) {
    // Allow 1 pence rounding tolerance
    fail(
      `Balance mismatch: SQLite total ${sqliteTotal} (→ ${sqliteTotalPence}p), ` +
      `Neon total ${neonTotalPence}p`,
    );
  }
  pass(`Total balance matches: ${neonTotalPence}p (±1p rounding tolerance)`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('Starting SQLite → Neon migration harness...');
  log(`SQLite source: ${SQLITE_PATH}`);

  await truncateAll();

  log('Migrating tables...');
  await migrateDebts();
  await migrateTranches();
  await migrateIncomeSources();
  await migrateExpenses();
  await migrateWindfalls();
  await migrateSettings();
  await migrateExpenseEvents();
  await migrateProgressSnapshots();
  await migrateConversations();
  await migrateMessages();

  await spotCheckBalances();

  log('');
  log('✅ Migration harness complete. All row counts match.');
  log('');
  log('IMPORTANT: This migrated your data to Neon with user_id = NULL.');
  log('In Plan 2 (Auth), after registering with Supabase, run:');
  log('  UPDATE <table> SET user_id = \'<your-uuid>\' WHERE user_id IS NULL');
  log('for each table to claim your existing data.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-migration.ts package.json
git commit -m "feat: add SQLite→Neon migration harness (npm run test:migration)"
```

---

### Task 18: Run the migration harness

**Files:** No new files — running the harness.

- [ ] **Step 1: Ensure DATABASE_URL is set in your shell**

```bash
export DATABASE_URL="postgresql://your-user:your-password@ep-xxx.eu-west-1.aws.neon.tech/neondb?sslmode=require"
```

Or on Windows PowerShell:
```powershell
$env:DATABASE_URL = "postgresql://your-user:your-password@ep-xxx.eu-west-1.aws.neon.tech/neondb?sslmode=require"
```

- [ ] **Step 2: Run the migration harness**

```bash
npm run test:migration
```

Expected output:
```
[migration] Starting SQLite → Neon migration harness...
[migration] SQLite source: ./finance.db
[migration] Truncating Neon tables (order matters for FK constraints)...
[migration] Neon tables cleared.
[migration] Migrating tables...
  ✓ debts: N rows match
  ✓ tranches: N rows match
  ✓ income_sources: N rows match
  ✓ expenses: N rows match
  ✓ windfalls: N rows match
  ✓ settings: N rows match
  ✓ expense_events: N rows match
  ✓ progress_snapshots: N rows match
  ✓ conversations: N rows match
  ✓ messages: N rows match
[migration] Running spot check: total debt balance...
  ✓ Total balance matches: NNNNNp (±1p rounding tolerance)

[migration] ✅ Migration harness complete. All row counts match.
```

- [ ] **Step 3: If any step fails, diagnose and fix**

Common issues:
- `ENOENT: no such file or directory 'finance.db'` → run from project root, or set `SQLITE_PATH=./path/to/finance.db`
- `SSL connection required` → ensure `?sslmode=require` is in `DATABASE_URL`
- Balance mismatch > 1p → check which `toPence()` calls might be wrong; add `console.log` to the spot check to see which rows differ

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: plan 1 complete — TypeScript setup + Neon PostgreSQL migration verified"
```

---

### Task 19: Final verification

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:unit
```

Expected: all pass (money utilities + any existing Jest tests)

- [ ] **Step 2: Run typecheck on both client and server**

```bash
npm run typecheck 2>&1
```

Expected: may show errors in existing `.jsx` files — these are fixed in Plan 4 (Mobile UI). The important check is that the new `.ts` files in `shared/`, `drizzle/`, `server/db/`, and `scripts/` compile without errors.

To check only the new TypeScript files:

```bash
npx tsc --noEmit --project server/tsconfig.json 2>&1 | grep "^shared\|^drizzle\|^scripts"
```

Expected: no errors on `shared/`, `drizzle/`, or `scripts/` files.

- [ ] **Step 3: Run audit**

```bash
npm run audit:ci
```

Fix any HIGH or CRITICAL issues before proceeding to Plan 2.

- [ ] **Step 4: Summary commit**

```bash
git log --oneline -10
```

Verify the commit history looks clean. Expected recent commits:
```
chore: plan 1 complete — TypeScript setup + Neon PostgreSQL migration verified
feat: add SQLite→Neon migration harness (npm run test:migration)
feat: generate initial Neon PostgreSQL migration (all tables + user_id)
feat: add Drizzle schema (all 12 tables + user_id + integer pence columns)
chore: add Drizzle config and Neon HTTP connection module
chore: install drizzle-orm, @neondatabase/serverless, drizzle-kit
chore: add typecheck and audit:ci npm scripts
chore: add TypeScript config for client and @shared Vite alias
chore: add TypeScript config for root and server
feat: add shared TypeScript types (debt, plan, ai, api) and Zod schemas
feat: add shared money utilities (toPence, fromPence, formatGBP)
docs: add future-work backlog from expert panel review
```

---

## Plan 1 Complete

**What was built:**
- `docs/future-work.md` — full v2/v3 backlog, won't get lost
- `shared/utils/money.ts` — `toPence`, `fromPence`, `formatGBP` (tested)
- `shared/types/` — `Debt`, `Tranche`, `PlanResult`, `AIProvider`, `FinancialContext`, Zod API schemas
- `tsconfig.json` (root + server + client) — strict TypeScript throughout
- `client/vite.config.ts` — `@shared` alias wired
- `server/jest.config.js` — ts-jest, picks up tests in `shared/`
- `drizzle/schema.ts` — all 13 tables with `user_id` and integer pence monetary columns
- `server/db/connection.ts` — Neon HTTP connection via Drizzle
- `scripts/test-migration.ts` — reads SQLite, writes Neon, verifies counts and balances
- Neon PostgreSQL database with schema applied

**Next:** Plan 2 covers Phase 2 (Supabase Auth) + Phase 3 (Security baseline — helmet, rate limiting, Zod middleware, BYOK encryption, cross-user isolation tests).
