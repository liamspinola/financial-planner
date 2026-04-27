import { BasePage } from './BasePage.js';

export class DashboardPage extends BasePage {
  async goto() {
    await this.navigate('/');
  }

  // Stat cards — find the card container that holds the given label text
  statCardValue(label) {
    // StatCard renders label + value as siblings; grab the numeric/value sibling
    return this.page.locator('.card, [class*="rounded"]')
      .filter({ hasText: label })
      .first();
  }

  // Promo alert banners (amber styling)
  get promoAlerts() {
    return this.page.locator('[class*="amber"]').filter({ hasText: /promo/i });
  }

  get chart() {
    return this.page.locator('.recharts-responsive-container').first();
  }

  get noPlanMessage() {
    return this.page.getByText(/No plan generated yet/i);
  }

  get loadingSpinner() {
    return this.page.locator('.animate-spin');
  }

  // Sidebar nav links
  navLink(name) {
    return this.page.getByRole('link', { name });
  }
}
