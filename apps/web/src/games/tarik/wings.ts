/**
 * Side extensions of the festival field for screens wider than 16:9. The main background art is
 * 640x360 art units (0..640); each wing is WING_ART units wide and continues the same layers
 * (sky, hills, bunting, crowd, fence, rails, sand) so the seams at x = 0 and x = 640 line up.
 * Left wing covers art x in [-WING_ART, 0], right wing [640, 640 + WING_ART]; both are drawn in
 * those absolute coordinates through the SVG viewBox.
 */

/** Wing width in art units (world px = 2x): enough for a 32:9 stage. */
export const WING_ART = 320;

const SHIRTS = ['#F2453D', '#2F8CFF', '#FFC928', '#22B35E', '#FFFFFF'];
const SKIN = ['#F1C27D', '#C68642', '#8D5524', '#E0AC69'];

/** Wing markup for art x in [x0, x1]. `side` picks the tree / cloud placement. */
export function tarikWing(side: 'left' | 'right'): string {
  const x0 = side === 'left' ? -WING_ART : 640;
  const x1 = x0 + WING_ART;
  const out: string[] = [];
  out.push(`<rect x="${x0}" y="0" width="${WING_ART}" height="360" fill="#9ADBFF"/>`);
  // Clouds.
  const cx = side === 'left' ? -150 : 800;
  out.push(
    `<g fill="#fff"><ellipse cx="${cx}" cy="96" rx="40" ry="12"/><circle cx="${cx - 10}" cy="88" r="15"/><circle cx="${cx + 10}" cy="82" r="18"/></g>`,
  );
  // Hills: same heights as the main art at the seam (y 196 / 214 at x = 0, 176 / 210 at x = 640).
  if (side === 'left') {
    out.push(
      `<path d="M${x0} 182 C-250 168 -120 210 0 196 V360 H${x0}Z" fill="#8BCB6B"/>`,
      `<path d="M${x0} 208 C-220 216 -100 208 0 214 V360 H${x0}Z" fill="#76BC58"/>`,
    );
  } else {
    out.push(
      `<path d="M640 176 C720 186 830 150 ${x1} 170 V360 H640Z" fill="#8BCB6B"/>`,
      `<path d="M640 210 C760 202 860 214 ${x1} 206 V360 H640Z" fill="#76BC58"/>`,
    );
  }
  // The main art's right tree pokes past x = 640; finish its canopy so the seam does not cut it.
  if (side === 'right') {
    out.push(
      '<circle cx="604" cy="134" r="28" fill="#3E9A45"/><circle cx="626" cy="146" r="18" fill="#348A3C"/>',
    );
  }
  // A tree per wing, behind the crowd like the main art.
  const tx = side === 'left' ? -236 : 876;
  out.push(
    `<rect x="${tx}" y="148" width="10" height="58" fill="#7A4A1E"/><circle cx="${tx - 2}" cy="138" r="27" fill="#3E9A45"/><circle cx="${tx + 20}" cy="130" r="21" fill="#3E9A45"/><circle cx="${tx + 8}" cy="112" r="17" fill="#4FAE52"/><circle cx="${tx + 22}" cy="146" r="15" fill="#348A3C"/>`,
  );
  // Bunting: one more garland per wing, hung from the same height as the main one's ends.
  const mid = (x0 + x1) / 2;
  out.push(`<path d="M${x0} 30 Q${mid} 64 ${x1} 30" fill="none" stroke="#6B4423" stroke-width="2"/>`);
  let red = '';
  let white = '';
  for (let i = 0, x = x0 + 12; x < x1; x += 30, i++) {
    const u = (x - x0) / WING_ART;
    const y = 30 + 68 * u * (1 - u);
    const tri = `M${x - 10} ${y.toFixed(1)} L${x + 10} ${y.toFixed(1)} L${x} ${(y + 18).toFixed(1)}Z `;
    if (i % 2) white += tri;
    else red += tri;
  }
  out.push(
    `<path d="${red}" fill="#E8352E"/><path d="${white}" fill="#fff" stroke="#E2E2E2" stroke-width="0.6"/>`,
  );
  // Crowd on the same 26-unit rhythm as the main art (x = 22 + 26i), continued past the seam.
  const bodies = ['', '', '', '', ''];
  const heads = ['', '', '', ''];
  let hair = '';
  let sticks = '';
  let fr = '';
  let fw = '';
  const iStart = Math.ceil((x0 - 22 + 10) / 26);
  const iEnd = Math.floor((x1 - 22 - 10) / 26);
  for (let i = iStart; i <= iEnd; i++) {
    const x = 22 + i * 26;
    const k = ((i % 1000) + 1000) % 1000;
    const y = 186 + ((k * 7) % 5) - 2;
    bodies[(k + 2) % 5] += `M${x - 10} ${y + 30} v-10 q0 -12 10 -12 q10 0 10 12 v10Z `;
    heads[(k * 3) % 4] += `M${x - 8} ${y} a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0Z `;
    hair += `M${x - 8} ${y - 1} a8 8 0 0 1 16 0 q-8 -4 -16 0Z `;
    if (k % 4 === 3) {
      sticks += `M${x + 9} ${y + 10} V${y - 22} `;
      fr += `M${x + 9} ${y - 22} h13 v5 h-13Z `;
      fw += `M${x + 9} ${y - 17} h13 v5 h-13Z `;
    }
  }
  out.push(bodies.map((d, i) => (d ? `<path d="${d}" fill="${SHIRTS[i]}"/>` : '')).join(''));
  out.push(heads.map((d, i) => (d ? `<path d="${d}" fill="${SKIN[i]}"/>` : '')).join(''));
  if (hair) out.push(`<path d="${hair}" fill="#2A1A10"/>`);
  if (sticks) out.push(`<path d="${sticks}" fill="none" stroke="#5A3A1A" stroke-width="1.6"/>`);
  if (fr) out.push(`<path d="${fr}" fill="#E8352E"/><path d="${fw}" fill="#fff"/>`);
  // Fence posts on the main art's 36-unit rhythm (x = 8 + 36i), rails and sand.
  let posts = '';
  for (let i = Math.ceil((x0 - 8) / 36); 8 + i * 36 < x1; i++) posts += `M${8 + i * 36} 206 h7 v40 h-7Z `;
  out.push(`<path d="${posts}" fill="#B07A47"/>`);
  out.push(`<path d="M${x0} 214 H${x1} V220 H${x0}Z M${x0} 232 H${x1} V238 H${x0}Z" fill="#9A6838"/>`);
  out.push(`<rect x="${x0}" y="246" width="${WING_ART}" height="114" fill="#E2B07A"/>`);
  const sand =
    side === 'left'
      ? [-90, 318, 16, -250, 296, 12, -180, 346, 18]
      : [720, 330, 16, 880, 300, 14, 790, 350, 12];
  let dots = '';
  for (let i = 0; i < sand.length; i += 3)
    dots += `<ellipse cx="${sand[i]}" cy="${sand[i + 1]}" rx="${sand[i + 2]}" ry="3"/>`;
  out.push(`<g fill="#CF9A62">${dots}</g>`);
  return out.join('');
}
