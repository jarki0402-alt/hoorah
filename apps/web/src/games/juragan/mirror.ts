/**
 * Long-distance play: the display state the Host's Juragan publishes and a far-away main screen
 * draws with the same tabletop and HUD. `toMirror` reads the HUD model the Host's screen renders
 * plus what its board shows (pawn spots, owners and buildings, focus, recent effects);
 * `applyMirror` validates the network copy and rebuilds those. Effects (dice, a walk, coins, a
 * Kabar card) are numbered so the far screen plays each one once, and carry their server time so a
 * late one is drawn in place instead. Times cross as server ms. Pure.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import { MAX_LEVEL, TILE_COUNT } from './board';
import type { Banner, CardLine, CardModel, HudModel, HudPlayer, RentRow, TileCardModel, Toast } from './hud';
import type { MoveKind, TileState } from './logic';
import type { PawnInfo, PawnPlace } from './scene/view';

export const MIRROR_VERSION = 1;

/** One board effect. `at` is game time on the Host, server ms on the wire. */
export type MirrorFx =
  | { k: 'd'; n: number; at: number; p: number; v: [number, number] }
  | { k: 'w'; n: number; at: number; p: number; m: MoveKind; path: number[] }
  /** Coins between two pawns (player ids); null is the bank. */
  | { k: 'c'; n: number; at: number; f: number | null; t: number | null; a: number }
  | { k: 'k'; n: number; at: number };

/** An effect before the driver numbers and times it. */
export type MirrorFxBody = Unnumbered<MirrorFx>;
type Unnumbered<F> = F extends MirrorFx ? Omit<F, 'n' | 'at'> : never;

/** Effects kept for the far screen (a dropped intermediate state must not lose one). */
export const FX_KEEP = 8;

type Person = [name: string, look: Look, color: string];
type Row = [
  id: number,
  name: string,
  look: Look,
  color: string,
  tile: number,
  cash: number,
  worth: number,
  cities: number,
  rank: number,
  flags: number,
  /** Recent cash changes flattened: key, amount, key, amount. */
  deltas: number[],
];
type MirrorTile = [
  tile: number,
  eyebrow: string,
  name: string,
  color: string,
  price: number | null,
  rows: [label: string, value: number, current: 0 | 1][],
  double: 0 | 1,
  lines: [label: string, value: string, strong: 0 | 1][],
  owner: Person | null,
  note: string | null,
  forSale: 0 | 1,
  level: number,
];
type MirrorBanner = {
  k: Banner['kind'];
  key: number;
  t: string;
  s: string;
  l: string | null;
  w: Person | null;
};

export interface JuraganMirror {
  v: typeof MIRROR_VERSION;
  /** Players in seat order with their HUD figures and board spot. */
  pl: Row[];
  /** Whose turn: player id, hint, bonus turn. */
  tu: [id: number, hint: string, bonus: 0 | 1] | null;
  di: [number, number] | null;
  ro: 0 | 1;
  tc: MirrorTile | null;
  cd: [key: number, title: string, body: string, tone: CardModel['tone']] | null;
  bn: MirrorBanner | null;
  to: [key: number, text: string, amount: string | null, tone: Toast['tone']] | null;
  rn: [n: number, of: number];
  lr: 0 | 1;
  /** Per tile: owner as 1-based index into `pl` (0 = the bank), and building level. */
  ow: number[];
  lv: number[];
  /** Pawn with the turn ring, pawn the camera leans to. */
  ac: number | null;
  fp: number | null;
  /** Pulsing outline: tile and colour. */
  hl: [tile: number, color: string] | null;
  fx: MirrorFx[];
  /** Decision ring: deadline (server ms) and its full length, null when not counting. */
  ring: [deadline: number, total: number] | null;
  /** Server ms the Host's game froze at (paused), else null. */
  fz: number | null;
}

/** Everything `toMirror` reads, in the Host's game time (`toServer` converts it). */
export interface MirrorSource {
  model: HudModel;
  tiles: readonly TileState[];
  places: readonly PawnPlace[];
  active: number | null;
  focus: number | null;
  highlight: { tile: number; color: string } | null;
  fx: readonly MirrorFx[];
  ring: { deadline: number; total: number } | null;
  /** Game time now while paused, else null. */
  frozenAt: number | null;
  toServer(t: number): number;
}

const F_ACTIVE = 1;
const F_JAILED = 2;
const F_BANKRUPT = 4;
const F_CONNECTED = 8;

const flag = (b: boolean): 0 | 1 => (b ? 1 : 0);
const person = (p: { name: string; look: Look; color: string }): Person => [p.name, p.look, p.color];

function row(p: HudPlayer, place: PawnPlace | undefined): Row {
  const flags =
    (p.active ? F_ACTIVE : 0) |
    (p.jailed ? F_JAILED : 0) |
    (p.bankrupt ? F_BANKRUPT : 0) |
    (p.connected ? F_CONNECTED : 0);
  return [
    p.id,
    p.name,
    p.look,
    p.color,
    place?.tile ?? 0,
    p.cash,
    p.worth,
    p.cities,
    p.rank,
    flags,
    p.deltas.flatMap((d) => [d.key, d.amount]),
  ];
}

function tileCard(c: TileCardModel): MirrorTile {
  return [
    c.tile,
    c.eyebrow,
    c.name,
    c.color,
    c.price,
    c.rows.map((r) => [r.label, r.value, flag(r.current)]),
    flag(c.double),
    c.lines.map((l) => [l.label, l.value, flag(l.strong === true)]),
    c.owner ? person(c.owner) : null,
    c.note,
    flag(c.forSale),
    c.level,
  ];
}

export function toMirror(src: MirrorSource): JuraganMirror {
  const m = src.model;
  const t = (v: number) => Math.round(src.toServer(v));
  const places = new Map(src.places.map((p) => [p.id, p]));
  const seat = new Map(m.players.map((p, i) => [p.id, i + 1]));
  const b = m.banner;
  return {
    v: MIRROR_VERSION,
    pl: m.players.map((p) => row(p, places.get(p.id))),
    tu: m.turn ? [m.turn.id, m.turn.hint, flag(m.turn.bonus)] : null,
    di: m.dice ? [m.dice[0], m.dice[1]] : null,
    ro: flag(m.rolling),
    tc: m.tile ? tileCard(m.tile) : null,
    cd: m.card ? [m.card.key, m.card.title, m.card.body, m.card.tone] : null,
    bn: b
      ? { k: b.kind, key: b.key, t: b.title, s: b.sub, l: b.line, w: b.winner ? person(b.winner) : null }
      : null,
    to: m.toast ? [m.toast.key, m.toast.text, m.toast.amount, m.toast.tone] : null,
    rn: [m.round.n, m.round.of],
    lr: flag(m.lastRound),
    ow: src.tiles.map((s) => (s.owner === null ? 0 : (seat.get(s.owner) ?? 0))),
    lv: src.tiles.map((s) => s.level),
    ac: src.active,
    fp: src.focus,
    hl: src.highlight ? [src.highlight.tile, src.highlight.color] : null,
    fx: src.fx.map((f) => ({ ...f, at: t(f.at) })),
    ring: src.ring ? [t(src.ring.deadline), src.ring.total] : null,
    fz: src.frozenAt === null ? null : t(src.frozenAt),
  };
}

/* ------------------------------------------------------------------ validation */

/** Seats the far screen accepts (the game allows 6; the offline demo goes to 8). */
const MAX_SEATS = 8;
const MAX_TEXT = 200;
const MAX_NAME = 40;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const MOVE_KINDS: readonly MoveKind[] = ['walk', 'back', 'jump'];
const BANNER_KINDS: readonly Banner['kind'][] = ['intro', 'last', 'finale'];
const CARD_TONES: readonly CardModel['tone'][] = ['good', 'bad', 'move'];
const TOAST_TONES: readonly Toast['tone'][] = ['good', 'bad', 'neutral', 'gold'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const isFlag = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const isTile = (v: unknown): v is number => isInt(v) && v >= 0 && v < TILE_COUNT;
const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR_RE.test(v);
const textOrNull = (v: unknown): v is string | null => v === null || isText(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** Throws on anything malformed; `applyMirror` turns that into null. */
function fail(): never {
  throw new Error('bad mirror state');
}

function list<T>(v: unknown, max: number, each: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) fail();
  return v.map(each);
}

function tuple(v: unknown, n: number): unknown[] {
  if (!Array.isArray(v) || v.length !== n) fail();
  return v;
}

function parsePerson(v: unknown): { name: string; look: Look; color: string } {
  const [name, rawLook, color] = tuple(v, 3);
  const look = parseLook(rawLook);
  if (!isText(name, MAX_NAME) || !look || !isColor(color)) fail();
  return { name, look, color };
}

function parseRow(v: unknown): HudPlayer & { tile: number } {
  const [id, name, rawLook, color, tile, cash, worth, cities, rank, flags, deltas] = tuple(v, 11);
  const look = parseLook(rawLook);
  if (!isInt(id) || !isText(name, MAX_NAME) || !look || !isColor(color) || !isTile(tile)) fail();
  if (!isInt(cash) || !isInt(worth) || !isNat(cities) || cities > TILE_COUNT || !isNat(rank)) fail();
  if (!isNat(flags) || flags > 15) fail();
  const flat = list(deltas, 8, (x) => (isInt(x) ? x : fail()));
  if (flat.length % 2 !== 0) fail();
  const ds: HudPlayer['deltas'] = [];
  for (let k = 0; k < flat.length; k += 2) ds.push({ key: flat[k]!, amount: flat[k + 1]! });
  return {
    id,
    name,
    look,
    color,
    tile,
    cash,
    worth,
    cities,
    rank,
    active: (flags & F_ACTIVE) !== 0,
    jailed: (flags & F_JAILED) !== 0,
    bankrupt: (flags & F_BANKRUPT) !== 0,
    connected: (flags & F_CONNECTED) !== 0,
    deltas: ds,
  };
}

function parseTileCard(v: unknown): TileCardModel | null {
  if (v === null) return null;
  const [tile, eyebrow, name, color, price, rows, double, lines, owner, note, forSale, level] = tuple(v, 12);
  if (!isTile(tile) || !isText(eyebrow, MAX_NAME) || !isText(name, MAX_NAME) || !isColor(color)) fail();
  if ((price !== null && !isNat(price)) || !isFlag(double) || !isFlag(forSale) || !textOrNull(note)) fail();
  if (!isNat(level) || level > MAX_LEVEL) fail();
  const rentRows = list(rows, MAX_LEVEL, (r): RentRow => {
    const [label, value, current] = tuple(r, 3);
    if (!isText(label, MAX_NAME) || !isNat(value) || !isFlag(current)) fail();
    return { label, value, current: current === 1 };
  });
  const cardLines = list(lines, 4, (l): CardLine => {
    const [label, value, strong] = tuple(l, 3);
    if (!isText(label, MAX_NAME * 2) || !isText(value, MAX_NAME) || !isFlag(strong)) fail();
    return strong === 1 ? { label, value, strong: true } : { label, value };
  });
  return {
    tile,
    eyebrow,
    name,
    color,
    price,
    rows: rentRows,
    double: double === 1,
    lines: cardLines,
    owner: owner === null ? null : parsePerson(owner),
    note,
    forSale: forSale === 1,
    level,
  };
}

function parseBanner(v: unknown): Banner | null {
  if (v === null) return null;
  if (!isRec(v) || !oneOf(BANNER_KINDS, v.k) || !isNat(v.key)) fail();
  if (!isText(v.t) || !isText(v.s) || !textOrNull(v.l)) fail();
  return {
    kind: v.k,
    key: v.key,
    title: v.t,
    sub: v.s,
    line: v.l,
    winner: v.w === null ? null : parsePerson(v.w),
  };
}

function parseCard(v: unknown): CardModel | null {
  if (v === null) return null;
  const [key, title, body, tone] = tuple(v, 4);
  if (!isNat(key) || !isText(title) || !isText(body, MAX_TEXT * 2) || !oneOf(CARD_TONES, tone)) fail();
  return { key, title, body, tone };
}

function parseToast(v: unknown): Toast | null {
  if (v === null) return null;
  const [key, text, amount, tone] = tuple(v, 4);
  if (!isNat(key) || !isText(text) || !textOrNull(amount) || !oneOf(TOAST_TONES, tone)) fail();
  return { key, text, amount, tone };
}

function parseDice(v: unknown): [number, number] | null {
  if (v === null) return null;
  const [a, b] = tuple(v, 2);
  const die = (x: unknown): x is number => isInt(x) && x >= 1 && x <= 6;
  if (!die(a) || !die(b)) fail();
  return [a, b];
}

function parseFx(v: unknown, ids: ReadonlySet<number>): MirrorFx {
  if (!isRec(v) || !isNat(v.n) || !isNum(v.at)) fail();
  const { n, at } = v;
  const pawn = (x: unknown): number => (isInt(x) && ids.has(x) ? x : fail());
  const anchor = (x: unknown): number | null => (x === null ? null : pawn(x));
  switch (v.k) {
    case 'd': {
      const dice = parseDice(v.v);
      if (!dice) fail();
      return { k: 'd', n, at, p: pawn(v.p), v: dice };
    }
    case 'w': {
      if (!oneOf(MOVE_KINDS, v.m)) fail();
      const path = list(v.path, TILE_COUNT * 2, (x) => (isTile(x) ? x : fail()));
      return { k: 'w', n, at, p: pawn(v.p), m: v.m, path };
    }
    case 'c':
      if (!isNat(v.a)) fail();
      return { k: 'c', n, at, f: anchor(v.f), t: anchor(v.t), a: v.a };
    case 'k':
      return { k: 'k', n, at };
    default:
      fail();
  }
}

/** The validated display state, ready for the HUD store and the tabletop. */
export interface JuraganShown {
  model: HudModel;
  pawns: PawnInfo[];
  places: PawnPlace[];
  tiles: TileState[];
  active: number | null;
  focus: number | null;
  highlight: { tile: number; color: string } | null;
  fx: MirrorFx[];
  ring: { deadline: number; total: number } | null;
  /** Server ms the Host froze at, or null while it runs. */
  frozen: number | null;
}

/** Validates a published state; null when anything is off (the screen keeps the last good one). */
export function applyMirror(raw: unknown): JuraganShown | null {
  try {
    return parse(raw);
  } catch {
    return null;
  }
}

function parse(raw: unknown): JuraganShown {
  if (!isRec(raw) || raw.v !== MIRROR_VERSION) fail();
  const r = raw;
  const rows = list(r.pl, MAX_SEATS, parseRow);
  if (!rows.length) fail();
  const ids = new Set(rows.map((p) => p.id));
  if (ids.size !== rows.length) fail();
  const pawnOf = (x: unknown): number | null => (x === null ? null : isInt(x) && ids.has(x) ? x : fail());

  let turn: HudModel['turn'] = null;
  if (r.tu !== null) {
    const [id, hint, bonus] = tuple(r.tu, 3);
    const p = rows.find((x) => x.id === id);
    if (!p || !isText(hint) || !isFlag(bonus)) fail();
    turn = { id: p.id, name: p.name, look: p.look, color: p.color, hint, bonus: bonus === 1 };
  }
  const [rn, rof] = tuple(r.rn, 2);
  if (!isNat(rn) || !isNat(rof) || rn > rof + 1 || !isFlag(r.ro) || !isFlag(r.lr)) fail();

  const owners = list(r.ow, TILE_COUNT, (x) => (isNat(x) && x <= rows.length ? x : fail()));
  const levels = list(r.lv, TILE_COUNT, (x) => (isNat(x) && x <= MAX_LEVEL ? x : fail()));
  if (owners.length !== TILE_COUNT || levels.length !== TILE_COUNT) fail();
  const tiles: TileState[] = owners.map((o, i) => ({
    owner: o === 0 ? null : rows[o - 1]!.id,
    level: levels[i]!,
  }));

  let highlight: JuraganShown['highlight'] = null;
  if (r.hl !== null) {
    const [tile, color] = tuple(r.hl, 2);
    if (!isTile(tile) || !isColor(color)) fail();
    highlight = { tile, color };
  }
  let ring: JuraganShown['ring'] = null;
  if (r.ring !== null) {
    const [deadline, total] = tuple(r.ring, 2);
    if (!isNum(deadline) || !isNum(total) || total <= 0) fail();
    ring = { deadline, total };
  }
  const frozen = r.fz;
  if (frozen !== null && !isNum(frozen)) fail();

  const model: HudModel = {
    players: rows.map(({ tile: _tile, ...p }) => p),
    turn,
    dice: parseDice(r.di),
    rolling: r.ro === 1,
    tile: parseTileCard(r.tc),
    card: parseCard(r.cd),
    banner: parseBanner(r.bn),
    toast: parseToast(r.to),
    round: { n: rn, of: rof },
    lastRound: r.lr === 1,
  };
  return {
    model,
    pawns: rows.map((p) => ({ id: p.id, look: p.look, color: p.color })),
    places: rows.map((p) => ({ id: p.id, tile: p.tile, jailed: p.jailed, out: p.bankrupt })),
    tiles,
    active: pawnOf(r.ac),
    focus: pawnOf(r.fp),
    highlight,
    fx: list(r.fx, FX_KEEP, (f) => parseFx(f, ids)),
    ring,
    frozen,
  };
}
