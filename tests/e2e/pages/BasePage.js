export class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  async navigate(path) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async clickNav(label) {
    await this.page.getByRole('link', { name: label }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async waitForSpinnerGone(timeout = 10_000) {
    const spinner = this.page.locator('.animate-spin').first();
    const visible = await spinner.isVisible().catch(() => false);
    if (visible) {
      await spinner.waitFor({ state: 'hidden', timeout });
    }
  }
}
