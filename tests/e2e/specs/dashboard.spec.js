import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { seedDebt, seedDebtWithPromo, seedIncome, seedAndGeneratePlan } from '../helpers/seed.js';
import { DashboardPage } from '../pages/DashboardPage.js';

test.describe('Dashboard', () => {
  let dashboard;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    dashboard = new DashboardPage(page);
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  test('shows "no plan" message when no data exists', async ({ page }) => {
    await dashboard.goto();
    await expect(dashboard.noPlanMessage).toBeVisible();
  });

  test('stat cards are visible in empty state', async ({ page }) => {
    await dashboard.goto();
    await expect(page.getByText('Total Debt')).toBeVisible();
    await expect(page.getByText('Monthly Income')).toBeVisible();
  });

  test('no promo alerts in empty state', async ({ page }) => {
    await dashboard.goto();
    await expect(dashboard.promoAlerts).toHaveCount(0);
  });

  // ── With debt data ──────────────────────────────────────────────────────────

  test('Total Debt card reflects seeded debt balance', async ({ page }) => {
    await seedDebt({ tranches: [{ label: 'Main', balance: 2500, apr: 0.20 }] });
    await dashboard.goto();
    await expect(page.getByText('£2,500.00')).toBeVisible();
  });

  test('Monthly Income card reflects seeded income', async ({ page }) => {
    await seedIncome({ amount: 3500 });
    await dashboard.goto();
    await expect(page.getByText('£3,500.00')).toBeVisible();
  });

  // ── With a generated plan ───────────────────────────────────────────────────

  test('chart renders after plan is generated', async ({ page }) => {
    await seedAndGeneratePlan();
    await dashboard.goto();
    await expect(dashboard.noPlanMessage).not.toBeVisible();
    await expect(dashboard.chart).toBeVisible();
    // Chart should contain SVG path elements (actual lines)
    await expect(dashboard.chart.locator('path').first()).toBeVisible();
  });

  test('"Months to Debt-Free" shows a number after plan generation', async ({ page }) => {
    await seedAndGeneratePlan();
    await dashboard.goto();
    await expect(page.getByText(/Months to Debt-Free/i)).toBeVisible();
    // The value should be a positive number
    const card = page.getByText(/Months to Debt-Free/i).locator('..');
    const text = await card.textContent();
    expect(text).toMatch(/\d+/);
  });

  // ── Promo alerts ────────────────────────────────────────────────────────────

  test('promo alert is shown when expiry is within 60 days', async ({ page }) => {
    await seedDebtWithPromo(30); // expires in 30 days
    await dashboard.goto();
    await expect(dashboard.promoAlerts.first()).toBeVisible();
  });

  test('no promo alert when expiry is beyond 60 days', async ({ page }) => {
    await seedDebtWithPromo(90); // expires in 90 days — outside threshold
    await dashboard.goto();
    await expect(dashboard.promoAlerts).toHaveCount(0);
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test('sidebar navigation links go to the correct pages', async ({ page }) => {
    await dashboard.goto();

    const routes = [
      { name: 'Debts',    url: '/debts' },
      { name: 'Budget',   url: '/budget' },
      { name: 'Plan',     url: '/plan' },
      { name: 'Advisor',  url: '/advisor' },
      { name: 'Progress', url: '/progress' },
    ];

    for (const { name, url } of routes) {
      await dashboard.clickNav(name);
      await expect(page).toHaveURL(new RegExp(url));
      await dashboard.clickNav('Dashboard');
    }
  });
});
