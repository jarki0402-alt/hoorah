/** CSV export of new Pass codes ("Unduh CSV"): pure text building, the download lives in share.ts. */
import type { AdminPass, PassKind } from '@hoorah/protocol';
import { durationDays } from './logic';

export const PASS_CSV_HEADER = ['code', 'label', 'jenis', 'durasi_hari', 'berlaku_sampai'] as const;

/** Spreadsheets run a cell that starts with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: formula starts are defused with a quote, and the cell is quoted when it needs it. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows joined with CRLF (what spreadsheet apps expect), ending with a line break. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n')
    .concat('\r\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-12-31 23:59" in local time: sorts as text and opens as a date in spreadsheets. */
export function csvDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** code,label,jenis,durasi_hari,berlaku_sampai for each pass, in the given order. */
export function passesCsv(passes: readonly AdminPass[], kindNames: Record<PassKind, string>): string {
  return toCsv([
    PASS_CSV_HEADER,
    ...passes.map((p) => [
      p.code,
      p.label,
      kindNames[p.kind] ?? p.kind,
      durationDays(p.durationMs),
      csvDateTime(p.expiresAt),
    ]),
  ]);
}

/** "kacaw-pass-20261123-1405.csv" (local time). */
export function csvFileName(now: number): string {
  const d = new Date(now);
  return `kacaw-pass-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}
