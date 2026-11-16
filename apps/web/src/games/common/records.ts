/**
 * Personal records for solo play (PRD 6.4): games without opponents (Kuis, Rusun, Jago Masak,
 * Makan Kerupuk) show "Rekor baru!" when a lone player beats their best on this main screen.
 */
import { loadJson, saveJson } from './store';

export interface RecordResult {
  /** Best after this game. */
  best: number;
  /** Best before this game, or null on the first ever game. */
  previous: number | null;
  /** True when this game beat a previous record (never on the very first game). */
  isNew: boolean;
}

const key = (gameId: string, variant: string) => `record.${gameId}.${variant}`;

/**
 * Store `value` if it beats the record for `gameId` + `variant` (e.g. the mode, "kilat").
 * `higherIsBetter = false` for times.
 */
export function submitRecord(
  gameId: string,
  variant: string,
  value: number,
  higherIsBetter = true,
): RecordResult {
  const prevRaw = loadJson<number | null>(key(gameId, variant), null);
  const previous = typeof prevRaw === 'number' && Number.isFinite(prevRaw) ? prevRaw : null;
  const better = previous === null || (higherIsBetter ? value > previous : value < previous);
  if (better && Number.isFinite(value)) saveJson(key(gameId, variant), value);
  return {
    best: better ? value : (previous as number),
    previous,
    isNew: better && previous !== null,
  };
}

export function readRecord(gameId: string, variant: string): number | null {
  const v = loadJson<number | null>(key(gameId, variant), null);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
