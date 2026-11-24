import type { Fruit } from '@hoorah/protocol';
import { kampungSvg } from '../../games/siluman/art';
import { castHead } from './people';
import { svgDoc } from './svg';

/**
 * Key art (640x360) for Kampung Siluman: the woodcut kampung at night under a big moon. Four
 * fruits stand in front of the stilt houses holding lanterns; behind the one in the middle a
 * long shadow grows tiger ears and two glowing eyes. The logo sits top left (see LOGO_POS in
 * keyart.tsx).
 */
export function silumanSvg(): string {
  // The 1600x960 kampung, scaled to the width and anchored to the bottom.
  // The scene's own width/height are dropped first: a duplicate attribute makes the SVG invalid.
  const scene = kampungSvg('night')
    .replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, '<svg$1')
    .replace('<svg ', '<svg x="0" y="-24" width="640" height="384" ');
  const fruits: [Fruit, number, 'happy' | 'wow' | 'effort'][] = [
    ['jeruk', 150, 'wow'],
    ['nanas', 260, 'happy'],
    ['alpukat', 400, 'effort'],
    ['rambutan', 510, 'wow'],
  ];
  const lantern = (x: number) =>
    `<g transform="translate(${x} 262)"><path d="M0 -26v8" stroke="#FBF1DC" stroke-width="2"/><rect x="-9" y="-18" width="18" height="24" rx="5" fill="#FF8A1F"/><circle cy="-6" r="22" fill="#FF8A1F" opacity="0.18"/></g>`;
  const heads = fruits
    .map(
      ([f, x, face]) =>
        `<g transform="translate(${x - 34} 262) scale(1.06)">${castHead(f, face)}</g>${lantern(x + 34)}`,
    )
    .join('');
  // The siluman shadow behind the middle of the row.
  const shadow =
    '<path d="M300 300q4-120 52-150q48 30 52 150Z" fill="#02060F" opacity="0.92"/>' +
    '<path d="M314 168l-14-40l32 26M390 168l14-40l-32 26" fill="#02060F" opacity="0.92"/>' +
    '<path d="M330 190l18 7l-18 5ZM374 190l-18 7l18 5Z" fill="#FFE7A3"/>' +
    '<circle cx="352" cy="196" r="46" fill="#FFE7A3" opacity="0.05"/>';
  const ground = '<rect y="318" width="640" height="42" fill="#040912"/>';
  return svgDoc(
    640,
    360,
    `<rect width="640" height="360" fill="#0B1530"/>${scene}${shadow}${ground}${heads}`,
  );
}
