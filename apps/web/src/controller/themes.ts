/**
 * Per-game controller themes. While a game (or its in-game results) is on the phone, the phone
 * borrows that game's world so it feels like part of the game, not a generic remote.
 *
 * How it works:
 *  - `useControllerTheme(gameId)` sets `data-game` on <html> and draws the game's scene as a
 *    single SVG sized to the viewport (crisp at any DPR, redrawn only when the shape changes).
 *  - Colours, panels and button materials are CSS custom properties in controller.css, keyed by
 *    `html[data-game='<id>']`. Everything else in the controller reads those tokens.
 *
 * Adding a theme for a new game: add an entry to THEMES below (scene + Host strip edge), then a
 * `html[data-game='<id>']` token block in controller.css (and material overrides if the game
 * needs them). Games without an entry simply keep the neutral Hoorah style.
 */
import { useLayoutEffect } from 'preact/hooks';
import { arenaTheme } from '../games/arena/controller-theme';
import { bomTheme } from '../games/bom/controller-theme';
import { caturTheme } from '../games/catur/controller-theme';
import { congklakTheme } from '../games/congklak/controller-theme';
import { dapurTheme } from '../games/dapur/controller-theme';
import { ejaTheme } from '../games/eja/controller-theme';
import { esTheme } from '../games/es/controller-theme';
import { hantuTheme } from '../games/hantu/controller-theme';
import { juraganTheme } from '../games/juragan/controller-theme';
import { karungTheme } from '../games/karung/controller-theme';
import { kataTheme } from '../games/kata/controller-theme';
import { kerupukTheme } from '../games/kerupuk/controller-theme';
import { kompakTheme } from '../games/kompak/controller-theme';
import { langkahTheme } from '../games/langkah/controller-theme';
import { lariTheme } from '../games/lari/controller-theme';
import { ludoTheme } from '../games/ludo/controller-theme';
import { nyebrangTheme } from '../games/nyebrang/controller-theme';
import { obbyTheme } from '../games/obby/controller-theme';
import { penyusupTheme } from '../games/penyusup/controller-theme';
import { runtuhTheme } from '../games/runtuh/controller-theme';
import { silumanTheme } from '../games/siluman/controller-theme';
import { taliTheme } from '../games/tali/controller-theme';
import { ularTheme } from '../games/ular/controller-theme';
import { warnaTheme } from '../games/warna/controller-theme';
import { wilayahTheme } from '../games/wilayah/controller-theme';
import { f1, seeded, svgUrl } from '../shared/art/svg';

interface Tile {
  w: number;
  h: number;
  body: string;
}

export interface ControllerTheme {
  /** Browser toolbar colour (meta theme-color) while the theme is on. */
  chrome: string;
  /** Full-screen illustration behind the controls for a w×h CSS-pixel viewport (SVG body). */
  scene: (w: number, h: number) => string;
  /** Repeat-x decoration hanging under the Host strip (its height is set in CSS). */
  stripEdge?: Tile;
  /** Extra textures, exposed as CSS custom properties holding url() values. */
  textures?: Record<string, Tile>;
}

const svg = (w: number, h: number, body: string, stretch = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${
    stretch ? ' preserveAspectRatio="none"' : ''
  }>${body}</svg>`;

const r = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;

/** A flat cartoon cloud made of overlapping circles on a flat base. */
function cloud(x: number, y: number, s: number, fill: string): string {
  const c = (cx: number, cy: number, rr: number) =>
    `<circle cx="${f1(x + cx * s)}" cy="${f1(y + cy * s)}" r="${f1(rr * s)}"/>`;
  return `<g fill="${fill}">${c(0, 0, 13)}${c(17, -7, 17)}${c(35, -1, 12)}${r(x, y, 35 * s, 12 * s, fill)}</g>`;
}

/* ------------------------------------------------------------------ kuis: game-show stage */

function kuisScene(w: number, h: number): string {
  const floor = Math.round(Math.min(96, h * 0.1));
  const fy = h - floor;
  const cw = Math.round(Math.max(10, Math.min(24, w * 0.03)));
  const q = 7;
  const kawung = `<pattern id="kw" width="28" height="28" patternUnits="userSpaceOnUse"><g fill="#173E46"><ellipse cx="14" cy="${q * 0.8}" rx="${q * 0.6}" ry="${q}"/><ellipse cx="14" cy="${28 - q * 0.8}" rx="${q * 0.6}" ry="${q}"/><ellipse cx="${q * 0.8}" cy="14" rx="${q}" ry="${q * 0.6}"/><ellipse cx="${28 - q * 0.8}" cy="14" rx="${q}" ry="${q * 0.6}"/></g></pattern>`;
  const curtain = (left: boolean) => {
    const x0 = left ? 0 : w;
    const s = left ? 1 : -1;
    const n = Math.max(3, Math.round(h / 140));
    let d = `M${x0} 0 H${x0 + s * cw} `;
    for (let i = 1; i <= n; i++) {
      const y = (h * i) / n;
      d += `Q${f1(x0 + s * (cw + (i % 2 ? 6 : -3)))} ${f1(y - h / (2 * n))} ${x0 + s * cw} ${f1(y)} `;
    }
    d += `H${x0}Z`;
    const fold = (k: number) => `M${f1(x0 + s * cw * k)} 0 V${h}`;
    return `<path d="${d}" fill="#B3261E"/><path d="${fold(0.38)} ${fold(0.74)}" stroke="#8E1D17" stroke-width="2.5"/>`;
  };
  let valance = `M0 0 H${w} V8 `;
  for (let x = w; x > -32; x -= 32) valance += `Q${x - 16} 22 ${x - 32} 8 `;
  valance += 'V0Z';
  return [
    `<defs>${kawung}</defs>`,
    r(0, 0, w, h, '#12343B'),
    r(0, 0, w, fy, 'url(#kw)'),
    `<g fill="#FFF2C2" opacity="0.05"><path d="M${f1(w * 0.26)} 0 H${f1(w * 0.4)} L${f1(w * 0.62)} ${fy} H${f1(w * 0.04)}Z"/><path d="M${f1(w * 0.64)} 0 H${f1(w * 0.76)} L${f1(w * 0.98)} ${fy} H${f1(w * 0.44)}Z"/></g>`,
    r(0, fy, w, floor, '#1C2A2E'),
    r(0, fy - 2, w, 4, '#FFC928'),
    `<g fill="#FFF2C2" opacity="0.08"><ellipse cx="${f1(w * 0.3)}" cy="${f1(fy + floor * 0.45)}" rx="${f1(w * 0.18)}" ry="${f1(floor * 0.16)}"/><ellipse cx="${f1(w * 0.7)}" cy="${f1(fy + floor * 0.45)}" rx="${f1(w * 0.18)}" ry="${f1(floor * 0.16)}"/></g>`,
    curtain(true),
    curtain(false),
    `<path d="${valance}" fill="#8E1D17"/>`,
  ].join('');
}

/* ------------------------------------------------------------------ rusun: crane site under a blue sky */

function rusunScene(w: number, h: number): string {
  const ground = h - 18;
  const rnd = seeded(7);
  let towers = '';
  let windows = '';
  for (let x = -8; x < w; ) {
    const bw = 26 + Math.round(rnd() * 30);
    const bh = Math.round(h * (0.05 + rnd() * 0.12));
    towers += r(x, ground - bh, bw, bh, '#A7D2EA');
    if (bh > 40)
      for (let wy = ground - bh + 8; wy < ground - 10; wy += 11)
        for (let wx = x + 6; wx < x + bw - 6; wx += 9) windows += `M${wx} ${wy}h4v5h-4Z`;
    x += bw + 4 + Math.round(rnd() * 10);
  }
  let zig = '';
  for (let y = 14; y < ground; y += 12) zig += `L${y % 24 < 12 ? w - 13 : w - 4} ${y} `;
  let jib = '';
  for (let x = 0; x < w; x += 12) jib += `L${x} ${x % 24 < 12 ? 11 : 1} `;
  let ticks = '';
  for (let y = 40, i = 0; y < ground; y += 36, i++) ticks += `M5 ${y} H${i % 4 === 3 ? 16 : 11} `;
  let dashes = '';
  for (let x = 14; x < w; x += 44) dashes += `M${x} ${ground + 9} h16`;
  return [
    r(0, 0, w, h, '#8ED0F4'),
    cloud(w * 0.06, h * 0.2, 0.9, '#E6F5FD'),
    cloud(w * 0.74, h * 0.36, 1.05, '#E6F5FD'),
    cloud(w * 0.16, h * 0.6, 0.75, '#E6F5FD'),
    `<path d="M${f1(w * 0.02)} ${ground} L${f1(w * 0.4)} ${f1(h * 0.62)} Q${f1(w * 0.46)} ${f1(h * 0.58)} ${f1(w * 0.52)} ${f1(h * 0.62)} L${f1(w * 0.98)} ${ground}Z" fill="#9CCDEB"/>`,
    towers,
    `<path d="${windows}" fill="#BFE0F2"/>`,
    r(0, ground - 3, w, 3, '#8C9198'),
    r(0, ground, w, h - ground, '#6B7077'),
    `<path d="${dashes}" stroke="#FFFFFF" stroke-width="2" opacity="0.8"/>`,
    `<path d="M5 18 V${ground} ${ticks}" stroke="#2E6A93" stroke-width="1.5" opacity="0.35" fill="none"/>`,
    r(w - 14, 0, 11, ground, '#FFC928', 'stroke="#111214" stroke-width="1.5"'),
    `<path d="M${w - 13} 2 ${zig}" fill="none" stroke="#111214" stroke-width="1.1"/>`,
    r(-2, 0, w + 4, 12, '#FFC928', 'stroke="#111214" stroke-width="1.5"'),
    `<path d="M0 6 ${jib}" fill="none" stroke="#111214" stroke-width="1.1"/>`,
  ].join('');
}

/* ------------------------------------------------------------------ tarik: village field on Independence Day */

function tarikScene(w: number, h: number): string {
  // The fence sits between the tap screen's header (top 23%) and the titles of message and result
  // screens (from ~30%), so no text runs over it. Landscape puts the info column beside the pad.
  const land = w > h;
  const horizon = Math.round(h * (land ? 0.15 : 0.21));
  const fenceY = Math.round(h * (land ? 0.2 : 0.255));
  const dirtY = fenceY + 26;
  const rnd = seeded(17);
  let flags = '';
  let i = 0;
  // Small and high: the bunting stays above the first line of text at the screen edges.
  for (let x = 8; x < w; x += 20, i++) {
    const t = x / w;
    const y = 2 + 40 * t * (1 - t);
    flags += `<path d="M${f1(x - 6)} ${f1(y)} L${f1(x + 6)} ${f1(y)} L${f1(x)} ${f1(y + 10)}Z" fill="${
      i % 2 ? '#FFFFFF' : '#E8352E'
    }"/>`;
  }
  let posts = '';
  for (let x = 6; x < w; x += 34) posts += `M${x} ${fenceY}h6v28h-6Z`;
  let pebbles = '';
  for (let k = 0; k < 18; k++) {
    const px = rnd() * w;
    const py = dirtY + 24 + rnd() * (h - dirtY - 30);
    pebbles += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(5 + rnd() * 11)}" ry="${f1(2 + rnd() * 2)}"/>`;
  }
  const tree = (x: number) =>
    `${r(x - 3, horizon - 6, 7, 30, '#7A4A1E')}<g><circle cx="${x}" cy="${horizon - 14}" r="20" fill="#3E9A45"/><circle cx="${x + 14}" cy="${horizon - 22}" r="14" fill="#4FAE52"/><circle cx="${x - 12}" cy="${horizon - 4}" r="12" fill="#348A3C"/></g>`;
  return [
    r(0, 0, w, dirtY, '#9ADBFF'),
    cloud(w * 0.1, horizon * 0.62, 0.95, '#FFFFFF'),
    cloud(w * 0.76, horizon * 0.42, 0.8, '#FFFFFF'),
    `<path d="M0 2 Q${w / 2} 22 ${w} 2" fill="none" stroke="#6B4423" stroke-width="1.4"/>`,
    flags,
    `<path d="M0 ${horizon + 6} C${f1(w * 0.25)} ${horizon - 22} ${f1(w * 0.5)} ${horizon - 8} ${f1(w * 0.62)} ${horizon} C${f1(w * 0.78)} ${horizon - 18} ${f1(w * 0.92)} ${horizon - 6} ${w} ${horizon - 2} V${dirtY} H0Z" fill="#8BCB6B"/>`,
    `<path d="M0 ${fenceY - 6} C${f1(w * 0.3)} ${fenceY - 18} ${f1(w * 0.7)} ${fenceY - 12} ${w} ${fenceY - 8} V${dirtY} H0Z" fill="#76BC58"/>`,
    tree(6),
    tree(w - 8),
    `<path d="${posts}" fill="#B07A47"/>`,
    r(0, fenceY + 5, w, 5, '#9A6838'),
    r(0, fenceY + 16, w, 5, '#9A6838'),
    r(0, dirtY, w, h - dirtY, '#E2B07A'),
    `<g fill="#CF9A62">${pebbles}</g>`,
  ].join('');
}

/* ------------------------------------------------------------------ bajaj: city street circuit in daylight */

const RUKO = ['#F2C094', '#E8A27C', '#F4D9A8', '#EFB59A', '#A9D8CC', '#F6E7C8'];

function bajajScene(w: number, h: number): string {
  const sky = Math.round(Math.max(64, Math.min(140, h * 0.16)));
  const kerbY = sky + 8;
  const road = kerbY + 8;
  const rnd = seeded(23);
  let far = '';
  for (let x = -6; x < w; ) {
    const tw = 16 + Math.round(rnd() * 16);
    const th = Math.round(sky * (0.4 + rnd() * 0.42));
    far += r(x, sky - th, tw, th, '#CDE6F4');
    x += tw + 3 + Math.round(rnd() * 8);
  }
  let near = '';
  let wins = '';
  for (let x = -10; x < w; ) {
    const bw = 38 + Math.round(rnd() * 26);
    const bh = Math.round(Math.min(64, sky * (0.24 + rnd() * 0.22)));
    const top = sky - bh;
    const col = RUKO[Math.floor(rnd() * RUKO.length)]!;
    near += r(x, top, bw, bh, col) + r(x - 2, top, bw + 4, 4, '#C9733A', 'opacity="0.55"');
    near += r(
      x + 5,
      sky - Math.min(14, bh * 0.36),
      bw - 10,
      Math.min(14, bh * 0.36),
      rnd() < 0.5 ? '#9AA0A6' : '#2DA39A',
    );
    if (bh > 30) wins += `M${x + 8} ${top + 9}h9v8h-9Z M${x + bw - 17} ${top + 9}h9v8h-9Z `;
    x += bw + Math.round(rnd() * 4);
  }
  let kerb = '';
  for (let x = 0; x < w; x += 40) kerb += `M${x} ${kerbY}h20v8h-20Z`;
  let side = '';
  for (let y = road; y < h; y += 40) side += `M0 ${y}h6v20h-6Z M${w - 6} ${y}h6v20h-6Z`;
  let grit = '';
  const n = Math.min(260, Math.round((w * (h - road)) / 1400));
  for (let k = 0; k < n; k++)
    grit += `M${f1(rnd() * w)} ${f1(road + rnd() * (h - road))}h${rnd() < 0.5 ? 2 : 3}v2h-2Z`;
  return [
    r(0, 0, w, sky, '#A8D8F2'),
    far,
    near,
    `<path d="${wins}" fill="#5B4636" opacity="0.45"/>`,
    r(0, sky, w, 8, '#DCCFB9'),
    r(0, kerbY, w, 8, '#F4F4F4'),
    `<path d="${kerb}" fill="#E8352E"/>`,
    r(0, road, w, h - road, '#3E4147'),
    `<path d="${grit}" fill="#4B4E55"/>`,
    `<path d="M14 ${road} V${h} M${w - 14} ${road} V${h}" stroke="#D9DBDE" stroke-width="3" opacity="0.4"/>`,
    r(0, road, 6, h - road, '#F4F4F4'),
    r(w - 6, road, 6, h - road, '#F4F4F4'),
    `<path d="${side}" fill="#E8352E"/>`,
  ].join('');
}

/** Side view of a bajaj; the colour picker paints it in each option's colour (CSS mask). */
const BAJAJ_BODY =
  'M9 33 V14 Q9 7 16 7 H44 Q49 7 52 13 L57 24 Q60 27 60 31 V33 Q60 35 58 35 H11 Q9 35 9 33Z M10 36 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0Z M46 36 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0Z';
const BAJAJ_DETAIL =
  '<path d="M14 12 H43 Q46 12 47.5 15 L51 23 H14Z" fill="#DDEFF8" opacity="0.9"/><path d="M27 12 V23" stroke="#111214" stroke-width="1.6" opacity="0.5"/><path d="M8 6 H46 Q50 6 51 9 H8Z" fill="#111214" opacity="0.8"/><circle cx="16" cy="36" r="6" fill="#111214"/><circle cx="52" cy="36" r="6" fill="#111214"/><circle cx="16" cy="36" r="2.4" fill="#C3CBD2"/><circle cx="52" cy="36" r="2.4" fill="#C3CBD2"/><rect x="55" y="25" width="4" height="4" rx="1" fill="#FFF3B8"/>';

/* ------------------------------------------------------------------ masak: Chef Mangga's kitchen */

function masakScene(w: number, h: number): string {
  // Wall on top (header text), the teal backsplash, then the wooden counter the pads sit on.
  // Text-heavy views put their subtitles at 40-55% of the height: that is counter, not tiles.
  const wallH = Math.round(h * 0.19);
  const counterY = Math.round(h * 0.42);
  const rnd = seeded(31);
  let shades = '';
  for (let row = 0; row * 20 < counterY - wallH; row++)
    for (let col = -1; col * 40 < w; col++)
      if (rnd() < 0.12) {
        const x = col * 40 + (row % 2 ? 20 : 0);
        shades += r(x, wallH + row * 20, 40, 20, rnd() < 0.5 ? '#4EB8A7' : '#62C8B8');
      }
  let seams = '';
  for (let y = counterY + 52; y < h; y += 38) seams += `M0 ${y} H${w} `;
  let grain = '';
  for (let k = 0; k < 26; k++) {
    const gx = rnd() * w;
    const gy = counterY + 24 + rnd() * (h - counterY - 28);
    grain += `M${f1(gx)} ${f1(gy)} h${f1(18 + rnd() * 50)}`;
  }
  return [
    `<defs><pattern id="grout" width="40" height="40" patternUnits="userSpaceOnUse" y="${wallH}"><path d="M0 0 H40 M0 20 H40 M0 0 V20 M20 20 V40" stroke="#EADFCB" stroke-width="2" fill="none"/></pattern></defs>`,
    r(0, 0, w, wallH, '#F6E3C6'),
    r(0, wallH, w, counterY - wallH, '#55BFAE'),
    shades,
    r(0, wallH, w, counterY - wallH, 'url(#grout)'),
    r(0, wallH - 6, w, 7, '#C9733A'),
    r(0, counterY, w, 14, '#EAB678'),
    r(0, counterY + 14, w, 5, '#C98D4E'),
    r(0, counterY + 19, w, h - counterY - 19, '#DCA262'),
    `<path d="${seams}" stroke="#C98D4E" stroke-width="2" opacity="0.55"/>`,
    `<path d="${grain}" stroke="#D3955A" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`,
  ].join('');
}

/* ------------------------------------------------------------------ registry */

export const THEMES: Record<string, ControllerTheme> = {
  kuis: {
    chrome: '#8E1D17',
    scene: kuisScene,
    stripEdge: { w: 32, h: 10, body: '<path d="M0 0 H32 V1 Q16 14 0 1Z" fill="#8E1D17"/>' },
  },
  rusun: {
    chrome: '#FFC928',
    scene: rusunScene,
    stripEdge: {
      w: 20,
      h: 12,
      body: '<rect width="20" height="12" fill="#FFC928"/><path d="M0 11 L10 1 L20 11" fill="none" stroke="#111214" stroke-width="1.3"/><path d="M0 0.75 H20 M0 11.25 H20" stroke="#111214" stroke-width="1.5"/>',
    },
  },
  tarik: {
    chrome: '#9ADBFF',
    scene: tarikScene,
    stripEdge: {
      w: 36,
      h: 16,
      body: '<path d="M0 1 H36" stroke="#6B4423" stroke-width="1.4"/><path d="M2 1 H16 L9 14Z" fill="#E8352E"/><path d="M20 1 H34 L27 14Z" fill="#FFFFFF"/>',
    },
  },
  bajaj: {
    chrome: '#1E2024',
    scene: bajajScene,
    stripEdge: {
      w: 16,
      h: 8,
      body: '<rect width="16" height="8" fill="#F4F4F4"/><path d="M0 0h4v4H0Z M8 0h4v4H8Z M4 4h4v4H4Z M12 4h4v4h-4Z" fill="#111214"/>',
    },
    textures: {
      '--t-swatch-mask': { w: 64, h: 44, body: `<path d="${BAJAJ_BODY}" fill="#000"/>` },
      '--t-swatch-detail': { w: 64, h: 44, body: BAJAJ_DETAIL },
    },
  },
  masak: {
    chrome: '#F6E3C6',
    scene: masakScene,
    stripEdge: {
      w: 40,
      h: 6,
      body: '<rect width="40" height="6" fill="#C9733A"/><rect y="4" width="40" height="2" fill="#A85E2C"/>',
    },
  },
  ular: ularTheme,
  congklak: congklakTheme,
  kerupuk: kerupukTheme,
  karung: karungTheme,
  kompak: kompakTheme,
  ludo: ludoTheme,
  catur: caturTheme,
  arena: arenaTheme,
  wilayah: wilayahTheme,
  lari: lariTheme,
  kata: kataTheme,
  juragan: juraganTheme,
  dapur: dapurTheme,
  obby: obbyTheme,
  tali: taliTheme,
  bom: bomTheme,
  runtuh: runtuhTheme,
  es: esTheme,
  langkah: langkahTheme,
  nyebrang: nyebrangTheme,
  penyusup: penyusupTheme,
  eja: ejaTheme,
  siluman: silumanTheme,
  warna: warnaTheme,
  hantu: hantuTheme,
};

const url = (key: string, s: string) => `url("${svgUrl(key, () => s)}")`;

/**
 * Turn the game's theme on for as long as `gameId` is set (null = neutral Hoorah style).
 * The scene is redrawn when the viewport changes shape (rotation, split screen); small height
 * changes from browser toolbars just stretch the current drawing.
 */
export function useControllerTheme(gameId: string | null): void {
  useLayoutEffect(() => {
    const theme = gameId ? THEMES[gameId] : undefined;
    if (!gameId || !theme) return;
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const chrome = meta?.content;
    const vars: string[] = [];
    const set = (k: string, v: string) => {
      root.style.setProperty(k, v);
      vars.push(k);
    };

    root.dataset.game = gameId;
    if (meta) meta.content = theme.chrome;
    if (theme.stripEdge) {
      const e = theme.stripEdge;
      set('--t-strip-edge', url(`edge:${gameId}`, svg(e.w, e.h, e.body)));
    }
    for (const [k, t] of Object.entries(theme.textures ?? {}))
      set(k, url(`tex:${gameId}:${k}`, svg(t.w, t.h, t.body)));

    let drawn = { w: 0, h: 0 };
    const paint = () => {
      const w = Math.max(1, Math.round(window.innerWidth));
      const h = Math.max(1, Math.round(window.innerHeight));
      if (drawn.w === w && Math.abs(h - drawn.h) < Math.max(140, drawn.h * 0.18)) return;
      drawn = { w, h };
      set('--t-art', url(`scene:${gameId}:${w}x${h}`, svg(w, h, theme.scene(w, h), true)));
    };
    paint();
    window.addEventListener('resize', paint);
    return () => {
      window.removeEventListener('resize', paint);
      delete root.dataset.game;
      for (const k of vars) root.style.removeProperty(k);
      if (meta && chrome !== undefined) meta.content = chrome;
    };
  }, [gameId]);
}
