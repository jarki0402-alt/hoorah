/**
 * Phone theme for Satu Tali: the dusk cliffs. A warm sky with a low sun sits behind the header,
 * a yellow rope with knots hangs under the Host strip, and rock ledges with a flag line the bottom
 * edge, the team's rope sagging between them, so the joystick sits on open sky.
 */
import type { ControllerTheme } from '../../controller/themes';
import { f1 } from '../../shared/art/svg';

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"/>`;

/** A rock ledge block with a lighter top. */
function ledge(x: number, y: number, w: number, h: number): string {
  return r(x, y, w, h, '#B4663E') + r(x, y, w, 7, '#E39A6B') + r(x, y + h - 8, w, 8, '#8C4F33');
}

function taliScene(w: number, h: number): string {
  const land = w > h;
  const out: string[] = [];
  out.push(r(0, 0, w, h, '#FFB98A'));
  out.push(r(0, h * 0.55, w, h * 0.45, '#FFC9A3'));
  out.push(
    `<circle cx="${f1(w * 0.78)}" cy="${f1(h * (land ? 0.3 : 0.2))}" r="${f1(Math.min(w, h) * 0.09)}" fill="#FFE2A8"/>`,
  );
  // Far mesas.
  out.push(
    r(w * 0.05, h * 0.62, w * 0.12, h * 0.38, '#E9A57B'),
    r(w * 0.6, h * 0.58, w * 0.16, h * 0.42, '#E9A57B'),
  );
  const base = h - Math.max(34, h * (land ? 0.13 : 0.09));
  const lw = Math.min(150, w * 0.3);
  out.push(ledge(-6, base, lw, h - base + 6));
  out.push(ledge(w - lw + 6, base - 18, lw, h - base + 24));
  // The team's rope sagging across the gap, with a knot in the middle.
  const x1 = lw - 14;
  const x2 = w - lw + 20;
  const mid = (x1 + x2) / 2;
  const sag = base + Math.min(40, h * 0.05);
  out.push(
    `<path d="M${f1(x1)} ${f1(base - 4)}Q${f1(mid)} ${f1(sag)} ${f1(x2)} ${f1(base - 22)}" fill="none" stroke="#111214" stroke-width="7" stroke-linecap="round"/>`,
    `<path d="M${f1(x1)} ${f1(base - 4)}Q${f1(mid)} ${f1(sag)} ${f1(x2)} ${f1(base - 22)}" fill="none" stroke="#FFC928" stroke-width="4" stroke-linecap="round"/>`,
  );
  // Flag on the far ledge.
  const fx = w - 34;
  const fy = base - 18;
  out.push(
    r(fx, fy - 46, 4, 46, '#FFF7F0'),
    `<path d="M${f1(fx + 4)} ${f1(fy - 46)}h24l-6 8 6 8h-24Z" fill="#FF5A1F"/>`,
  );
  return out.join('');
}

export const taliTheme: ControllerTheme = {
  chrome: '#C9794B',
  scene: taliScene,
  // A yellow rope with knots under the Host strip.
  stripEdge: {
    w: 40,
    h: 10,
    body:
      '<rect x="0" y="3" width="40" height="4" rx="2" fill="#FFC928"/>' +
      '<rect x="16" y="1" width="8" height="8" rx="3" fill="#E0A800"/>',
  },
};
