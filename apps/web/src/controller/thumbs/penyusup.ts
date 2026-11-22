/**
 * Penyusup option pictures in the game's poster look: black stage, yellow spotlight, cream cards.
 * Keys: `lang-<Lang>`, `mode-<Mode>`, `kosong-on`, `kosong-off`.
 */
import { thumbSvg } from './frame';

const INK = '#18181A';
const YEL = '#FFC928';
const CREAM = '#FFF7DC';
const K = '#111214';
const FONT = `font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"`;

const spot = `<ellipse cx="80" cy="-6" rx="70" ry="64" fill="${YEL}" opacity="0.14"/>`;

/** A speech bubble holding a short tag, with a small stripe badge under the text. */
function bubble(tag: string, stripes: [string, string]): string {
  return (
    `<path d="M26 22h108a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H70l-20 18v-18H26a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12Z" fill="${CREAM}" stroke="${YEL}" stroke-width="4" stroke-linejoin="round"/>` +
    `<text x="80" y="64" text-anchor="middle" font-size="34" fill="${K}" ${FONT}>${tag}</text>` +
    `<rect x="62" y="70" width="36" height="5" fill="${stripes[0]}"/><rect x="62" y="75" width="36" height="5" fill="${stripes[1]}"/>`
  );
}

/** A face-down card; `blank` = Si Kosong (no word, a question mark). */
function card(x: number, y: number, rot: number, blank: boolean): string {
  const body = blank
    ? `<text x="22" y="44" text-anchor="middle" font-size="30" fill="${YEL}" ${FONT}>?</text>`
    : `<rect x="10" y="24" width="24" height="5" rx="2.5" fill="${K}"/><rect x="13" y="34" width="18" height="4" rx="2" fill="#8E8E93"/>`;
  return (
    `<g transform="translate(${x} ${y}) rotate(${rot} 22 30)">` +
    `<rect width="44" height="60" rx="7" fill="${blank ? INK : CREAM}" stroke="${blank ? YEL : K}" stroke-width="3"/>${body}</g>`
  );
}

export const THUMBS: Record<string, () => string> = {
  'lang-id': () => thumbSvg(INK, spot + bubble('ID', ['#E8352E', '#FFFFFF'])),
  'lang-en': () => thumbSvg(INK, spot + bubble('EN', ['#2F7DF6', '#E8352E'])),
  'mode-lisan': () =>
    thumbSvg(
      INK,
      `${spot}<circle cx="60" cy="62" r="30" fill="${CREAM}"/>` +
        `<ellipse cx="66" cy="70" rx="10" ry="7" fill="${K}"/><circle cx="52" cy="54" r="4" fill="${K}"/><circle cx="72" cy="54" r="4" fill="${K}"/>` +
        `<path d="M100 48q8 14 0 28M112 40q14 22 0 44M124 32q20 30 0 60" fill="none" stroke="${YEL}" stroke-width="5" stroke-linecap="round"/>`,
    ),
  'mode-ketik': () =>
    thumbSvg(
      INK,
      `${spot}<rect x="52" y="10" width="56" height="102" rx="10" fill="#2A2A2D" stroke="${CREAM}" stroke-width="3"/>` +
        `<rect x="58" y="20" width="44" height="26" rx="5" fill="${CREAM}"/><rect x="62" y="30" width="22" height="5" rx="2.5" fill="${K}"/><rect x="86" y="28" width="3" height="10" fill="${YEL}"/>` +
        Array.from({ length: 12 }, (_, i) => {
          const c = i % 4;
          const r = Math.floor(i / 4);
          return `<rect x="${59 + c * 11}" y="${56 + r * 13}" width="9" height="10" rx="2" fill="${r === 2 && c > 0 && c < 3 ? YEL : '#8E8E93'}"/>`;
        }).join(''),
    ),
  'kosong-on': () =>
    thumbSvg(INK, spot + card(30, 34, -10, false) + card(86, 34, 10, false) + card(58, 26, 0, true)),
  'kosong-off': () =>
    thumbSvg(INK, spot + card(30, 34, -10, false) + card(86, 34, 10, false) + card(58, 26, 0, false)),
};
