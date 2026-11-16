/**
 * Game-show backdrop sized to the live stage (1280x720 on 16:9; wider or taller on other screens).
 * The 1280-wide core (light beams, floor spots) stays centred; extra width becomes more wall and
 * spotlights between the core and the curtains, which stay pinned to the stage edges. Extra
 * height becomes more wall above the floor, which stays pinned to the bottom.
 */
import { svgDoc, svgUrl } from '../../shared/art/svg';

const KAWUNG = (id: string, size: number, color: string) => {
  const q = size / 4;
  const h = size / 2;
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><g fill="${color}"><ellipse cx="${h}" cy="${q * 0.8}" rx="${q * 0.6}" ry="${q}"/><ellipse cx="${h}" cy="${size - q * 0.8}" rx="${q * 0.6}" ry="${q}"/><ellipse cx="${q * 0.8}" cy="${h}" rx="${q}" ry="${q * 0.6}"/><ellipse cx="${size - q * 0.8}" cy="${h}" rx="${q}" ry="${q * 0.6}"/></g></pattern>`;
};

/** Floor band height, same as the 1280x720 art. */
const FLOOR = 164;

export function kuisBackdropSvg(w: number, h: number): string {
  const dx = (w - 1280) / 2;
  const floorY = h - FLOOR;
  // Light beams reach the floor line; the core three are the original art, shifted to the centre.
  const beam = (top: number, topW: number, bottom: number, bottomW: number) =>
    `<path d="M${top + dx} 0 H${top + topW + dx} L${bottom + bottomW + dx} ${floorY} H${bottom + dx}Z"/>`;
  const beams = [beam(330, 70, 200, 360), beam(880, 70, 720, 360), beam(610, 60, 520, 240)];
  // Wider screens: one more beam per side, over the wall the curtains used to cover.
  if (dx > 60) {
    const side = (cx: number) => `<path d="M${cx - 25} 0 H${cx + 25} L${cx + 100} ${floorY} H${cx - 100}Z"/>`;
    beams.push(side(150 + dx * 0.5), side(w - 150 - dx * 0.5));
  }
  let valance = `M0 0 H${w} V30 `;
  const scallops = Math.max(1, Math.round(w / 64));
  const sw = w / scallops;
  for (let i = scallops; i > 0; i--) {
    const x = i * sw;
    valance += `Q${(x - sw / 2).toFixed(1)} 58 ${(x - sw).toFixed(1)} 30 `;
  }
  // Curtains are drawn on the 720-tall art; taller stages stretch them vertically only.
  const ky = h / 720;
  const cy = (y: number) => (y * ky).toFixed(1);
  const curtainL = `M0 0 H150 C130 ${cy(240)} 170 ${cy(480)} 120 ${h} H0Z`;
  const curtainR = `M${w} 0 H${w - 150} C${w - 130} ${cy(240)} ${w - 170} ${cy(480)} ${w - 120} ${h} H${w}Z`;
  const folds = [36, 84]
    .map((x) => `M${x} 0 C${x - 12} ${cy(240)} ${x + 14} ${cy(480)} ${x - 6} ${h}`)
    .concat(
      [36, 84].map((x) => `M${w - x} 0 C${w - x + 12} ${cy(240)} ${w - x - 14} ${cy(480)} ${w - x + 6} ${h}`),
    )
    .join(' ');
  const spots = [470, 810].map((x) => `<ellipse cx="${x + dx}" cy="${floorY + 54}" rx="150" ry="22"/>`);
  if (dx > 60) {
    spots.push(`<ellipse cx="${150 + dx * 0.5}" cy="${floorY + 54}" rx="110" ry="18"/>`);
    spots.push(`<ellipse cx="${w - 150 - dx * 0.5}" cy="${floorY + 54}" rx="110" ry="18"/>`);
  }
  const body = [
    `<defs>${KAWUNG('kw', 28, '#1D4C55')}</defs>`,
    `<rect width="${w}" height="${h}" fill="#12343B"/>`,
    `<rect width="${w}" height="${floorY + 4}" fill="url(#kw)" opacity="0.6"/>`,
    `<g fill="#FFF2C2" opacity="0.1">${beams.join('')}</g>`,
    `<rect x="0" y="${floorY}" width="${w}" height="${FLOOR}" fill="#1C2A2E"/>`,
    `<rect x="0" y="${floorY - 4}" width="${w}" height="6" fill="#FFC928"/>`,
    `<g fill="#FFF2C2" opacity="0.1">${spots.join('')}</g>`,
    `<path d="${curtainL}" fill="#B3261E"/>`,
    `<path d="${curtainR}" fill="#B3261E"/>`,
    `<path d="${folds}" fill="none" stroke="#8E1D17" stroke-width="10"/>`,
    `<path d="${valance}Z" fill="#8E1D17"/>`,
  ].join('');
  return svgDoc(w, h, body);
}

export const backdropUrl = (w: number, h: number): string =>
  svgUrl(`kuis-stage-${w}x${h}`, () => kuisBackdropSvg(w, h));
