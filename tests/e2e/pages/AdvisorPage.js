import { BasePage } from './BasePage.js';

export class AdvisorPage extends BasePage {
  async goto() {
    await this.navigate('/advisor');
  }

  // ── Session list ───────────────────────────────────────────────────────────
  get newSessionButton() { return this.page.getByRole('button', { name: /New session/i }); }

  get emptyStateMessage() {
    return this.page.getByText(/No session selected|Start a new session/i).first();
  }

  /** Returns the locator for a session row in the sidebar by its visible title. */
  sessionItem(title) {
    // Session rows render in a fixed-width left panel (w-56)
    return this.page.locator('[class*="w-56"], [class*="sidebar"], aside')
      .getByText(title).first();
  }

  sessionRow(title) {
    return this.page.locator('button, div[role="button"]').filter({ hasText: title }).first();
  }

  async deleteSession(title) {
    const row = this.sessionRow(title);
    await row.hover();
    await row.getByRole('button', { name: /Delete/i }).first().click();
    // Confirm
    await this.page.getByRole('button', { name: /Confirm|Yes/i }).first().click();
  }

  async cancelDeleteSession(title) {
    const row = this.sessionRow(title);
    await row.hover();
    await row.getByRole('button', { name: /Delete/i }).first().click();
    await this.page.getByRole('button', { name: /Cancel|No/i }).first().click();
  }

  async renameSession(currentTitle, newTitle) {
    await this.sessionRow(currentTitle).dblclick();
    const input = this.page.locator('input[type="text"]').last();
    await input.selectText();
    await input.fill(newTitle);
    await input.press('Enter');
  }

  async renameSessionAndCancel(currentTitle, newTitle) {
    await this.sessionRow(currentTitle).dblclick();
    const input = this.page.locator('input[type="text"]').last();
    await input.fill(newTitle);
    await input.press('Escape');
  }

  // ── Chat panel ─────────────────────────────────────────────────────────────
  get chatTextarea() {
    return this.page.getByPlaceholder(/Ask anything|Message/i);
  }

  get sendButton() {
    return this.page.getByTitle(/Send/i);
  }

  get contextToggle() {
    return this.page.getByText(/Use my financial data/i).first();
  }

  get thinkingIndicator() {
    return this.page.getByText(/thinking|Thinking/i).first();
  }

  userBubble(text) {
    // User messages are in blue-tinted bubbles aligned right
    return this.page.locator('[class*="blue"]').filter({ hasText: text }).first();
  }

  assistantBubble(text) {
    return this.page.locator('[class*="slate"], [class*="assistant"]').filter({ hasText: text }).first();
  }

  suggestionPill(text) {
    return this.page.getByRole('button', { name: text });
  }

  async sendMessage(text) {
    await this.chatTextarea.fill(text);
    await this.sendButton.click();
  }

  async sendMessageWithCtrlEnter(text) {
    await this.chatTextarea.fill(text);
    await this.chatTextarea.press('Control+Enter');
  }

  // ── Route intercept helper ─────────────────────────────────────────────────
  /**
   * Registers a page.route() intercept that returns a deterministic mock
   * response for all advisor message POST requests.
   * Call this in beforeEach for advisor tests to avoid hitting Claude CLI.
   */
  static async mockMessages(page, overrides = {}) {
    let seq = 1;
    await page.route('**/api/advisor/conversations/*/messages', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON();
      const userSeq = seq;
      const assistantSeq = seq + 1;
      seq += 2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userMessage: {
            id: 9000 + userSeq,
            conversation_id: 1,
            role: 'user',
            content: body.content,
            sequence: userSeq,
            created_at: new Date().toISOString(),
          },
          assistantMessage: {
            id: 9000 + assistantSeq,
            conversation_id: 1,
            role: 'assistant',
            content: overrides.response ?? 'This is a mocked advisor response for E2E testing.',
            sequence: assistantSeq,
            created_at: new Date().toISOString(),
          },
          newTitle: overrides.newTitle ?? 'Mocked Chat Title',
        }),
      });
    });
  }
}
