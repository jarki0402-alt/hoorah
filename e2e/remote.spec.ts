import { type Browser, chromium, devices, expect, type Page, test } from '@playwright/test';

/**
 * "Main bareng teman jauh" (long-distance play): the Host's main screen hands out a link, a
 * second main screen far away opens it and draws the same pages, phones there join the same room.
 */
const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/screens';

let chrome: Browser;
const errors: string[] = [];

function watch(page: Page, label: string): Page {
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|WebSocket connection|Failed to load resource/i.test(m.text())) {
      errors.push(`[${label}] console: ${m.text()}`);
    }
  });
  return page;
}

async function open(opts: Parameters<Browser['newContext']>[0], url: string, label: string): Promise<Page> {
  const ctx = await chrome.newContext(opts);
  const page = watch(await ctx.newPage(), label);
  await page.goto(url);
  return page;
}

async function join(url: string, name: string, label: string): Promise<Page> {
  const p = await open({ ...devices['Pixel 7'] }, url, label);
  await p.getByPlaceholder('Contoh: Rina').fill(name);
  await p.getByRole('button', { name: 'Masuk' }).click();
  const siap = p.getByRole('button', { name: 'Siap', exact: true });
  await siap.click();
  await expect(siap).toBeHidden();
  await p
    .getByRole('button', { name: 'Nanti saja' })
    .click({ timeout: 3_000 })
    .catch(() => {});
  return p;
}

async function pad(host: Page, key: 'Atas' | 'Bawah' | 'Kiri' | 'Kanan' | 'OK', times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await host.getByRole('button', { name: key, exact: true }).click();
    await host.waitForTimeout(150);
  }
}

test.beforeAll(async () => {
  chrome = await chromium.launch();
});

test.afterAll(async () => {
  await chrome?.close();
});

test('long-distance play: a far-away main screen follows the Host screen, its phones join the room', async () => {
  errors.length = 0;
  const a = await open({ viewport: { width: 1280, height: 720 } }, `${BASE}/main`, 'screen-a');
  await expect(a.locator('.room-code')).toHaveText(/^\d{3} \d{3}$/);
  const shown = (await a.locator('.room-code').textContent())!;
  const code = shown.replace(/\s/g, '');

  const rina = await join(`${BASE}/?r=${code}`, 'Rina', 'host-phone');
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();
  await a.locator('button', { hasText: /mulai/i }).first().click();
  await a.mouse.move(2, 2);
  await expect(a.locator('.home-scroll')).toBeVisible();

  // The home button opens the panel: the link, its QR and the steps; nobody watches yet.
  await a.getByRole('button', { name: /Main bareng teman jauh/ }).click();
  const panel = a.locator('.remote-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Menunggu layar teman…')).toBeVisible();
  const link = (await a.locator('.remote-link').textContent())!;
  const path = /\/J\/\d{6}-[2-9A-Z]{8}$/.exec(link)?.[0];
  expect(path, link).toBeTruthy();
  expect(path!.slice(3, 9)).toBe(code);
  await a.waitForTimeout(700);
  await a.screenshot({ path: `${SHOTS}/remote-01-panel.png` });

  // The friend's laptop opens the link (any letter case): it shows the Host's room and code.
  const b = await open(
    { viewport: { width: 1280, height: 720 } },
    `${BASE}${path!.toLowerCase()}`,
    'screen-b',
  );
  await expect(b.locator('.remote-chip')).toContainText('Host: Rina');
  await expect(b.locator('.far-badge-code')).toHaveText(shown);
  await expect(panel.getByText('Layar teman tersambung')).toBeVisible();
  await expect(b.locator('.home-scroll')).toBeVisible();
  // Games it cannot show yet are marked on both screens while it watches.
  await expect(a.locator('.card', { hasText: 'Bajaj Rush' }).locator('.remote-tag')).toBeVisible();
  await expect(b.locator('.card', { hasText: 'Bajaj Rush' }).locator('.remote-tag')).toBeVisible();
  await expect(a.locator('.card', { hasText: 'Kuis Nusantara' }).locator('.remote-tag')).toHaveCount(0);

  // The Host closes the panel from the phone; the button now says a friend's screen is connected.
  await pad(rina, 'OK');
  await expect(panel).toBeHidden();
  await expect(a.locator('.remote-btn')).toContainText('Teman jauh tersambung');

  // The Host walks the home grid: the far-away screen shows the same card in focus.
  await pad(rina, 'Bawah', 2);
  await pad(rina, 'Kanan', 2);
  const focusedTitle = (await a.locator('.card.focused .card-title').textContent())!.trim();
  await expect(b.locator('.card.focused .card-title')).toHaveText(focusedTitle);
  await expect(b.locator('.home-hero-title')).toHaveText(focusedTitle);
  // Keys and the mouse on the far-away screen change nothing on either screen.
  await b.keyboard.press('ArrowRight');
  await b.keyboard.press('Enter');
  await b.waitForTimeout(400);
  await expect(a.locator('.card.focused .card-title')).toHaveText(focusedTitle);
  await expect(b.locator('.home-scroll')).toBeVisible();

  // The Host's picker marks the games a far-away screen cannot show, then opens Kuis Nusantara.
  await rina.getByRole('button', { name: /Pilih game/ }).click();
  await rina.getByRole('tab', { name: 'Semua' }).click();
  await expect(rina.locator('.pick-card', { hasText: 'Bajaj Rush' }).locator('.pick-far')).toBeVisible();
  await expect(rina.locator('.pick-card', { hasText: 'Kuis Nusantara' }).locator('.pick-far')).toHaveCount(0);
  await rina.locator('.pick-card', { hasText: 'Kuis Nusantara' }).click();
  await expect(a.locator('.side-panel')).toBeVisible();
  await expect(b.locator('.side-panel')).toBeVisible();
  await expect(b.locator('.hero-title')).toHaveText('Kuis Nusantara');
  await expect(b.locator('.remote-detail')).toBeVisible();
  await a.waitForTimeout(700);
  await b.screenshot({ path: `${SHOTS}/remote-02-far-detail.png` });

  // A phone at the friend's place joins with the code on that screen: it shows up on the Host's.
  const sari = await join(`${BASE}/r/${code}`, 'Sari', 'far-phone');
  await expect(sari.getByText('Halo, Sari!')).toBeVisible();
  await expect(a.locator('.side-panel')).toContainText('Sari');
  await expect(b.locator('.side-panel')).toContainText('Sari');

  // Back home, the Host stops long-distance play: the far-away screen says so, the link is dead.
  await rina.getByRole('button', { name: 'Kembali', exact: true }).click();
  await expect(a.locator('.home-scroll')).toBeVisible();
  await expect(b.locator('.home-scroll')).toBeVisible();
  await a.locator('.remote-btn').click();
  await a.getByRole('button', { name: 'Putuskan layar teman' }).click();
  await expect(b.getByText('Sambungan berakhir')).toBeVisible();
  await expect(panel.getByText('Menunggu layar teman…')).toBeVisible();
  const fresh = (await a.locator('.remote-link').textContent())!;
  expect(fresh).not.toBe(link);

  // The new link works: the far-away screen follows again, and a supported game runs on both
  // (the far-away copy starts with the Host's settings and draws the Host's published state).
  const freshPath = /\/J\/\d{6}-[2-9A-Z]{8}$/.exec(fresh)![0];
  await b.goto(`${BASE}${freshPath}`);
  await expect(panel.getByText('Layar teman tersambung')).toBeVisible();
  await expect(b.locator('.home-scroll')).toBeVisible();
  await a.getByRole('button', { name: 'Selesai', exact: true }).click();
  await a.mouse.move(2, 2);
  await expect(panel).toBeHidden();
  await rina.getByRole('button', { name: /Pilih game/ }).click();
  await rina.getByRole('tab', { name: 'Semua' }).click();
  await rina.locator('.pick-card', { hasText: 'Kuis Nusantara' }).click();
  await expect(b.locator('.side-panel')).toBeVisible();
  await a.waitForTimeout(400);
  await pad(rina, 'OK'); // "Main"
  const intro = a.locator('.tu-overlay');
  await expect(intro.or(a.locator('iframe.game-frame'))).toBeVisible();
  if (await intro.isVisible()) {
    await expect(b.locator('.tu-overlay')).toBeVisible();
    await rina.getByRole('button', { name: 'Lewati cara main' }).click();
  }
  await expect(a.locator('iframe[src*="/games/kuis/"]')).toBeVisible();
  await expect(b.locator('iframe[src*="/games/kuis/"]')).toBeVisible({ timeout: 20_000 });
  await expect(a.locator('.loading-box')).toBeHidden({ timeout: 30_000 });
  await expect(b.locator('.loading-box')).toBeHidden({ timeout: 30_000 });
  await a.waitForTimeout(2500);
  await a.screenshot({ path: `${SHOTS}/remote-03-game-a.png` });
  await b.screenshot({ path: `${SHOTS}/remote-03-game-b.png` });

  for (const p of [a, b, rina, sari]) await p.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});
