import { FRUITS, type Fruit, LIMITS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants';
import {
  type Channel,
  type ClientMsg,
  PLATFORM_PAGES,
  type PlatformPage,
  type RelayTarget,
} from './messages';
import { isPassCode, normalizePassCode, PASS_CODE_MAX } from './pass';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

export function isFruit(v: unknown): v is Fruit {
  return typeof v === 'string' && (FRUITS as readonly string[]).includes(v);
}

/** Keeps only the code's digits (spaces, dashes and other typing are dropped) and truncates. */
export function normalizeRoomCode(input: string): string {
  let out = '';
  for (const ch of input) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === ROOM_CODE_LENGTH) break;
  }
  return out;
}

export function isRoomCode(v: unknown): v is string {
  return typeof v === 'string' && v.length === ROOM_CODE_LENGTH && normalizeRoomCode(v) === v;
}

/** How a code is shown to people: two groups of three ("482 917"). */
export function formatRoomCode(code: string): string {
  return code.length === ROOM_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Collapses whitespace, drops control chars, trims to the limit. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, LIMITS.nameMax).join('');
}

function isTarget(v: unknown): v is RelayTarget {
  return v === 'all' || v === 'screen' || (isInt(v) && v >= 1 && v <= 255);
}

function isChannel(v: unknown): v is Channel {
  return v === 'p' || v === 'g' || v === 'r';
}

/** Parses and validates one JSON message from a client. Returns null when anything is off. */
export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > LIMITS.messageBytes) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'hello': {
      if (!isInt(m.v)) return null;
      if (m.role === 'screen') {
        if (m.resume === undefined) return { t: 'hello', role: 'screen', v: m.v };
        const r = m.resume;
        if (!isObj(r) || !isRoomCode(r.code) || !isToken(r.token)) return null;
        return { t: 'hello', role: 'screen', v: m.v, resume: { code: r.code, token: r.token } };
      }
      if (m.role === 'controller') {
        if (!isRoomCode(m.code) || !isStr(m.name, 64) || !isFruit(m.fruit)) return null;
        const name = sanitizeName(m.name);
        if (!name) return null;
        if (m.token !== undefined && !isToken(m.token)) return null;
        const msg: ClientMsg = { t: 'hello', role: 'controller', v: m.v, code: m.code, name, fruit: m.fruit };
        if (typeof m.token === 'string') msg.token = m.token;
        // A malformed remembered pass is dropped, never a reason to refuse the player.
        const pass =
          typeof m.pass === 'string' && m.pass.length <= PASS_CODE_MAX * 2 ? normalizePassCode(m.pass) : '';
        if (isPassCode(pass)) msg.pass = pass;
        return msg;
      }
      return null;
    }
    case 'relay':
      if (!isChannel(m.ch) || !isTarget(m.to) || !('data' in m)) return null;
      return { t: 'relay', ch: m.ch, to: m.to, data: m.data };
    case 'ping':
      if (!isInt(m.id) || typeof m.ct !== 'number' || !Number.isFinite(m.ct)) return null;
      return { t: 'ping', id: m.id, ct: m.ct };
    case 'host':
    case 'kick':
      if (!isInt(m.id) || m.id < 1 || m.id > 255) return null;
      return { t: m.t, id: m.id };
    case 'leave':
      return { t: 'leave' };
    case 'status': {
      if (!(PLATFORM_PAGES as readonly string[]).includes(m.page as string)) return null;
      if (m.gameId !== null && (typeof m.gameId !== 'string' || !/^[a-z0-9-]{1,24}$/.test(m.gameId)))
        return null;
      const status: Extract<ClientMsg, { t: 'status' }> = {
        t: 'status',
        page: m.page as PlatformPage,
        gameId: m.gameId,
      };
      if (m.direct !== undefined) {
        if (!isInt(m.direct) || m.direct < 0 || m.direct > LIMITS.maxPlayers) return null;
        status.direct = m.direct;
      }
      return status;
    }
    case 'pass': {
      if (typeof m.code !== 'string' || m.code.length > PASS_CODE_MAX * 2) return null;
      const code = normalizePassCode(m.code);
      return isPassCode(code) ? { t: 'pass', code } : null;
    }
    default:
      return null;
  }
}
