import { describe, expect, it } from 'vitest';
import {
  INTRO_CUES,
  MIN_PLAYERS,
  NIGHT_ORDER,
  type Role,
  rolesFor,
  type SilumanEvent,
  SilumanMatch,
  silumanCount,
  TIMING,
  tallyLength,
} from './logic';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true }));

function make(n: number, seed = 11) {
  let now = 1_000;
  const m = new SilumanMatch({ seed, now, players: players(n) });
  const step = (ms: number) => {
    const events: SilumanEvent[] = [];
    for (let left = ms; left > 0; left -= 250) {
      now += Math.min(250, left);
      events.push(...m.tick(now));
    }
    return events;
  };
  return { m, step, at: () => now };
}

/** Start, skip the sound intro, everyone looks at their card: ends at dusk. */
function toNight(g: ReturnType<typeof make>) {
  g.m.start(g.at());
  g.m.skipIntro(g.at());
  for (const s of g.m.table) g.m.ready(s.id, g.at());
  g.step(TIMING.dealMinMs + 300);
  expect(g.m.phase).toBe('dusk');
  g.step(TIMING.duskMs + 50);
  expect(g.m.phase).toBe('night');
  expect(g.m.calling).toBe('siluman');
}

const byRole = (m: SilumanMatch, role: Role) => m.table.filter((s) => s.role === role);
/** Run the rest of the current turn and the gap after it. */
const nextTurn = (g: ReturnType<typeof make>) => g.step(TIMING.turnMs + TIMING.gapMs + 50);

describe('roles', () => {
  it('scales the siluman with the table', () => {
    expect(silumanCount(5)).toBe(1);
    expect(silumanCount(8)).toBe(2);
    expect(silumanCount(16)).toBe(3);
  });

  it('always deals a Dukun and a Tabib, extras on request', () => {
    const base = rolesFor(5, 'dasar');
    expect(base).toHaveLength(5);
    expect(base.filter((r) => r === 'dukun')).toHaveLength(1);
    expect(base.filter((r) => r === 'tabib')).toHaveLength(1);
    expect(rolesFor(6, 'pemburu')).toContain('pemburu');
    expect(rolesFor(6, 'pengkhianat')).not.toContain('pengkhianat');
    const both = rolesFor(9, 'keduanya');
    expect(both).toContain('pemburu');
    expect(both).toContain('pengkhianat');
    expect(both.filter((r) => r === 'siluman')).toHaveLength(2);
  });
});

describe('setup', () => {
  it('needs five players and refuses the Pengkhianat below seven', () => {
    const g = make(4);
    expect(g.m.start(g.at())).toEqual([]);
    expect(g.m.phase).toBe('setup');
    const h = make(6);
    expect(h.m.pick('pengkhianat')).toBe(false);
    expect(h.m.pick('pemburu')).toBe(true);
    h.m.next(h.at());
    expect(h.m.step).toBe('talk');
    expect(h.m.pick('panjang')).toBe(true);
    expect(h.m.pick('pemburu')).toBe(false);
    expect(h.m.back()).toBe(true);
    expect(MIN_PLAYERS).toBe(5);
  });

  it('introduces every sound before the cards are dealt', () => {
    const g = make(5);
    const cues: string[] = [];
    for (const e of g.m.start(g.at())) if (e.type === 'cue') cues.push(e.cue);
    for (const e of g.step(TIMING.introCueMs * INTRO_CUES.length + 100))
      if (e.type === 'cue') cues.push(e.cue);
    expect(cues).toEqual([...INTRO_CUES]);
    expect(g.m.phase).toBe('deal');
    expect(g.m.table).toHaveLength(5);
  });
});

describe('the night', () => {
  it('calls each role for a fixed turn with eyes closed in between', () => {
    const g = make(6);
    toNight(g);
    const calls: string[] = ['siluman'];
    const closes: string[] = [];
    for (const e of g.step((TIMING.turnMs + TIMING.gapMs) * NIGHT_ORDER.length + 100)) {
      if (e.type === 'call') calls.push(e.role);
      if (e.type === 'close') closes.push(e.role);
    }
    expect(calls).toEqual([...NIGHT_ORDER]);
    expect(closes).toEqual([...NIGHT_ORDER]);
    expect(g.m.phase).toBe('dawn');
  });

  it('only lets the called role act, on valid targets', () => {
    const g = make(6);
    toNight(g);
    const sil = byRole(g.m, 'siluman')[0]!;
    const dukun = byRole(g.m, 'dukun')[0]!;
    const warga = byRole(g.m, 'warga')[0]!;
    g.m.nightPick(dukun.id, warga.id, g.at());
    expect(g.m.dukunPick).toBeNull();
    g.m.nightPick(sil.id, sil.id, g.at());
    expect(g.m.silumanPicks.size).toBe(0);
    g.m.nightPick(sil.id, warga.id, g.at());
    expect(g.m.silumanPicks.get(sil.id)).toBe(warga.id);
  });

  it('takes the siluman victim at dawn unless the Tabib protected them', () => {
    const g = make(6);
    toNight(g);
    const sil = byRole(g.m, 'siluman')[0]!;
    const tabib = byRole(g.m, 'tabib')[0]!;
    const dukun = byRole(g.m, 'dukun')[0]!;
    const target = byRole(g.m, 'warga')[0]!;
    g.m.nightPick(sil.id, target.id, g.at());
    nextTurn(g);
    expect(g.m.calling).toBe('dukun');
    g.m.nightPick(dukun.id, sil.id, g.at());
    expect(g.m.sights.at(-1)).toMatchObject({ target: sil.id, role: 'siluman' });
    // One look per night.
    g.m.nightPick(dukun.id, target.id, g.at());
    expect(g.m.sights).toHaveLength(1);
    nextTurn(g);
    expect(g.m.calling).toBe('tabib');
    g.m.nightPick(tabib.id, target.id, g.at());
    nextTurn(g);
    expect(g.m.phase).toBe('dawn');
    expect(g.m.dawnVictim).toBeNull();
    expect(target.alive).toBe(true);
    expect(tabib.stats.saves).toBe(1);
    expect(dukun.stats.seen).toBe(1);
  });

  it('does not let the Tabib protect the same player two nights running', () => {
    const g = make(6);
    toNight(g);
    const tabib = byRole(g.m, 'tabib')[0]!;
    nextTurn(g);
    nextTurn(g);
    g.m.nightPick(tabib.id, tabib.id, g.at());
    nextTurn(g);
    expect(g.m.lastProtected).toBe(tabib.id);
    // Day: nobody suspects, everyone skips.
    g.step(TIMING.dawnMs + 50);
    expect(g.m.phase).toBe('discuss');
    for (const s of g.m.alive) g.m.ready(s.id, g.at());
    expect(g.m.phase).toBe('vote');
    for (const s of g.m.alive) {
      g.m.vote(s.id, 0, g.at());
      g.m.lock(s.id, g.at());
    }
    expect(g.m.phase).toBe('tally');
    expect(g.m.tally?.out).toBeNull();
    g.step(tallyLength(g.m.tally!.order.length) + TIMING.revealMs + TIMING.duskMs + 300);
    expect(g.m.phase).toBe('night');
    nextTurn(g);
    nextTurn(g);
    expect(g.m.calling).toBe('tabib');
    g.m.nightPick(tabib.id, tabib.id, g.at());
    expect(g.m.tabibPick).toBeNull();
  });
});

describe('the day', () => {
  function toDay(g: ReturnType<typeof make>) {
    toNight(g);
    const sil = byRole(g.m, 'siluman')[0]!;
    const victim = byRole(g.m, 'warga')[0]!;
    g.m.nightPick(sil.id, victim.id, g.at());
    g.step((TIMING.turnMs + TIMING.gapMs) * 3 + 100);
    expect(g.m.dawnVictim).toBe(victim.id);
    g.step(TIMING.dawnMs + 50);
    expect(g.m.phase).toBe('discuss');
    return { sil, victim };
  }

  it('turns the most suspected into the defender, then votes them out', () => {
    const g = make(7);
    const { sil, victim } = toDay(g);
    expect(victim.alive).toBe(false);
    const accusers = g.m.alive.filter((s) => s.id !== sil.id);
    for (const a of accusers.slice(0, 3)) g.m.suspect(a.id, sil.id, g.at());
    expect(g.m.suspicions()[0]).toMatchObject({ id: sil.id });
    // Tapping again takes the marker back.
    g.m.suspect(accusers[0]!.id, sil.id, g.at());
    expect(g.m.suspicions()[0]!.by).toHaveLength(2);
    for (const s of g.m.alive) g.m.ready(s.id, g.at());
    expect(g.m.phase).toBe('defense');
    expect(g.m.defender).toBe(sil.id);
    g.step(TIMING.defenseMinMs + 50);
    g.m.doneDefending(sil.id, g.at());
    expect(g.m.phase).toBe('vote');
    for (const s of g.m.alive) {
      g.m.vote(s.id, s.id === sil.id ? accusers[0]!.id : sil.id, g.at());
      g.m.lock(s.id, g.at());
    }
    expect(g.m.phase).toBe('tally');
    expect(g.m.tally?.out).toBe(sil.id);
    expect(g.m.tallyShown()).toBe(0);
    g.step(tallyLength(g.m.tally!.order.length) + 50);
    expect(g.m.phase).toBe('reveal');
    // With two siluman in a table of 7 the game goes on.
    expect(g.m.table.filter((s) => s.role === 'siluman')).toHaveLength(2);
  });

  it('keeps everyone in on a tie', () => {
    const g = make(6);
    const { sil } = toDay(g);
    for (const s of g.m.alive) g.m.ready(s.id, g.at());
    const others = g.m.alive.filter((s) => s.id !== sil.id);
    const [a, b] = [others[0]!, others[1]!];
    const voters = g.m.alive;
    voters.forEach((s, i) => {
      const target = i % 2 === 0 ? (s.id === a.id ? b.id : a.id) : s.id === b.id ? a.id : b.id;
      g.m.vote(s.id, target, g.at());
      g.m.lock(s.id, g.at());
    });
    expect(g.m.tally).not.toBeNull();
    if (g.m.tally?.tie) expect(g.m.tally.out).toBeNull();
  });

  it('lets the arwah guess for points and ends when the siluman are gone', () => {
    const g = make(5);
    const { sil, victim } = toDay(g);
    for (const s of g.m.alive) g.m.ready(s.id, g.at());
    expect(g.m.phase).toBe('vote');
    g.m.vote(victim.id, sil.id, g.at());
    g.m.lock(victim.id, g.at());
    for (const s of g.m.alive) {
      g.m.vote(s.id, s.id === sil.id ? (g.m.alive.find((x) => x.id !== sil.id)?.id ?? 0) : sil.id, g.at());
      g.m.lock(s.id, g.at());
    }
    expect(g.m.tally?.out).toBe(sil.id);
    expect(victim.stats.ghostHits).toBe(1);
    g.step(tallyLength(g.m.tally!.order.length) + TIMING.revealMs + 600);
    expect(g.m.phase).toBe('final');
    expect(g.m.winner).toBe('warga');
    const warga = g.m.table.find((s) => s.role === 'warga' && s.alive)!;
    expect(warga.score).toBeGreaterThan(sil.score);
    g.step(TIMING.finalMs + 50);
    expect(g.m.phase).toBe('ended');
  });

  it('lets a dead Pemburu take someone along', () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const g = make(6, seed);
      g.m.pick('pemburu');
      toNight(g);
      const hunter = byRole(g.m, 'pemburu')[0];
      const sil = byRole(g.m, 'siluman')[0]!;
      if (!hunter) continue;
      found = true;
      g.m.nightPick(sil.id, hunter.id, g.at());
      g.step((TIMING.turnMs + TIMING.gapMs) * 3 + TIMING.dawnMs + 200);
      expect(g.m.phase).toBe('hunt');
      expect(g.m.hunter).toBe(hunter.id);
      g.m.shoot(hunter.id, sil.id, g.at());
      expect(sil.alive).toBe(false);
      expect(hunter.stats.shots).toBe(1);
      g.step(TIMING.huntShowMs + 50);
      expect(g.m.phase).toBe('final');
      expect(g.m.winner).toBe('warga');
    }
    expect(found).toBe(true);
  });

  it('gives the siluman the win once they match the others', () => {
    const g = make(5);
    const { sil } = toDay(g);
    // 4 left: 1 siluman vs 3. Vote out a non-siluman: 1 vs 2. Next night takes one more: 1 vs 1.
    for (const s of g.m.alive) g.m.ready(s.id, g.at());
    const scapegoat = g.m.alive.find((s) => s.id !== sil.id)!;
    for (const s of g.m.alive) {
      g.m.vote(s.id, s.id === scapegoat.id ? sil.id : scapegoat.id, g.at());
      g.m.lock(s.id, g.at());
    }
    g.step(tallyLength(g.m.tally!.order.length) + TIMING.revealMs + 600);
    if (g.m.phase === 'hunt') g.step(TIMING.huntMs + 100);
    expect(g.m.phase).toBe('dusk');
    g.step(TIMING.duskMs + 50);
    const next = g.m.alive.find((s) => s.role !== 'siluman' && s.role !== 'tabib')!;
    g.m.nightPick(sil.id, next.id, g.at());
    g.step((TIMING.turnMs + TIMING.gapMs) * 3 + TIMING.dawnMs + 200);
    if (g.m.phase === 'hunt') g.step(TIMING.huntMs + 100);
    expect(g.m.phase).toBe('final');
    expect(g.m.winner).toBe('siluman');
  });

  it('stops the clock while held', () => {
    const g = make(5);
    toNight(g);
    const left = g.m.msLeft();
    g.m.setHeld(true, g.at());
    g.step(30_000);
    expect(g.m.calling).toBe('siluman');
    expect(g.m.msLeft()).toBe(left);
  });
});
