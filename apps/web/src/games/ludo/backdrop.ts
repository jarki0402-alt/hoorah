/** The wooden table under the board: a small repeating tile of planks with a little grain. */
import { seeded, svgUrl } from '../../shared/art/svg';

const W = 360;
const H = 360;

function tableSvg(): string {
  const rnd = seeded(23);
  const planks = [0, 90, 180, 270];
  const tones = ['#8F5B32', '#996237', '#8A5730', '#94603A'];
  let body = '';
  planks.forEach((x, i) => {
    body += `<rect x="${x}" y="0" width="90" height="${H}" fill="${tones[i]}"/>`;
    // Grain: a few long wavy strokes per plank.
    for (let g = 0; g < 5; g++) {
      const gx = x + 10 + rnd() * 70;
      const amp = 2 + rnd() * 4;
      body += `<path d="M${gx.toFixed(1)} 0 C${(gx + amp).toFixed(1)} 90 ${(gx - amp).toFixed(1)} 180 ${gx.toFixed(1)} ${H / 2} S${(gx + amp).toFixed(1)} 300 ${gx.toFixed(1)} ${H}" fill="none" stroke="#6F4425" stroke-width="${(1 + rnd() * 1.4).toFixed(1)}" opacity="0.28"/>`;
    }
    // A knot now and then.
    if (rnd() > 0.45) {
      const ky = 40 + rnd() * 280;
      const kx = x + 25 + rnd() * 40;
      body += `<ellipse cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" rx="5" ry="9" fill="none" stroke="#6F4425" stroke-width="1.6" opacity="0.35"/>`;
    }
    // Plank seam and the end joint at a different height per plank.
    body += `<rect x="${x}" y="0" width="3" height="${H}" fill="#5E3A1F"/>`;
    const jy = Math.round(60 + rnd() * 240);
    body += `<rect x="${x}" y="${jy}" width="90" height="2.5" fill="#5E3A1F" opacity="0.8"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

export function tableUrl(): string {
  return svgUrl('ludo-table', tableSvg);
}
