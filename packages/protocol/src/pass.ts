/**
 * Hoorah Pass, trial stage (owner decision 2026-11-16): the owner makes a shared code in the admin
 * dashboard with an end time. Any phone in a room, or a phone turned away from a full room, enters
 * it and the room opens up to the pass's seat count. Not tied to accounts or devices; to be
 * revisited after the trial.
 */

export const PASS_CODE_MIN = 4;
export const PASS_CODE_MAX = 16;
/** Generated codes avoid look-alike characters (0/O, 1/I/L). */
export const PASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PASS_CODE_GENERATED_LENGTH = 8;

/** Upper-cases and keeps only letters and digits (spaces, dashes and other typing are dropped). */
export function normalizePassCode(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) {
    if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) out += ch;
    if (out.length === PASS_CODE_MAX) break;
  }
  return out;
}

export function isPassCode(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length >= PASS_CODE_MIN &&
    v.length <= PASS_CODE_MAX &&
    normalizePassCode(v) === v
  );
}

export function generatePassCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < PASS_CODE_GENERATED_LENGTH; i++) {
    code += PASS_CODE_ALPHABET[Math.floor(random() * PASS_CODE_ALPHABET.length)];
  }
  return code;
}

/** What a room tells its screen and phones about its pass (never the owner's notes). */
export interface RoomPass {
  /** Epoch ms after which the pass no longer opens rooms. */
  expiresAt: number;
}

/** Why a pass code did not open the room. */
export type PassReject = 'invalid' | 'expired' | 'busy' | 'rate_limited' | 'used';

/**
 * Kinds of Pass code (owner 2026-11-23):
 * - `shared`: the trial-stage code, any room until it ends (as before);
 * - `single`: one buyer's code: runs `durationMs` from its first use, stays with that main screen
 *   (entering it on another screen moves it, at most once per `PASS_MOVE_GAP_MS`);
 * - `promo`: one code for many screens (`maxUses`), each gets `durationMs` from its own first use,
 *   redeemable until the code's end time.
 */
export type PassKind = 'shared' | 'single' | 'promo';

export const PASS_MOVE_GAP_MS = 6 * 60 * 60_000;
