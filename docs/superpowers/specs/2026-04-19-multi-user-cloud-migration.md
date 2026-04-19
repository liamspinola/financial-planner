# Spec: Multi-User Cloud Migration with PWA + TypeScript

**Date:** 2026-04-19
**Status:** Ready for implementation
**Reviewed by:** CTO, Senior SE, Senior Solutions Architect, Senior AI SE, Senior QA, Senior PM, Senior UI/UX (6 rounds)

---

## Context

The financial planner is a single-user local app (React + Express + SQLite) that runs on localhost. The developer's brother needs to use it independently: he is non-technical, has no PC, is in a different location, and will access it exclusively on his phone.

The app must feel native without requiring an app store. It must handle personal financial data (debts, income, expenses) safely under UK GDPR. It must scale cleanly from 2 users to many without architectural rework.

**Cost target:** £0/month.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Platform | Hosted PWA | Reuses 90% of existing code, works iOS + Android, no app store |
| Database | Neon PostgreSQL (EU region) | Replaces SQLite, no free-tier pausing, database branching for CI |
| Auth | Supabase Auth | Google + email magic link, EU region, free up to 50k MAU |
| AI default | Gemini 2.0 Flash (`gemini-2.0-flash-001`, pinned) | Free tier, 1.5k req/day, no cost to developer |
| AI BYOK | Anthropic SDK (`claude-sonnet-4-6`) | Users with API key get Claude; encrypted per-user |
| Language | TypeScript strict mode | Prevents wrong-shape data bugs; type system enforces anonymisation |
| ORM | Drizzle | TypeScript-first, serverless compatible, inspectable SQL migrations |
| Deployment | Vercel (frontend + serverless API, EU region) | Free tier, preview environments, SSE support |
| Streaming | SSE (Server-Sent Events) | Vercel hobby has no WebSocket support; SSE works natively |
| Monitoring | Sentry (free) + UptimeRobot (free) | Error visibility + uptime alerting |

---

## Architecture

```
financial-planner/
  shared/
    types/
      debt.ts         ← Debt, Tranche, DebtWithTranches
      plan.ts         ← PlanResult, StrategyComparison
      ai.ts           ← AIProvider interface, FinancialContext, AIMessage
      api.ts          ← API request/response shapes (Zod schemas + z.infer<> types)
  client/
    src/
      lib/auth.ts     ← Supabase Auth client
      components/
        BottomNav.tsx      ← mobile tab bar (md:hidden)
        AIDisclosure.tsx   ← opt-in consent + FCA disclaimer
        OfflineBanner.tsx  ← connectivity detection
        IOSInstallGuide.tsx ← "Tap Share → Add to Home Screen" overlay
        UpdateBanner.tsx   ← service worker update prompt
      views/
        Login.tsx     ← Google + email login
        Settings.tsx  ← BYOK key input, delete account
      public/
        manifest.json ← PWA identity (name, icons, standalone)
        sw.js         ← service worker
  server/
    middleware/
      auth.ts         ← Supabase JWT validation → req.auth.userId
      rateLimit.ts    ← express-rate-limit (100/min general, 10/min AI)
      validate.ts     ← Zod request body validation wrapper
    ai/
      providers/
        gemini.ts     ← implements AIProvider (pinned version, safety settings)
        anthropic.ts  ← implements AIProvider (BYOK decrypted key)
        mock.ts       ← implements AIProvider (tests, deterministic)
      router.ts       ← checks user BYOK key → selects provider
      prompts/
        analysis.ts   ← buildAnalysisPrompt(ctx: FinancialContext): string
        golden-outputs/ ← saved Claude CLI outputs for prompt regression
    routes/           ← all prefixed /api/v1/
      users.ts        ← DELETE /api/v1/users/me, GET /api/v1/users/me
      ai-keys.ts      ← BYOK CRUD (encrypted)
      [existing routes migrated]
    index.ts          ← helmet, CORS, rate limit, Sentry, Express
  drizzle/
    schema.ts         ← Drizzle schema (all tables + user_id UUID FK)
    migrations/       ← generated SQL (up + down)
```

### Key Architectural Contracts

**AIProvider interface** — both real providers and the mock implement this:
```typescript
interface AIProvider {
  streamAnalysis(
    ctx: FinancialContext,
    userMessage: string,
    history: AIMessage[]
  ): AsyncIterable<string>;
  readonly providerName: 'gemini' | 'anthropic';
}
```

**FinancialContext** — anonymisation enforced by type; PII exclusion is a compile-time contract:
```typescript
interface FinancialContext {
  // No userId, email, or displayName — by design and by type
  debts: Array<{ label: string; balancePence: number; apr: number }>;
  monthlyIncomePence: number;
  monthlyExpensesPence: number;
  strategy: 'avalanche' | 'snowball';
  debtFreeDateEstimate: string;
}
```

**Monetary values** — all stored and calculated in integer pence (×100 on input, ÷100 on display). Float arithmetic is never used for monetary calculations.

**userId extraction** — always from verified JWT (`req.auth.userId`), never from request body.

**API versioning** — all routes prefixed `/api/v1/` before first deploy. Cannot be retrofitted.

**SSE streaming pattern:**
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
for await (const token of provider.streamAnalysis(ctx, msg, history)) {
  res.write(`data: ${JSON.stringify({ token })}\n\n`);
}
res.write('data: [DONE]\n\n');
res.end();
```

---

## Data Model

All existing tables (debts, tranches, income_sources, expenses, spending_actuals, progress_snapshots, plan_cache, windfalls, expense_events, settings, messages, conversations) gain a `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` column. Every query includes a `WHERE user_id = $userId` clause.

New tables:
- `user_ai_keys`: `user_id`, `encrypted_key` (AES-256-GCM ciphertext), `iv` (12-byte random), `provider` ('anthropic'), `created_at`

Separate `user_profiles` table (display name, preferences) kept isolated from financial tables — if financial tables are ever exposed, they contain amounts and categories, not names tied to those amounts.

---

## Security

| Layer | Control |
|---|---|
| In transit | HTTPS enforced by Vercel + Neon |
| At rest | Neon AES-256 default encryption |
| Auth | JWT from Supabase; short expiry (15min access / 7-day refresh) |
| App isolation | `user_id` WHERE clause on every query; cross-user access tests |
| SQL | Drizzle parameterized queries only — no string concatenation |
| Headers | `helmet` (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) |
| Rate limiting | `express-rate-limit`: 100 req/min general, 10 req/min AI (per user) |
| Input validation | Zod schemas on all route request bodies |
| CORS | Locked to Vercel frontend domain only — no wildcard |
| BYOK keys | AES-256-GCM; random IV per key; master key in Vercel env only |
| Prompt injection | User data sanitised before AI prompt insertion; user data in `user` turn not `system` turn |
| AI output | DOMPurify on all AI-rendered HTML |
| Logging | No request bodies, no AI prompts/responses, no API keys in logs |
| Sentry | `beforeSend` strips `extra` and `request.data` |
| Dependencies | `npm audit --audit-level=high` in CI; Dependabot enabled |

---

## Data Protection & GDPR

**Principle:** Minimise what is collected. Do not collect bank names, account numbers, real names, dates of birth, or precise location.

**AI anonymisation:** `FinancialContext` type excludes userId, email, and display name by definition. Prompts send financial figures and categories only — never "John earns £3,200", always "the user earns £3,200".

**AI opt-in:** AI features require explicit consent before first use: "Your financial data (excluding name and email) is sent to Google for AI analysis. It is not used to train their models." Users who decline can use all core features.

**Conversation history:** AI messages stored in `messages` / `conversations` tables. 90-day retention policy (v2 — see Future Work). Users can clear AI history independently of their account.

**User rights (all self-service):**
- Right to erasure: `DELETE /api/v1/users/me` cascades all tables immediately
- Right to access: JSON export of all user data (v2 — see Future Work)
- Right to rectification: all data is editable by design

**Data residency:** EU region on Neon, Supabase, and Vercel. Set at account creation — cannot be changed without full migration.

**Legal:** Privacy policy required before any external user (use Termly, include AI data disclosure). FCA disclaimer on all AI responses: "This is not regulated financial advice."

---

## Environment Variables

| Variable | Source | Scope |
|---|---|---|
| `DATABASE_URL` | Neon pooler connection string | Server only |
| `SUPABASE_URL` | Supabase project URL | Server + client (`VITE_` prefix for client) |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | Client only (`VITE_` prefix) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Server only — never expose to client |
| `GEMINI_API_KEY` | Google AI Studio | Server only |
| `BYOK_ENCRYPTION_KEY` | 32-byte random hex (generate once) | Server only |
| `SENTRY_DSN` | Sentry project DSN | Server + client |
| `CLIENT_ORIGIN` | Vercel frontend URL | Server only (CORS) |

---

## Mobile-First UI

The existing app is desktop-only — the fixed 224px sidebar leaves 166px for content on a 390px phone. All components are rewritten mobile-first as part of the TypeScript migration.

**Navigation:**
- Mobile: bottom tab bar (`BottomNav.tsx`, `fixed bottom-0 md:hidden`), 4 tabs: Plan · Debts · Budget · AI
- Desktop: existing sidebar (`hidden md:flex md:w-56`)

**Safe area insets (required for iPhone):**
```css
.bottom-nav { padding-bottom: calc(0.5rem + env(safe-area-inset-bottom)); }
.top-header { padding-top: env(safe-area-inset-top); }
.page-content { padding-bottom: calc(4rem + env(safe-area-inset-bottom)); }
```
Requires `viewport-fit=cover` in the viewport meta tag and `"display": "standalone"` in manifest.json.

**Input rules:**
- All monetary and percentage inputs: `type="text" inputmode="decimal"` (triggers numeric keyboard; avoids `type="number"` locale/UX issues)
- All inputs: `w-full` or `flex-1 min-w-0` (no fixed widths)
- All tap targets: minimum `min-h-[44px]`
- AI chat input: font-size minimum 16px (prevents iOS auto-zoom on focus)
- AI chat container: `dvh` units (adjusts when virtual keyboard appears)

**Layout rules:**
- All tables wrapped in `overflow-x-auto`
- All charts: `ResponsiveContainer width="100%"` (no hardcoded pixel widths)
- All form rows: `flex-col sm:flex-row`

**UX:**
- Currency: `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })` everywhere — no manual `£` string formatting
- Empty states on every tab with a clear CTA (not a blank screen)
- Hero metric: debt-free date prominent above fold on Plan tab
- Skeleton loading (`animate-pulse`) for plan summary and AI response area

---

## PWA

- `manifest.json`: app name, 192px + 512px icons, theme colour, `"display": "standalone"`
- Service worker: cache shell, update strategy shows "New version available — tap to update" banner
- Offline state: friendly message showing last sync time, not blank screen or error

---

## AI Provider Behaviour

- **Default:** Gemini 2.0 Flash (`gemini-2.0-flash-001`) — free for all users
- **BYOK:** If user has stored Anthropic key → `claude-sonnet-4-6`
- **Fallback:** If Gemini fails (quota/error) → clear user-facing error message. No silent provider switching.
- **Safety:** Gemini configured with `BLOCK_ONLY_HIGH` for all harm categories (financial content triggers false positives at MEDIUM)
- **System prompts:** Server-side only, never in client bundles
- **Model pinning:** Pinned to specific version — never use "latest" aliases
- **Prompt quality gate:** Golden scenario outputs captured from current Claude CLI before migration; Gemini output must match quality before Phase 4 completes

---

## Testing Strategy

**Unit tests (Jest):** Financial engine (TypeScript), Zod schema validation, currency formatter edge cases, pence arithmetic precision, BYOK encryption/decryption utilities, `MockAIProvider` deterministic responses

**E2E tests (Playwright):** Run at three viewport sizes (1280px desktop, 390px iPhone 14, 412px Pixel 7)
- Auth: register, login, JWT expiry → redirect
- Cross-user isolation: User A cannot read/write/delete User B's data (returns 403)
- Core flows: add debt, run plan, use AI (mocked), delete account
- Mobile: bottom nav tappable, debt form with virtual keyboard, table scroll, chart no overflow, AI input visible with keyboard open
- Empty states: new user sees CTA on each tab
- Skeleton loading: mock 500ms slow API, verify skeleton appears then resolves
- Rate limiting: 50 rapid AI requests → 429 (not 500)
- PWA: service worker update banner, offline banner

**CI pipeline:**
```
tsc --noEmit              # type check
npm run lint              # ESLint + TypeScript rules
npm audit --audit-level=high
npm test                  # Jest
npx playwright test       # E2E (desktop + iPhone 14 + Pixel 7)
```

**Migration testing harness:** Seed SQLite → run migration → verify row counts match → verify amortisation totals identical (catches float precision issues)

---

## Release Checklist (Definition of Done for v1)

Before sharing the URL with the first user:

- [ ] All Playwright tests pass (desktop + iPhone 14 + Pixel 7 viewports)
- [ ] `tsc --noEmit` — zero type errors
- [ ] `npm audit --audit-level=high` — zero high/critical vulnerabilities
- [ ] Lighthouse mobile: 90+ Performance, 100 PWA
- [ ] Manual test on physical Android phone: install to home screen, navigate all tabs, add debt, run plan, use AI
- [ ] Manual test on physical iPhone: bottom nav not clipped by home indicator, Dynamic Island area clear
- [ ] Privacy policy live and linked in app footer
- [ ] FCA disclaimer visible on AI responses
- [ ] Account deletion tested end-to-end (all tables cleared)
- [ ] UptimeRobot monitoring active and green
- [ ] `docs/future-work.md` committed to repo

---

## Implementation Phases

| Phase | Summary |
|---|---|
| 0 | Repo setup: shared types, TypeScript config, ESLint, CI pipeline, write `docs/future-work.md` |
| 1 | Database: Neon PostgreSQL (EU), Drizzle schema, user_id on all tables, migration harness, pence audit |
| 2 | Auth: Supabase (EU), Google + email login, JWT middleware, login view |
| 3 | Security: helmet, rate limiting, Zod validation, CORS, BYOK encryption, health route, cross-user tests |
| 4 | AI layer: remove Claude CLI, Gemini + Anthropic providers, SSE streaming, prompt quality gate |
| 5 | PWA + Mobile UI: manifest, service worker, bottom nav, safe area insets, inputmode, empty states, hero metric, skeletons, mobile tests |
| 6 | GDPR: delete account, Sentry scrubbing, privacy policy, AI opt-in consent, data residency verification |
| 7 | Deployment: Vercel config, env vars, Neon migration, smoke test, UptimeRobot, Dependabot |

---

## Future Work

See `docs/future-work.md` for the full prioritised backlog. Key items deferred from v1:

**High (v2):** Onboarding wizard · iOS install guide · AI conversation history retention (90 days) + clear history control · Data export (JSON, GDPR right to access) · Staging environment with Neon branching

**Medium (v2/v3):** BYOK token usage display · In-app feedback button · Lighthouse CI automation · Real device testing (BrowserStack)

**Low (v3+):** PWA push notifications (debt milestones) · Neon storage monitoring alert · Gemini model upgrade procedure · FCA authorisation legal review at scale
