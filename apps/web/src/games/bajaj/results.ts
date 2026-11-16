/** Final standings, awards and the GameResult handed to the shell, per mode. Pure, so it is tested. */
import type { GameAward, GameResult } from '@hoorah/sdk';
import type { Kart, Race } from './logic';
import { formatTime, STR } from './strings';

export interface ResultRow {
  idx: number;
  place: number;
  time: number | null;
  best: number | null;
  lapsDone: number;
  lives: number;
  out: boolean;
}

/** Everyone in final order. Lawan Waktu ranks by best lap; the others keep the race order. */
export function finalRows(race: Race): ResultRow[] {
  let order = [...race.order];
  if (race.mode === 'time') {
    order = race.karts
      .map((k) => k.idx)
      .sort((a, b) => {
        const A = race.bestLap(race.karts[a]!);
        const B = race.bestLap(race.karts[b]!);
        if (A === null && B === null) return race.karts[b]!.u - race.karts[a]!.u;
        if (A === null) return 1;
        if (B === null) return -1;
        return A - B;
      });
  }
  return order.map((idx, i) => {
    const k = race.karts[idx]!;
    return {
      idx,
      place: i + 1,
      time: k.finishT,
      best: race.bestLap(k),
      lapsDone: k.lapTimes.length,
      lives: k.lives,
      out: k.out,
    };
  });
}

function pickBest(humans: Kart[], score: (k: Kart) => number, min: number): Kart | null {
  let best: Kart | null = null;
  let bestScore = -Infinity;
  let tie = false;
  for (const k of humans) {
    const s = score(k);
    if (s > bestScore) {
      bestScore = s;
      best = k;
      tie = false;
    } else if (s === bestScore) {
      tie = true;
    }
  }
  if (!best || bestScore < min || tie) return null;
  return best;
}

export function pickAwards(race: Race): GameAward[] {
  const humans = race.karts.filter((k) => k.human);
  const out: GameAward[] = [];
  const add = (k: Kart | null, title: string, desc: (k: Kart) => string, icon: GameAward['icon']) => {
    if (k) out.push({ playerId: k.id, title, desc: desc(k), icon });
  };
  const fastest = pickBest(
    humans,
    (k) => {
      const b = race.bestLap(k);
      return b === null ? -Infinity : -b;
    },
    -1e12,
  );
  const lap = (k: Kart) => STR.awardFastestLapDesc(formatTime(race.bestLap(k)!));
  const hits = pickBest(humans, (k) => k.stats.hitsGiven, 1);
  const boxes = pickBest(humans, (k) => k.stats.boxes, 3);
  const clean = humans.length >= 2 ? pickBest(humans, (k) => -k.stats.wallHits, -1e9) : null;

  if (race.mode === 'arena') {
    add(hits, STR.awardSniper, (k) => STR.awardSniperDesc(k.stats.hitsGiven), 'target');
    const tough = pickBest(humans, (k) => (k.out ? k.outT / 1e6 : 1e6 + k.lives), 0);
    add(tough, STR.awardTough, (k) => (k.out ? STR.awardToughOutDesc : STR.awardToughDesc(k.lives)), 'heart');
    add(boxes, STR.awardBoxes, (k) => STR.awardBoxesDesc(k.stats.boxes), 'build');
    return out.slice(0, 4);
  }
  if (race.mode === 'time') {
    add(fastest, STR.awardFastestLap, lap, 'zap');
    const steady = pickBest(
      humans.filter((k) => k.lapTimes.length >= 2),
      (k) => -(Math.max(...k.lapTimes) - Math.min(...k.lapTimes)),
      -1e12,
    );
    add(
      steady,
      STR.awardSteady,
      (k) => STR.awardSteadyDesc(formatTime(Math.max(...k.lapTimes) - Math.min(...k.lapTimes))),
      'star',
    );
    add(clean, STR.awardClean, () => STR.awardCleanDesc, 'heart');
    return out.slice(0, 4);
  }
  add(fastest, STR.awardFastestLap, lap, 'zap');
  add(hits, STR.awardItems, (k) => STR.awardItemsDesc(k.stats.hitsGiven), 'target');
  add(
    pickBest(humans, (k) => k.stats.overtakes, 3),
    STR.awardOvertakes,
    (k) => STR.awardOvertakesDesc(k.stats.overtakes),
    'star',
  );
  add(boxes, STR.awardBoxes, (k) => STR.awardBoxesDesc(k.stats.boxes), 'build');
  add(clean, STR.awardClean, () => STR.awardCleanDesc, 'heart');
  return out.slice(0, 4);
}

export function resultLabel(race: Race, r: ResultRow): string {
  if (race.mode === 'arena') return STR.resultLabelArena(r.place, r.out ? null : r.lives);
  if (race.mode === 'time') return STR.resultLabelTime(r.place, r.best !== null ? formatTime(r.best) : null);
  return STR.resultLabel(r.place, r.time !== null ? formatTime(r.time) : null);
}

export function buildResult(race: Race, circuitName: string): GameResult {
  const rows = finalRows(race);
  const total = race.karts.length;
  const ranking = rows
    .filter((r) => race.karts[r.idx]!.human)
    .map((r) => ({
      playerId: race.karts[r.idx]!.id,
      score: total - r.place + 1,
      rank: r.place,
      label: resultLabel(race, r),
    }));
  const winner = race.karts[rows[0]?.idx ?? 0];
  const title = !winner
    ? STR.resultsTitle
    : winner.human
      ? STR.resultWinner(winner.name)
      : STR.resultCpuWinner(winner.name);
  return {
    title,
    subtitle: STR.resultSub(race.mode, circuitName, race.laps),
    ranking,
    awards: pickAwards(race),
  };
}
