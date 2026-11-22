/**
 * Bom Oper arena pictures (160×120), inked comic style: a black bomb with a lit fuse over each
 * yard. Halaman Rumah: grass, a tree and a well; Pasar Kaget: striped stall roofs and crates;
 * Atap Gedung: a rooftop with a blue water tank and city blocks behind.
 */
import { thumbSvg } from './frame';

const INK = '#111214';

/** The bomb with its spark, centred at (x, y). */
function bomb(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="13" fill="#22242A" stroke="${INK}" stroke-width="2"/><circle cx="${x - 4}" cy="${y - 5}" r="3" fill="#FFFFFF"/><rect x="${x - 3}" y="${y - 17}" width="7" height="5" fill="#8B8F99" stroke="${INK}" stroke-width="1.5"/><path d="M${x + 1} ${y - 17}q4 -7 9 -6" fill="none" stroke="#E9D2A6" stroke-width="2.5"/><path d="M${x + 10} ${y - 30}l2 5 5-2-3 5 5 3-6 1 1 6-4-4-4 4 1-6-6-1 5-3-3-5 5 2Z" fill="#FFC928" stroke="${INK}" stroke-width="1.2"/>`;
}

/** A tiny runner in a shirt colour, feet at (x, y). */
function runner(x: number, y: number, head: string, shirt: string): string {
  return `<g transform="translate(${x} ${y})"><rect x="-4" y="-9" width="3" height="9" fill="#2B2F38"/><rect x="1" y="-9" width="3" height="9" fill="#2B2F38"/><rect x="-5" y="-19" width="10" height="11" rx="2" fill="${shirt}" stroke="${INK}" stroke-width="1.3"/><rect x="-6" y="-31" width="12" height="12" rx="2.5" fill="${head}" stroke="${INK}" stroke-width="1.3"/></g>`;
}

function halaman(): string {
  return thumbSvg(
    '#9FD9FF',
    [
      `<rect y="62" width="160" height="58" fill="#7CC86A" stroke="${INK}" stroke-width="2"/>`,
      '<path d="M0 62h160" stroke="#FFF7F0" stroke-width="6" stroke-dasharray="6 4"/>',
      `<rect x="18" y="56" width="8" height="26" fill="#9A6B45" stroke="${INK}" stroke-width="1.5"/><rect x="6" y="34" width="32" height="24" rx="4" fill="#22B35E" stroke="${INK}" stroke-width="2"/>`,
      `<rect x="112" y="84" width="30" height="16" fill="#B9B2A6" stroke="${INK}" stroke-width="2"/><rect x="108" y="80" width="38" height="6" fill="#8B8F99" stroke="${INK}" stroke-width="1.5"/>`,
      runner(60, 104, '#FF8A3D', '#2F8CFF'),
      runner(96, 98, '#22B35E', '#F2453D'),
      bomb(78, 46),
    ].join(''),
  );
}

function pasar(): string {
  let stripes = '';
  for (let i = 0; i < 8; i++)
    stripes += `<rect x="${10 + i * 18}" y="34" width="9" height="12" fill="#F2453D"/>`;
  return thumbSvg(
    '#FFE2A8',
    [
      `<rect y="70" width="160" height="50" fill="#D9CBB4" stroke="${INK}" stroke-width="2"/>`,
      `<rect x="10" y="34" width="144" height="12" fill="#FFF7F0" stroke="${INK}" stroke-width="2"/>${stripes}`,
      `<rect x="16" y="46" width="3" height="28" fill="#FFF7F0"/><rect x="145" y="46" width="3" height="28" fill="#FFF7F0"/>`,
      `<rect x="20" y="60" width="124" height="16" fill="#C98A4E" stroke="${INK}" stroke-width="2"/>`,
      `<rect x="28" y="54" width="12" height="7" fill="#FFC928"/><rect x="50" y="54" width="12" height="7" fill="#22B35E"/><rect x="104" y="54" width="12" height="7" fill="#FF8A3D"/>`,
      `<rect x="122" y="92" width="20" height="18" fill="#B97A4A" stroke="${INK}" stroke-width="2"/>`,
      runner(50, 110, '#FFC928', '#FF5C9A'),
      runner(92, 106, '#F2453D', '#22B35E'),
      bomb(80, 22),
    ].join(''),
  );
}

function atap(): string {
  return thumbSvg(
    '#BFE0FF',
    [
      '<rect x="0" y="30" width="26" height="40" fill="#D9DEE5"/><rect x="128" y="22" width="32" height="48" fill="#C4CCD6"/><rect x="34" y="40" width="20" height="30" fill="#C4CCD6"/>',
      `<rect y="68" width="160" height="52" fill="#B7BCC4" stroke="${INK}" stroke-width="2"/>`,
      `<rect y="64" width="160" height="6" fill="#E9E2D6" stroke="${INK}" stroke-width="1.5"/>`,
      `<rect x="110" y="62" width="30" height="34" rx="4" fill="#2F8CFF" stroke="${INK}" stroke-width="2"/><rect x="118" y="57" width="14" height="6" fill="#FFF7F0" stroke="${INK}" stroke-width="1.5"/>`,
      `<rect x="16" y="88" width="24" height="16" fill="#F4F4F4" stroke="${INK}" stroke-width="2"/><circle cx="28" cy="96" r="5" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
      runner(62, 108, '#FF8A3D', '#14B8A6'),
      runner(90, 112, '#FFC928', '#2F8CFF'),
      bomb(76, 40),
    ].join(''),
  );
}

export const THUMBS: Record<string, () => string> = { halaman, pasar, atap };
