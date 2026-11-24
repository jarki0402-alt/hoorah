import { castHead } from './people';
import { svgDoc } from './svg';

const KAWUNG = (id: string, size: number, color: string) => {
  const q = size / 4;
  const h = size / 2;
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><g fill="${color}"><ellipse cx="${h}" cy="${q * 0.8}" rx="${q * 0.6}" ry="${q}"/><ellipse cx="${h}" cy="${size - q * 0.8}" rx="${q * 0.6}" ry="${q}"/><ellipse cx="${q * 0.8}" cy="${h}" rx="${q}" ry="${q * 0.6}"/><ellipse cx="${size - q * 0.8}" cy="${h}" rx="${q}" ry="${q * 0.6}"/></g></pattern>`;
};

/** Key art (640x360): stage, LED board with a big question mark, three contestants on podiums. */
export function kuisKeyArtSvg(): string {
  let valance = 'M0 0 H640 V22 ';
  for (let x = 640; x > 0; x -= 40) valance += `Q${x - 20} 40 ${x - 40} 22 `;
  let bulbs = '';
  const dot = (x: number, y: number) => `M${x - 3.2} ${y} a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0Z `;
  for (let x = 180; x <= 460; x += 20) bulbs += dot(x, 46) + dot(x, 212);
  for (let y = 66; y <= 192; y += 21) bulbs += dot(170, y) + dot(470, y);
  const podium = (x: number, color: string, score: string) =>
    `<path d="M${x - 50} 300 L${x - 42} 236 H${x + 42} L${x + 50} 300Z" fill="${color}"/><rect x="${x - 34}" y="248" width="68" height="16" rx="3" fill="#111214"/><text x="${x}" y="261" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="12" fill="#FFC928">${score}</text>`;
  const body = [
    `<defs>${KAWUNG('kk', 20, '#1D4C55')}</defs>`,
    '<rect width="640" height="360" fill="#12343B"/>',
    '<rect width="640" height="290" fill="url(#kk)" opacity="0.55"/>',
    '<g fill="#FFF2C2" opacity="0.16"><path d="M150 0 H186 L268 290 H96Z"/><path d="M454 0 H490 L544 290 H372Z"/></g>',
    '<path d="M0 0 H92 C80 120 104 240 72 360 H0Z" fill="#B3261E"/><path d="M640 0 H548 C560 120 536 240 568 360 H640Z" fill="#B3261E"/>',
    '<path d="M22 0 C14 120 30 240 18 360 M50 0 C42 120 58 240 46 360 M618 0 C626 120 610 240 622 360 M590 0 C598 120 582 240 594 360" fill="none" stroke="#8E1D17" stroke-width="6"/>',
    `<path d="${valance}Z" fill="#8E1D17"/>`,
    '<rect x="166" y="42" width="308" height="174" rx="16" fill="#3A2A12"/><rect x="176" y="52" width="288" height="154" rx="10" fill="#0B1F24"/><rect x="176" y="52" width="288" height="154" rx="10" fill="url(#kk)" opacity="0.6"/>',
    `<path d="${bulbs}" fill="#FFE38A"/>`,
    '<path d="M296 98 a24 24 0 1 1 34 22 c-6 3 -8 7 -8 13 v6 h-16 v-8 c0 -10 4 -16 12 -21 a9 9 0 1 0 -9 -10Z M306 152 h16 v16 h-16Z" fill="#FFC928" stroke="#111214" stroke-width="4" paint-order="stroke"/>',
    '<rect x="0" y="280" width="640" height="80" fill="#1C2A2E"/><rect x="0" y="278" width="640" height="4" fill="#FFC928"/>',
    '<g fill="#FFF2C2" opacity="0.14"><ellipse cx="182" cy="300" rx="90" ry="14"/><ellipse cx="458" cy="300" rx="90" ry="14"/></g>',
    `<g transform="translate(174.4 192) scale(0.8)">${castHead('jeruk', 'happy')}</g>`,
    `<g transform="translate(294.4 184) scale(0.8)">${castHead('nanas', 'wow')}</g>`,
    `<g transform="translate(414.4 192) scale(0.8)">${castHead('stroberi', 'happy')}</g>`,
    podium(200, '#FF5A1F', '1.200'),
    podium(320, '#2F8CFF', '900'),
    podium(440, '#22B35E', '1.450'),
  ].join('');
  return svgDoc(640, 360, body);
}
