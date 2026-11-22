/**
 * Hantu Tak Terlihat key art: a dark old house seen from above. Two fruit friends sweep their
 * flashlights down a hallway; one beam catches a pale teal ghost that only shows inside the
 * light. A key glints in a corner and the fuse box waits on the wall. The top left stays dark
 * for the logo.
 */
import { fruitMarkup } from './fruits';
import { f1, seeded, svgDoc } from './svg';

export function hantuSvg(): string {
  const rnd = seeded(28);
  const out: string[] = [];
  out.push(
    '<defs><radialGradient id="hb" cx="0" cy="0.5" r="1"><stop offset="0" stop-color="#FFE7A8" stop-opacity="0.55"/><stop offset="1" stop-color="#FFE7A8" stop-opacity="0"/></radialGradient><clipPath id="hc"><path d="M250 250 L560 120 L600 260 Z"/></clipPath></defs>',
  );
  out.push('<rect width="640" height="360" fill="#2C1B0F"/>');
  let planks = '';
  for (let y = 0; y < 360; y += 18) planks += `M0 ${y}H640`;
  out.push(`<path d="${planks}" stroke="#1A120B" stroke-width="2"/>`);
  // Walls of the hallway.
  out.push(
    '<rect y="0" width="640" height="70" fill="#1C1D21"/><rect y="64" width="640" height="6" fill="#4A4D55"/>',
  );
  out.push(
    '<rect y="300" width="640" height="60" fill="#1C1D21"/><rect y="300" width="640" height="6" fill="#4A4D55"/>',
  );
  // Darkness over everything, then the beams.
  out.push('<rect width="640" height="360" fill="#050608" opacity="0.72"/>');
  out.push('<path d="M250 250 L560 120 L600 260 Z" fill="url(#hb)"/>');
  out.push('<path d="M120 190 L330 80 L360 170 Z" fill="#FFE7A8" opacity="0.16"/>');
  // The ghost, seen only inside the right beam.
  out.push(
    '<g clip-path="url(#hc)"><path d="M470 250 V180 a42 42 0 0 1 84 0 V250 l-14 -12 l-14 12 l-14 -12 l-14 12 l-14 -12 l-14 12 Z" fill="#A6F4E6"/><ellipse cx="497" cy="182" rx="7" ry="9" fill="#101214"/><ellipse cx="527" cy="182" rx="7" ry="9" fill="#101214"/><ellipse cx="512" cy="210" rx="6" ry="8" fill="#101214"/></g>',
  );
  // Key glint and fuse box.
  out.push(
    '<circle cx="80" cy="280" r="12" fill="#FFC928" opacity="0.25"/><circle cx="80" cy="280" r="5" fill="#FFC928"/>',
  );
  out.push(
    '<rect x="596" y="30" width="26" height="30" rx="3" fill="#4A4D55"/><path d="M611 34 L603 47 H610 L607 57 L617 43 H610 Z" fill="#FFC928"/>',
  );
  // Dust motes in the beam.
  let motes = '';
  for (let i = 0; i < 18; i++)
    motes += `<circle cx="${f1(300 + rnd() * 250)}" cy="${f1(150 + rnd() * 90)}" r="${f1(0.8 + rnd() * 1.4)}"/>`;
  out.push(`<g fill="#FFF6DC" opacity="0.7">${motes}</g>`);
  // The friends.
  out.push(`<g transform="translate(222 222) scale(0.9)">${fruitMarkup('jeruk', 'wow')}</g>`);
  out.push(`<g transform="translate(90 162) scale(0.8)">${fruitMarkup('alpukat', 'happy')}</g>`);
  return svgDoc(640, 360, out.join(''));
}
