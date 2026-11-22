import { svgDoc } from '../../shared/art/svg';

/** Width and height of every option thumbnail (4:3); corners are rounded by the page, not here. */
export const THUMB_W = 160;
export const THUMB_H = 120;

/** A complete thumbnail: `body` drawn over a full-bleed background colour. */
export function thumbSvg(bg: string, body: string): string {
  return svgDoc(THUMB_W, THUMB_H, `<rect width="${THUMB_W}" height="${THUMB_H}" fill="${bg}"/>${body}`);
}
