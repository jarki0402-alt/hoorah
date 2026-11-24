/**
 * Renders the home-screen PNG icons from public/icon-app.svg (made by brand.ts, see brand.test.ts):
 * a square orange tile (the phone rounds the corners itself) in 180 (iOS), 192 and 512 px.
 * Run after changing the icon: `node scripts/brand-icons.mjs`. Needs Playwright's Chromium.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = (name) => fileURLToPath(new URL(`../apps/web/public/${name}`, import.meta.url));
const svg = readFileSync(pub('icon-app.svg'), 'utf8');
const SIZES = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

const browser = await chromium.launch();
try {
  for (const [name, size] of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    // The orange page fills the tile's rounded corners, so the icon is a full square.
    await page.setContent(
      `<html><body style="margin:0;background:#FF5A1F"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.screenshot({ path: pub(name), omitBackground: false });
    await page.close();
    console.log(`${name} ${size}x${size}`);
  }
} finally {
  await browser.close();
}
