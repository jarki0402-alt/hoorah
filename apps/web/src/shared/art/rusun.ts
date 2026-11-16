import { circ, f1, rect, svgDoc } from './svg';

/** Rusun (vertical housing) art: generated floors, background city, crane. 1280x720 world units. */

export const RUSUN = {
  floorHeight: 50,
  wallHeight: 44,
  /** Extra width either side of a floor's wall for the slab overhang. */
  pad: 6,
  walls: ['#F4E1C1', '#FFD6A5', '#CDE7F0', '#E4F1D4'],
  shades: ['#DCC6A3', '#E8B985', '#A9CDDB', '#C5DDB0'],
} as const;

type Layer = Record<string, string>;

const FILLS: [key: string, attrs: string][] = [
  ['wall', ''],
  ['shade', ''],
  ['topShadow', 'fill="#111214" opacity="0.14"'],
  ['stain', 'fill="#111214" opacity="0.08"'],
  ['pipe', 'fill="#9AA0A6"'],
  ['shut', 'fill="#2DA39A"'],
  ['shutLine', 'fill="none" stroke="#1C7C74" stroke-width="1"'],
  ['frame', 'fill="#2B3A55"'],
  ['glass', 'fill="#8EC9E8"'],
  ['curtR', 'fill="#F2453D"'],
  ['curtY', 'fill="#FFC928"'],
  ['headO', 'fill="#FF9A1F"'],
  ['leaf', 'fill="#2E9E4F"'],
  ['eyes', 'fill="#111214"'],
  ['glare', 'fill="#FFFFFF" opacity="0.55"'],
  ['mull', 'fill="#2B3A55"'],
  ['sill', 'fill="#EDE3D3"'],
  ['awnR', 'fill="#E8352E"'],
  ['awnW', 'fill="#FFFFFF"'],
  ['roll', 'fill="#A8ADB4"'],
  ['rollLine', 'fill="none" stroke="#878C93" stroke-width="1.2"'],
  ['door', 'fill="#7A4A1E"'],
  ['disp', 'fill="#BFE6FF"'],
  ['rope', 'fill="none" stroke="#5A4A3C" stroke-width="1"'],
  ['cr', 'fill="#F2453D"'],
  ['cy', 'fill="#FFC928"'],
  ['cb', 'fill="#2F8CFF"'],
  ['cw', 'fill="#FFFFFF" stroke="#C9CCD1" stroke-width="0.6"'],
  ['rail', 'fill="#3C3E44"'],
  ['pot', 'fill="#B5532A"'],
  ['plant', 'fill="#2E9E4F"'],
  ['plant2', 'fill="#4FAE52"'],
  ['ac', 'fill="#E9EAEC" stroke="#9AA0A6" stroke-width="1"'],
  ['acLine', 'fill="none" stroke="#9AA0A6" stroke-width="1"'],
  ['slab', 'fill="#6B5B4B"'],
  ['slabHi', 'fill="#8A7865"'],
  ['wBody', 'fill="#2F8CFF" stroke="#111214" stroke-width="1"'],
  ['wHead', 'fill="#FF9A1F" stroke="#111214" stroke-width="1"'],
  ['wHelmet', 'fill="#FFC928" stroke="#111214" stroke-width="1"'],
  ['wEyes', 'fill="#111214"'],
];

function floorLayers(fw: number, i: number, workers: boolean): Layer {
  const o: Layer = {};
  for (const [k] of FILLS) o[k] = '';
  const X = RUSUN.pad;
  const WH = RUSUN.wallHeight;
  const inner = fw * 0.84;
  o.wall = rect(X, 0, fw, WH);
  o.shade = rect(X + inner, 0, fw - inner, WH);
  o.topShadow = rect(X, 0, fw, 4);
  o.stain = rect(X + fw * 0.22, 38, 12, 3) + rect(X + fw * 0.64, 5, 7, 2) + rect(X + fw * 0.45, 40, 6, 2);
  o.pipe =
    rect(X + fw * 0.9, 0, 3.5, WH) +
    rect(X + fw * 0.9 - 1.5, 12, 6.5, 2) +
    rect(X + fw * 0.9 - 1.5, 32, 6.5, 2);
  if (i === 0) {
    for (let s = X, n = 0; s < X + inner - 2; s += 14, n++) {
      const sw = Math.min(14, X + inner - s);
      const piece = `${rect(s, 4, sw, 8)}M${f1(s)} 12a${f1(sw / 2)} 4 0 0 0 ${f1(sw)} 0Z `;
      if (n % 2) o.awnW += piece;
      else o.awnR += piece;
    }
    const rx = X + fw * 0.06;
    const rw = fw * 0.42;
    o.roll = rect(rx, 17, rw, 27);
    for (let y = 20; y < 44; y += 3) o.rollLine += `M${f1(rx)} ${y}h${f1(rw)} `;
    o.door = rect(X + fw * 0.54, 17, 22, 27) + circ(X + fw * 0.54 + 18, 31, 1.4);
    o.frame = rect(X + fw * 0.64 - 2, 16, fw * 0.17 + 4, 20);
    o.disp = rect(X + fw * 0.64, 18, fw * 0.17, 16);
  } else {
    const n = Math.max(2, Math.floor((inner - 10) / 40));
    const gap = (inner - 10) / n;
    for (let k = 0; k < n; k++) {
      const wx = X + 6 + k * gap + (gap - 22) / 2;
      const wy = 7;
      if ((i * 3 + k) % 5 === 2) {
        o.shut += rect(wx - 9, wy - 1, 7, 24) + rect(wx + 24, wy - 1, 7, 24);
        for (let j = 0; j < 5; j++)
          o.shutLine += `M${f1(wx - 9)} ${f1(wy + 3 + j * 4)}h7 M${f1(wx + 24)} ${f1(wy + 3 + j * 4)}h7 `;
      }
      o.frame += rect(wx - 1.5, wy - 1.5, 25, 25);
      o.glass += rect(wx + 0.5, wy + 0.5, 21, 21);
      if ((i + k) % 4 === 1) o.curtR += rect(wx + 0.5, wy + 0.5, 8, 21);
      if ((i + k) % 4 === 3) o.curtY += rect(wx + 12.5, wy + 0.5, 8.5, 21);
      if ((i % 3 === 2 && k === 1) || (i % 5 === 0 && k === 0)) {
        const cx = wx + 11;
        const cy = wy + 15;
        o.headO += circ(cx, cy, 6.5);
        o.leaf += `M${f1(cx + 1)} ${f1(cy - 6)}q3 -5 7 -3q-3 4 -7 3Z `;
        o.eyes += circ(cx - 2.4, cy - 0.5, 1.1) + circ(cx + 2.4, cy - 0.5, 1.1);
      }
      o.glare += `M${f1(wx + 3)} ${f1(wy + 16)}L${f1(wx + 12)} ${f1(wy + 3)}L${f1(wx + 16)} ${f1(wy + 3)}L${f1(wx + 7)} ${f1(wy + 16)}Z `;
      o.mull += rect(wx + 10.3, wy, 1.4, 22);
      o.sill += rect(wx - 3, wy + 23, 28, 3);
    }
    if (i % 2 === 0) {
      o.rail += rect(X + 2, 33, inner - 4, 2.2);
      for (let x = X + 4; x < X + inner - 2; x += 6) o.rail += rect(x, 35, 1.4, 9);
      o.pot += rect(X + 8, 38, 9, 6) + rect(X + inner - 18, 38, 9, 6);
      o.plant += circ(X + 12.5, 34, 5) + circ(X + inner - 13.5, 34, 5);
      o.plant2 +=
        circ(X + 9, 36, 3.4) +
        circ(X + 16, 35, 3.4) +
        circ(X + inner - 17, 36, 3.4) +
        circ(X + inner - 10, 35, 3.4);
    } else {
      o.rope += `M${f1(X + 6)} 33H${f1(X + inner - 4)} `;
      const cols = ['cr', 'cy', 'cb', 'cw'];
      for (let p = 0, px = X + 12; px < X + inner - 16; px += 17, p++) {
        o[cols[p % 4]!] += `M${f1(px)} 33h8l3 3l-2 2l-1 -1v6h-8v-6l-1 1l-2 -2Z `;
      }
    }
    if (i % 3 === 1) {
      const ax = X + inner - 30;
      o.ac += rect(ax, 31, 18, 11);
      o.acLine += `M${f1(ax + 3)} 34h12 M${f1(ax + 3)} 36.5h12 M${f1(ax + 3)} 39h12 `;
    }
  }
  o.slab = rect(0, WH, fw + RUSUN.pad * 2, 6);
  o.slabHi = rect(0, WH, fw + RUSUN.pad * 2, 1.6);
  if (workers) {
    for (const wxp of [fw * 0.3, fw * 0.62]) {
      const cx = X + wxp;
      o.wBody += rect(cx - 6, -16, 12, 16);
      o.wHead += circ(cx, -23, 7);
      o.wHelmet += `M${f1(cx - 8)} -26a8 8 0 0 1 16 0Z `;
      o.wEyes += circ(cx - 2.5, -22, 1.1) + circ(cx + 2.5, -22, 1.1);
    }
  }
  return o;
}

/** Floor markup in local coords: x from 0 to fw + 2*pad, y from 0 (top) to 50 (bottom of slab). */
export function floorMarkup(fw: number, i: number, workers = false): string {
  const o = floorLayers(fw, i, workers);
  const wall = RUSUN.walls[i % 4]!;
  const shade = RUSUN.shades[i % 4]!;
  let out = '';
  for (const [k, attrs] of FILLS) {
    const d = o[k];
    if (!d) continue;
    const a = k === 'wall' ? `fill="${wall}"` : k === 'shade' ? `fill="${shade}"` : attrs;
    out += `<path d="${d}" ${a}/>`;
  }
  if (i === 0) {
    out += `<text x="${f1(RUSUN.pad + fw * 0.27)}" y="35" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="9" fill="#2B3A55">WARUNG SEMBAKO</text>`;
  }
  return out;
}

/** A standalone floor image. Height includes headroom for workers riding on top. */
export function floorSvg(fw: number, i: number, workers = false): string {
  const head = workers ? 32 : 0;
  const w = fw + RUSUN.pad * 2;
  return svgDoc(
    w,
    RUSUN.floorHeight + head,
    floorMarkup(fw, i, workers),
    `0 ${-head} ${w} ${RUSUN.floorHeight + head}`,
  );
}

export const floorWidth = (i: number): number => Math.max(150, 400 - 18 * i);

/** Sky, volcano, clouds, city, palms, kampung houses, street and bakso cart. 1280x720. */
export function rusunBackgroundMarkup(): string {
  const bld: [number, number, number][] = [
    [40, 470, 70],
    [118, 446, 54],
    [180, 500, 80],
    [960, 480, 64],
    [1032, 440, 60],
    [1100, 490, 90],
    [1196, 456, 84],
  ];
  let cityBld = '';
  let cityWin = '';
  for (const [x, y, bw] of bld) {
    cityBld += rect(x, y, bw, 620 - y);
    for (let yy = y + 10; yy < 600; yy += 18)
      for (let xx = x + 8; xx < x + bw - 8; xx += 14) cityWin += rect(xx, yy, 6, 8);
  }
  const houses: [number, number, number][] = [
    [0, 616, 110],
    [96, 630, 120],
    [210, 622, 90],
    [840, 626, 110],
    [940, 614, 130],
    [1060, 630, 100],
    [1150, 620, 130],
  ];
  let hw = '';
  let hs = '';
  let hwin = '';
  let roof = '';
  let roofLine = '';
  for (const [x, y, w] of houses) {
    hw += rect(x, y, w, 676 - y);
    hs += rect(x + w * 0.8, y, w * 0.2, 676 - y);
    hwin += rect(x + w * 0.2, y + 14, 14, 14) + rect(x + w * 0.52, y + 14, 14, 14);
    roof += `M${x - 8} ${y} L${x + w / 2} ${y - 34} L${x + w + 8} ${y}Z `;
    for (let k = 1; k < 4; k++)
      roofLine += `M${f1(x - 8 + k * 6)} ${f1(y - k * 8)} H${f1(x + w + 8 - k * 6)} `;
  }
  const cloud = (cx: number, cy: number, s: number) =>
    `<g transform="translate(${cx} ${cy}) scale(${s})"><g fill="#D3EAF7" transform="translate(0 10)"><circle cx="-70" cy="10" r="36"/><circle cx="-18" cy="-10" r="48"/><circle cx="42" cy="0" r="40"/><circle cx="92" cy="16" r="28"/><rect x="-100" y="8" width="214" height="36" rx="18"/></g><g fill="#fff"><circle cx="-70" cy="10" r="36"/><circle cx="-18" cy="-10" r="48"/><circle cx="42" cy="0" r="40"/><circle cx="92" cy="16" r="28"/><rect x="-100" y="8" width="214" height="30" rx="15"/></g></g>`;
  return [
    '<rect width="1280" height="720" fill="#AEE0F7"/><rect width="1280" height="420" fill="#92D2F5"/><rect width="1280" height="250" fill="#79C6F2"/>',
    '<circle cx="1090" cy="150" r="70" fill="#FFF2C2" opacity="0.6"/><circle cx="1090" cy="150" r="46" fill="#FFE38A"/>',
    '<path d="M-60 580 L226 300 Q262 274 300 300 L580 580Z" fill="#9CC3DD"/><path d="M218 308 Q262 282 308 308 L296 318 Q262 300 230 318Z" fill="#7FA9C6"/>',
    '<g fill="#E9F3F9"><circle cx="266" cy="270" r="13"/><circle cx="282" cy="250" r="17"/><circle cx="304" cy="228" r="21"/><circle cx="330" cy="206" r="16"/></g>',
    '<path d="M860 580 L1110 360 Q1146 336 1180 362 L1420 580Z" fill="#A8CCE2"/>',
    cloud(270, 160, 1),
    cloud(1000, 252, 0.62),
    '<path d="M120 90 l8 6 l8 -6 M148 110 l6 5 l6 -5 M1000 60 l7 5 l7 -5" fill="none" stroke="#2B3A55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    `<path d="${cityBld}" fill="#7FB3CF"/><path d="${cityWin}" fill="#C9E7F6"/>`,
    '<path d="M150 676 C146 620 158 560 176 520" fill="none" stroke="#8A5A2B" stroke-width="10" stroke-linecap="round"/>',
    '<g fill="#2E9E4F"><path d="M176 520 C150 500 120 504 100 520 C126 512 150 514 176 522Z"/><path d="M176 520 C196 494 228 492 250 506 C224 502 200 508 176 522Z"/><path d="M176 520 C170 490 180 470 196 460 C188 482 184 500 178 522Z"/><path d="M176 520 C150 530 136 556 136 576 C146 552 160 536 178 524Z"/></g>',
    '<path d="M1140 676 C1144 620 1132 566 1116 530" fill="none" stroke="#8A5A2B" stroke-width="10" stroke-linecap="round"/>',
    '<g fill="#3E9A45"><path d="M1116 530 C1090 512 1060 514 1042 530 C1066 522 1090 524 1116 532Z"/><path d="M1116 530 C1136 504 1168 502 1190 516 C1164 512 1140 518 1116 532Z"/><path d="M1116 530 C1112 500 1122 480 1138 470 C1130 492 1126 510 1118 532Z"/><path d="M1116 530 C1140 542 1152 566 1152 586 C1142 562 1130 548 1114 534Z"/></g>',
    `<path d="${hw}" fill="#F4E1C1"/><path d="${hs}" fill="#DCC6A3"/><path d="${hwin}" fill="#2B3A55"/><path d="${roof}" fill="#D9622B"/><path d="${roofLine}" fill="none" stroke="#B84E1F" stroke-width="2"/>`,
    '<rect x="0" y="676" width="1280" height="12" fill="#C9CCD1"/><rect x="0" y="688" width="1280" height="32" fill="#6B6F78"/>',
    '<path d="M20 704 h40 M120 704 h40 M220 704 h40 M320 704 h40 M920 704 h40 M1020 704 h40 M1120 704 h40 M1220 704 h40" stroke="#fff" stroke-width="3"/>',
    '<path d="M292 614 Q330 584 368 614Z" fill="#F2453D"/><path d="M311 600 Q330 590 349 600 L349 614 L311 614Z" fill="#fff" opacity="0.9"/><path d="M330 614 V636" stroke="#5A4A3C" stroke-width="2.5"/>',
    '<rect x="298" y="636" width="72" height="30" rx="3" fill="#2F8CFF"/><rect x="304" y="640" width="36" height="12" fill="#BFE6FF"/>',
    '<text x="334" y="662" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="10" fill="#fff">BAKSO</text>',
    '<circle cx="312" cy="670" r="8" fill="#111214"/><circle cx="312" cy="670" r="3" fill="#9AA0A6"/><path d="M370 646 h14" stroke="#5A4A3C" stroke-width="3" stroke-linecap="round"/>',
  ].join('');
}

/** Crane jib across the top with counterweight. Trolley sits at `trolleyX`. */
export function craneMarkup(trolleyX = 760): string {
  let jib = '';
  for (let x = 240; x < 1180; x += 22) jib += `M${x} 22 L${x + 11} 38 L${x + 22} 22 `;
  return [
    '<path d="M240 16 H1180 V22 H240Z M240 38 H1180 V44 H240Z" fill="#E6AE10"/>',
    `<path d="${jib}" fill="none" stroke="#E6AE10" stroke-width="4"/>`,
    '<path d="M240 16 H1180 V44 H240Z" fill="none" stroke="#111214" stroke-width="2.5"/>',
    '<rect x="246" y="44" width="70" height="30" fill="#9AA0A6" stroke="#111214" stroke-width="2"/><path d="M256 52 h50 M256 60 h50 M256 68 h50" stroke="#7D8288" stroke-width="2"/>',
    `<rect x="${trolleyX - 16}" y="44" width="34" height="14" rx="2" fill="#2B3A55"/>`,
  ].join('');
}

/** Full key-art scene: 10 floors and a swinging 11th with workers. 1280x720. */
export function rusunSceneSvg(): string {
  const H = RUSUN.floorHeight;
  const offs = [0, 5, -3, 8, 2, -6, 10, 4, -8, 12];
  let floors = '';
  for (let i = 0; i < 10; i++) {
    const fw = floorWidth(i);
    const x = 640 - fw / 2 - RUSUN.pad + (offs[i] ?? 0);
    const y = 680 - (i + 1) * H;
    floors += `<g transform="translate(${f1(x)} ${y})">${floorMarkup(fw, i)}</g>`;
  }
  const sw = 220;
  const swing = `<g transform="translate(760 146) rotate(6) translate(${-(sw / 2 + RUSUN.pad)} -50)">${floorMarkup(sw, 10, true)}</g>`;
  const cables =
    '<path d="M761 58 V70 M765 76 L656 84 M765 76 L874 106" fill="none" stroke="#111214" stroke-width="2.5"/><path d="M754 66 h22 v12 h-22Z" fill="#FFC928" stroke="#111214" stroke-width="2"/>';
  return svgDoc(1280, 720, rusunBackgroundMarkup() + craneMarkup() + cables + floors + swing);
}
