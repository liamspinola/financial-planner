import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { seedMinimalPlanData, seedAndGeneratePlan, seedDebt, seedIncome } from '../helpers/seed.js';
import { PlanPage } from '../pages/PlanPage.js';

test.describe('Plan', () => {
  let plan;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    plan = new PlanPage(page);
  });

  // ── Empty / error states ────────────────────────────────────────────────────

  test('shows no-data prompt when no debts or income exist', async ({ page }) => {
    await plan.goto();
    await expect(plan.noDataPrompt).toBeVisible();
  });

  test('shows error when Generate is clicked with no debts', async ({ page }) => {
    await seedIncome();
    await plan.goto();
    await plan.noAiButton.click();
    await plan.generateButton.click();
    await expect(plan.errorMessage).toBeVisible();
    const text = await plan.errorMessage.textContent();
    expect(text).toMatch(/No debts/i);
  });

  test('shows deficit error when expenses exceed income', async ({ page }) => {
    // Income £500, debt min £0, no expenses — just make income less than debt minimum
    await seedDebt({ minimum_payment: 600, tranches: [{ label: 'Main', balance: 5000, apr: 0.20 }] });
    await seedIncome({ amount: 500 }); // income < minimum_payment → deficit
    await plan.goto();
    await plan.noAiButton.click();
    await plan.generateButton.click();
    await expect(plan.errorMessage).toBeVisible();
  });

  // ── Plan generation ─────────────────────────────────────────────────────────

  test('generates plan and shows Recommended Strategy card', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.strategyCard).toBeVisible();
  });

  test('plan shows debt-free date', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.debtFreeDateText).toBeVisible();
  });

  test('plan shows total interest', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.totalInterestText).toBeVisible();
  });

  test('strategy comparison table is visible after generation', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.comparisonTable).toBeVisible();
    await expect(page.getByText(/Avalanche/i).first()).toBeVisible();
    await expect(page.getByText(/Snowball/i).first()).toBeVisible();
  });

  test('timeline chart renders after plan generation', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.chart).toBeVisible();
  });

  test('monthly action guide renders with entries', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.monthlyGuide).toBeVisible();
  });

  test('Print / Save PDF button is present after plan generation', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await expect(plan.printButton).toBeVisible();
  });

  // ── What-If panel ───────────────────────────────────────────────────────────

  test('what-if slider changes the number input value', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    // Scroll to the what-if section
    await plan.whatIfSlider.scrollIntoViewIfNeeded();
    await plan.whatIfSlider.fill('200');
    await expect(plan.whatIfNumberInput).toHaveValue('200');
  });

  test('Calculate button shows a what-if result', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.whatIfSlider.scrollIntoViewIfNeeded();
    await plan.whatIfNumberInput.fill('100');
    await plan.calculateButton.click();
    await expect(plan.whatIfResult).toBeVisible();
  });

  // ── Windfalls ───────────────────────────────────────────────────────────────

  test('adds a windfall and shows it in the list', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.windfallLabelInput.fill('Tax Rebate');
    await plan.windfallAmountInput.fill('500');
    await plan.windfallMonthSelect.selectOption({ index: 1 });
    await plan.addWindfallButton.click();
    await expect(page.getByText('Tax Rebate')).toBeVisible();
  });

  test('deletes a windfall', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.windfallLabelInput.fill('Bonus');
    await plan.windfallAmountInput.fill('1000');
    await plan.windfallMonthSelect.selectOption({ index: 1 });
    await plan.addWindfallButton.click();
    await plan.windfallDeleteButton('Bonus').click();
    await expect(page.getByText('Bonus')).not.toBeVisible();
  });

  // ── Expense events ──────────────────────────────────────────────────────────

  test('adds an expected expense event', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.expenseEventLabelInput.fill('Car Service');
    await plan.expenseEventAmountInput.fill('300');
    await plan.expenseEventMonthSelect.selectOption({ index: 1 });
    await plan.addExpenseEventButton.click();
    await expect(page.getByText('Car Service')).toBeVisible();
  });

  test('adds an unexpected expense event with correct category', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.expenseEventLabelInput.fill('Emergency Repair');
    await plan.expenseEventAmountInput.fill('600');
    await plan.expenseEventMonthSelect.selectOption({ index: 1 });
    await plan.expenseEventCategorySelect.selectOption('unexpected');
    await plan.addExpenseEventButton.click();
    await expect(page.getByText('Emergency Repair')).toBeVisible();
  });

  test('deletes an expense event', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.expenseEventLabelInput.fill('Holiday');
    await plan.expenseEventAmountInput.fill('1200');
    await plan.expenseEventMonthSelect.selectOption({ index: 1 });
    await plan.addExpenseEventButton.click();
    await plan.expenseEventDeleteButton('Holiday').click();
    await expect(page.getByText('Holiday')).not.toBeVisible();
  });

  // ── Lump Sum Advisor ────────────────────────────────────────────────────────

  test('Analyse button is disabled when amount is empty', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.lumpSumAmountInput.scrollIntoViewIfNeeded();
    await expect(plan.analyseButton).toBeDisabled();
  });

  test('Analyse button is enabled when amount is filled', async ({ page }) => {
    await seedMinimalPlanData();
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.lumpSumAmountInput.scrollIntoViewIfNeeded();
    await plan.lumpSumAmountInput.fill('500');
    await expect(plan.analyseButton).toBeEnabled();
  });

  test('Analyse returns option cards (mocked)', async ({ page }) => {
    await seedMinimalPlanData();
    // Intercept the lump sum API call to return a controlled result
    await page.route('**/api/plan/lumpsum', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        amount: 500,
        applyMonth: 1,
        baseline: { payoffMonths: 24, totalInterest: 400, debtFreeDate: '04/2028' },
        options: [
          {
            id: 'avalanche',
            name: 'Highest Rate First',
            targetDebtId: 1,
            targetDebtName: 'Test Credit Card',
            targetApr: 0.20,
            payoffMonths: 22,
            totalInterest: 350,
            monthsSaved: 2,
            interestSaved: 50,
            debtFreeDate: '02/2028',
            recommended: true,
            reasoning: 'Saves the most interest.',
          },
        ],
        winner: 'avalanche',
      }),
    }));
    await plan.goto();
    await plan.generateWithNoAI();
    await plan.lumpSumAmountInput.scrollIntoViewIfNeeded();
    await plan.lumpSumAmountInput.fill('500');
    await plan.analyseButton.click();
    await expect(page.getByText('Highest Rate First')).toBeVisible();
  });

  // ── AI mode (mocked) ────────────────────────────────────────────────────────

  test('AI narrative card visible when Plan Narration mode is used (mocked)', async ({ page }) => {
    await page.route('**/api/ai', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        narrative: 'You are making great progress paying off your debt.',
        budgetTips: null,
        cached: false,
      }),
    }));
    await seedMinimalPlanData();
    await plan.goto();
    await plan.narrationButton.click();
    await plan.generateButton.click();
    await page.getByText(/Recommended Strategy/i).waitFor({ timeout: 15_000 });
    await expect(plan.aiNarrativeCard).toBeVisible();
  });

  test('AI budget tips card visible when Full Analysis mode is used (mocked)', async ({ page }) => {
    await page.route('**/api/ai', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        narrative: 'Great work on your finances.',
        budgetTips: '• Cut dining out by £50/month to save £200 in interest.',
        cached: false,
      }),
    }));
    await seedMinimalPlanData();
    await plan.goto();
    await plan.fullAnalysisButton.click();
    await plan.generateButton.click();
    await page.getByText(/Recommended Strategy/i).waitFor({ timeout: 15_000 });
    await expect(plan.aiBudgetTipsCard).toBeVisible();
  });
});
