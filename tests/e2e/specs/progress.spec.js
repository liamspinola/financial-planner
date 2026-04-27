import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { seedAndGeneratePlan, seedSnapshot } from '../helpers/seed.js';
import { ProgressPage } from '../pages/ProgressPage.js';

test.describe('Progress', () => {
  let progress;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    progress = new ProgressPage(page);
  });

  // ── No plan state ───────────────────────────────────────────────────────────

  test('shows "generate a plan first" message when no plan exists', async ({ page }) => {
    await progress.goto();
    await expect(progress.noPlanMessage).toBeVisible();
  });

  // ── With a generated plan ───────────────────────────────────────────────────

  test('shows a balance input labelled with the debt name', async ({ page }) => {
    const { debt } = await seedAndGeneratePlan();
    await progress.goto();
    await expect(progress.balanceInput(debt.name)).toBeVisible();
  });

  test('Save snapshot button is enabled when plan exists', async ({ page }) => {
    await seedAndGeneratePlan();
    await progress.goto();
    await expect(progress.saveButton).toBeEnabled();
  });

  // ── Saving a snapshot ───────────────────────────────────────────────────────

  test('saving a snapshot shows a vs-plan comparison message', async ({ page }) => {
    const { debt } = await seedAndGeneratePlan();
    await progress.goto();
    await progress.balanceInput(debt.name).fill('1800');
    await progress.saveButton.click();
    await expect(progress.vsMessage).toBeVisible({ timeout: 10_000 });
  });

  test('saving a snapshot renders the comparison chart', async ({ page }) => {
    const { debt } = await seedAndGeneratePlan();
    await progress.goto();
    await progress.balanceInput(debt.name).fill('1800');
    await progress.saveButton.click();
    await expect(progress.chart).toBeVisible({ timeout: 10_000 });
  });

  test('snapshot appears in the history section after saving', async ({ page }) => {
    const { debt } = await seedAndGeneratePlan();
    const month = new Date().toISOString().slice(0, 7);
    await progress.goto();
    await progress.balanceInput(debt.name).fill('1900');
    await progress.saveButton.click();
    await expect(progress.snapshotHistorySection).toBeVisible({ timeout: 10_000 });
    // The current month should appear in the history
    await expect(page.getByText(month)).toBeVisible();
  });

  test('optional note is saved and visible in history', async ({ page }) => {
    const { debt } = await seedAndGeneratePlan();
    await progress.goto();
    await progress.balanceInput(debt.name).fill('1700');
    await progress.noteInput.fill('Made extra payment this month');
    await progress.saveButton.click();
    await expect(page.getByText('Made extra payment this month')).toBeVisible({ timeout: 10_000 });
  });

  // ── Deleting a snapshot ─────────────────────────────────────────────────────

  test('deleting a snapshot removes it from history', async ({ page }) => {
    const { debt } = await seedAndGeneratePlan();
    const month = new Date().toISOString().slice(0, 7);
    // Seed a snapshot via API
    await seedSnapshot(month, { [debt.id]: 1500 }, 'test snapshot');
    await progress.goto();
    await expect(page.getByText(month)).toBeVisible();
    await progress.deleteSnapshotInRow(month).click();
    await expect(page.getByText(month)).not.toBeVisible();
  });

  // ── Ahead / behind plan ─────────────────────────────────────────────────────

  test('"ahead of plan" message when balance is lower than projection', async ({ page }) => {
    const { debt, plan } = await seedAndGeneratePlan();
    // Seed a balance well below what the plan projects — this means we paid off more
    const month = new Date().toISOString().slice(0, 7);
    const projectedBalance = plan.chartData?.[0]?.[`debt_${debt.id}`] ?? 2000;
    const aheadBalance = Math.max(0, projectedBalance - 500);
    await progress.goto();
    await progress.balanceInput(debt.name).fill(String(aheadBalance));
    await progress.saveButton.click();
    // Should show "ahead" or positive comparison
    await expect(page.getByText(/ahead of plan/i)).toBeVisible({ timeout: 10_000 });
  });

  test('"behind plan" message when balance is higher than projection', async ({ page }) => {
    const { debt, plan } = await seedAndGeneratePlan();
    const month = new Date().toISOString().slice(0, 7);
    const projectedBalance = plan.chartData?.[0]?.[`debt_${debt.id}`] ?? 2000;
    const behindBalance = projectedBalance + 500; // higher balance = behind plan
    await progress.goto();
    await progress.balanceInput(debt.name).fill(String(behindBalance));
    await progress.saveButton.click();
    await expect(page.getByText(/behind plan/i)).toBeVisible({ timeout: 10_000 });
  });
});
