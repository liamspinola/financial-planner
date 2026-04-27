import { BasePage } from './BasePage.js';

export class DebtsPage extends BasePage {
  async goto() {
    await this.navigate('/debts');
  }

  // ── Form controls ──────────────────────────────────────────────────────────
  get addDebtButton()  { return this.page.getByRole('button', { name: /Add Debt/i }); }
  get saveDebtButton() { return this.page.getByRole('button', { name: /Save Debt/i }); }
  get cancelButton()   { return this.page.getByRole('button', { name: /Cancel/i }); }

  get nameInput()      { return this.page.locator('#debt-name'); }
  get lenderInput()    { return this.page.locator('#debt-lender'); }
  get typeSelect()     { return this.page.locator('#debt-type'); }
  get notesTextarea()  { return this.page.locator('textarea').first(); }

  // Min payment type toggle — "% of balance" checkbox/button
  get pctMinToggle()   { return this.page.getByRole('button', { name: /% of balance/i }); }

  // ── Tranche fields (indexed) ───────────────────────────────────────────────
  trancheLabel(i)    { return this.page.locator(`#tranche-label-${i}`); }
  trancheBalance(i)  { return this.page.locator(`#tranche-balance-${i}`); }
  trancheApr(i)      { return this.page.locator(`#tranche-apr-${i}`); }
  tranchePromoCheck(i){ return this.page.locator(`#tranche-promo-${i}`); }
  tranchePromoDate(i) { return this.page.locator(`#tranche-promo-date-${i}`); }
  tranchePostApr(i)   { return this.page.locator(`#tranche-post-apr-${i}`); }

  get addSegmentButton() { return this.page.getByRole('button', { name: /Add segment/i }); }

  removeSegmentButton(i) {
    return this.page.getByRole('button', { name: new RegExp(`Remove segment ${i + 1}`, 'i') });
  }

  // ── Card interactions ──────────────────────────────────────────────────────
  debtCard(name) {
    return this.page.locator('.card').filter({ hasText: name });
  }

  editButton(name) {
    return this.debtCard(name).getByRole('button', { name: /Edit debt/i });
  }

  deleteButton(name) {
    return this.debtCard(name).getByRole('button', { name: /Delete debt/i });
  }

  expandButton(name) {
    // The expand/collapse chevron button on a DebtCard
    return this.debtCard(name).getByRole('button', { name: /segment/i }).first();
  }

  get confirmDeleteYes() { return this.page.getByRole('button', { name: /^Yes$/i }); }
  get confirmDeleteNo()  { return this.page.getByRole('button', { name: /^No$/i }); }

  // ── Inline error ───────────────────────────────────────────────────────────
  get formError() {
    return this.page.locator('[class*="red"]').filter({ hasText: /required|must be|invalid/i }).first();
  }

  // ── Convenience: fill and save a basic debt ────────────────────────────────
  async fillAndSave({ name, lender, type, balance = 1000, apr = 20, notes }) {
    await this.addDebtButton.click();
    await this.nameInput.fill(name);
    if (lender) await this.lenderInput.fill(lender);
    if (type)   await this.typeSelect.selectOption({ label: type });
    await this.trancheLabel(0).fill('Main Balance');
    await this.trancheBalance(0).fill(String(balance));
    await this.trancheApr(0).fill(String(apr));
    if (notes)  await this.notesTextarea.fill(notes);
    await this.saveDebtButton.click();
    await this.waitForSpinnerGone();
  }
}
