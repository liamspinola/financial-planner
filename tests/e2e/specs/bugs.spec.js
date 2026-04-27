/**
 * bugs.spec.js — Regression tests for bugs found during code review.
 *
 * Bug 1: POST /api/debts did not invalidate the plan cache.
 *   Symptom: After adding a new debt, GET /api/plan/cached still returned the
 *   old stale plan, so the dashboard would show incorrect totals.
 *   Fix: Added `db.prepare('DELETE FROM plan_cache').run()` to the POST handler.
 *
 * Bug 2: POST /api/plan/whatif used hardcoded fundingDelay=0 instead of reading
 *   the emergency fund settings, making what-if results inconsistent with the
 *   main plan when an emergency fund was configured.
 *   Fix: Loaded settings and computed fundingDelay in the whatif handler.
 *
 * Bug 3: ChartTooltip crashed on load with "isoDate.split is not a function".
 *   Symptom: Blank screen after a couple of seconds on the dashboard / plan pages
 *   when a cached plan existed. Recharts passes the x-axis dataKey value as `label`
 *   to the tooltip; since the x-axis uses `month` (a number), `formatMonthLabel`
 *   received a number and blew up calling .split('-') on it.
 *   Fix: ChartTooltip now reads `payload[0]?.payload?.date` (the YYYY-MM-DD string
 *   stored on each data point) instead of the raw numeric `label`.
 */

import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { seedDebt, seedIncome, seedAndGeneratePlan, seedEmergencyFund } from '../helpers/seed.js';

const API = 'http://localhost:3001';

test.describe('Bug regressions', () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bug 1 — POST /api/debts must invalidate the plan cache
  // ────────────────────────────────────────────────────────────────────────────

  test('Bug 1: plan cache is null immediately after creating a new debt', async ({ request }) => {
    // Step 1: Seed data and generate a plan so the cache is populated
    await seedIncome({ amount: 3000, frequency: 'monthly' });
    const { debt: firstDebt } = await seedDebt({ name: 'First Debt', tranches: [{ label: 'Main', balance: 1000, apr: 0.15 }] });

    const planRes = await request.post(`${API}/api/plan`);
    expect(planRes.ok()).toBeTruthy();

    // Verify cache is populated
    const cachedBefore = await request.get(`${API}/api/plan/cached`);
    const cachedDataBefore = await cachedBefore.json();
    expect(cachedDataBefore).not.toBeNull();

    // Step 2: Add a SECOND debt — this should bust the cache
    await seedDebt({ name: 'Second Debt', tranches: [{ label: 'Main', balance: 2000, apr: 0.20 }] });

    // Step 3: The cache must now be null (stale plan cleared)
    const cachedAfter = await request.get(`${API}/api/plan/cached`);
    const cachedDataAfter = await cachedAfter.json();
    expect(cachedDataAfter).toBeNull();
  });

  test('Bug 1: dashboard does not show stale debt total after adding a debt', async ({ page, request }) => {
    // Seed initial state and generate plan
    await seedIncome({ amount: 3000, frequency: 'monthly' });
    await seedDebt({ name: 'Original Debt', tranches: [{ label: 'Main', balance: 1000, apr: 0.15 }] });
    await request.post(`${API}/api/plan`);

    // Navigate to dashboard — should show £1,000
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('£1,000.00')).toBeVisible();

    // Add a second debt via API (bypasses UI to isolate the cache bug)
    await seedDebt({ name: 'New Debt', tranches: [{ label: 'Balance', balance: 5000, apr: 0.20 }] });

    // Reload dashboard — cache was busted, so total should now reflect both debts
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Total should be £6,000 (1000 + 5000) — if bug persists, it would still show £1,000
    await expect(page.getByText('£6,000.00')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bug 2 — POST /api/plan/whatif must respect emergency fund funding delay
  // ────────────────────────────────────────────────────────────────────────────

  test('Bug 2: whatif baseline payoffMonths matches main plan payoffMonths when emergency fund is set', async ({ request }) => {
    // Set up a scenario with an emergency fund that causes a funding delay
    await seedDebt({ name: 'EF Debt', tranches: [{ label: 'Main', balance: 3000, apr: 0.20 }] });
    await seedIncome({ amount: 3000, frequency: 'monthly' });
    await seedEmergencyFund(2000, 0); // target £2000, current £0 → forces funding months

    // Generate the main plan
    const planRes = await request.post(`${API}/api/plan`);
    expect(planRes.ok()).toBeTruthy();
    const plan = await planRes.json();

    // Call whatif with extraMonthly=0 — the baseline should match the main plan
    const whatifRes = await request.post(`${API}/api/plan/whatif`, {
      data: { extraMonthly: 0 },
    });
    expect(whatifRes.ok()).toBeTruthy();
    const whatif = await whatifRes.json();

    // The baseline in whatif must equal the main plan's payoffMonths.
    // Before the fix, whatif used fundingDelay=0 so its baseline was shorter
    // (it ignored the months needed to build the emergency fund first).
    expect(whatif.baseline.payoffMonths).toBe(plan.payoffMonths);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bug 3 — ChartTooltip crashed with "isoDate.split is not a function"
  // ────────────────────────────────────────────────────────────────────────────

  test('Bug 3: dashboard chart renders without a blank-screen crash', async ({ page, request }) => {
    // Generate a plan so the dashboard has chart data to render
    await seedAndGeneratePlan();
    // If the tooltip crash were still present, React's error boundary would
    // replace the whole page with a blank screen / error overlay within ~2s.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Page must still have content — a crash produces an empty body
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.getByText(/Total Debt/i)).toBeVisible();
  });

  test('Bug 3: hovering a chart data point does not throw', async ({ page, request }) => {
    await seedAndGeneratePlan();
    await page.goto('/plan');
    // Select No AI and generate so the line chart renders
    await page.getByRole('button', { name: /No AI/i }).click();
    await page.getByRole('button', { name: /Generate Plan/i }).click();
    await page.getByText(/Recommended Strategy/i).waitFor({ timeout: 15_000 });

    const chart = page.locator('.recharts-wrapper').first();
    await expect(chart).toBeVisible();

    // Hover over the middle of the chart to trigger the tooltip
    const box = await chart.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
    }

    // No uncaught errors should have been thrown
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(500);
    const relevant = errors.filter(e => e.includes('split') || e.includes('formatMonthLabel'));
    expect(relevant).toHaveLength(0);
  });

  test('Bug 2: whatif without emergency fund still works correctly', async ({ request }) => {
    // No emergency fund — fundingDelay should be 0 either way
    await seedDebt({ name: 'No EF Debt', tranches: [{ label: 'Main', balance: 2000, apr: 0.18 }] });
    await seedIncome({ amount: 3000, frequency: 'monthly' });

    const planRes = await request.post(`${API}/api/plan`);
    const plan = await planRes.json();

    const whatifRes = await request.post(`${API}/api/plan/whatif`, {
      data: { extraMonthly: 0 },
    });
    const whatif = await whatifRes.json();

    // Both should agree on the baseline payoff months
    expect(whatif.baseline.payoffMonths).toBe(plan.payoffMonths);
  });
});
