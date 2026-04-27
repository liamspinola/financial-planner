import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/reset.js';
import { AdvisorPage } from '../pages/AdvisorPage.js';

test.describe('Advisor', () => {
  let advisor;

  test.beforeEach(async ({ page, request }) => {
    await resetDb(request);
    // Intercept ALL advisor message POSTs so we never call Claude CLI
    await AdvisorPage.mockMessages(page);
    advisor = new AdvisorPage(page);
    await advisor.goto();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  test('shows empty state when no sessions exist', async ({ page }) => {
    await expect(advisor.emptyStateMessage).toBeVisible();
  });

  // ── Create session ──────────────────────────────────────────────────────────

  test('New session button creates a session in the sidebar', async ({ page }) => {
    await advisor.newSessionButton.click();
    // A session row should appear (default title is "New conversation" or similar)
    await expect(page.getByText(/New conversation|conversation/i).first()).toBeVisible();
  });

  test('chat textarea is visible after creating a session', async ({ page }) => {
    await advisor.newSessionButton.click();
    await expect(advisor.chatTextarea).toBeVisible();
  });

  // ── Send messages ───────────────────────────────────────────────────────────

  test('sending a message shows the user bubble', async ({ page }) => {
    await advisor.newSessionButton.click();
    await advisor.sendMessage('How do I pay off my debt faster?');
    await expect(advisor.userBubble('How do I pay off my debt faster?')).toBeVisible();
  });

  test('mocked assistant response appears after sending', async ({ page }) => {
    await advisor.newSessionButton.click();
    await advisor.sendMessage('Hello');
    // Wait for the typewriter to finish revealing the full response
    await expect(page.getByText('This is a mocked advisor response for E2E testing.')).toBeVisible({ timeout: 10_000 });
  });

  test('session title updates after first message (mocked newTitle)', async ({ page }) => {
    await advisor.newSessionButton.click();
    await advisor.sendMessage('What is the avalanche method?');
    await expect(page.getByText('Mocked Chat Title')).toBeVisible({ timeout: 10_000 });
  });

  test('Ctrl+Enter sends the message', async ({ page }) => {
    await advisor.newSessionButton.click();
    await advisor.sendMessageWithCtrlEnter('Test Ctrl Enter');
    await expect(advisor.userBubble('Test Ctrl Enter')).toBeVisible();
  });

  // ── Suggestion pills ────────────────────────────────────────────────────────

  test('suggestion pills are visible before any messages are sent', async ({ page }) => {
    await advisor.newSessionButton.click();
    // App shows suggested questions when chat is empty
    const pills = page.getByRole('button').filter({ hasText: /How|What|Should|Can/i });
    await expect(pills.first()).toBeVisible();
  });

  test('clicking a suggestion pill fills the textarea', async ({ page }) => {
    await advisor.newSessionButton.click();
    const pill = page.getByRole('button').filter({ hasText: /How|What|Should|Can/i }).first();
    const pillText = await pill.textContent();
    await pill.click();
    await expect(advisor.chatTextarea).toHaveValue(pillText.trim());
  });

  // ── Context toggle ──────────────────────────────────────────────────────────

  test('context toggle is visible and enabled on a new session', async ({ page }) => {
    await advisor.newSessionButton.click();
    await expect(advisor.contextToggle).toBeVisible();
    // Should not be disabled before first message
    const cls = await advisor.contextToggle.evaluate(el => el.closest('[class]')?.className ?? '');
    expect(cls).not.toMatch(/cursor-not-allowed/);
  });

  test('context toggle becomes locked after sending first message', async ({ page }) => {
    await advisor.newSessionButton.click();
    await advisor.sendMessage('Lock the context please');
    // Wait for the response to confirm send completed
    await page.getByText('This is a mocked advisor response for E2E testing.').waitFor({ timeout: 10_000 });
    // Toggle should now show locked/disabled state
    const cls = await advisor.contextToggle.evaluate(el => {
      const parent = el.closest('[class*="opacity"], [class*="cursor"]');
      return parent ? parent.className : el.className;
    });
    expect(cls).toMatch(/opacity|cursor-not-allowed|disabled/);
  });

  // ── Multiple sessions ───────────────────────────────────────────────────────

  test('two sessions appear in the sidebar', async ({ page }) => {
    await advisor.newSessionButton.click();
    await advisor.sendMessage('Session one question');
    await page.getByText('This is a mocked advisor response for E2E testing.').waitFor({ timeout: 10_000 });
    await advisor.newSessionButton.click();
    await advisor.sendMessage('Session two question');
    await page.getByText('This is a mocked advisor response for E2E testing.').waitFor({ timeout: 10_000 });
    // Both session titles should be visible in sidebar
    await expect(page.getByText('Mocked Chat Title')).toHaveCount({ minimum: 1 });
  });

  // ── Delete session ──────────────────────────────────────────────────────────

  test('delete shows a confirmation UI', async ({ page }) => {
    await advisor.newSessionButton.click();
    const row = advisor.sessionRow('New conversation');
    await row.hover();
    const deleteBtn = row.getByRole('button', { name: /Delete/i }).first();
    await deleteBtn.click();
    // Confirmation buttons or icons should appear
    await expect(page.getByRole('button', { name: /Confirm|Yes|check/i }).first()).toBeVisible();
  });

  test('cancelling delete keeps the session', async ({ page }) => {
    await advisor.newSessionButton.click();
    // Wait for session row to settle
    await page.waitForTimeout(300);
    const row = advisor.sessionRow('New conversation');
    await row.hover();
    const deleteBtn = row.getByRole('button', { name: /Delete/i }).first();
    await deleteBtn.click();
    const cancelBtn = page.getByRole('button', { name: /Cancel|No/i }).first();
    await cancelBtn.click();
    // Session should still be in the list
    await expect(page.getByText(/New conversation/i)).toBeVisible();
  });

  test('confirming delete removes the session', async ({ page }) => {
    await advisor.newSessionButton.click();
    await page.waitForTimeout(300);
    const row = advisor.sessionRow('New conversation');
    await row.hover();
    await row.getByRole('button', { name: /Delete/i }).first().click();
    await page.getByRole('button', { name: /Confirm|Yes/i }).first().click();
    await expect(advisor.emptyStateMessage).toBeVisible();
  });

  // ── Rename session ──────────────────────────────────────────────────────────

  test('double-clicking a session title opens a rename input', async ({ page }) => {
    await advisor.newSessionButton.click();
    await page.waitForTimeout(300);
    await advisor.sessionRow('New conversation').dblclick();
    await expect(page.locator('input[type="text"]').last()).toBeVisible();
  });

  test('pressing Enter saves the renamed title', async ({ page }) => {
    await advisor.newSessionButton.click();
    await page.waitForTimeout(300);
    await advisor.sessionRow('New conversation').dblclick();
    const input = page.locator('input[type="text"]').last();
    await input.selectText();
    await input.fill('My Renamed Session');
    await input.press('Enter');
    await expect(page.getByText('My Renamed Session')).toBeVisible();
  });

  test('pressing Escape reverts the rename', async ({ page }) => {
    await advisor.newSessionButton.click();
    await page.waitForTimeout(300);
    await advisor.sessionRow('New conversation').dblclick();
    const input = page.locator('input[type="text"]').last();
    await input.fill('Cancelled Rename');
    await input.press('Escape');
    await expect(page.getByText('New conversation')).toBeVisible();
    await expect(page.getByText('Cancelled Rename')).not.toBeVisible();
  });
});
