import { type Browser, chromium, devices, expect, type Page, test } from '@playwright/test';

const BASE = 'http://localhost:5173';

let chrome: Browser;
const errors: string[] = [];

test.beforeAll(async () => {
  chrome = await chromium.launch();
});

test.afterAll(async () => {
  await chrome.close();
});

async function phone(code: string, name: string): Promise<Page> {
  const ctx = await chrome.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto(`${BASE}/?r=${code}`);
  await page.getByPlaceholder('Contoh: Rina').fill(name);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page
    .getByRole('button', { name: 'Nanti saja' })
    .click({ timeout: 3_000 })
    .catch(() => {});
  // Right after joining the avatar maker shows; Siap goes on to the lobby.
  await page.getByRole('button', { name: 'Siap', exact: true }).click();
  return page;
}

test('Host hand-over: the Host asks, the other phone declines, then accepts', async () => {
  errors.length = 0;
  const tv = await (await chrome.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  tv.on('pageerror', (e) => errors.push(`[tv] ${e.message}`));
  await tv.goto(`${BASE}/main`);
  await expect(tv.locator('.room-code')).toHaveText(/^\d{3} \d{3}$/);
  const code = (await tv.locator('.room-code').textContent())!.replace(/\s/g, '');

  const rina = await phone(code, 'Rina');
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();
  const budi = await phone(code, 'Budi');
  await expect(budi.getByText('Halo, Budi!')).toBeVisible();
  // Player toasts show from the home page on (the join page lists the players itself).
  await tv.locator('button', { hasText: /mulai/i }).first().click();
  await expect(tv.locator('.home-scroll')).toBeVisible();

  const ask = async () => {
    await rina.getByRole('button', { name: 'Ganti Host' }).click();
    const row = rina.locator('.host-swap-row', { hasText: 'Budi' });
    await row.getByRole('button', { name: 'Jadikan Host' }).click();
    await expect(rina.getByText('Menunggu jawaban Budi…')).toBeVisible();
    await expect(budi.getByText('Rina ingin menjadikanmu Host.', { exact: false })).toBeVisible();
  };

  // Declined: Rina stays Host and is told so.
  await ask();
  await budi.getByRole('button', { name: 'Tolak' }).click();
  await expect(rina.locator('.host-notice')).toHaveText('Budi menolak');
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();

  // Accepted: Budi becomes Host, everyone hears it.
  await ask();
  await budi.getByRole('button', { name: 'Terima' }).click();
  await expect(budi.getByText('HOST', { exact: true })).toBeVisible();
  await expect(budi.locator('.host-notice')).toHaveText('Kamu sekarang Host');
  await expect(rina.locator('.host-notice')).toHaveText('Budi sekarang Host');
  await expect(tv.locator('.toast', { hasText: 'Budi sekarang Host' })).toBeVisible();
  await expect(rina.getByText('Halo, Rina!')).toBeVisible();

  await tv.context().close();
  await rina.context().close();
  await budi.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});
