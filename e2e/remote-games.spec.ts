import { type Browser, chromium, devices, expect, type Page, test } from '@playwright/test';

/**
 * Long-distance play, per game: the Host's main screen starts a game while a far-away main screen
 * watches; both screens must load it and the far-away one must draw the Host's published stage.
 * Screenshots of both land in test-results/screens for a side by side look.
 */
const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/screens';

/** Games released for long-distance play since stage 2, with the players each needs to start. */
const CASES: { id: string; title: string; players: number; settle?: number; start?: string }[] = [
  { id: 'penyusup', title: 'Penyusup', players: 3 },
  { id: 'siluman', title: 'Kampung Siluman', players: 5 },
  { id: 'juragan', title: 'Juragan Nusantara', players: 2 },
  { id: 'tarik', title: 'Tarik Tambang', players: 2, settle: 9000 },
  { id: 'bom', title: 'Bom Oper', players: 2, settle: 9000, start: 'Mulai' },
  { id: 'es', title: 'Seluncur Es', players: 2, settle: 9000 },
  { id: 'karung', title: 'Balap Karung', players: 2, settle: 6000 },
  { id: 'runtuh', title: 'Lantai Runtuh', players: 2, settle: 7000 },
  { id: 'wilayah', title: 'Rebut Wilayah', players: 2, settle: 7000 },
  { id: 'kerupuk', title: 'Makan Kerupuk', players: 2, settle: 8000 },
  { id: 'rusun', title: 'Rusun', players: 2, settle: 6000 },
  { id: 'langkah', title: 'Langkah Maut', players: 2, settle: 8000, start: 'Mulai' },
];
const NAMES = ['Rina', 'Bayu', 'Sari', 'Dodi', 'Wulan', 'Tono'];

let chrome: Browser;

test.beforeAll(async () => {
  chrome = await chromium.launch();
});

test.afterAll(async () => {
  await chrome?.close();
});

function watch(page: Page, label: string, errors: string[]): Page {
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|WebSocket connection|Failed to load resource/i.test(m.text())) {
      errors.push(`[${label}] console: ${m.text()}`);
    }
  });
  return page;
}

async function open(url: string, label: string, errors: string[], phone: boolean): Promise<Page> {
  const ctx = await chrome.newContext(
    phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 } },
  );
  const page = watch(await ctx.newPage(), label, errors);
  await page.goto(url);
  return page;
}

async function join(url: string, name: string, errors: string[]): Promise<Page> {
  const p = await open(url, name, errors, true);
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

for (const c of CASES) {
  test(`long-distance play: the far-away screen draws ${c.title}`, async () => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    const a = await open(`${BASE}/main`, 'screen-a', errors, false);
    await expect(a.locator('.room-code')).toHaveText(/^\d{3} \d{3}$/);
    const code = (await a.locator('.room-code').textContent())!.replace(/\s/g, '');

    const phones: Page[] = [];
    for (let i = 0; i < c.players; i++) phones.push(await join(`${BASE}/?r=${code}`, NAMES[i]!, errors));
    const host = phones[0]!;
    await a.locator('button', { hasText: /mulai/i }).first().click();
    await a.mouse.move(2, 2);
    await expect(a.locator('.home-scroll')).toBeVisible();

    await a.getByRole('button', { name: /Main bareng teman jauh/ }).click();
    const link = (await a.locator('.remote-link').textContent())!;
    const path = /\/J\/\d{6}-[2-9A-Z]{8}$/.exec(link)![0];
    const b = await open(`${BASE}${path}`, 'screen-b', errors, false);
    await expect(a.locator('.remote-panel').getByText('Layar teman tersambung')).toBeVisible();
    await a.getByRole('button', { name: 'Selesai', exact: true }).click();
    await a.mouse.move(2, 2);

    await host.getByRole('button', { name: /Pilih game/ }).click();
    await host.getByRole('tab', { name: 'Semua' }).click();
    const card = host.locator('.pick-card', { hasText: c.title });
    await expect(card.locator('.pick-far')).toHaveCount(0);
    await card.click();
    await expect(b.locator('.hero-title')).toHaveText(c.title);
    await a.waitForTimeout(400);
    await host.getByRole('button', { name: 'OK', exact: true }).click();
    const intro = a.locator('.tu-overlay');
    await expect(intro.or(a.locator('iframe.game-frame'))).toBeVisible();
    if (await intro.isVisible()) await host.getByRole('button', { name: 'Lewati cara main' }).click();

    const frameSel = `iframe[src*="/games/${c.id}/"]`;
    await expect(a.locator(frameSel)).toBeVisible({ timeout: 20_000 });
    await expect(b.locator(frameSel)).toBeVisible({ timeout: 20_000 });
    await expect(a.locator('.loading-box')).toBeHidden({ timeout: 30_000 });
    await expect(b.locator('.loading-box')).toBeHidden({ timeout: 30_000 });
    // The far-away copy draws a stage of its own (not an empty frame).
    const far = b.frameLocator(frameSel);
    await expect.poll(async () => far.locator('body *').count(), { timeout: 15_000 }).toBeGreaterThan(20);
    // Real-time games get past their countdown, so the shots show the play itself.
    // Games that open on a picker are started from the Host's phone.
    if (c.start) {
      // Landscape games first ask the phone to turn; the test keeps it upright.
      const upright = host.getByRole('button', { name: 'Tetap tegak' });
      await upright.click({ timeout: 5_000 }).catch(() => {});
      await host.getByRole('button', { name: c.start, exact: true }).click();
    }
    await a.waitForTimeout(c.settle ?? 3000);
    await a.screenshot({ path: `${SHOTS}/remote-${c.id}-a.png` });
    await b.screenshot({ path: `${SHOTS}/remote-${c.id}-b.png` });

    for (const p of [a, b, ...phones]) await p.context().close();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
