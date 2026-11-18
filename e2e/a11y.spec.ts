import { expect, test } from './fixtures.js';

test.describe('M10 Accessibility, Keyboard Navigation & i18n RTL', () => {
  test('supports keyboard-only navigation, landmarks, and RTL switching', async ({ page }) => {
    await page.goto('/');

    // Verify landmark & main heading
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Ensure no positive tabindex anti-patterns
    const badTabIndex = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[tabindex]')).filter(
        (el) => Number.parseInt(el.getAttribute('tabindex') ?? '0', 10) > 0,
      ).length;
    });
    expect(badTabIndex).toBe(0);

    // Keyboard Command Palette via Ctrl+K / Escape
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Language switcher -> Arabic sets dir="rtl" and lang="ar"
    const langSelect = page.getByLabel('Language');
    await langSelect.selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    // Switch back to English
    await langSelect.selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('Reader & Editor previews, searches, and edits text inline', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try sample PDF' }).click();
    await page.getByRole('button', { name: 'Open Reader & Editor' }).click();

    await expect(page.getByLabel('Find in page')).toBeVisible();
    await page.getByLabel('Find in page').fill('Sample');
    await expect(page.getByText(/[1-9]\d* match\(es\)/)).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Edit tool')).toBeVisible();
    const firstEditable = page.getByLabel(/Edit text:/).first();
    await expect(firstEditable).toBeVisible();
    await firstEditable.fill('Updated Sample Heading');
    await page.getByRole('button', { name: /Save Edits/ }).click();
    await expect(page.getByLabel('Find in page')).toBeVisible();
  });
});
