import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHorizontalOverflow, registerAndLogin } from './helpers';

const VIEWPORTS = [
  { name: 'iphone-se-portrait', width: 320, height: 568, mobile: true },
  { name: 'iphone-portrait', width: 390, height: 844, mobile: true },
  { name: 'iphone-landscape', width: 844, height: 390, mobile: true },
  { name: 'android-pixel', width: 412, height: 915, mobile: true },
  { name: 'tablet-portrait', width: 768, height: 1024, mobile: true },
  { name: 'laptop', width: 1280, height: 800, mobile: false },
  { name: 'desktop', width: 1920, height: 1080, mobile: false },
];
const PAGES = ['/', '/chat', '/tasks', '/learn', '/news', '/reminders', '/settings'];
const OUT = fileURLToPath(new URL('../../../design/screenshots/', import.meta.url));

test('responsive matrix: no horizontal overflow, key controls reachable', async ({ browser }) => {
  test.setTimeout(240_000);
  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  await registerAndLogin(setupPage, 'Sandeep');
  await setupPage.getByLabel('Add a task or reminder in plain words').fill('Call Mom today at 11:30pm');
  await setupPage.getByRole('button', { name: 'Preview' }).click();
  await setupPage.getByRole('button', { name: 'Confirm' }).click();
  await expect(setupPage.getByText('Task added')).toBeVisible();
  const state = await setup.storageState();
  await setup.close();

  const failures: string[] = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ storageState: state, viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      if (await hasHorizontalOverflow(page)) failures.push(`${vp.name} ${p}: horizontal overflow`);
      if (p === '/chat') {
        const composer = page.getByLabel('Message Friday');
        await expect(composer).toBeInViewport();
        await expect(page.getByRole('button', { name: /voice input|Voice input/ })).toBeInViewport();
      }
      const name = `${vp.name}${p === '/' ? '-home' : p.replace(/\//g, '-')}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    }
    await ctx.close();
  }
  expect(failures).toEqual([]);
});
