/**
 * Computer opponents, shared by every game (PRD 6.4).
 *
 * Rules decided by the owner:
 *  - Playing alone: the game adds its opponents by itself (no button, no setting).
 *  - Two or more humans: no computer players at all.
 *  - Opponents look like normal players (name + avatar), never labelled "BOT".
 *  - Difficulty adapts silently: the screen remembers a skill level per game, nudged down after the
 *    human loses and up after they win.
 *  - The same brains take over a seat whose phone dropped mid-game, until it reconnects.
 *
 * Opponents get negative ids so they can never collide with server ids (always > 0). Their logic
 * runs on the main screen inside the game; the server never sees them.
 */
import { FRUITS, PERSON_IDS, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { CPU_NAMES } from './cpu-strings';
import { loadJson, saveJson } from './store';

export function isCpu(id: number): boolean {
  return id < 0;
}

/** Computer players for a lineup: unused fruits and colours, distinct names, ids -1, -2, ... */
export function makeCpuPlayers(
  humans: readonly PlayerInfo[],
  count: number,
  rnd: () => number = Math.random,
): PlayerInfo[] {
  if (count <= 0) return [];
  const usedFruits = new Set(humans.map((p) => p.fruit));
  const usedColors = new Set(humans.map((p) => p.color.toUpperCase()));
  const usedNames = new Set(humans.map((p) => p.name.trim().toLowerCase()));
  const fruits = shuffle(
    FRUITS.filter((f) => !usedFruits.has(f)),
    rnd,
  );
  const colors = PLAYER_COLORS.filter((c) => !usedColors.has(c.toUpperCase()));
  // Opponents are cast characters nobody in the room picked.
  const usedPeople = new Set(humans.map((p) => p.look.c));
  const people = shuffle(
    PERSON_IDS.filter((c) => !usedPeople.has(c)),
    rnd,
  );
  const names = shuffle(
    CPU_NAMES.filter((n) => !usedNames.has(n.toLowerCase())),
    rnd,
  );
  const out: PlayerInfo[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: -(i + 1),
      name: names[i % Math.max(1, names.length)] ?? CPU_NAMES[i % CPU_NAMES.length]!,
      fruit: fruits[i % Math.max(1, fruits.length)] ?? FRUITS[i % FRUITS.length]!,
      look: { c: people[i % Math.max(1, people.length)] ?? PERSON_IDS[i % PERSON_IDS.length]! },
      color: colors[i % Math.max(1, colors.length)] ?? PLAYER_COLORS[i % PLAYER_COLORS.length]!,
      connected: true,
      isHost: false,
    });
  }
  return out;
}

/** Opponents to add: `count` when exactly one human plays, none otherwise. */
export function soloOpponents(
  humans: readonly PlayerInfo[],
  count: number,
  rnd: () => number = Math.random,
): PlayerInfo[] {
  return humans.length === 1 ? makeCpuPlayers(humans, count, rnd) : [];
}

/* ------------------------------------------------------------------ adaptive skill */

export const SKILL_DEFAULT = 0.45;
export const SKILL_MIN = 0.05;
export const SKILL_MAX = 0.95;
const SKILL_UP = 0.1;
const SKILL_DOWN = 0.14;

const skillKey = (gameId: string) => `cpu.skill.${gameId}`;

/** 0 (very gentle) .. 1 (sharp). Remembered per game on this main screen. */
export function cpuSkill(gameId: string): number {
  const v = loadJson<number>(skillKey(gameId), SKILL_DEFAULT);
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, SKILL_MIN, SKILL_MAX) : SKILL_DEFAULT;
}

/** Next skill after a solo game. Losing makes the computer gentler a bit faster than winning sharpens it. */
export function nextSkill(skill: number, outcome: 'win' | 'lose' | 'draw'): number {
  const d = outcome === 'win' ? SKILL_UP : outcome === 'lose' ? -SKILL_DOWN : 0;
  return clamp(skill + d, SKILL_MIN, SKILL_MAX);
}

/** Call once when a solo game against the computer ends. `outcome` is from the human's side. */
export function reportSoloResult(gameId: string, outcome: 'win' | 'lose' | 'draw'): number {
  const next = nextSkill(cpuSkill(gameId), outcome);
  saveJson(skillKey(gameId), Number(next.toFixed(3)));
  return next;
}

/* ------------------------------------------------------------------ human-like helpers */

/** Linear blend: `lerp(a, b, skill)`. */
export function bySkill(skill: number, gentle: number, sharp: number): number {
  return gentle + (sharp - gentle) * clamp(skill, 0, 1);
}

/**
 * A believable "thinking" pause in ms: random within [min, max], a bit shorter for sharper
 * opponents, never instant.
 */
export function thinkMs(skill: number, min = 600, max = 1500, rnd: () => number = Math.random): number {
  const span = Math.max(0, max - min);
  return Math.round(min + span * (0.35 + 0.65 * rnd()) * bySkill(skill, 1, 0.7));
}

/** Pick the best option with probability rising with skill, else a random one (a human slip). */
export function pickWithSlips<T>(ranked: readonly T[], skill: number, rnd: () => number = Math.random): T {
  if (ranked.length === 0) throw new Error('pickWithSlips: no options');
  const best = bySkill(skill, 0.45, 0.95);
  if (ranked.length === 1 || rnd() < best) return ranked[0]!;
  // Slips lean towards the better half.
  const i = 1 + Math.floor(rnd() * rnd() * (ranked.length - 1));
  return ranked[Math.min(i, ranked.length - 1)]!;
}

/** Gaussian-ish noise in [-1, 1] (sum of uniforms). */
export function wobble(rnd: () => number = Math.random): number {
  return (rnd() + rnd() + rnd()) / 1.5 - 1;
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, a), b);
}

function shuffle<T>(list: readonly T[], rnd: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
