import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { DebtsPage } from '../pages/DebtsPage.js';

test.describe('Debts', () => {
  let debts;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    debts = new DebtsPage(page);
    await debts.goto();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  test('shows empty state message when no debts exist', async ({ page }) => {
    await expect(page.getByText(/No debts added yet/i)).toBeVisible();
  });

  test('Add Debt button is visible in empty state', async () => {
    await expect(debts.addDebtButton).toBeVisible();
  });

  // ── Form open / close ───────────────────────────────────────────────────────

  test('Add Debt button opens the debt form', async ({ page }) => {
    await debts.addDebtButton.click();
    await expect(debts.nameInput).toBeVisible();
  });

  test('Cancel button closes form without creating a debt', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.cancelButton.click();
    await expect(debts.nameInput).not.toBeVisible();
    await expect(page.getByText(/No debts added yet/i)).toBeVisible();
  });

  // ── Create debt ─────────────────────────────────────────────────────────────

  test('creates a debt and shows it in the list', async ({ page }) => {
    await debts.fillAndSave({ name: 'Barclaycard', balance: 1500, apr: 20 });
    await expect(debts.debtCard('Barclaycard')).toBeVisible();
  });

  test('debt card shows balance formatted as GBP', async ({ page }) => {
    await debts.fillAndSave({ name: 'HSBC Loan', balance: 3200, apr: 8 });
    await expect(page.getByText('£3,200.00')).toBeVisible();
  });

  test('debt type is shown on the card', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.nameInput.fill('Overdraft Test');
    await debts.typeSelect.selectOption({ label: 'Overdraft' });
    await debts.trancheLabel(0).fill('Main Balance');
    await debts.trancheBalance(0).fill('500');
    await debts.trancheApr(0).fill('39.9');
    await debts.saveDebtButton.click();
    await expect(page.getByText(/Overdraft/i).first()).toBeVisible();
  });

  // ── APR badge colours ───────────────────────────────────────────────────────

  test('APR badge is red for rates above 20%', async ({ page }) => {
    await debts.fillAndSave({ name: 'High APR Card', balance: 1000, apr: 25 });
    await debts.debtCard('High APR Card').getByRole('button', { name: /segment/i }).click();
    const aprBadge = page.getByText(/25\.0%/).first();
    await expect(aprBadge).toBeVisible();
    // Badge container should use red styling
    const badgeClass = await aprBadge.evaluate(el => el.closest('[class]')?.className ?? '');
    expect(badgeClass).toMatch(/red/);
  });

  test('APR badge is green for rates below 10%', async ({ page }) => {
    await debts.fillAndSave({ name: 'Low APR Loan', balance: 2000, apr: 5 });
    await debts.debtCard('Low APR Loan').getByRole('button', { name: /segment/i }).click();
    const aprBadge = page.getByText(/5\.0%/).first();
    await expect(aprBadge).toBeVisible();
    const badgeClass = await aprBadge.evaluate(el => el.closest('[class]')?.className ?? '');
    expect(badgeClass).toMatch(/green/);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  test('shows error when account name is empty', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.trancheBalance(0).fill('500');
    await debts.trancheApr(0).fill('20');
    await debts.saveDebtButton.click();
    await expect(debts.formError).toBeVisible();
  });

  test('shows error when APR exceeds 200', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.nameInput.fill('Bad APR Debt');
    await debts.trancheLabel(0).fill('Main');
    await debts.trancheBalance(0).fill('1000');
    await debts.trancheApr(0).fill('201');
    await debts.saveDebtButton.click();
    await expect(debts.formError).toBeVisible();
  });

  test('shows error when promo enabled but no end date provided', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.nameInput.fill('Promo Debt');
    await debts.trancheLabel(0).fill('Main');
    await debts.trancheBalance(0).fill('1000');
    await debts.trancheApr(0).fill('0');
    await debts.tranchePromoCheck(0).check();
    // Leave promo date empty
    await debts.saveDebtButton.click();
    await expect(debts.formError).toBeVisible();
  });

  // ── Tranches ────────────────────────────────────────────────────────────────

  test('Add segment button adds a second tranche row', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.addSegmentButton.click();
    await expect(debts.trancheLabel(1)).toBeVisible();
  });

  test('segment expand button reveals tranche details', async ({ page }) => {
    await debts.fillAndSave({ name: 'Multi Tranche', balance: 1000, apr: 15 });
    await debts.debtCard('Multi Tranche').getByRole('button', { name: /segment/i }).click();
    await expect(page.getByText(/Main Balance/)).toBeVisible();
  });

  // ── Edit ────────────────────────────────────────────────────────────────────

  test('edit button pre-populates form with existing values', async ({ page }) => {
    await debts.fillAndSave({ name: 'Edit Me', balance: 2000, apr: 18 });
    await debts.editButton('Edit Me').click();
    await expect(debts.nameInput).toHaveValue('Edit Me');
  });

  test('saving edit updates the card text', async ({ page }) => {
    await debts.fillAndSave({ name: 'Original Name', balance: 1000, apr: 20 });
    await debts.editButton('Original Name').click();
    await debts.nameInput.fill('Updated Name');
    await debts.saveDebtButton.click();
    await expect(debts.debtCard('Updated Name')).toBeVisible();
    await expect(page.getByText('Original Name')).not.toBeVisible();
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  test('delete button shows confirmation dialog', async ({ page }) => {
    await debts.fillAndSave({ name: 'Delete Me', balance: 500, apr: 20 });
    await debts.deleteButton('Delete Me').click();
    await expect(debts.confirmDeleteYes).toBeVisible();
    await expect(debts.confirmDeleteNo).toBeVisible();
  });

  test('clicking No in confirmation keeps the debt', async ({ page }) => {
    await debts.fillAndSave({ name: 'Keep Me', balance: 500, apr: 20 });
    await debts.deleteButton('Keep Me').click();
    await debts.confirmDeleteNo.click();
    await expect(debts.debtCard('Keep Me')).toBeVisible();
  });

  test('clicking Yes in confirmation removes the debt', async ({ page }) => {
    await debts.fillAndSave({ name: 'Remove Me', balance: 500, apr: 20 });
    await debts.deleteButton('Remove Me').click();
    await debts.confirmDeleteYes.click();
    await expect(page.getByText('Remove Me')).not.toBeVisible();
    await expect(page.getByText(/No debts added yet/i)).toBeVisible();
  });

  // ── Multiple debts ──────────────────────────────────────────────────────────

  test('subtitle shows total count and balance for multiple debts', async ({ page }) => {
    await debts.fillAndSave({ name: 'Debt A', balance: 1000, apr: 20 });
    await debts.fillAndSave({ name: 'Debt B', balance: 2000, apr: 15 });
    // Should show "2 accounts" and combined £3,000
    await expect(page.getByText(/2 accounts/i)).toBeVisible();
    await expect(page.getByText('£3,000.00')).toBeVisible();
  });

  // ── Notes ───────────────────────────────────────────────────────────────────

  test('notes are saved and visible after expanding the card', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.nameInput.fill('Notes Debt');
    await debts.trancheLabel(0).fill('Main');
    await debts.trancheBalance(0).fill('1000');
    await debts.trancheApr(0).fill('20');
    await debts.notesTextarea.fill('This is a test note');
    await debts.saveDebtButton.click();
    await debts.debtCard('Notes Debt').getByRole('button', { name: /segment/i }).click();
    await expect(page.getByText('This is a test note')).toBeVisible();
  });

  // ── Percentage min payment ──────────────────────────────────────────────────

  test('% of balance toggle reveals percentage and floor inputs', async ({ page }) => {
    await debts.addDebtButton.click();
    await debts.pctMinToggle.click();
    // Should now show a % input and a floor input
    await expect(page.getByText(/% of balance|Minimum %/i).first()).toBeVisible();
    await expect(page.getByText(/Floor/i).first()).toBeVisible();
  });
});
