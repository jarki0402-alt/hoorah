import { isScreenId } from './access';
import {
  FRUITS,
  type Fruit,
  LIMITS,
  MIRROR_KEY_ALPHABET,
  MIRROR_KEY_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './constants';
import { parseLook } from './look';
import {
  type Channel,
  type ClientMsg,
  PLATFORM_PAGES,
  type PlatformPage,
  parseRtcSignal,
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

export function isMirrorKey(v: unknown): v is string {
  if (typeof v !== 'string' || v.length !== MIRROR_KEY_LENGTH) return false;
  for (const ch of v) if (!MIRROR_KEY_ALPHABET.includes(ch)) return false;
  return true;
}

export function generateMirrorKey(random: () => number = Math.random): string {
  let key = '';
  for (let i = 0; i < MIRROR_KEY_LENGTH; i++) {
    key += MIRROR_KEY_ALPHABET[Math.floor(random() * MIRROR_KEY_ALPHABET.length)];
  }
  return key;
}

/** Room code and secret of a far-away main screen link: `482917-K7M2Q9XA`, any letter case. */
export interface MirrorLink {
  code: string;
  key: string;
}

/** The `<code>-<key>` part of a far-away main screen link, or null when it is not one. */
export function parseMirrorLink(raw: unknown): MirrorLink | null {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const m = /^(\d{6})-([0-9a-z]{8})$/i.exec(raw.trim());
  if (!m) return null;
  const code = m[1]!;
  const key = m[2]!.toUpperCase();
  return isRoomCode(code) && isMirrorKey(key) ? { code, key } : null;
}

/** The `<code>-<key>` part of the link a far-away main screen opens. */
export function formatMirrorLink(link: MirrorLink): string {
  return `${link.code}-${link.key}`;
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
  return v === 'all' || v === 'screen' || v === 'mirror' || (isInt(v) && v >= 1 && v <= 255);
}

function isMirrorId(v: unknown): v is number {
  return isInt(v) && v >= 1 && v <= LIMITS.maxMirrorId;
}

/** Far-away main screens a relay to 'mirror' leaves out: a short list of distinct ids. */
function parseSkip(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > LIMITS.maxMirrors || !v.every(isMirrorId)) return null;
  return new Set(v).size === v.length ? (v as number[]) : null;
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
        const msg: Extract<ClientMsg, { t: 'hello'; role: 'screen' }> = {
          t: 'hello',
          role: 'screen',
          v: m.v,
        };
        if (m.resume !== undefined) {
          const r = m.resume;
          if (!isObj(r) || !isRoomCode(r.code) || !isToken(r.token)) return null;
          msg.resume = { code: r.code, token: r.token };
        }
        // A malformed screen id is dropped (the room then works without one), never a reason to refuse.
        if (isScreenId(m.screen)) msg.screen = m.screen;
        return msg;
      }
      if (m.role === 'controller') {
        if (!isRoomCode(m.code) || !isStr(m.name, 64)) return null;
        if (m.fruit !== undefined && !isFruit(m.fruit)) return null;
        const name = sanitizeName(m.name);
        if (!name) return null;
        if (m.token !== undefined && !isToken(m.token)) return null;
        const msg: ClientMsg = { t: 'hello', role: 'controller', v: m.v, code: m.code, name };
        if (isFruit(m.fruit)) msg.fruit = m.fruit;
        if (m.look !== undefined) {
          const look = parseLook(m.look);
          if (!look) return null;
          msg.look = look;
        }
        if (typeof m.token === 'string') msg.token = m.token;
        // A malformed remembered pass is dropped, never a reason to refuse the player.
        const pass =
          typeof m.pass === 'string' && m.pass.length <= PASS_CODE_MAX * 2 ? normalizePassCode(m.pass) : '';
        if (isPassCode(pass)) msg.pass = pass;
        return msg;
      }
      if (m.role === 'mirror') {
        if (!isRoomCode(m.code) || !isMirrorKey(m.key)) return null;
        return { t: 'hello', role: 'mirror', v: m.v, code: m.code, key: m.key };
      }
      return null;
    }
    case 'relay': {
      if (!isChannel(m.ch) || !isTarget(m.to) || !('data' in m)) return null;
      if (m.skip === undefined) return { t: 'relay', ch: m.ch, to: m.to, data: m.data };
      const skip = m.to === 'mirror' && m.ch === 'p' ? parseSkip(m.skip) : null;
      return skip ? { t: 'relay', ch: m.ch, to: m.to, data: m.data, skip } : null;
    }
    case 'mirrorRtc': {
      const sig = parseRtcSignal(m.sig);
      if (!sig || (m.to !== undefined && !isMirrorId(m.to))) return null;
      return m.to === undefined ? { t: 'mirrorRtc', sig } : { t: 'mirrorRtc', to: m.to, sig };
    }
    case 'ping':
      if (!isInt(m.id) || typeof m.ct !== 'number' || !Number.isFinite(m.ct)) return null;
      return { t: 'ping', id: m.id, ct: m.ct };
    case 'profile': {
      if (!isStr(m.name, 64)) return null;
      const name = sanitizeName(m.name);
      const look = parseLook(m.look);
      if (m.picking !== undefined && typeof m.picking !== 'boolean') return null;
      if (!name || !look) return null;
      return m.picking ? { t: 'profile', name, look, picking: true } : { t: 'profile', name, look };
    }
    case 'host':
    case 'kick':
      if (!isInt(m.id) || m.id < 1 || m.id > 255) return null;
      return { t: m.t, id: m.id };
    case 'hostOffer':
      if (!isInt(m.id) || m.id < 1 || m.id > 255) return null;
      return { t: 'hostOffer', id: m.id };
    case 'hostOfferCancel':
      return { t: 'hostOfferCancel' };
    case 'hostReply':
      if (typeof m.accept !== 'boolean') return null;
      return { t: 'hostReply', accept: m.accept };
    case 'leave':
      return { t: 'leave' };
    case 'mirrorsOff':
      return { t: 'mirrorsOff' };
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
    case 'trial':
      return { t: 'trial' };
    case 'pass': {
      if (typeof m.code !== 'string' || m.code.length > PASS_CODE_MAX * 2) return null;
      const code = normalizePassCode(m.code);
      return isPassCode(code) ? { t: 'pass', code } : null;
    }
    default:
      return null;
  }
}
