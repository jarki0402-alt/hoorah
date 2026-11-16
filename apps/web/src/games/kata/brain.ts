/**
 * Computer players for Sambung Kata (PRD 6.4). Pure: given the start, the dictionary, the used
 * words and a skill level, decide what to type and when. They look like normal players; the
 * difficulty adapts silently through `skill` (think time, slips, how cunning the word choice is).
 */
import type { PlayerInfo } from '@hoorah/protocol';
import { bySkill, pickWithSlips, soloOpponents } from '../common/cpu';
import type { Lexicon } from './lexicon';
import { MIN_CHAIN_OPTIONS, TIMING } from './logic';
import { lastSyllable } from './syllables';

/** Computer players seated when exactly one person plays. */
export const SOLO_OPPONENTS = 3;

export function kataOpponents(humans: readonly PlayerInfo[], rnd: () => number = Math.random): PlayerInfo[] {
  return soloOpponents(humans, SOLO_OPPONENTS, rnd);
}

export interface BrainInput {
  prefix: string;
  lexicon: Lexicon;
  used: ReadonlySet<string>;
  /** 0 gentle .. 1 sharp. */
  skill: number;
  /** Length of this turn. */
  turnMs: number;
  rnd?: () => number;
}

/**
 * What a computer seat does this turn: type `word` after `delayMs`, or `freeze` (let the clock
 * run out). A slip is a word that will be refused (already used), sent like any other.
 */
export type BrainMove = { kind: 'word'; word: string; delayMs: number; slip: boolean } | { kind: 'freeze' };

/** Chance the computer fumbles this turn: gentler players, shorter clocks and rare starts slip more. */
export function slipChance(skill: number, turnMs: number, options: number): number {
  const base = bySkill(skill, 0.15, 0.03);
  const pressure =
    Math.max(0, (TIMING.turnStartMs - turnMs) / (TIMING.turnStartMs - TIMING.turnMinMs)) * 0.05;
  const rare = options < 6 ? bySkill(skill, 0.1, 0.03) : 0;
  return Math.min(0.6, Math.max(0.02, base + pressure + rare));
}

/**
 * Candidate words, best first for a sharp player: words that leave the next player a start with
 * few (but some) answers come first, then the rest from rarest to most common start.
 */
export function rankWords(words: readonly string[], lexicon: Lexicon, used: ReadonlySet<string>): string[] {
  const scored = words.map((w) => {
    const tail = lastSyllable(w);
    const free = lexicon.countFree(tail, used) - (w.startsWith(tail) ? 1 : 0);
    // Dead ends deal a fresh start (no trap), so they rank with the easy ones.
    const trap = free >= MIN_CHAIN_OPTIONS ? 1000 - free : -free;
    return { w, trap };
  });
  scored.sort((a, b) => b.trap - a.trap || a.w.length - b.w.length || (a.w < b.w ? -1 : 1));
  return scored.map((s) => s.w);
}

/** A gentle player's order: short, plain words first with a little shuffle. */
function easyOrder(words: readonly string[], rnd: () => number): string[] {
  return words
    .map((w) => ({ w, k: w.length + rnd() * 3 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.w);
}

/** Thinking plus typing time, always inside the turn. */
export function answerDelay(
  skill: number,
  turnMs: number,
  word: string,
  options: number,
  rnd: () => number,
): number {
  const think = turnMs * bySkill(skill, 0.3, 0.12) * (0.6 + 0.8 * rnd()) * (options < 6 ? 1.35 : 1);
  const typing = (word.length - 1) * bySkill(skill, 260, 150);
  const latest = Math.max(600, turnMs - 1300);
  return Math.round(Math.min(latest, Math.max(900, think + typing)));
}

export function decide(input: BrainInput): BrainMove {
  const rnd = input.rnd ?? Math.random;
  const free = input.lexicon.freeWithPrefix(input.prefix, input.used);
  if (free.length === 0) return { kind: 'freeze' };
  if (rnd() < slipChance(input.skill, input.turnMs, free.length)) {
    const repeat = input.lexicon.withPrefix(input.prefix).filter((w) => input.used.has(w));
    if (repeat.length && rnd() < 0.45) {
      const word = repeat[Math.floor(rnd() * repeat.length)]!;
      return {
        kind: 'word',
        word,
        delayMs: answerDelay(input.skill, input.turnMs, word, 1, rnd),
        slip: true,
      };
    }
    return { kind: 'freeze' };
  }
  const sharp = rnd() < bySkill(input.skill, 0.15, 0.85);
  const ranked = sharp ? rankWords(free, input.lexicon, input.used) : easyOrder(free, rnd);
  const word = pickWithSlips(ranked, input.skill, rnd);
  return {
    kind: 'word',
    word,
    delayMs: answerDelay(input.skill, input.turnMs, word, free.length, rnd),
    slip: false,
  };
}
