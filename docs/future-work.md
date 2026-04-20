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
