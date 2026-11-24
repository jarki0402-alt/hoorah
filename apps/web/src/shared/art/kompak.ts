import type { Fruit } from '@hoorah/protocol';
import { castHead } from './people';
import { svgDoc } from './svg';

/**
 * Key art (640x360) for Kompak Gak?: four fruits at an angkringan counter at night under a
 * striped tarp. Three of them think of the same glass of tea; the fourth pictures a satay
 * skewer and looks worried. The logo sits on the sky at the left (see LOGO_POS in keyart.tsx).
 */
export function kompakSvg(): string {
  const tarp: string[] = [];
  for (let x = 0; x < 640; x += 64) {
    tarp.push(`<rect x="${x}" y="0" width="32" height="40" fill="#E8692E"/>`);
    tarp.push(`<path d="M${x} 38 Q${x + 16} 54 ${x + 32} 38Z" fill="#E8692E"/>`);
    tarp.push(`<path d="M${x + 32} 38 Q${x + 48} 54 ${x + 64} 38Z" fill="#F6E3C6"/>`);
  }
  let bulbs = '';
  let glow = '';
  for (let x0 = -40; x0 < 640; x0 += 170) {
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const x = x0 + 170 * t;
      const y = 50 + 4 * 22 * t * (1 - t);
      bulbs += `M${(x - 4.5).toFixed(1)} ${(y + 6).toFixed(1)}a4.5 5.5 0 1 0 9 0a4.5 5.5 0 1 0 -9 0Z`;
      glow += `M${(x - 13).toFixed(1)} ${(y + 6).toFixed(1)}a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z`;
    }
  }
  let wire = '';
  for (let x0 = -40; x0 < 640; x0 += 170) wire += `M${x0} 50 Q${x0 + 85} 94 ${x0 + 170} 50 `;

  const tea = (x: number, y: number) =>
    `<g transform="translate(${x} ${y})"><path d="M-11 -14 H11 L9 14 H-9Z" fill="#E9EEF2"/><path d="M-10 -5 H10 L9 14 H-9Z" fill="#C8742C"/><path d="M-6 -2 V10" stroke="#E39A55" stroke-width="2.5" stroke-linecap="round"/></g>`;
  const sate = (x: number, y: number) =>
    `<g transform="translate(${x} ${y}) rotate(-30)"><path d="M-20 0 H20" stroke="#D9B98A" stroke-width="2.5" stroke-linecap="round"/><rect x="-14" y="-5" width="8" height="10" rx="2.5" fill="#8A4A1E"/><rect x="-4" y="-5" width="8" height="10" rx="2.5" fill="#8A4A1E"/><rect x="6" y="-5" width="8" height="10" rx="2.5" fill="#8A4A1E"/></g>`;
  const bubble = (cx: number, cy: number, fx: number, fy: number, inner: string, accent: string) =>
    `<g><circle cx="${fx}" cy="${fy}" r="4" fill="#F6E3C6"/><circle cx="${(fx + cx) / 2}" cy="${(fy + cy) / 2 + 10}" r="6" fill="#F6E3C6"/><rect x="${cx - 30}" y="${cy - 26}" width="60" height="52" rx="22" fill="#F6E3C6" stroke="${accent}" stroke-width="4"/>${inner}</g>`;

  const fruits: [Fruit, number, 'happy' | 'wow' | 'effort'][] = [
    ['jeruk', 216, 'wow'],
    ['rambutan', 316, 'happy'],
    ['nanas', 416, 'wow'],
    ['semangka', 516, 'effort'],
  ];
  const heads = fruits
    .map(([f, x, face]) => `<g transform="translate(${x - 36} 196) scale(1.125)">${castHead(f, face)}</g>`)
    .join('');

  let planks = '';
  for (let y = 300; y < 360; y += 22) planks += `M0 ${y}H640`;

  const body = [
    '<rect width="640" height="360" fill="#16202C"/>',
    '<g fill="#FFF2C2" opacity="0.55"><circle cx="40" cy="150" r="1.4"/><circle cx="96" cy="196" r="1.1"/><circle cx="150" cy="128" r="1.6"/><circle cx="592" cy="122" r="1.4"/><circle cx="560" cy="186" r="1.1"/><circle cx="610" cy="232" r="1.3"/><circle cx="30" cy="234" r="1.2"/></g>',
    `<path d="${glow}" fill="#FFC928" opacity="0.12"/>`,
    `<path d="${wire}" fill="none" stroke="#0B1118" stroke-width="2"/>`,
    `<path d="${bulbs}" fill="#FFD866"/>`,
    '<rect width="640" height="40" fill="#F6E3C6"/>',
    tarp.join(''),
    '<rect width="640" height="5" fill="#B8481A"/>',
    bubble(216, 140, 214, 186, tea(216, 140), '#3FC489'),
    bubble(316, 128, 314, 186, tea(316, 128), '#3FC489'),
    bubble(416, 140, 414, 186, tea(416, 140), '#3FC489'),
    bubble(536, 128, 524, 186, sate(536, 128), '#FF8A3D'),
    heads,
    '<rect x="0" y="262" width="640" height="98" fill="#6B4423"/>',
    '<rect x="0" y="262" width="640" height="12" fill="#8A5A2B"/>',
    '<rect x="0" y="274" width="640" height="4" fill="#4E3018"/>',
    `<path d="${planks}" stroke="#58371C" stroke-width="2"/>`,
    '<g transform="translate(40 222)"><path d="M8 40 C2 28 6 12 26 10 C46 12 50 28 44 40Z" fill="#3C4651"/><path d="M42 22 C54 18 60 10 62 4 L66 6 C62 20 56 28 46 32Z" fill="#3C4651"/><path d="M8 20 C-4 20 -4 36 10 36" fill="none" stroke="#3C4651" stroke-width="5"/><rect x="18" y="3" width="16" height="8" rx="3" fill="#2B333C"/></g>',
    '<g transform="translate(212 244)"><path d="M-9 -12 H9 L8 18 H-8Z" fill="#E9EEF2" opacity="0.5"/><path d="M-8.4 -2 H8.4 L8 18 H-8Z" fill="#C8742C"/></g>',
    '<g transform="translate(412 244)"><path d="M-9 -12 H9 L8 18 H-8Z" fill="#E9EEF2" opacity="0.5"/><path d="M-8.4 -2 H8.4 L8 18 H-8Z" fill="#C8742C"/></g>',
  ].join('');
  return svgDoc(640, 360, body);
}
