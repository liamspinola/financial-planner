import { BasePage } from './BasePage.js';

export class BudgetPage extends BasePage {
  async goto() {
    await this.navigate('/budget');
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  get budgetTab() { return this.page.getByRole('button', { name: /^Budget$/i }); }
  get reviewTab() { return this.page.getByRole('button', { name: /Monthly Review/i }); }

  // ── Income section ─────────────────────────────────────────────────────────
  // "Add" buttons: income is the first, expenses the second
  get addIncomeButton()   { return this.page.getByRole('button', { name: /^Add$/i }).first(); }
  get addExpenseButton()  { return this.page.getByRole('button', { name: /^Add$/i }).nth(1); }

  // Inline form fields (identified by placeholder / aria-label in the JSX)
  get incomeLabelInput()      { return this.page.getByPlaceholder(/e\.g\. Salary|income source/i).first(); }
  get incomeAmountInput()     { return this.page.getByRole('spinbutton').first(); }
  get incomeFrequencySelect() { return this.page.getByRole('combobox').first(); }

  get expenseLabelInput()     { return this.page.getByPlaceholder(/e\.g\. Rent|expense/i).first(); }
  get expenseAmountInput()    { return this.page.getByRole('spinbutton').nth(1); }
  get expenseCategorySelect() { return this.page.getByRole('combobox').nth(1); }
  get expenseEssentialCheck() { return this.page.getByLabel(/Essential/i); }

  // Save / Cancel for inline forms
  get saveInlineButton()   { return this.page.getByRole('button', { name: /Save/i }).first(); }
  get cancelInlineButton() { return this.page.getByRole('button', { name: /Cancel/i }).first(); }

  // Row edit/delete helpers
  incomeRowEditButton(label) {
    return this.page.getByRole('row').filter({ hasText: label })
      .getByRole('button', { name: /Edit/i });
  }
  incomeRowDeleteButton(label) {
    return this.page.getByRole('row').filter({ hasText: label })
      .getByRole('button', { name: /Delete/i });
  }
  expenseRowEditButton(label) {
    return this.page.getByRole('row').filter({ hasText: label })
      .getByRole('button', { name: /Edit/i });
  }
  expenseRowDeleteButton(label) {
    return this.page.getByRole('row').filter({ hasText: label })
      .getByRole('button', { name: /Delete/i });
  }

  // ── Surplus banner ─────────────────────────────────────────────────────────
  get surplusBanner() {
    return this.page.getByText(/surplus|available|deficit/i).first();
  }

  // ── Emergency fund ─────────────────────────────────────────────────────────
  get efTargetInput()  { return this.page.getByLabel(/Target/i); }
  get efCurrentInput() { return this.page.getByLabel(/Current savings/i); }
  get efSaveButton()   { return this.page.getByRole('button', { name: /Save/i }).last(); }
  get efProgressBar()  { return this.page.locator('[class*="bg-teal"]').first(); }

  // ── Monthly Review tab ─────────────────────────────────────────────────────
  get monthInput() { return this.page.locator('input[type="month"]'); }

  reviewRow(category) {
    return this.page.getByRole('row').filter({ hasText: category });
  }

  editActualInRow(category) {
    return this.reviewRow(category).getByRole('button', { name: /Edit/i });
  }

  actualInputInRow(category) {
    return this.reviewRow(category).getByRole('spinbutton');
  }
}
