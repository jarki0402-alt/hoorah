/**
 * Kampung Siluman option pictures in the game's woodcut look: flat silhouettes on deep night
 * blue under a pale moon, warm lamp-orange for light. Keys: `role-<Role>`, `extra-<Extras>`,
 * `talk-<Talk>`. The main screen reuses the role pictures for the night calls and the reveal.
 */
import { thumbSvg } from './frame';

const NIGHT = '#13203A';
const DEEP = '#0B1426';
const MOON = '#FFE7A3';
const LAMP = '#FF8A1F';
const CREAM = '#FBF1DC';
const RED = '#E8483A';
const GREEN = '#3FAE6A';

const moon = (x = 128, y = 26, r = 14) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${MOON}"/><circle cx="${x + 5}" cy="${y - 4}" r="${r - 2}" fill="${NIGHT}" opacity="0.18"/>`;
const ground = `<path d="M0 104q40-8 80 0t80 0v16H0Z" fill="${DEEP}"/>`;

/** A stilt house with a lit window. */
const house = (x: number, s = 1) =>
  `<g transform="translate(${x} ${104 - 62 * s}) scale(${s})"><path d="M0 26L30 0l30 26Z" fill="${DEEP}"/><rect x="6" y="26" width="48" height="28" fill="${DEEP}"/><rect x="22" y="32" width="14" height="12" fill="${LAMP}"/><rect x="10" y="54" width="4" height="8" fill="${DEEP}"/><rect x="46" y="54" width="4" height="8" fill="${DEEP}"/></g>`;

/** A villager silhouette in a caping hat. */
const villager = (x: number, y: number, s = 1, fill = CREAM) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"><path d="M-16 -30l16-10l16 10Z"/><circle cy="-22" r="8"/><path d="M-12 -12h24l4 30h-32Z"/></g>`;

const art: Record<string, string> = {
  warga: `${moon()}${house(8, 0.9)}${villager(104, 84)}${ground}`,
  siluman:
    `${moon(34, 28, 16)}` +
    `<path d="M50 104q2-46 30-56q28 10 30 56Z" fill="${DEEP}"/>` +
    `<path d="M58 54l-8-22l18 14M102 54l8-22l-18 14" fill="${DEEP}"/>` +
    `<path d="M66 66l10 4l-10 3ZM94 66l-10 4l10 3Z" fill="${MOON}"/>` +
    `<path d="M72 86l4 6l4-6l4 6l4-6" fill="none" stroke="${CREAM}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M40 100l8-14l4 14M120 100l-8-14l-4 14" fill="${DEEP}"/>${ground}`,
  dukun:
    `${moon(28, 24, 11)}` +
    `<path d="M48 104q4-40 32-46q28 6 32 46Z" fill="${DEEP}"/><circle cx="80" cy="50" r="14" fill="${DEEP}"/><path d="M62 44q18-14 36 0v-6q-18-10-36 0Z" fill="${LAMP}"/>` +
    `<path d="M54 22q26-22 52 0q-26 20-52 0Z" fill="${CREAM}"/><circle cx="80" cy="22" r="8" fill="${NIGHT}"/><circle cx="80" cy="22" r="3.5" fill="${MOON}"/>` +
    `<path d="M120 70l10 0l-2 12h-6Z" fill="${MOON}"/><circle cx="125" cy="85" r="2" fill="${MOON}"/>${ground}`,
  tabib:
    `${moon(132, 24, 11)}` +
    `<path d="M40 86q40 22 80 0l-6 18H46Z" fill="${CREAM}"/><path d="M36 84h88" stroke="${CREAM}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M70 82q-18-34 10-58q14 30-10 58Z" fill="${GREEN}"/><path d="M80 82q20-30 44-32q-12 28-44 32Z" fill="${GREEN}"/>` +
    `<path d="M74 80q2-26 6-50M84 80q14-14 30-26" stroke="${DEEP}" stroke-width="2" fill="none"/>${ground}`,
  pemburu:
    `${moon(30, 26, 12)}` +
    `<path d="M104 18q-34 42 0 84" fill="none" stroke="${CREAM}" stroke-width="5" stroke-linecap="round"/><path d="M104 18v84" stroke="${CREAM}" stroke-width="1.6"/>` +
    `<path d="M40 60h70" stroke="${LAMP}" stroke-width="4" stroke-linecap="round"/><path d="M112 60l-12-7v14Z" fill="${LAMP}"/><path d="M40 60l-8-6M40 60l-8 6" stroke="${LAMP}" stroke-width="3" stroke-linecap="round"/>${ground}`,
  pengkhianat:
    `${moon(132, 22, 10)}` +
    `<path d="M80 16q-34 0-34 40q0 34 34 46Z" fill="${CREAM}"/><path d="M80 16q34 0 34 40q0 34-34 46Z" fill="${DEEP}"/>` +
    `<path d="M80 16v86" stroke="${LAMP}" stroke-width="2.5"/>` +
    `<circle cx="64" cy="50" r="5" fill="${NIGHT}"/><path d="M58 74q8 6 16 0" fill="none" stroke="${NIGHT}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M90 48l12 4l-12 4Z" fill="${MOON}"/><path d="M88 74l4 5l4-5l4 5l4-5" fill="none" stroke="${RED}" stroke-width="2.5"/>${ground}`,
};

/** A small framed role picture (72x54), for the "extras" combinations. */
function badge(x: number, y: number, body: string): string {
  return `<g transform="translate(${x} ${y}) scale(0.45)"><rect width="160" height="120" rx="18" fill="${NIGHT}" stroke="${MOON}" stroke-width="6"/>${body}</g>`;
}

/** An hourglass with `n` marks: the length of the day's discussion. */
function hourglass(n: number): string {
  const marks = Array.from(
    { length: n },
    (_, i) => `<rect x="108" y="${34 + i * 22}" width="22" height="12" rx="6" fill="${LAMP}"/>`,
  ).join('');
  return (
    `${moon(30, 24, 10)}` +
    `<path d="M50 18h44M50 102h44" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M56 22q0 22 16 38q-16 16-16 38h32q0-22-16-38q16-16 16-38Z" fill="none" stroke="${CREAM}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M62 30h20q-2 14-10 22q-8-8-10-22Z" fill="${MOON}" opacity="${n === 1 ? 0.35 : n === 2 ? 0.6 : 0.9}"/>` +
    `<path d="M60 96q2-14 12-22q10 8 12 22Z" fill="${MOON}" opacity="${n === 3 ? 0.35 : n === 2 ? 0.6 : 0.9}"/>${marks}`
  );
}

const role = (r: string) => () => thumbSvg(NIGHT, art[r] ?? '');

export const THUMBS: Record<string, () => string> = {
  'role-warga': role('warga'),
  'role-siluman': role('siluman'),
  'role-dukun': role('dukun'),
  'role-tabib': role('tabib'),
  'role-pemburu': role('pemburu'),
  'role-pengkhianat': role('pengkhianat'),
  'extra-dasar': () =>
    thumbSvg(
      DEEP,
      badge(6, 4, art.warga!) +
        badge(82, 4, art.siluman!) +
        badge(6, 62, art.dukun!) +
        badge(82, 62, art.tabib!),
    ),
  'extra-pemburu': () => thumbSvg(DEEP, `${badge(6, 33, art.warga!)}${badge(82, 33, art.pemburu!)}`),
  'extra-pengkhianat': () => thumbSvg(DEEP, `${badge(6, 33, art.warga!)}${badge(82, 33, art.pengkhianat!)}`),
  'extra-keduanya': () => thumbSvg(DEEP, `${badge(6, 33, art.pemburu!)}${badge(82, 33, art.pengkhianat!)}`),
  'talk-singkat': () => thumbSvg(NIGHT, hourglass(1)),
  'talk-sedang': () => thumbSvg(NIGHT, hourglass(2)),
  'talk-panjang': () => thumbSvg(NIGHT, hourglass(3)),
};
