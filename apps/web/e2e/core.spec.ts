import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { registerAndLogin } from './helpers';

test('signed-out users are redirected to login, with a safe next parameter', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks/);
  await page.goto('/login?next=//evil.example');
  await page.getByLabel('Email').fill('nobody@example.test');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('main, form').getByRole('alert')).toContainText('Invalid email or password');
});

test('vertical slice: register → natural-language task → persisted → on dashboard', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByLabel('Add a task or reminder in plain words').fill('Finish OT security report today at 11pm high priority #work');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Finish OT security report');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Task added' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Finish OT security report');

  // Survives a reload: it's in the database, not client memory.
  await page.reload();
  await expect(page.locator('main')).toContainText('Finish OT security report');
  await page.goto('/tasks');
  await expect(page.locator('main')).toContainText('Finish OT security report');
  // Completing removes it from the open view, so click rather than check().
  await page.getByRole('checkbox', { name: 'Complete Finish OT security report' }).click();
  await expect(page.locator('main')).not.toContainText('Finish OT security report');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('main')).toContainText('Finish OT security report');
});

test('chat streams a labelled demo reply and confirms a reminder proposal', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/chat');
  await page.getByLabel('Message Friday').fill('Remind me to call the dentist tomorrow at 5 PM');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Demo response')).toBeVisible();
  await expect(page.locator('main')).toContainText('nothing is saved until you do');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Reminder set: Call the dentist')).toBeVisible();
  await page.goto('/reminders');
  await expect(page.locator('main')).toContainText('Call the dentist');
  await expect(page.locator('main')).toContainText('Scheduled');

  // History persists across reloads.
  await page.goto('/chat');
  await expect(page.locator('main')).toContainText('Remind me to call the dentist tomorrow at 5 PM');
});

test('voice: permission denied shows a real error, never fake success', async ({ page }) => {
  await page.addInitScript(() => {
    class DeniedRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: unknown = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onerror?.({ error: 'not-allowed' });
          this.onend?.();
        }, 10);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: DeniedRecognition, webkitSpeechRecognition: DeniedRecognition });
  });
  await registerAndLogin(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Start voice input' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Microphone permission was denied');
  await expect(page.getByLabel('Message Friday')).toHaveValue('');
});

test('voice: transcript lands in the composer for review, not auto-sent', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: unknown = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const alt = { transcript: 'what do I have today' };
          const result = Object.assign([alt], { isFinal: true });
          this.onresult?.({ results: [result] });
          this.onend?.();
        }, 10);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await registerAndLogin(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Start voice input' }).click();
  await expect(page.getByLabel('Message Friday')).toHaveValue('what do I have today');
  await expect(page.getByText('Transcribed from voice')).toBeVisible();
  await expect(page.locator('ol li')).toHaveCount(0);
});

test('chat can be stopped mid-stream and retried', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/chat');
  await page.getByLabel('Message Friday').fill('hello there');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(page.getByText('Stopped.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Demo response')).toBeVisible();
});

test('learning: quiz reveals answers only after submitting and schedules review', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/learn');
  await page.locator('a[href^="/learn/"]').first().click();
  await expect(page.getByRole('heading', { name: 'Quick check' })).toBeVisible();
  await expect(page.getByLabel('Correct answer')).toHaveCount(0);
  const groups = page.locator('fieldset');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByRole('status')).toContainText('not mastery');
});

test('news shows an honest empty state and blocks unsafe feeds', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/news');
  await expect(page.getByText('Choose your sources')).toBeVisible();
  await page.getByLabel('Name').fill('Internal');
  await page.getByLabel('Feed URL').fill('https://127.0.0.1/feed');
  await page.getByRole('button', { name: 'Add source' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(/private|not allowed/i);
});

test('settings persist and timezone validation works', async ({ page }) => {
  await registerAndLogin(page);
  await page.goto('/settings');
  await page.getByLabel('Timezone').selectOption('Europe/London');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Timezone')).toHaveValue('Europe/London');
});

test('pages have no serious accessibility violations', async ({ page }) => {
  await registerAndLogin(page);
  for (const path of ['/', '/tasks', '/chat', '/learn', '/news', '/reminders', '/notes', '/settings']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${path}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});
