import { BasePage } from './BasePage.js';

export class ProgressPage extends BasePage {
  async goto() {
    await this.navigate('/progress');
  }

  get noPlanMessage() {
    return this.page.getByText(/Generate a payoff plan first/i);
  }

  // Balance input for a specific debt (labelled with the debt name)
  balanceInput(debtName) {
    return this.page.getByLabel(debtName);
  }

  get noteInput() {
    return this.page.getByPlaceholder(/Optional note|note/i);
  }

  get saveButton() {
    return this.page.getByRole('button', { name: /Save snapshot|Update snapshot/i });
  }

  get vsMessage() {
    // The comparison message — "ahead of plan", "behind plan", "on track"
    return this.page.getByText(/ahead of plan|behind plan|on track/i).first();
  }

  get chart() {
    return this.page.locator('.recharts-wrapper').first();
  }

  get snapshotHistorySection() {
    return this.page.getByText(/Snapshot History/i).first();
  }

  snapshotHistoryRow(month) {
    // month in YYYY-MM format — the row displays the formatted date
    return this.page.locator('tr, li, [class*="row"]').filter({ hasText: month }).first();
  }

  deleteSnapshotInRow(month) {
    return this.snapshotHistoryRow(month).getByRole('button', { name: /Delete/i });
  }
}
