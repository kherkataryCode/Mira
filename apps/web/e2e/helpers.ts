import { expect, type Page } from '@playwright/test';

export async function registerAndLogin(page: Page, name = 'Asha', opts: { buddy?: boolean } = {}): Promise<string> {
  // Mira's pop-ups are muted in tests unless a test is about them, so they never cover controls.
  if (!opts.buddy) await page.addInitScript(() => localStorage.setItem('mira.buddy', 'off'));
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  return email;
}

/** True when the page scrolls horizontally (layout overflow). */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}
