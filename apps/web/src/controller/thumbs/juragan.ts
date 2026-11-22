/**
 * Juragan Nusantara option pictures: the building a city grows into (Renovasi Gotong Royong shows
 * what the free upgrade builds). Keys: `lvl-1` Rumah, `lvl-2` Toko, `lvl-3` Gedung, `lvl-4` Hotel.
 */
import { thumbSvg } from './frame';

const K = '#111214';
const S = `stroke="${K}" stroke-width="3" stroke-linejoin="round"`;

/** Island tile: sea, a sandy rim and a grass top the building stands on. */
const island =
  `<rect y="84" width="160" height="36" fill="#2F8CFF"/>` +
  `<path d="M14 92h132l-8 14H22Z" fill="#E9C58A" ${S}/>` +
  `<path d="M18 84h124v8H18Z" fill="#5FAE5A" ${S}/>`;

function windows(x: number, y: number, cols: number, rows: number, dx: number, dy: number): string {
  let d = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) d += `M${x + c * dx} ${y + r * dy}h7v8h-7Z`;
  return `<path d="${d}" fill="#BFE6FF" stroke="${K}" stroke-width="2"/>`;
}

const BUILDINGS: Record<1 | 2 | 3 | 4, string> = {
  1:
    `<path d="M54 84V56h52v28Z" fill="#FFF2B8" ${S}/>` +
    `<path d="M46 58l34-26 34 26Z" fill="#F2453D" ${S}/>` +
    `<path d="M74 84V68h12v16Z" fill="#B07A45" ${S}/>` +
    windows(60, 64, 1, 1, 0, 0) +
    windows(93, 64, 1, 1, 0, 0),
  2:
    `<path d="M40 84V48h80v36Z" fill="#FFF7F0" ${S}/>` +
    `<path d="M36 48h88v-10H36Z" fill="#FF8A1F" ${S}/>` +
    `<path d="M40 56l10-8h60l10 8Z" fill="#FFC928" ${S}/>` +
    `<path d="M50 56v4M60 56v4M70 56v4M80 56v4M90 56v4M100 56v4M110 56v4" stroke="${K}" stroke-width="2"/>` +
    `<path d="M48 84V64h26v20ZM86 84V64h26v20Z" fill="#BFE6FF" ${S}/>`,
  3:
    `<path d="M50 84V22h44v62Z" fill="#7FB2E8" ${S}/>` +
    `<path d="M94 84V40h22v44Z" fill="#5A8FC8" ${S}/>` +
    windows(56, 30, 3, 5, 12, 10) +
    windows(99, 48, 1, 3, 0, 11) +
    `<path d="M66 84V74h12v10Z" fill="#43464E" ${S}/>`,
  4:
    `<path d="M48 84V20h64v64Z" fill="#FFC928" ${S}/>` +
    `<path d="M44 20h72v-8H44Z" fill="#F2453D" ${S}/>` +
    windows(55, 28, 4, 4, 14, 11) +
    `<path d="M70 84V74q10-8 20 0v10Z" fill="#B07A45" ${S}/>` +
    `<path d="M120 22l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#FFF2B8" ${S}/>` +
    `<path d="M30 30l2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1Z" fill="#FFF2B8" stroke="${K}" stroke-width="2"/>`,
};

export const THUMBS: Record<string, () => string> = Object.fromEntries(
  ([1, 2, 3, 4] as const).map((lvl) => [`lvl-${lvl}`, () => thumbSvg('#CDEBFF', island + BUILDINGS[lvl])]),
);
