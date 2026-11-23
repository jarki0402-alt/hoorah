/**
 * The little phone beside a tutorial step: the control to use, drawn and animated (a pushed
 * joystick, a pressed button, a swiping finger, a picked choice...). Landscape, like most games.
 */
import type { PhoneHint } from '../../shared/tutorial/types';

const VW = 300;
const VH = 160;
const YELLOW = '#FFC928';
const TEXT = '#FFFFFF';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function text(s: string, x: number, y: number, size = 14, color = TEXT, anchor = 'middle'): string {
  return `<text x="${x}" y="${y}" font-family="'Baloo 2', sans-serif" font-size="${size}" font-weight="800" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
}

const DIR: Record<'left' | 'right' | 'up' | 'down', [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

function stick(dir: 'left' | 'right' | 'up' | 'down' | 'any', button?: string): string {
  const cx = 78;
  const cy = 92;
  const knob = `<circle cx="${cx}" cy="${cy}" r="17" fill="${YELLOW}"/>`;
  const moving =
    dir === 'any'
      ? `<g class="tu-orbit" style="transform-origin:${cx}px ${cy}px">${`<circle cx="${cx + 22}" cy="${cy}" r="17" fill="${YELLOW}"/>`}</g>`
      : `<g class="tu-move" style="--dx:${DIR[dir][0] * 22}px;--dy:${DIR[dir][1] * 22}px;--dur:1.6s;--delay:0s">${knob}</g>`;
  const btn = button ? `<circle cx="232" cy="96" r="28" fill="#2B2D33"/>${text(button, 232, 101, 12)}` : '';
  return `<circle cx="${cx}" cy="${cy}" r="40" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>${moving}${btn}`;
}

function buttons(labels: readonly string[], press: number): string {
  const n = labels.length;
  const gap = Math.min(86, 240 / n);
  const x0 = VW / 2 - ((n - 1) * gap) / 2;
  return labels
    .map((l, i) => {
      const x = x0 + i * gap;
      const r = Math.min(34, gap / 2 - 4);
      const on = i === press;
      const body = `<circle cx="${x}" cy="88" r="${r}" fill="${on ? YELLOW : '#2B2D33'}"/>${text(l, x, 93, l.length > 7 ? 10 : 12, on ? '#111214' : TEXT)}`;
      return on
        ? `<g class="tu-press" style="transform-origin:${x}px 88px">${body}</g><g class="tu-tap" style="transform-origin:${x}px 88px;--delay:0s"><circle cx="${x}" cy="88" r="${r + 6}" fill="none" stroke="#fff" stroke-width="3"/></g>`
        : body;
    })
    .join('');
}

function tapBig(label: string, hold: boolean): string {
  const body = `<circle cx="${VW / 2}" cy="88" r="44" fill="${YELLOW}"/>${text(label, VW / 2, 94, label.length > 8 ? 12 : 15, '#111214')}`;
  return hold
    ? `${body}<circle class="tu-hold" cx="${VW / 2}" cy="88" r="52" fill="none" stroke="#fff" stroke-width="4" pathLength="100" stroke-dasharray="100 100"/>`
    : `<g class="tu-press fast" style="transform-origin:${VW / 2}px 88px">${body}</g><g class="tu-tap" style="transform-origin:${VW / 2}px 88px;--delay:0s"><circle cx="${VW / 2}" cy="88" r="50" fill="none" stroke="#fff" stroke-width="3"/></g>`;
}

function swipe(dir: 'left' | 'right' | 'up' | 'down'): string {
  const [dx, dy] = DIR[dir];
  const cx = VW / 2;
  const cy = 88;
  const fx = cx - dx * 60;
  const fy = cy - dy * 34;
  return `<path d="M${cx - dx * 70} ${cy - dy * 40} L${cx + dx * 70} ${cy + dy * 40}" stroke="rgba(255,255,255,0.25)" stroke-width="6" stroke-linecap="round" stroke-dasharray="10 10"/><g class="tu-slide" style="--dx:${dx * 120}px;--dy:${dy * 68}px;--dur:1.4s;--delay:0s"><circle cx="${fx}" cy="${fy}" r="16" fill="${YELLOW}"/><circle cx="${fx}" cy="${fy}" r="24" fill="none" stroke="#fff" stroke-width="3" opacity="0.6"/></g>`;
}

function choice(options: readonly string[], pick: number): string {
  const n = Math.min(4, options.length);
  const cols = Math.min(n, 2);
  const rows = Math.ceil(n / cols);
  const w = cols === 1 ? 220 : 124;
  const h = rows === 1 ? 62 : 46;
  return options
    .slice(0, 4)
    .map((o, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = VW / 2 - (cols * w + (cols - 1) * 10) / 2 + c * (w + 10);
      const y = (rows === 1 ? 58 : 36) + r * (h + 10);
      const on = i === pick;
      const tile = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${on ? YELLOW : '#2B2D33'}"/>${text(o, x + w / 2, y + h / 2 + 5, o.length > 12 ? 11 : 13, on ? '#111214' : TEXT)}`;
      return on
        ? `<g class="tu-press" style="transform-origin:${x + w / 2}px ${y + h / 2}px">${tile}</g>`
        : tile;
    })
    .join('');
}

function dpad(dir: 'left' | 'right' | 'up' | 'down'): string {
  const cx = VW / 2;
  const cy = 88;
  const s = 30;
  const keys: ['left' | 'right' | 'up' | 'down', number, number, string][] = [
    ['up', cx, cy - s, 'M0 -9 L9 6 L-9 6Z'],
    ['down', cx, cy + s, 'M0 9 L9 -6 L-9 -6Z'],
    ['left', cx - s, cy, 'M-9 0 L6 -9 L6 9Z'],
    ['right', cx + s, cy, 'M9 0 L-6 -9 L-6 9Z'],
  ];
  return keys
    .map(([d, x, y, tri]) => {
      const on = d === dir;
      const key = `<rect x="${x - 26}" y="${y - 26}" width="52" height="52" rx="10" fill="${on ? YELLOW : '#2B2D33'}"/><path transform="translate(${x} ${y})" d="${tri}" fill="${on ? '#111214' : '#fff'}"/>`;
      return on ? `<g class="tu-press" style="transform-origin:${x}px ${y}px">${key}</g>` : key;
    })
    .join('');
}

function typing(s: string): string {
  const keys = Array.from(
    { length: 10 },
    (_, i) => `<rect x="${32 + i * 24}" y="104" width="20" height="18" rx="4" fill="#2B2D33"/>`,
  ).join('');
  const keys2 = Array.from(
    { length: 9 },
    (_, i) => `<rect x="${44 + i * 24}" y="126" width="20" height="18" rx="4" fill="#2B2D33"/>`,
  ).join('');
  return `<rect x="40" y="44" width="220" height="44" rx="10" fill="#fff"/>${text(s, 56, 73, 18, '#111214', 'start')}<rect class="tu-caret" x="${60 + s.length * 10}" y="54" width="3" height="24" fill="#111214"/>${keys}${keys2}<g class="tu-tap" style="transform-origin:140px 112px;--delay:0s"><circle cx="140" cy="112" r="12" fill="none" stroke="${YELLOW}" stroke-width="3"/></g>`;
}

function board(s: string): string {
  let cells = '';
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      cells += `<rect x="${24 + c * 28}" y="${24 + r * 28}" width="28" height="28" fill="${(r + c) % 2 ? '#8B5A2B' : '#E9CF8E'}"/>`;
  return `${cells}<rect x="80" y="80" width="28" height="28" fill="${YELLOW}"/><g class="tu-tap" style="transform-origin:94px 94px;--delay:0s"><circle cx="94" cy="94" r="16" fill="none" stroke="#fff" stroke-width="3"/></g>${text(s, 214, 86, s.length > 14 ? 11 : 13)}`;
}

function look(s: string): string {
  return `<g class="tu-bob" style="--dur:2s;--delay:0s"><ellipse cx="${VW / 2}" cy="70" rx="38" ry="22" fill="#fff"/><circle cx="${VW / 2}" cy="70" r="13" fill="#111214"/></g>${text(s, VW / 2, 122, s.length > 24 ? 12 : 15)}`;
}

function body(p: PhoneHint): string {
  switch (p.kind) {
    case 'stick':
      return stick(p.dir, p.button);
    case 'buttons':
      return buttons(p.labels, p.press);
    case 'tap':
      return tapBig(p.label, p.hold === true);
    case 'swipe':
      return swipe(p.dir);
    case 'choice':
      return choice(p.options, p.pick);
    case 'dpad':
      return dpad(p.dir);
    case 'type':
      return typing(p.text);
    case 'board':
      return board(p.text);
    case 'look':
      return look(p.text);
  }
}

export function PhoneMock({ hint }: { hint: PhoneHint }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 ${VW + 28} ${VH + 28}"><rect x="-12" y="-12" width="${VW + 24}" height="${VH + 24}" rx="26" fill="#0B0C0E" stroke="#3A3D45" stroke-width="3"/><rect x="0" y="0" width="${VW}" height="${VH}" rx="16" fill="#17181C"/>${body(hint)}</svg>`;
  // Markup built here from typed hint data (labels escaped).
  return <div class="tu-phone" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
