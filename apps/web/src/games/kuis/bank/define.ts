/**
 * Shapes shared by every part of the Kuis Nusantara question bank (questions.ts and bank/*.ts).
 *
 * Rules for every entry (checked by tests in logic.test.ts):
 * - the correct option is written FIRST (`mk` sets answer 0); options are shuffled per session;
 * - question <= 120 chars, each option <= 22 chars, fact <= 110 chars, four distinct options;
 * - only well-established, non-contested, non-time-sensitive facts; Indonesian, no em dash.
 */

export type Category = 'Budaya' | 'Kuliner' | 'Geografi' | 'Alam' | 'Sejarah' | 'Bahasa';

export interface Question {
  id: string;
  category: Category;
  /** Optional sub-label shown next to the category, e.g. "Alat musik". */
  topic?: string;
  q: string;
  options: readonly [string, string, string, string];
  /** Index of the correct option in `options`. */
  answer: number;
  /** One short "Tahukah kamu?" sentence shown on reveal. */
  fact: string;
}

export const mk = (
  id: string,
  category: Category,
  topic: string | undefined,
  q: string,
  options: readonly [string, string, string, string],
  fact: string,
): Question => ({ id, category, ...(topic ? { topic } : {}), q, options, answer: 0, fact });
