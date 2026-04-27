import { BasePage } from './BasePage.js';

export class PlanPage extends BasePage {
  async goto() {
    await this.navigate('/plan');
  }

  // ── AI mode buttons ────────────────────────────────────────────────────────
  get noAiButton()          { return this.page.getByRole('button', { name: /No AI/i }); }
  get narrationButton()     { return this.page.getByRole('button', { name: /Plan Narration/i }); }
  get fullAnalysisButton()  { return this.page.getByRole('button', { name: /Full Analysis/i }); }

  // ── Primary actions ────────────────────────────────────────────────────────
  get generateButton() { return this.page.getByRole('button', { name: /Generate Plan/i }); }
  get printButton()    { return this.page.getByRole('button', { name: /Print/i }); }

  // ── Empty / error states ───────────────────────────────────────────────────
  get noDataPrompt()  { return this.page.getByText(/Add your debts and budget/i); }
  get errorMessage()  { return this.page.locator('[class*="red"]').filter({ hasText: /error|deficit|No debts/i }).first(); }

  // ── Plan results ───────────────────────────────────────────────────────────
  get strategyCard()     { return this.page.getByText(/Recommended Strategy/i).first(); }
  get debtFreeDateText() { return this.page.getByText(/Debt-Free Date/i).first(); }
  get totalInterestText(){ return this.page.getByText(/Total Interest/i).first(); }
  get comparisonTable()  { return this.page.getByText(/Strategy Comparison/i).first(); }
  get chart()            { return this.page.locator('.recharts-wrapper').first(); }
  get monthlyGuide()     { return this.page.getByText(/Monthly Action Guide/i).first(); }

  // ── AI content (used with route intercept) ─────────────────────────────────
  get aiNarrativeCard()  { return this.page.getByText(/Financial Analysis/i).first(); }
  get aiBudgetTipsCard() { return this.page.getByText(/Budget Recommendations/i).first(); }

  // ── What-If panel ──────────────────────────────────────────────────────────
  get whatIfSlider()       { return this.page.locator('input[type="range"]').first(); }
  get whatIfNumberInput()  {
    // The "extra" number input next to the slider
    return this.page.locator('input[type="number"]').first();
  }
  get calculateButton()    { return this.page.getByRole('button', { name: /Calculate/i }); }
  get whatIfResult()       { return this.page.getByText(/month(s)? sooner|no change/i).first(); }

  // ── Windfalls ──────────────────────────────────────────────────────────────
  get windfallLabelInput()  { return this.page.getByPlaceholder(/Label.*rebate|Tax rebate/i); }
  get windfallAmountInput() { return this.page.locator('input[placeholder="£ amount"]').first(); }
  get windfallMonthSelect() { return this.page.locator('select').filter({ hasText: /Select month/i }).first(); }
  get addWindfallButton()   { return this.page.getByRole('button', { name: /Add windfall/i }); }

  windfall(label) {
    return this.page.locator('li, [class*="windfall"], tr').filter({ hasText: label }).first();
  }
  windfallEditButton(label)   { return this.windfall(label).getByRole('button', { name: /Edit/i }); }
  windfallDeleteButton(label) { return this.windfall(label).getByRole('button', { name: /Delete/i }); }

  // ── Expense Events ─────────────────────────────────────────────────────────
  get expenseEventLabelInput()  { return this.page.getByPlaceholder(/Label.*holiday|Car repair/i); }
  get expenseEventAmountInput() { return this.page.locator('input[placeholder="£ amount"]').nth(1); }
  get expenseEventMonthSelect() { return this.page.locator('select').filter({ hasText: /Select month/i }).nth(1); }
  get addExpenseEventButton()   { return this.page.getByRole('button', { name: /Add expense/i }); }
  get expenseEventCategorySelect() { return this.page.locator('select').filter({ hasText: /expected/i }).first(); }

  expenseEvent(label) {
    return this.page.locator('li, [class*="expense"], tr').filter({ hasText: label }).first();
  }
  expenseEventDeleteButton(label) { return this.expenseEvent(label).getByRole('button', { name: /Delete/i }); }

  // ── Lump Sum Advisor ───────────────────────────────────────────────────────
  get lumpSumAmountInput() { return this.page.getByPlaceholder(/e\.g\. 1300|lump sum/i); }
  get analyseButton()      { return this.page.getByRole('button', { name: /Analys/i }); }

  // ── Convenience: generate plan with No AI mode ─────────────────────────────
  async generateWithNoAI() {
    await this.noAiButton.click();
    await this.generateButton.click();
    // Wait for results card — plan calc is fast but React state is async
    await this.page.getByText(/Recommended Strategy/i).waitFor({ timeout: 15_000 });
  }
}
