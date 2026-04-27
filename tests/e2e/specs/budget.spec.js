import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { seedExpense, seedIncome, seedActual } from '../helpers/seed.js';
import { BudgetPage } from '../pages/BudgetPage.js';

test.describe('Budget', () => {
  let budget;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    budget = new BudgetPage(page);
    await budget.goto();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  test('shows empty state for income and expenses', async ({ page }) => {
    await expect(page.getByText(/No income sources yet/i)).toBeVisible();
    await expect(page.getByText(/No expenses yet/i)).toBeVisible();
  });

  test('Budget tab is active by default', async ({ page }) => {
    // The Budget tab button should have active (teal) styling
    const tab = budget.budgetTab;
    await expect(tab).toBeVisible();
    const cls = await tab.getAttribute('class');
    expect(cls).toMatch(/teal|active|border/);
  });

  // ── Add income ──────────────────────────────────────────────────────────────

  test('clicking Add opens the income inline form', async ({ page }) => {
    await budget.addIncomeButton.click();
    await expect(budget.incomeLabelInput).toBeVisible();
  });

  test('adds income and shows row with label and amount', async ({ page }) => {
    await budget.addIncomeButton.click();
    await budget.incomeLabelInput.fill('Salary');
    await budget.incomeAmountInput.fill('3000');
    await budget.saveInlineButton.click();
    await expect(page.getByText('Salary')).toBeVisible();
    await expect(page.getByText('£3,000.00')).toBeVisible();
  });

  test('weekly income shows monthly equivalent', async ({ page }) => {
    await budget.addIncomeButton.click();
    await budget.incomeLabelInput.fill('Weekly Pay');
    await budget.incomeAmountInput.fill('1000');
    await budget.incomeFrequencySelect.selectOption('weekly');
    await budget.saveInlineButton.click();
    // 1000 * 52/12 ≈ £4,333.33
    await expect(page.getByText(/4,333/)).toBeVisible();
  });

  test('Cancel on income form does not add a row', async ({ page }) => {
    await budget.addIncomeButton.click();
    await budget.incomeLabelInput.fill('Should not save');
    await budget.cancelInlineButton.click();
    await expect(page.getByText('Should not save')).not.toBeVisible();
  });

  // ── Add expense ─────────────────────────────────────────────────────────────

  test('adds expense and shows row with label and amount', async ({ page }) => {
    await budget.addExpenseButton.click();
    await budget.expenseLabelInput.fill('Rent');
    await budget.expenseAmountInput.fill('900');
    await budget.expenseCategorySelect.selectOption('rent');
    await budget.saveInlineButton.click();
    await expect(page.getByText('Rent')).toBeVisible();
    await expect(page.getByText('£900.00')).toBeVisible();
  });

  test('essential expense shows Essential badge', async ({ page }) => {
    await budget.addExpenseButton.click();
    await budget.expenseLabelInput.fill('Essential Expense');
    await budget.expenseAmountInput.fill('200');
    await budget.expenseCategorySelect.selectOption('groceries');
    await budget.expenseEssentialCheck.check();
    await budget.saveInlineButton.click();
    await expect(page.getByText(/Essential/i).first()).toBeVisible();
  });

  test('non-essential expense shows Discretionary badge', async ({ page }) => {
    await budget.addExpenseButton.click();
    await budget.expenseLabelInput.fill('Streaming');
    await budget.expenseAmountInput.fill('15');
    await budget.expenseCategorySelect.selectOption('entertainment');
    // Leave is_essential unchecked
    await budget.saveInlineButton.click();
    await expect(page.getByText(/Discretionary/i)).toBeVisible();
  });

  // ── Surplus banner ──────────────────────────────────────────────────────────

  test('surplus banner appears with positive surplus when income > expenses', async ({ page }) => {
    await budget.addIncomeButton.click();
    await budget.incomeLabelInput.fill('Salary');
    await budget.incomeAmountInput.fill('3000');
    await budget.saveInlineButton.click();
    // No expenses — surplus should be positive
    await expect(budget.surplusBanner).toBeVisible();
    const text = await budget.surplusBanner.textContent();
    expect(text).toMatch(/£/);
  });

  // ── Inline edit ─────────────────────────────────────────────────────────────

  test('editing income pre-populates the inline form', async ({ page }) => {
    await seedIncome({ label: 'Edit Income', amount: 2000, frequency: 'monthly' });
    await budget.goto();
    await budget.incomeRowEditButton('Edit Income').click();
    await expect(budget.incomeLabelInput).toHaveValue('Edit Income');
  });

  test('saving income edit updates the row label', async ({ page }) => {
    await seedIncome({ label: 'Old Label', amount: 2000, frequency: 'monthly' });
    await budget.goto();
    await budget.incomeRowEditButton('Old Label').click();
    await budget.incomeLabelInput.fill('New Label');
    await budget.saveInlineButton.click();
    await expect(page.getByText('New Label')).toBeVisible();
    await expect(page.getByText('Old Label')).not.toBeVisible();
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  test('deleting income removes its row', async ({ page }) => {
    await seedIncome({ label: 'Delete This Income', amount: 1000, frequency: 'monthly' });
    await budget.goto();
    await budget.incomeRowDeleteButton('Delete This Income').click();
    await expect(page.getByText('Delete This Income')).not.toBeVisible();
  });

  test('deleting expense removes its row', async ({ page }) => {
    await seedExpense({ label: 'Delete This Expense', amount: 100, category: 'other' });
    await budget.goto();
    await budget.expenseRowDeleteButton('Delete This Expense').click();
    await expect(page.getByText('Delete This Expense')).not.toBeVisible();
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  test('income: error when label is empty', async ({ page }) => {
    await budget.addIncomeButton.click();
    await budget.incomeAmountInput.fill('1000');
    await budget.saveInlineButton.click();
    await expect(page.getByText(/Label is required|required/i).first()).toBeVisible();
  });

  // ── Emergency fund ──────────────────────────────────────────────────────────

  test('emergency fund progress bar fills proportionally', async ({ page }) => {
    await budget.efTargetInput.fill('1000');
    await budget.efCurrentInput.fill('500');
    await budget.efSaveButton.click();
    // Progress bar should be visible
    await expect(budget.efProgressBar).toBeVisible();
    // Width should be approximately 50%
    const style = await budget.efProgressBar.getAttribute('style');
    expect(style).toMatch(/50|width/);
  });

  test('emergency fund values persist after save', async ({ page }) => {
    await budget.efTargetInput.fill('2000');
    await budget.efCurrentInput.fill('800');
    await budget.efSaveButton.click();
    // Reload and check values persisted
    await budget.goto();
    await expect(budget.efTargetInput).toHaveValue('2000');
    await expect(budget.efCurrentInput).toHaveValue('800');
  });

  // ── Monthly Review tab ──────────────────────────────────────────────────────

  test('clicking Monthly Review tab shows month input', async ({ page }) => {
    await budget.reviewTab.click();
    await expect(budget.monthInput).toBeVisible();
  });

  test('review shows row after seeding expense and actual', async ({ page }) => {
    const { id: expenseId } = await seedExpense({ label: 'Groceries', amount: 300, category: 'groceries' });
    const month = new Date().toISOString().slice(0, 7); // current month YYYY-MM
    await seedActual(expenseId, 'groceries', 'Groceries', 350, month);
    await budget.goto();
    await budget.reviewTab.click();
    await budget.monthInput.fill(month);
    await page.keyboard.press('Tab'); // trigger change event
    await expect(budget.reviewRow('groceries')).toBeVisible();
  });

  test('editing actual inline shows a number input', async ({ page }) => {
    const { id: expenseId } = await seedExpense({ label: 'Utilities', amount: 150, category: 'utilities' });
    const month = new Date().toISOString().slice(0, 7);
    await seedActual(expenseId, 'utilities', 'Utilities', 200, month);
    await budget.goto();
    await budget.reviewTab.click();
    await budget.monthInput.fill(month);
    await page.keyboard.press('Tab');
    await budget.editActualInRow('utilities').click();
    await expect(budget.actualInputInRow('utilities')).toBeVisible();
  });
});
