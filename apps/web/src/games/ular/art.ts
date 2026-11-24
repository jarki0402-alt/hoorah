/**
 * Board and token art for the main screen. The board is one inline SVG drawn once per size and
 * cell size (numbers use the brand font, so it lives in the DOM, not in an <img>).
 */
import type { Look } from '@hoorah/protocol';
import { avatarMarkup } from '../../shared/art/people';
import { f1 } from '../../shared/art/svg';
import { ladderMarkup, type P, SNAKE_SKINS, snakeMarkup } from '../../shared/art/ular';
import { type Board, cellCenter, ladderPoint, snakePoint, squareCell } from './board';
import { STR } from './strings';

/** Wooden frame thickness around the cells, in px. */
export const FRAME = 14;

const CELL_COLORS = ['#FFF1C9', '#FFD9A0', '#CDEBB0', '#B9E2F0'];
const INK = '#5A3B1A';

function giftBox(cx: number, cy: number, s: number): string {
  const w = s;
  const h = s * 0.78;
  const x = cx - w / 2;
  const y = cy - h / 2 + s * 0.08;
  return [
    `<rect x="${f1(x + 2)}" y="${f1(y + 4)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(s * 0.12)}" fill="#000" opacity="0.18"/>`,
    `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(s * 0.12)}" fill="#FF8A3D" stroke="#3A2410" stroke-width="2"/>`,
    `<rect x="${f1(x - s * 0.06)}" y="${f1(y - s * 0.02)}" width="${f1(w + s * 0.12)}" height="${f1(s * 0.2)}" rx="${f1(s * 0.06)}" fill="#E2543A" stroke="#3A2410" stroke-width="2"/>`,
    `<rect x="${f1(cx - s * 0.07)}" y="${f1(y - s * 0.02)}" width="${f1(s * 0.14)}" height="${f1(h + s * 0.02)}" fill="#FFD23F"/>`,
    `<path d="M${f1(cx)} ${f1(y - s * 0.02)} c${f1(-s * 0.3)} ${f1(-s * 0.3)} ${f1(-s * 0.36)} ${f1(s * 0.02)} 0 0 c${f1(s * 0.36)} ${f1(s * 0.02)} ${f1(s * 0.3)} ${f1(-s * 0.3)} 0 0Z" fill="#FFD23F" stroke="#3A2410" stroke-width="1.6"/>`,
    `<text x="${f1(cx)}" y="${f1(y + h * 0.82)}" text-anchor="middle" font-size="${f1(s * 0.56)}" fill="#FFFFFF" stroke="#3A2410" stroke-width="2.4" paint-order="stroke">?</text>`,
  ].join('');
}

function finishFlag(cx: number, cy: number, s: number): string {
  const x = cx - s * 0.3;
  const top = cy - s * 0.5;
  const q = s * 0.16;
  let checks = '';
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      if ((r + c) % 2 === 0)
        checks += `M${f1(x + 3 + c * q)} ${f1(top + r * q)}h${f1(q)}v${f1(q)}h${f1(-q)}Z`;
  return [
    `<path d="M${f1(x + 2)} ${f1(top - 2)}V${f1(cy + s * 0.5)}" stroke="#3A2410" stroke-width="3" stroke-linecap="round"/>`,
    `<rect x="${f1(x + 3)}" y="${f1(top)}" width="${f1(q * 4)}" height="${f1(q * 3)}" fill="#FFFFFF" stroke="#3A2410" stroke-width="1.6"/>`,
    `<path d="${checks}" fill="#111214"/>`,
  ].join('');
}

/** The whole board (frame, cells, numbers, ladders, snakes) for a given cell size. */
export function boardMarkup(board: Board, c: number): string {
  const W = board.cols * c;
  const H = board.rows * c;
  const at = (p: P): P => ({ x: FRAME + p.x * c, y: FRAME + p.y * c });
  const out: string[] = [];
  out.push(
    `<rect x="4" y="9" width="${W + FRAME * 2 - 4}" height="${H + FRAME * 2 - 4}" rx="20" fill="#000" opacity="0.22"/>`,
    `<rect width="${W + FRAME * 2}" height="${H + FRAME * 2}" rx="20" fill="#8A5A2B"/>`,
    `<rect x="${FRAME * 0.45}" y="${FRAME * 0.45}" width="${W + FRAME * 1.1}" height="${H + FRAME * 1.1}" rx="13" fill="#B07A47"/>`,
  );
  let cells = '';
  let nums = '';
  let icons = '';
  const surprises = new Set(board.surprises);
  for (let n = 1; n <= board.size; n++) {
    const { col, row } = squareCell(n, board.cols);
    const x = FRAME + col * c;
    const y = FRAME + (board.rows - 1 - row) * c;
    const fill = n === board.size ? '#FFD23F' : surprises.has(n) ? '#FFE3B8' : CELL_COLORS[(col + row) % 4]!;
    cells += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="${fill}"/>`;
    nums += `<text x="${f1(x + c * 0.08)}" y="${f1(y + c * 0.27)}">${n}</text>`;
    const cx = x + c / 2;
    const cy = y + c / 2;
    if (surprises.has(n)) icons += giftBox(cx + c * 0.06, cy + c * 0.06, c * 0.48);
    if (n === board.size) {
      icons += finishFlag(cx + c * 0.06, cy - c * 0.02, c * 0.56);
      icons += `<text x="${f1(cx)}" y="${f1(y + c * 0.9)}" text-anchor="middle" font-size="${f1(c * 0.2)}" fill="${INK}">${STR.finishSquare}</text>`;
    }
    if (n === 1)
      icons += `<text x="${f1(cx)}" y="${f1(y + c * 0.9)}" text-anchor="middle" font-size="${f1(c * 0.2)}" fill="${INK}">${STR.startSquare}</text>`;
  }
  let grid = '';
  for (let i = 1; i < board.cols; i++) grid += `M${FRAME + i * c} ${FRAME}v${H}`;
  for (let j = 1; j < board.rows; j++) grid += `M${FRAME} ${FRAME + j * c}h${W}`;
  out.push(
    cells,
    `<path d="${grid}" stroke="#C9A16A" stroke-width="1.5"/>`,
    `<rect x="${FRAME}" y="${FRAME}" width="${W}" height="${H}" fill="none" stroke="#6B4423" stroke-width="2.5"/>`,
    `<g font-family="'Baloo 2', ui-rounded, system-ui, sans-serif" font-weight="800">`,
    `<g font-size="${f1(c * 0.22)}" fill="${INK}" opacity="0.72">${nums}</g>`,
    icons,
    '</g>',
  );
  // Ladders under the snakes.
  const rungW = Math.max(14, c * 0.34);
  for (const l of board.ladders)
    out.push(ladderMarkup(at(ladderPoint(board, l, 0)), at(ladderPoint(board, l, 1)), rungW));
  board.snakes.forEach((s, i) => {
    const pts: P[] = [];
    const samples = 44;
    for (let k = 0; k < samples; k++) pts.push(at(snakePoint(board, s, k / (samples - 1))));
    out.push(snakeMarkup(pts, Math.max(14, c * 0.32), SNAKE_SKINS[i % SNAKE_SKINS.length]!));
  });
  return out.join('');
}

/** Pixel centre of a square inside the board SVG (frame included). */
export function squarePx(board: Board, n: number, c: number): P {
  const p = cellCenter(board, n);
  return { x: FRAME + p.x * c, y: FRAME + p.y * c };
}

/**
 * Token face: the player's avatar in a cream disc with the player's colour as ring. `uid` keeps
 * the avatar's clip ids unique when several tokens share one document.
 */
export function tokenMarkup(look: Look, color: string, uid?: string): string {
  return [
    '<ellipse cx="32" cy="61" rx="22" ry="5" fill="#000" opacity="0.28"/>',
    `<circle cx="32" cy="32" r="28" fill="#FFF7EA" stroke="${color}" stroke-width="6"/>`,
    '<circle cx="32" cy="32" r="31" fill="none" stroke="#3A2410" stroke-width="1.6"/>',
    `<g transform="translate(9.6 9.6) scale(0.7)">${avatarMarkup(look, 'happy', uid)}</g>`,
  ].join('');
}

/** Pips of a die face on a 100x100 grid. */
export function diePips(face: number): string {
  const L = 27;
  const M = 50;
  const R = 73;
  const F: Record<number, [number, number][]> = {
    1: [[M, M]],
    2: [
      [L, L],
      [R, R],
    ],
    3: [
      [L, L],
      [M, M],
      [R, R],
    ],
    4: [
      [L, L],
      [R, L],
      [L, R],
      [R, R],
    ],
    5: [
      [L, L],
      [R, L],
      [M, M],
      [L, R],
      [R, R],
    ],
    6: [
      [L, L],
      [R, L],
      [L, M],
      [R, M],
      [L, R],
      [R, R],
    ],
  };
  return (F[face] ?? F[1]!).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5"/>`).join('');
}
