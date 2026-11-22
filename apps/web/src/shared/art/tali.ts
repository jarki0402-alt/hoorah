/**
 * Satu Tali key art: dusk cliffs climbing from the left to a flag on the right summit. Three
 * blocky climbers are tied by one yellow rope: one has slipped off a ledge and dangles, caught by
 * the friend gripping the rope above, while the leader hauls towards the flag. The top left stays
 * open sky for the logo.
 */
import { box, figure, INK, placed } from './kotak';
import { f1, svgDoc } from './svg';

function rope(points: [number, number][]): string {
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    d += `Q${f1((x0 + x1) / 2)} ${f1(Math.max(y0, y1) + 10)} ${x1} ${y1}`;
  }
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#FFC928" stroke-width="4.5" stroke-linecap="round"/>`;
}

export function taliSvg(): string {
  const out: string[] = [];
  out.push('<rect width="640" height="360" fill="#FFB98A"/>');
  out.push('<rect y="190" width="640" height="170" fill="#FFC9A3"/>');
  out.push('<circle cx="520" cy="82" r="38" fill="#FFE2A8"/>');
  // Far mesas and the canyon floor.
  out.push(
    '<rect x="250" y="200" width="70" height="160" fill="#E9A57B"/><rect x="244" y="196" width="82" height="10" fill="#D98A5B"/>',
  );
  out.push('<rect x="350" y="230" width="54" height="130" fill="#E9A57B"/>');
  out.push('<rect y="330" width="640" height="30" fill="#7A3F27"/>');
  // Cliffs rising to the right.
  out.push(box(-10, 262, 170, 110, 40, '#C9794B'));
  out.push(box(196, 222, 120, 150, 44, '#B4663E'));
  out.push(box(352, 172, 120, 200, 44, '#C9794B'));
  out.push(box(500, 124, 150, 250, 44, '#B4663E'));
  // Handholds on the summit wall.
  const holds = ['#FFC928', '#22B35E', '#2F8CFF', '#F2453D'];
  for (let i = 0; i < 8; i++)
    out.push(
      `<rect x="${492 + (i % 2) * 2}" y="${140 + i * 24}" width="10" height="9" rx="2" fill="${holds[i % holds.length]}" stroke="${INK}" stroke-width="1.5"/>`,
    );
  // The summit flag.
  out.push(`<rect x="604" y="44" width="6" height="80" fill="#FFF7F0" stroke="${INK}" stroke-width="2"/>`);
  out.push(`<path d="M610 46h40l-10 13 10 13h-40Z" fill="#FF5A1F" stroke="${INK}" stroke-width="2"/>`);
  // Rope: leader on the third cliff, the gripper on the second, one dangling below its lip.
  out.push(
    rope([
      [418, 128],
      [262, 180],
      [322, 250],
    ]),
  );
  out.push(placed(figure('nanas', '#2F8CFF', 'run'), 420, 172, 0.62, 6));
  out.push(placed(figure('alpukat', '#22B35E', 'push'), 262, 222, 0.62, -6));
  out.push(placed(figure('semangka', '#F2453D', 'fall'), 330, 300, 0.6, 18));
  // "Ditangkap!" burst lines by the dangling climber.
  out.push(
    `<path d="M352 238l14-10M356 252l18-2M350 266l14 8" stroke="#FFF7F0" stroke-width="4" stroke-linecap="round"/>`,
  );
  return svgDoc(640, 360, out.join(''));
}
