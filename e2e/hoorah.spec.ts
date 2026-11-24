import { mkdirSync } from 'node:fs';
import {
  type Browser,
  type BrowserContextOptions,
  chromium,
  devices,
  expect,
  type Page,
  test,
  webkit,
} from '@playwright/test';
import { GAMES, type GameId } from '../apps/web/src/shared/games';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });

let chrome: Browser;
let safari: Browser;
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

async function open(
  browser: Browser,
  opts: BrowserContextOptions,
  url: string,
  label: string,
): Promise<Page> {
  const ctx = await browser.newContext(opts);
  const page = watch(await ctx.newPage(), label);
  await page.goto(url);
  return page;
}

/**
 * A game played for the first time on this screen opens with its "Cara main": the phones show
 * "Paham!" and the Host skips it from the phone. A game seen before starts at once.
 */
async function passTutorial(tv: Page, host: Page): Promise<void> {
  const overlay = tv.locator('.tu-overlay');
  await expect(overlay.or(tv.locator('iframe.game-frame'))).toBeVisible({ timeout: 15_000 });
  if (!(await overlay.isVisible())) return;
  await expect(host.getByRole('button', { name: 'Paham!' })).toBeVisible();
  await host.getByRole('button', { name: 'Lewati cara main' }).click();
  await expect(overlay).toBeHidden();
}

/**
 * The e2e server starts with "Mode uji coba: semua terbuka" (OPEN_ALL=1) so every game can be
 * played; the free-tier checks switch it off through the admin API and back on afterwards.
 */
async function setOpenAll(on: boolean): Promise<void> {
  const owner = await chrome.newContext({ baseURL: BASE });
  const H = { 'x-hoorah-admin': '1' };
  const login = await owner.request.post('/api/admin/login', {
    headers: H,
    data: { username: 'admin', password: 'e2e-admin-pass' },
  });
  expect(login.ok()).toBe(true);
  const put = await owner.request.put('/api/admin/config', { headers: H, data: { openAll: on } });
  expect(put.ok()).toBe(true);
  await owner.close();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The Host phone drives the TV with the d-pad. */
async function pad(
  host: Page,
  key: 'Atas' | 'Bawah' | 'Kiri' | 'Kanan' | 'OK' | 'Kembali' | 'Menu',
  times = 1,
) {
  for (let i = 0; i < times; i++) {
    await host.getByRole('button', { name: key, exact: true }).click();
    await host.waitForTimeout(120);
  }
}

/** Hold an emulated phone upright or sideways. */
async function turn(page: Page, to: 'portrait' | 'landscape'): Promise<void> {
  const v = page.viewportSize();
  if (!v) return;
  const long = Math.max(v.width, v.height);
  const short = Math.min(v.width, v.height);
  await page.setViewportSize(
    to === 'landscape' ? { width: long, height: short } : { width: short, height: long },
  );
  await page.waitForTimeout(300);
}

test.beforeAll(async () => {
  // Bajaj Rush and Jago Masak are WebGL; without the GPU the software renderer drops below the
  // games' minimum frame rate and their clocks slow down (by design, so weak screens don't skip).
  chrome = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  safari = await webkit.launch();
});

test.afterAll(async () => {
  await chrome?.close();
  await safari?.close();
});

/**
 * Right after "Masuk" the phone shows the avatar maker; this picks a character (optional) and
 * taps "Siap" to go on to the lobby.
 */
async function ready(p: Page, who?: string): Promise<void> {
  const siap = p.getByRole('button', { name: 'Siap', exact: true });
  await siap.waitFor();
  if (who) await p.getByRole('button', { name: who, exact: true }).click();
  await siap.click();
  await expect(siap).toBeHidden();
}

test('full flow on TV + iPhone (WebKit) + Android (Chromium)', async () => {
  test.setTimeout(600_000); // every game in turn: longer than the default as the catalog grows
  // ---- TV (desktop/TV browser at 1080p) ----
  const tv = await open(chrome, { viewport: { width: 1920, height: 1080 } }, `${BASE}/main`, 'tv'); // desktop browser: auto-detected as the big screen
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');

  // ---- iPhone joins by QR link ----
  const rina = await open(safari, { ...devices['iPhone 15'] }, `${BASE}/?r=${code}`, 'iphone');
  await rina.getByPlaceholder('Contoh: Rina').fill('Rina');
  await rina.getByRole('button', { name: 'Masuk' }).click();
  // In the room the avatar maker comes first: a character, another outfit colour, then Siap.
  // The main screen marks the seat while the phone is choosing.
  await expect(rina.getByRole('button', { name: 'Siap', exact: true })).toBeVisible();
  await expect(tv.locator('.player-row', { hasText: 'Rina' }).getByText(/memilih tokoh/i)).toBeVisible();
  await rina.getByRole('button', { name: 'Mia', exact: true }).click();
  await rina.getByRole('tab', { name: 'Baju' }).click();
  await rina.getByRole('button', { name: 'Warna 3', exact: true }).click();
  await shot(rina, '01-iphone-pick');
  await ready(rina);
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();
  await expect(tv.locator('.player-row', { hasText: 'Rina' }).getByText(/memilih tokoh/i)).toBeHidden();

  // ---- Android joins by typing the code ----
  const budi = await open(chrome, { ...devices['Pixel 7'] }, `${BASE}/main`, 'android');
  await budi
    .getByLabel('Kode room')
    .first()
    .fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await budi.getByRole('button', { name: 'Lanjut' }).click();
  await budi.getByPlaceholder('Contoh: Rina').fill('Budi');
  await budi.getByRole('button', { name: 'Masuk' }).click();
  await ready(budi, 'Bram');
  await expect(budi.getByText('Halo, Budi!')).toBeVisible();

  await expect(tv.locator('.player-row', { hasText: 'Rina' })).toBeVisible();
  await expect(tv.locator('.player-row', { hasText: 'Budi' })).toBeVisible();
  await shot(tv, '01-tv-join');
  await shot(rina, '01-iphone-hostpad');
  await shot(budi, '01-android-lobby');

  // ---- A third phone is turned away (free tier: 2 players) ----
  await setOpenAll(false);
  const third = await open(chrome, { ...devices['Galaxy S9+'] }, `${BASE}/?r=${code}`, 'third');
  await third.getByPlaceholder('Contoh: Rina').fill('Sari');
  await third.getByRole('button', { name: 'Masuk' }).click();
  await expect(third.getByText('Room penuh')).toBeVisible();
  await third.context().close();
  await setOpenAll(true);

  // ---- Host goes to the home screen ----
  await tv.locator('button', { hasText: /mulai|beranda/i }).click(); // a real click unlocks TV audio
  await expect(tv.getByText('Pas untuk kalian')).toBeVisible();
  await tv.waitForTimeout(600);
  await shot(tv, '02-tv-home');

  // ---- Reconnect: Android reloads mid-session and lands back in the room ----
  await budi.reload();
  await expect(budi.getByText('Halo, Budi!')).toBeVisible();
  // Android lost fullscreen with the reload, so it offers it again; the test carries on without.
  await budi.getByRole('button', { name: 'Nanti saja' }).click({ timeout: 5_000 });

  /** The phone that shows `selector` first (turn-based games give it to one player only). */
  const firstWith = async (selector: string, timeout = 45_000): Promise<Page> => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      for (const p of [rina, budi]) {
        if (await p.locator(selector).first().isVisible()) return p;
      }
      await rina.waitForTimeout(250);
    }
    throw new Error(`no phone showed ${selector}`);
  };
  const turnButton = '.button-view .round-btn:not([disabled])';
  const games: { id: string; play: () => Promise<void> }[] = [
    {
      id: 'kuis',
      play: async () => {
        for (const p of [rina, budi]) {
          await expect(p.locator('.answer').first()).toBeVisible({ timeout: 20_000 });
        }
        await shot(tv, '04-kuis-tv-question');
        await shot(rina, '04-kuis-iphone-choice');
        await rina.locator('.answer').first().click();
        await budi.locator('.answer').nth(1).click();
        await expect(
          tv
            .frameLocator('iframe.game-frame')
            .getByText(/Tahukah kamu/i)
            .first(),
        ).toBeVisible({ timeout: 20_000 });
        await tv.waitForTimeout(800);
        await shot(tv, '05-kuis-tv-reveal');
        await shot(budi, '05-kuis-android-result');
      },
    },
    {
      id: 'rusun',
      play: async () => {
        const dropper = async () => {
          for (let i = 0; i < 40; i++) {
            for (const p of [rina, budi]) {
              if (await p.getByRole('button', { name: /JATUHKAN/ }).isVisible()) return p;
            }
            await rina.waitForTimeout(250);
          }
          throw new Error('no phone got the JATUHKAN button');
        };
        const first = await dropper();
        await shot(tv, '06-rusun-tv-turn');
        await shot(first, '06-rusun-phone-turn');
        await first.getByRole('button', { name: /JATUHKAN/ }).click();
        await tv.waitForTimeout(1500);
        const second = await dropper();
        await second.getByRole('button', { name: /JATUHKAN/ }).click();
        await tv.waitForTimeout(1200);
        await shot(tv, '07-rusun-tv-after-drops');
      },
    },
    {
      id: 'tarik',
      play: async () => {
        for (const p of [rina, budi]) {
          await expect(p.locator('.tap-pad')).toBeVisible({ timeout: 25_000 });
        }
        for (let i = 0; i < 25; i++) {
          await rina.locator('.tap-pad').click();
          if (i % 2) await budi.locator('.tap-pad').click();
        }
        await tv.waitForTimeout(500);
        await shot(tv, '08-tarik-tv-pulling');
        await shot(rina, '08-tarik-iphone-tap');
      },
    },
    {
      id: 'bajaj',
      play: async () => {
        // Pre-race menu: only the Host picks the mode and the circuit; Budi's phone waits, locked.
        const next = (p: Page) => p.locator('.menu-actions .big-btn:not(.secondary)').click();
        await expect(rina.locator('.menu-opt', { hasText: 'Grand Prix' })).toBeVisible({ timeout: 30_000 });
        await expect(budi.locator('.ctrl.menu.is-locked')).toBeVisible();
        await rina.locator('.menu-opt', { hasText: 'Grand Prix' }).click();
        await tv.waitForTimeout(600);
        await shot(tv, '09-bajaj-tv-mode');
        await shot(rina, '09-bajaj-iphone-mode');
        await shot(budi, '09-bajaj-android-waiting');
        await next(rina); // Lanjut
        await rina.locator('.menu-opt', { hasText: 'Pesisir Pantai' }).click();
        await tv.waitForTimeout(1200);
        await shot(tv, '09-bajaj-tv-circuit');
        await next(rina); // Lanjut

        // Everyone picks a colour (taken colours are disabled), then taps Siap.
        for (const [i, p] of [rina, budi].entries()) {
          const swatches = p.locator('.menu-options.is-swatch .menu-opt:not([disabled])');
          await expect(swatches.first()).toBeVisible({ timeout: 10_000 });
          await swatches.nth(2 + i * 2).click();
          await p.waitForTimeout(400);
        }
        await tv.waitForTimeout(800);
        await shot(tv, '09-bajaj-tv-garage');
        await shot(budi, '09-bajaj-android-colour');
        for (const p of [rina, budi]) await next(p); // Siap: the race starts once everyone is ready

        // Race: wait for the countdown, hold GAS on both phones and steer Rina right.
        for (const p of [rina, budi]) {
          await expect(p.locator('.ctrl.drive:not(.is-locked)')).toBeVisible({ timeout: 30_000 });
        }
        const gas = async (p: Page, type: 'pointerdown' | 'pointerup') => {
          const box = await p.locator('.pedal.is-gas').boundingBox();
          if (!box) throw new Error('gas pedal has no box');
          await p.locator('.pedal-pad').dispatchEvent(type, {
            pointerId: 41,
            pointerType: 'touch',
            clientX: box.x + box.width / 2,
            clientY: box.y + box.height / 2,
          });
        };
        await gas(rina, 'pointerdown');
        await gas(budi, 'pointerdown');
        const pad = await rina.locator('.steer-pad').boundingBox();
        if (!pad) throw new Error('steer pad has no box');
        await rina.mouse.move(pad.x + pad.width * 0.8, pad.y + pad.height / 2);
        await rina.mouse.down();
        await tv.waitForTimeout(500);
        await rina.mouse.up();
        await tv.waitForTimeout(1500);
        await shot(tv, '09-bajaj-tv-race');
        await shot(rina, '09-bajaj-iphone-pedals');

        // The first row of kardus boxes is a few seconds down the road: use an item if one lands.
        const ready = (p: Page) => p.locator('.drive-item.has-item').filter({ hasNotText: 'Mengocok' });
        for (let i = 0; i < 40; i++) {
          if ((await ready(rina).count()) || (await ready(budi).count())) break;
          await tv.waitForTimeout(250);
        }
        for (const p of [rina, budi]) {
          if (await ready(p).count()) {
            await shot(p, `09-bajaj-${p === rina ? 'iphone' : 'android'}-item`);
            await p.locator('.drive-item').dispatchEvent('pointerdown');
          }
        }
        await tv.waitForTimeout(1200);
        await shot(tv, '09-bajaj-tv-item');
        await gas(rina, 'pointerup');
        await gas(budi, 'pointerup');
      },
    },
    {
      id: 'masak',
      play: async () => {
        for (const p of [rina, budi]) {
          await expect(p.locator('.ctrl.gesture:not(.is-locked)')).toBeVisible({ timeout: 45_000 });
        }
        for (const p of [rina, budi]) {
          if (await p.locator('.gesture-pad').isVisible()) {
            for (let i = 0; i < 12; i++) await p.locator('.gesture-pad').click();
          }
        }
        await tv.waitForTimeout(600);
        await shot(tv, '10-masak-tv-step');
        await shot(rina, '10-masak-iphone-gesture');
      },
    },
    {
      id: 'ular',
      play: async () => {
        const p = await firstWith(turnButton);
        await shot(p, '12-ular-phone-roll');
        await p.locator(turnButton).click();
        await tv.waitForTimeout(2500);
        await shot(tv, '12-ular-tv-board');
      },
    },
    {
      id: 'congklak',
      play: async () => {
        const p = await firstWith('.choice-view .answer');
        await shot(p, '13-congklak-phone-holes');
        await p.locator('.choice-view .answer').first().click();
        await tv.waitForTimeout(2500);
        await shot(tv, '13-congklak-tv-sowing');
      },
    },
    {
      id: 'kerupuk',
      play: async () => {
        for (const p of [rina, budi]) await expect(p.locator(turnButton)).toBeVisible({ timeout: 45_000 });
        await shot(rina, '14-kerupuk-iphone-bite');
        for (let i = 0; i < 4; i++) {
          for (const p of [rina, budi]) {
            if (await p.locator(turnButton).isVisible()) await p.locator(turnButton).click();
          }
          await tv.waitForTimeout(500);
        }
        await shot(tv, '14-kerupuk-tv-biting');
      },
    },
    {
      id: 'karung',
      play: async () => {
        for (const p of [rina, budi]) {
          await expect(p.locator('.tap-pad')).toBeVisible({ timeout: 45_000 });
        }
        for (let i = 0; i < 10; i++) {
          await rina.locator('.tap-pad').click();
          await budi.locator('.tap-pad').click();
          await rina.waitForTimeout(450);
        }
        await shot(tv, '15-karung-tv-race');
        await shot(budi, '15-karung-android-tap');
      },
    },
    {
      id: 'kompak',
      play: async () => {
        for (const p of [rina, budi]) {
          await expect(p.locator('.choice-view .answer').first()).toBeVisible({ timeout: 45_000 });
        }
        await shot(tv, '16-kompak-tv-prompt');
        await shot(rina, '16-kompak-iphone-choice');
        await rina.locator('.choice-view .answer').first().click();
        await budi.locator('.choice-view .answer').first().click();
        await tv.waitForTimeout(3000);
        await shot(tv, '16-kompak-tv-reveal');
      },
    },
    {
      id: 'ludo',
      play: async () => {
        const p = await firstWith(turnButton);
        await shot(p, '17-ludo-phone-roll');
        await p.locator(turnButton).click();
        await tv.waitForTimeout(2500);
        await shot(tv, '17-ludo-tv-board');
      },
    },
    {
      id: 'catur',
      play: async () => {
        for (const p of [rina, budi]) {
          await expect(p.locator('.chess-view')).toBeVisible({ timeout: 45_000 });
        }
        await firstWith('.chess-view.is-turn', 20_000);
        await shot(tv, '18-catur-tv-board');
        await shot(rina, '18-catur-iphone-board');
        await shot(budi, '18-catur-android-board');
      },
    },
  ];

  /** The phones are still held sideways from the last landscape game. */
  let sideways = false;
  for (const g of games) {
    // Home: pick the game from the Host's phone (the picker's "Semua" tab lists every game).
    await rina.getByRole('button', { name: /Pilih game/ }).click();
    const all = rina.getByRole('tab', { name: 'Semua' });
    await expect(all).toBeVisible();
    await all.click();
    await expect(all).toHaveAttribute('aria-selected', 'true');
    await rina.waitForTimeout(600); // the list re-renders while the main screen jumps to the row
    const card = rina.locator('.pick-card', { hasText: GAMES[g.id as GameId].title }).first();
    // The screen may still report its previous group for a moment: tap the tab again if needed.
    for (let i = 0; i < 4 && (await card.count()) === 0; i++) {
      await all.click();
      await rina.waitForTimeout(800);
    }
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(tv.locator('.side-panel')).toBeVisible();
    await shot(tv, `03-${g.id}-detail`);
    await pad(rina, 'OK'); // "Main" is focused
    await passTutorial(tv, rina);
    await expect(tv.locator(`iframe[src*="/games/${g.id}/"]`)).toBeVisible();
    await expect(tv.locator('.loading-box')).toBeHidden({ timeout: 30_000 });
    // Landscape games ask an upright phone to turn; the players turn their phones sideways and
    // keep holding them so until a portrait game asks them to turn upright again.
    const landscape = g.id === 'tarik' || g.id === 'bajaj';
    if (landscape && !sideways) {
      await expect(rina.getByText('Putar HP-mu')).toBeVisible({ timeout: 20_000 });
      for (const p of [rina, budi]) await turn(p, 'landscape');
      sideways = true;
      await expect(rina.getByText('Putar HP-mu')).toBeHidden();
    } else if (!landscape && sideways) {
      await expect(rina.getByText('Game ini dimainkan tegak.')).toBeVisible({ timeout: 20_000 });
      await shot(rina, `03-${g.id}-turn-upright`);
      for (const p of [rina, budi]) await turn(p, 'portrait');
      sideways = false;
      await expect(rina.getByText('Putar HP-mu')).toBeHidden();
    }
    await g.play();

    if (g.id === 'kuis') {
      // A non-Host opens their own menu from the pill; the game keeps running.
      await budi.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(budi.getByText('Game tetap jalan')).toBeVisible();
      await tv.waitForTimeout(600);
      await shot(budi, '11-player-menu');
      await budi.getByRole('button', { name: 'Lanjut main' }).click();
    }

    // Pause from the pill on the Host phone: the menu opens on the phone.
    await rina.getByRole('button', { name: 'Jeda game' }).click();
    await expect(tv.getByText('Dijeda', { exact: true })).toBeVisible();
    await expect(rina.getByText('Game dijeda')).toBeVisible();

    if (g.id === 'kuis') {
      await tv.waitForTimeout(600);
      await shot(tv, '11-tv-paused');
      await shot(rina, '11-host-menu');
      // "Tambah pemain" puts the join QR on the main screen.
      await rina.getByRole('button', { name: 'Tambah pemain' }).click();
      await expect(tv.getByText('Scan untuk ikut main')).toBeVisible();
      await expect(rina.getByText('Teman scan QR di layar utama')).toBeVisible();
      await tv.waitForTimeout(600);
      await shot(tv, '11-tv-invite');
      await shot(rina, '11-host-invite');
      await rina.getByRole('button', { name: 'Selesai' }).click();
      await expect(tv.getByText('Scan untuk ikut main')).toBeHidden();
      // Settings on the phone change the main screen.
      await rina.getByRole('switch', { name: /Musik/ }).click();
      await expect(tv.getByText('Musik dimatikan')).toBeVisible();
      await rina.getByRole('switch', { name: /Musik/ }).click();
      await expect(tv.getByText('Musik dinyalakan')).toBeVisible();
    }

    // Quit to the catalog from the phone menu.
    await rina.getByRole('button', { name: 'Keluar game' }).click();
    await rina.getByRole('button', { name: 'Ya, keluar' }).click();
    await expect(tv.getByText('Pas untuk kalian')).toBeVisible();
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

test('solo: one phone gets a computer opponent (Ludo)', async () => {
  errors.length = 0;
  const tv = await open(chrome, { viewport: { width: 1920, height: 1080 } }, `${BASE}/main`, 'tv-solo');
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');

  const rina = await open(safari, { ...devices['iPhone 15'] }, `${BASE}/?r=${code}`, 'iphone-solo');
  await rina.getByPlaceholder('Contoh: Rina').fill('Rina');
  await rina.getByRole('button', { name: 'Masuk' }).click();
  await ready(rina, 'Mia');
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();

  await tv.locator('button', { hasText: /mulai|beranda/i }).click();
  await tv.mouse.move(2, 2); // a resting pointer would hover (and focus) whatever lands under it
  await tv.waitForTimeout(800);
  // The Host picks the game from the list on the phone instead of walking the home row.
  await rina.getByRole('button', { name: /Pilih game/ }).click();
  await expect(rina.locator('.picker')).toBeVisible();
  await rina.getByRole('tab', { name: 'Semua' }).click();
  // The main screen jumps to the same group: the "Semua" shelf, its tab in focus.
  await expect(tv.locator('.home-shelf-tab.focused .home-shelf-label')).toHaveText('Semua');
  // The same order as the main screen: games for one player first, one that needs more at the end.
  await expect(rina.locator('.pick-card').last()).not.toHaveText(/Ludo/);
  await shot(rina, '19-solo-picker');
  await shot(tv, '19-solo-tv-papan');
  await rina.locator('.pick-card', { hasText: 'Ludo' }).click();
  await expect(tv.locator('.side-panel')).toBeVisible();
  await expect(tv.getByText('Siap main')).toBeVisible(); // 1 player is enough now
  await expect(rina.locator('.hostpad')).toBeVisible(); // the picker closed itself
  await tv.waitForTimeout(600);
  await pad(rina, 'OK');
  await passTutorial(tv, rina);
  await expect(tv.locator('iframe[src*="/games/ludo/"]')).toBeVisible();
  const frame = tv.frameLocator('iframe[src*="/games/ludo/"]');
  await expect(tv.locator('.loading-box')).toBeHidden({ timeout: 30_000 });

  // The opponent shows up under one of the computer names, never as "BOT".
  const { CPU_NAMES } = await import('../apps/web/src/games/common/cpu-strings');
  const nameRe = new RegExp(CPU_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
  await expect(frame.getByText(nameRe).first()).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByText(/\bBOT\b|\bCPU\b/)).toHaveCount(0);

  // Rina plays several turns. Without a 6 her turn passes to the opponent, so the turn only keeps
  // coming back if the opponent rolls by itself.
  const turn = rina.locator('.button-view .round-btn:not([disabled])');
  const pawn = rina.locator('.choice-view .answer:not([disabled])');
  let turns = 0;
  const until = Date.now() + 90_000;
  while (turns < 3 && Date.now() < until) {
    if (await turn.isVisible()) {
      await turn.click();
      turns++;
      await rina.waitForTimeout(1200);
    } else if (await pawn.first().isVisible()) {
      await pawn.first().click();
      await rina.waitForTimeout(800);
    } else {
      await rina.waitForTimeout(250);
    }
  }
  expect(turns).toBe(3);
  await shot(tv, '19-solo-ludo-tv');
  await shot(rina, '19-solo-ludo-phone');

  await rina.getByRole('button', { name: 'Jeda game' }).click();
  await rina.getByRole('button', { name: 'Keluar game' }).click();
  await rina.getByRole('button', { name: 'Ya, keluar' }).click();
  await tv.context().close();
  await rina.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('same Wi-Fi: direct WebRTC link with relay fallback (laptop screen, Android + iPhone)', async () => {
  errors.length = 0;
  const tv = await open(chrome, { viewport: { width: 1280, height: 720 } }, `${BASE}/main`, 'tv-rtc');
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');

  const rina = await open(safari, { ...devices['iPhone 15'] }, `${BASE}/?r=${code}`, 'iphone-rtc');
  await rina.getByPlaceholder('Contoh: Rina').fill('Rina');
  await rina.getByRole('button', { name: 'Masuk' }).click();
  await ready(rina);
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();
  const budi = await open(chrome, { ...devices['Pixel 7'] }, `${BASE}/?r=${code}`, 'android-rtc');
  await budi.getByPlaceholder('Contoh: Rina').fill('Budi');
  await budi.getByRole('button', { name: 'Masuk' }).click();
  await budi
    .getByRole('button', { name: 'Nanti saja' })
    .click({ timeout: 5_000 })
    .catch(() => {});
  await ready(budi);

  // The main screen offers each phone a direct link; both ends report it (debug attributes).
  for (const p of [rina, budi]) {
    await expect(p.locator('html')).toHaveAttribute('data-link', 'direct', { timeout: 15_000 });
  }
  await expect(tv.locator('html')).toHaveAttribute('data-direct', '2');

  // Remote keys travel the direct link: OK on the join page opens the home screen.
  await pad(rina, 'OK');
  await expect(tv.locator('.home-scroll')).toBeVisible();

  // Break the iPhone's link on purpose: traffic falls back to the relay at once (the remote keeps
  // working), then the link comes back. The Android phone keeps its own link all along.
  await rina.evaluate(() => (window as unknown as { __hoorahRtc: { close(): void } }).__hoorahRtc.close());
  await expect(rina.locator('html')).toHaveAttribute('data-link', 'relay');
  // Home opens on the Mode Pesta card; past the Acak card sits the first game, OK opens its detail.
  await pad(rina, 'Kanan', 2);
  await pad(rina, 'OK');
  await expect(tv.locator('.side-panel')).toBeVisible();
  await expect(rina.locator('html')).toHaveAttribute('data-link', 'direct', { timeout: 15_000 });
  await expect(budi.locator('html')).toHaveAttribute('data-link', 'direct');

  await tv.context().close();
  await rina.context().close();
  await budi.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('same Wi-Fi: direct WebRTC link with a Safari main screen (Mac/iPad) and an Android phone', async () => {
  errors.length = 0;
  const tv = await open(
    safari,
    { viewport: { width: 1280, height: 800 } },
    `${BASE}/main`,
    'safari-screen-rtc',
  );
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');

  const budi = await open(chrome, { ...devices['Galaxy S9+'] }, `${BASE}/?r=${code}`, 'android-rtc-2');
  await budi.getByPlaceholder('Contoh: Rina').fill('Budi');
  await budi.getByRole('button', { name: 'Masuk' }).click();
  await budi
    .getByRole('button', { name: 'Nanti saja' })
    .click({ timeout: 5_000 })
    .catch(() => {});
  await ready(budi);
  await expect(budi.locator('html')).toHaveAttribute('data-link', 'direct', { timeout: 15_000 });
  await expect(tv.locator('html')).toHaveAttribute('data-direct', '1');
  await pad(budi, 'OK');
  await expect(tv.locator('.home-scroll')).toBeVisible();

  await tv.context().close();
  await budi.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('nearby screen, banner follows the focused card, add-player panel', async () => {
  errors.length = 0;
  const tv = await open(chrome, { viewport: { width: 1920, height: 1080 } }, `${BASE}/main`, 'tv-nearby');
  await expect(tv.locator('.room-code')).toHaveText(/^\d{3} \d{3}$/);
  const code = (await tv.locator('.room-code').textContent())!.replace(/\s/g, '');

  // A phone on the same network opens the plain address: the screen is offered, one tap joins.
  const budi = await open(chrome, { ...devices['Pixel 7'] }, `${BASE}/main`, 'android-nearby');
  const offer = budi.locator('.nearby-room', { hasText: `${code.slice(0, 3)} ${code.slice(3)}` });
  await expect(offer).toBeVisible({ timeout: 10_000 });
  await offer.click();
  await budi.getByPlaceholder('Contoh: Rina').fill('Budi');
  await budi.getByRole('button', { name: 'Masuk' }).click();
  await ready(budi);
  await expect(budi.getByText('HOST', { exact: true })).toBeVisible();
  await budi
    .getByRole('button', { name: 'Nanti saja' })
    .click({ timeout: 5_000 })
    .catch(() => {});

  // Home: quick starts → shelf tabs → cards; the hero up top shows the focused game's name.
  await tv.locator('button', { hasText: /mulai/i }).first().click();
  await tv.mouse.move(2, 2);
  await expect(tv.locator('.home-scroll')).toBeVisible();
  await pad(budi, 'Bawah');
  await pad(budi, 'Bawah');
  await pad(budi, 'Kanan');
  const focusedTitle = (await tv.locator('.card.focused .card-title').textContent())!.trim();
  await expect(tv.locator('.home-hero-title')).toHaveText(focusedTitle);

  // "+ Tambah pemain" opens the QR panel over the home screen; Selesai closes it.
  await tv.getByRole('button', { name: 'Tambah pemain' }).click();
  await expect(tv.locator('.invite-panel')).toBeVisible();
  await expect(tv.locator('.invite-code')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`);
  await pad(budi, 'OK');
  await expect(tv.locator('.invite-panel')).toBeHidden();
  await expect(tv.locator('.home-scroll')).toBeVisible();

  await tv.context().close();
  await budi.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('graphics diagnostics page: GPU test, level and manual choice', async () => {
  errors.length = 0;
  const tv = await open(chrome, { viewport: { width: 960, height: 540 } }, `${BASE}/?diag=1`, 'tv-diag');
  const level = tv.locator('.dg-row').first();
  await expect(level).toContainText('Level grafis game 3D');
  await expect(tv.getByText('Sedang menguji')).toHaveCount(0, { timeout: 10_000 });
  await expect(tv.locator('.dg-row', { hasText: /^Uji GPU/ })).toContainText('ms per lapis');
  // Arrow keys reach the buttons (TV remote), and a manual level is remembered.
  await tv.keyboard.press('ArrowRight');
  await tv.keyboard.press('ArrowRight');
  await tv.keyboard.press('ArrowRight');
  await tv.keyboard.press('Enter');
  await expect(level).toContainText('Ringan · pilihan manual');
  await tv.reload();
  await expect(tv.locator('.dg-row').first()).toContainText('Ringan · pilihan manual');
  await tv.getByRole('button', { name: 'Otomatis' }).click();
  await expect(tv.locator('.dg-row').first()).not.toContainText('pilihan manual');
  await tv.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Kacaw Pass: a third phone opens a full room with a code made in the admin dashboard', async () => {
  await setOpenAll(false);
  // ---- The owner makes a code (API here; the dashboard UI is checked at the end) ----
  const owner = await chrome.newContext({ baseURL: BASE });
  const H = { 'x-hoorah-admin': '1' };
  const login = await owner.request.post('/api/admin/login', {
    headers: H,
    data: { username: 'admin', password: 'e2e-admin-pass' },
  });
  expect(login.ok()).toBe(true);
  const made = await owner.request.post('/api/admin/passes', {
    headers: H,
    data: {
      label: 'Uji e2e',
      code: 'E2EPASS',
      expiresAt: Date.now() + 2 * 3_600_000,
      maxPlayers: 4,
      maxRooms: null,
    },
  });
  expect(made.status()).toBe(201);

  // ---- A main screen and two phones fill the free room ----
  const tv = await open(chrome, { viewport: { width: 1920, height: 1080 } }, `${BASE}/main`, 'pass-tv');
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');
  const joinAs = async (browser: Browser, device: string, name: string): Promise<Page> => {
    const p = await open(browser, { ...devices[device] }, `${BASE}/?r=${code}`, `pass-${name}`);
    await p.getByPlaceholder('Contoh: Rina').fill(name);
    await p.getByRole('button', { name: 'Masuk' }).click();
    return p;
  };
  const rina = await joinAs(safari, 'iPhone 15', 'Rina');
  await ready(rina);
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();
  const budi = await joinAs(chrome, 'Pixel 7', 'Budi');
  await ready(budi);
  await expect(budi.getByText('Halo, Budi!')).toBeVisible();

  // ---- The third phone is turned away, a wrong code is refused, the right one gets in ----
  const sari = await joinAs(chrome, 'Galaxy S9+', 'Sari');
  await expect(sari.getByText('Room penuh')).toBeVisible();
  await shot(sari, '30-pass-android-full');
  await sari.getByLabel('Kode Pass').fill('salah123');
  await sari.getByRole('button', { name: 'Pakai Pass & masuk' }).click();
  await expect(sari.getByText('Kode Pass tidak berlaku')).toBeVisible();
  // Typed in lower case with a dash: the phone tidies it up.
  await sari.getByLabel('Kode Pass').fill('e2e-pass');
  await sari.getByRole('button', { name: 'Pakai Pass & masuk' }).click();
  await ready(sari);
  await expect(sari.getByText('Halo, Sari!')).toBeVisible();
  await expect(tv.locator('.access-chip.is-pass')).toBeVisible();
  await expect(tv.getByText(/3\s*\/\s*4/)).toBeVisible();
  await shot(tv, '30-pass-tv-join');
  await shot(sari, '30-pass-android-in');

  // ---- The dashboard lists the room using the pass ----
  const rooms = await owner.request.get('/api/admin/rooms');
  const list = (await rooms.json()) as {
    rooms: { code: string; pass: { code: string } | null; players: number }[];
  };
  expect(list.rooms.find((r) => r.code === code)).toMatchObject({ players: 3, pass: { code: 'E2EPASS' } });

  // ---- The owner's dashboard on a phone: log in, see the pass in use and the room ----
  const dash = await open(chrome, { ...devices['Pixel 7'] }, `${BASE}/admin/`, 'pass-admin');
  await dash.getByLabel('Username').fill('admin');
  await dash.getByLabel('Kata sandi').fill('e2e-admin-pass');
  await dash.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(dash.getByText('E2EPASS').first()).toBeVisible();
  await shot(dash, '31-admin-passes');
  await dash.getByRole('tab', { name: 'Room' }).click();
  const roomCard = dash
    .locator('article, li, section, div')
    .filter({ hasText: `${code.slice(0, 3)} ${code.slice(3)}` });
  await expect(roomCard.filter({ hasText: 'Menunggu pemain' }).last()).toBeVisible();
  await shot(dash, '31-admin-rooms');

  for (const p of [tv, rina, budi, sari, dash]) await p.context().close();
  await owner.close();
  await setOpenAll(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('solo: Dapur Heboh with a computer helper, floating stick and three buttons', async () => {
  errors.length = 0;
  const tv = await open(chrome, { viewport: { width: 1280, height: 720 } }, `${BASE}/main`, 'tv-dapur');
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');

  const rina = await open(chrome, { ...devices['Pixel 7 landscape'] }, `${BASE}/?r=${code}`, 'android-dapur');
  await rina.getByPlaceholder('Contoh: Rina').fill('Rina');
  await rina.getByRole('button', { name: 'Masuk' }).click();
  await ready(rina, 'Mia');
  await rina
    .getByRole('button', { name: 'Nanti saja' })
    .click({ timeout: 2500 })
    .catch(() => {});
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();

  await tv.locator('button', { hasText: /mulai|beranda/i }).click();
  await tv.mouse.move(2, 2);
  await tv.waitForTimeout(800);
  await rina.getByRole('button', { name: /Pilih game/ }).click();
  await rina.getByRole('tab', { name: 'Semua' }).click();
  await rina.locator('.pick-card', { hasText: 'Dapur Heboh' }).click();
  await expect(tv.locator('.side-panel')).toBeVisible();
  await tv.waitForTimeout(600);
  await pad(rina, 'OK');
  await passTutorial(tv, rina);
  await expect(tv.locator('.loading-box')).toBeHidden({ timeout: 30_000 });
  const frame = tv.frameLocator('iframe[src*="/games/dapur/"]');

  // One cook: Warung Pagi is suggested, the Host picks it and a difficulty on the phone.
  await expect(frame.locator('.dp-setup')).toBeVisible({ timeout: 20_000 });
  await expect(frame.locator('.dp-card', { hasText: 'Warung Pagi' }).locator('.dp-badge')).toBeVisible();
  await shot(tv, '30-dapur-setup');
  await rina.locator('.menu-opt', { hasText: 'Warung Pagi' }).first().dispatchEvent('pointerdown');
  await rina.getByRole('button', { name: 'Lanjut', exact: true }).click();
  await rina.locator('.menu-opt', { hasText: 'Santai' }).first().dispatchEvent('pointerdown');
  await rina.getByRole('button', { name: 'Mulai masak', exact: true }).click();

  // The first game on this screen starts with the hands-on practice: a step card on the main
  // screen, the button to press lit on the phone, Lewati (tap twice) skips to the real round.
  const zone = rina.locator('.pad-stick-zone');
  await expect(zone).toBeVisible({ timeout: 15_000 });
  await expect(frame.locator('.dp-guide')).toBeVisible({ timeout: 15_000 });
  await shot(tv, '30-dapur-practice');
  const skip = rina.locator('.pad-btn', { hasText: 'Lewati' });
  await expect(skip).toBeVisible();
  await skip.dispatchEvent('pointerdown');
  const sure = rina.locator('.pad-btn', { hasText: 'Yakin?' });
  await expect(sure).toBeVisible();
  await sure.dispatchEvent('pointerdown');
  await expect(frame.locator('.dp-guide')).toBeHidden({ timeout: 15_000 });

  // Then the kitchen pad: floating stick plus Ambil / Kerja / Lempar.
  for (const label of ['Ambil', 'Kerja', 'Lempar']) {
    await expect(rina.locator('.pad-btn', { hasText: label })).toBeVisible();
  }
  await expect(frame.locator('.dp-box-value.score')).toBeVisible({ timeout: 15_000 });

  // The stick centres where the thumb lands and the knob follows the drag.
  const box = (await zone.boundingBox())!;
  const x = box.x + box.width * 0.3;
  const y = box.y + box.height * 0.6;
  await rina.mouse.move(x, y);
  await rina.mouse.down();
  const ring = rina.locator('.pad-stick');
  const ringBox = (await ring.boundingBox())!;
  expect(Math.abs(ringBox.x + ringBox.width / 2 - x)).toBeLessThan(4);
  expect(Math.abs(ringBox.y + ringBox.height / 2 - y)).toBeLessThan(4);
  await rina.mouse.move(x + 80, y, { steps: 5 });
  await rina.waitForTimeout(400);
  const knob = (await rina.locator('.pad-stick-knob').boundingBox())!;
  expect(knob.x + knob.width / 2).toBeGreaterThan(x + 40);
  await rina.mouse.up();
  await rina.locator('.pad-btn', { hasText: 'Ambil' }).dispatchEvent('pointerdown');
  await rina.locator('.pad-btn', { hasText: 'Lempar' }).dispatchEvent('pointerdown');
  await rina.waitForTimeout(1500);
  await shot(tv, '30-dapur-play');
  await shot(rina, '30-dapur-phone');

  await rina.getByRole('button', { name: 'Jeda game' }).click();
  await rina.getByRole('button', { name: 'Keluar game' }).click();
  await rina.getByRole('button', { name: 'Ya, keluar' }).click();
  await tv.context().close();
  await rina.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('free tier: a locked game offers the Pass, the trial opens everything once', async () => {
  await setOpenAll(false);
  const tv = await open(chrome, { viewport: { width: 1920, height: 1080 } }, `${BASE}/main`, 'free-tv');
  const codeEl = tv.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');
  const rina = await open(chrome, { ...devices['Pixel 7'] }, `${BASE}/?r=${code}`, 'free-rina');
  await rina.getByPlaceholder('Contoh: Rina').fill('Rina');
  await rina.getByRole('button', { name: 'Masuk' }).click();
  await ready(rina);
  await expect(rina.getByText('HOST', { exact: true })).toBeVisible();
  await tv.locator('button', { hasText: /mulai|beranda/i }).click();
  await tv.mouse.move(2, 2);
  // Let the home page settle first, like the other tests: an early click can be lost.
  await tv.waitForTimeout(800);

  // A Pass game carries the PASS chip; its detail page offers the Pass instead of starting.
  await expect(tv.locator('.card', { hasText: 'Obby' }).getByText('PASS')).toBeVisible();
  // A click while the home rows are still settling can be lost: retry until the detail page opens.
  const unlock = tv.getByRole('button', { name: /Buka dengan Pass/ });
  try {
    await expect(async () => {
      if (!(await unlock.isVisible())) await tv.locator('.card', { hasText: 'Obby' }).first().click();
      await expect(unlock).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  } catch (e) {
    // Kept on purpose: this step fails now and then in full runs only; the picture shows why.
    await shot(tv, 'free-tier-detail-failed');
    throw e;
  }
  await unlock.click();
  await expect(tv.locator('.offer-panel')).toBeVisible();
  await expect(tv.getByText('Obby butuh Kacaw Pass')).toBeVisible();
  await shot(tv, '40-free-offer');

  // The trial starts once: everything opens and the top bar counts down.
  await tv.getByRole('button', { name: /Coba gratis \d+ menit/ }).click();
  await expect(tv.locator('.offer-panel')).toBeHidden();
  await expect(tv.getByRole('button', { name: /^Main$/ })).toBeVisible();
  // Back on the home screen the top bar counts the trial down.
  await tv.keyboard.press('Escape');
  await expect(tv.getByText(/Coba gratis · \d+/)).toBeVisible();
  await shot(tv, '41-free-trial-home');

  for (const p of [tv, rina]) await p.context().close();
  await setOpenAll(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('landing page: the big screen starts at /main and comes back to /, a phone joins with a code', async () => {
  // A fresh big screen sees the landing page; the start button opens the main screen.
  const desk = await open(chrome, { viewport: { width: 1440, height: 900 } }, `${BASE}/`, 'landing-desk');
  await expect(desk.getByRole('link', { name: 'Mulai main sekarang' })).toBeVisible();
  await shot(desk, '50-landing');
  await desk.getByRole('link', { name: 'Mulai main sekarang' }).click();
  await expect(desk).toHaveURL(/\/main$/);
  const codeEl = desk.locator('.room-code');
  await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
  const code = (await codeEl.textContent())!.replace(/\s/g, '');
  // Back at / this device still sees the landing page, now with "continue as the main screen".
  await desk.goto(`${BASE}/`);
  await expect(desk).toHaveURL(new RegExp(`${BASE}/$`));
  await expect(desk.getByRole('link', { name: 'Lanjutkan sebagai layar utama' })).toBeVisible();

  // A phone opening the site types the code at the top of the landing page.
  const phone = await open(chrome, { ...devices['Pixel 7'] }, `${BASE}/`, 'landing-phone');
  await phone.getByLabel('Kode room').fill(code);
  await phone.getByRole('button', { name: 'Gabung', exact: true }).click();
  await expect(phone).toHaveURL(new RegExp(`(R/|\\?r=)${code}`));
  await expect(phone.getByPlaceholder('Contoh: Rina')).toBeVisible();
  await shot(phone, '51-landing-phone-join');

  for (const p of [desk, phone]) await p.context().close();
  expect(errors, errors.join('\n')).toEqual([]);
});
