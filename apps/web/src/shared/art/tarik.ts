import type { Fruit } from '@hoorah/protocol';
import { fruitMarkup } from './fruits';
import { svgDoc } from './svg';

/** Bunting, fence posts and the crowd are generated once (deterministic). */
function crowdParts() {
  const yAt = (x: number) => {
    const u = x / 640;
    return 30 + 68 * u * (1 - u);
  };
  let red = '';
  let white = '';
  for (let i = 0, x = 12; x < 640; x += 30, i++) {
    const y = yAt(x);
    const tri = `M${x - 10} ${y.toFixed(1)} L${x + 10} ${y.toFixed(1)} L${x} ${(y + 18).toFixed(1)}Z `;
    if (i % 2) white += tri;
    else red += tri;
  }
  let posts = '';
  for (let x = 8; x < 640; x += 36) posts += `M${x} 206 h7 v40 h-7Z `;
  const bodies = ['', '', '', '', ''];
  const heads = ['', '', '', ''];
  let hair = '';
  let sticks = '';
  let fr = '';
  let fw = '';
  for (let i = 0; i < 24; i++) {
    const x = 22 + i * 26;
    const y = 186 + ((i * 7) % 5) - 2;
    bodies[i % 5] += `M${x - 10} ${y + 30} v-10 q0 -12 10 -12 q10 0 10 12 v10Z `;
    heads[(i * 3) % 4] += `M${x - 8} ${y} a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0Z `;
    hair += `M${x - 8} ${y - 1} a8 8 0 0 1 16 0 q-8 -4 -16 0Z `;
    if (i % 4 === 1) {
      sticks += `M${x + 9} ${y + 10} V${y - 22} `;
      fr += `M${x + 9} ${y - 22} h13 v5 h-13Z `;
      fw += `M${x + 9} ${y - 17} h13 v5 h-13Z `;
    }
  }
  return { red, white, posts, bodies, heads, hair, sticks, fr, fw };
}

let parts: ReturnType<typeof crowdParts> | null = null;

/** 640x360 festival field: sky, bunting, crowd, fence, ground, mud pit. No rope, no players. */
export function tarikBackground(): string {
  parts ??= crowdParts();
  const p = parts;
  const shirt = ['#F2453D', '#2F8CFF', '#FFC928', '#22B35E', '#FFFFFF'];
  const skin = ['#F1C27D', '#C68642', '#8D5524', '#E0AC69'];
  return [
    '<rect width="640" height="360" fill="#9ADBFF"/>',
    '<g fill="#fff"><ellipse cx="96" cy="86" rx="44" ry="13"/><circle cx="84" cy="78" r="16"/><circle cx="106" cy="72" r="20"/><ellipse cx="520" cy="70" rx="38" ry="11"/><circle cx="510" cy="63" r="13"/><circle cx="530" cy="58" r="17"/></g>',
    '<path d="M0 196 C80 158 160 168 240 186 C330 156 430 146 520 176 C580 166 620 170 640 176 V360 H0Z" fill="#8BCB6B"/>',
    '<path d="M0 214 C120 196 220 204 320 210 C430 198 540 200 640 210 V360 H0Z" fill="#76BC58"/>',
    '<rect x="34" y="150" width="10" height="56" fill="#7A4A1E"/><circle cx="30" cy="142" r="26" fill="#3E9A45"/><circle cx="54" cy="132" r="22" fill="#3E9A45"/><circle cx="44" cy="114" r="18" fill="#4FAE52"/><circle cx="54" cy="148" r="16" fill="#348A3C"/>',
    '<rect x="598" y="146" width="10" height="60" fill="#7A4A1E"/><circle cx="604" cy="134" r="28" fill="#3E9A45"/><circle cx="626" cy="146" r="18" fill="#348A3C"/><circle cx="590" cy="118" r="16" fill="#4FAE52"/>',
    '<path d="M0 30 Q320 64 640 30" fill="none" stroke="#6B4423" stroke-width="2"/>',
    `<path d="${p.red}" fill="#E8352E"/><path d="${p.white}" fill="#fff" stroke="#E2E2E2" stroke-width="0.6"/>`,
    p.bodies.map((d, i) => `<path d="${d}" fill="${shirt[i]}"/>`).join(''),
    p.heads.map((d, i) => `<path d="${d}" fill="${skin[i]}"/>`).join(''),
    `<path d="${p.hair}" fill="#2A1A10"/>`,
    `<path d="${p.sticks}" fill="none" stroke="#5A3A1A" stroke-width="1.6"/>`,
    `<path d="${p.fr}" fill="#E8352E"/><path d="${p.fw}" fill="#fff"/>`,
    `<path d="${p.posts}" fill="#B07A47"/>`,
    '<path d="M0 214 H640 V220 H0Z M0 232 H640 V238 H0Z" fill="#9A6838"/>',
    '<rect x="0" y="246" width="640" height="114" fill="#E2B07A"/>',
    '<g fill="#CF9A62"><ellipse cx="70" cy="300" rx="14" ry="3"/><ellipse cx="560" cy="290" rx="18" ry="3"/><ellipse cx="120" cy="344" rx="20" ry="4"/><ellipse cx="520" cy="342" rx="16" ry="3"/><ellipse cx="380" cy="352" rx="12" ry="3"/></g>',
    '<ellipse cx="320" cy="304" rx="74" ry="18" fill="#8A5A34"/><ellipse cx="304" cy="299" rx="32" ry="5" fill="#A87448"/><ellipse cx="350" cy="309" rx="14" ry="3" fill="#A87448"/>',
    '<path d="M320 250 V286 M320 322 V360" stroke="#FFF7F0" stroke-width="3" stroke-dasharray="7 6"/>',
  ].join('');
}

export interface TeamLook {
  fruit: Fruit;
  shirt: string;
  dark: string;
}

/** One puller facing right, feet at (0,0). Mirror with scale(-1 1) for the other side. */
export function tarikCharacter(t: TeamLook): string {
  return [
    `<path d="M-8 -90 Q18 -88 44 -76" fill="none" stroke="${t.dark}" stroke-width="11" stroke-linecap="round"/>`,
    '<path d="M-4 -48 Q-14 -24 -26 -4" fill="none" stroke="#2B3A55" stroke-width="13" stroke-linecap="round"/>',
    '<path d="M6 -48 Q26 -32 20 -4" fill="none" stroke="#33466A" stroke-width="13" stroke-linecap="round"/>',
    '<ellipse cx="-29" cy="-2" rx="12" ry="6" fill="#111214"/><ellipse cx="25" cy="-2" rx="12" ry="6" fill="#111214"/>',
    `<rect x="-20" y="-108" width="40" height="66" rx="16" fill="${t.shirt}"/>`,
    '<rect x="-20" y="-84" width="40" height="7" fill="#fff"/>',
    `<path d="M8 -90 Q32 -84 50 -68" fill="none" stroke="${t.shirt}" stroke-width="11" stroke-linecap="round"/>`,
    '<circle cx="44" cy="-76" r="7" fill="#fff" stroke="#111214" stroke-width="1.5"/><circle cx="50" cy="-68" r="7" fill="#fff" stroke="#111214" stroke-width="1.5"/>',
    `<g transform="translate(-30.4 -158) scale(0.95)">${fruitMarkup(t.fruit, 'effort')}</g>`,
  ].join('');
}

export const TEAM_RED: TeamLook = { fruit: 'semangka', shirt: '#E8352E', dark: '#B82620' };
export const TEAM_BLUE: TeamLook = { fruit: 'alpukat', shirt: '#2F8CFF', dark: '#1F6FD6' };

/** Full key-art composition (640x360). */
export function tarikSceneSvg(left: TeamLook = TEAM_RED, right: TeamLook = TEAM_BLUE): string {
  const body = [
    tarikBackground(),
    '<path d="M108 270 L219 234 Q320 245 421 234 L532 270" fill="none" stroke="#8A5A2B" stroke-width="7" stroke-linecap="round"/>',
    '<path d="M108 270 L219 234 Q320 245 421 234 L532 270" fill="none" stroke="#C8925A" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 6"/>',
    '<path d="M297 240 h8 l-1 17 l-3 -3 l-3 3Z" fill="#F2453D" stroke="#111214" stroke-width="1"/>',
    '<g fill="#F3D9B0"><circle cx="176" cy="318" r="8"/><circle cx="162" cy="313" r="6"/><circle cx="188" cy="323" r="5"/><circle cx="464" cy="318" r="8"/><circle cx="478" cy="313" r="6"/><circle cx="452" cy="323" r="5"/></g>',
    `<g transform="translate(200 318) rotate(-20)">${tarikCharacter(left)}</g>`,
    `<g transform="translate(440 318) scale(-1 1) rotate(-20)">${tarikCharacter(right)}</g>`,
    '<g fill="#7FD1FF"><path d="M238 150 q5 7 0 10 q-5 -3 0 -10Z"/><path d="M246 162 q4 6 0 8 q-4 -2 0 -8Z"/><path d="M402 146 q5 7 0 10 q-5 -3 0 -10Z"/></g>',
  ].join('');
  return svgDoc(640, 360, body);
}
