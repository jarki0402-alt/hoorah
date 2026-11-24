import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { type Role, type SilumanEvent, SilumanMatch, TIMING, tallyLength } from './logic';
import { applyMirror, MirrorScene, type SilumanMirror, toMirror } from './mirror';

function player(id: number): PlayerInfo {
  return {
    id,
    name: `Pemain ${id}`.padEnd(12, 'x'),
    fruit: 'semangka',
    look: { c: 'putri', s: 3, hc: 2, oc: 5 },
    color: '#FF5C9A',
    connected: true,
    isHost: id === 1,
  };
}

function make(n: number, seed = 11) {
  let now = 1_000;
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const m = new SilumanMatch({ seed, now, players: ids.map((id) => ({ id, connected: true })) });
  const step = (ms: number) => {
    const events: SilumanEvent[] = [];
    for (let left = ms; left > 0; left -= 250) {
      now += Math.min(250, left);
      events.push(...m.tick(now));
    }
    return events;
  };
  const players = ids.map(player);
  const publish = (at = now) => toMirror(m, at, m.phaseElapsed(), m.held, 1, players);
  return { m, step, at: () => now, publish };
}

type Game = ReturnType<typeof make>;

const byRole = (m: SilumanMatch, role: Role) => m.table.filter((s) => s.role === role);

function wire(state: SilumanMirror): SilumanMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

function scene(g: Game, at = g.at()): MirrorScene {
  return new MirrorScene(wire(g.publish(at)), () => at);
}

function toNight(g: Game) {
  g.m.start(g.at());
  g.m.skipIntro(g.at());
  for (const s of g.m.table) g.m.ready(s.id, g.at());
  g.step(TIMING.dealMinMs + 300);
  g.step(TIMING.duskMs + 50);
  expect(g.m.calling).toBe('siluman');
}

function toDay(g: Game) {
  toNight(g);
  const sil = byRole(g.m, 'siluman')[0]!;
  const victim = byRole(g.m, 'warga')[0]!;
  g.m.nightPick(sil.id, victim.id, g.at());
  g.step((TIMING.turnMs + TIMING.gapMs) * 3 + 100);
  expect(g.m.phase).toBe('dawn');
  return { sil, victim };
}

/** Everyone else votes the first siluman out, the siluman votes someone else. */
function voteOut(g: Game, sil: number) {
  for (const s of g.m.alive) g.m.ready(s.id, g.at());
  expect(g.m.phase).toBe('vote');
  const other = g.m.alive.find((x) => x.id !== sil)!.id;
  for (const s of g.m.alive) {
    g.m.vote(s.id, s.id === sil ? other : sil, g.at());
    g.m.lock(s.id, g.at());
  }
  expect(g.m.phase).toBe('tally');
}

describe('siluman mirror', () => {
  it('round-trips the setup menu, the roster and the Host', () => {
    const g = make(6);
    g.m.pick('pemburu');
    const s = scene(g);
    expect(s.phase).toBe('setup');
    expect(s.step).toBe('roles');
    expect(s.settings).toEqual(g.m.settings);
    expect(s.host).toBe(1);
    expect(s.present.map((x) => x.id)).toEqual(g.m.present.map((x) => x.id));
    expect(s.info(4)?.name).toBe(player(4).name);
    expect(s.info(4)?.look).toEqual(player(4).look);
  });

  it('keeps every card and night pick off the wire at night', () => {
    const g = make(8);
    toNight(g);
    const sil = byRole(g.m, 'siluman')[0]!;
    const target = byRole(g.m, 'warga')[0]!;
    g.m.nightPick(sil.id, target.id, g.at());
    const state = g.publish();
    expect(state.se.every(([, , role]) => role === null)).toBe(true);
    // No ready or lock ticks at night (they could show who acted).
    expect(state.se.every(([, flags]) => (flags & (8 | 16)) === 0)).toBe(true);
    expect([state.dv, state.hu, state.hs, state.df, state.ta]).toEqual([null, null, null, null, null]);
    expect(state.ni).toEqual([]);
    const s = new MirrorScene(wire(state), () => g.at() + 2000);
    expect(s.calling).toBe('siluman');
    expect(s.clockLength()).toBe(g.m.clockLength());
    expect(s.msLeft()).toBe(g.m.msLeft() - 2000);
    expect(s.table).toHaveLength(8);
    expect(s.alive).toHaveLength(8);
  });

  it('shows only the morning victim card at dawn', () => {
    const g = make(7);
    const { victim } = toDay(g);
    const state = g.publish();
    const shown = state.se.filter(([, , role]) => role !== null);
    expect(shown).toEqual([[victim.id, expect.any(Number), victim.role]]);
    const s = new MirrorScene(wire(state), () => g.at());
    expect(s.dawnVictim).toBe(victim.id);
    expect(s.seat(victim.id)?.alive).toBe(false);
    expect(s.alive.map((x) => x.id)).toEqual(g.m.alive.map((x) => x.id));
  });

  it('sends suspicion counts, never who suspects whom', () => {
    const g = make(7);
    const { sil } = toDay(g);
    g.step(TIMING.dawnMs + 50);
    expect(g.m.phase).toBe('discuss');
    const accusers = g.m.alive.filter((s) => s.id !== sil.id).slice(0, 3);
    for (const a of accusers) g.m.suspect(a.id, sil.id, g.at());
    g.m.ready(accusers[0]!.id, g.at());
    const state = g.publish();
    expect(state.mk).toEqual([[sil.id, 3]]);
    const s = new MirrorScene(wire(state), () => g.at());
    expect(s.marks()).toEqual(g.m.marks());
    expect(s.seat(accusers[0]!.id)?.ready).toBe(true);
    expect(s.seat(accusers[1]!.id)?.ready).toBe(false);
  });

  it('replays the tally on the shared clock and turns over only the voted card', () => {
    const g = make(7);
    const { sil } = toDay(g);
    g.step(TIMING.dawnMs + 50);
    voteOut(g, sil.id);
    let clock = g.at();
    const s = new MirrorScene(wire(g.publish()), () => clock);
    expect(s.tally?.order).toEqual(g.m.tally?.order);
    expect(s.tally?.out).toBe(sil.id);
    expect(s.tallyShown()).toBe(0);
    g.step(3_000);
    clock = g.at();
    expect(s.tallyShown()).toBe(g.m.tallyShown());
    expect(s.tallyShown()).toBeGreaterThan(0);
    // A local pause holds the tally where it is.
    s.setLocalPause(true);
    const held = s.tallyShown();
    clock += 60_000;
    expect(s.tallyShown()).toBe(held);
    expect(g.publish().se.every(([, , role]) => role === null)).toBe(true);

    g.step(tallyLength(g.m.tally!.order.length));
    expect(g.m.phase).toBe('reveal');
    const reveal = g.publish();
    expect(reveal.se.filter(([, , role]) => role !== null)).toEqual([
      [sil.id, expect.any(Number), 'siluman'],
    ]);
    const r = new MirrorScene(wire(reveal), () => g.at());
    expect(r.seat(sil.id)?.role).toBe('siluman');
    expect(r.tally?.tie).toBe(false);
  });

  it('freezes the clock while the Host is held', () => {
    const g = make(6);
    toNight(g);
    g.step(4_000);
    g.m.setHeld(true, g.at());
    const left = g.m.msLeft();
    const s = new MirrorScene(wire(g.publish()), () => g.at() + 90_000);
    expect(s.msLeft()).toBe(Math.round(left));
  });

  it('reveals the whole cast and the chronicle only at the end', () => {
    const g = make(5);
    const { sil } = toDay(g);
    g.step(TIMING.dawnMs + 50);
    expect(g.publish().ni).toEqual([]);
    voteOut(g, sil.id);
    g.step(tallyLength(g.m.tally!.order.length) + TIMING.revealMs + 600);
    expect(g.m.phase).toBe('final');
    const s = new MirrorScene(wire(g.publish()), () => g.at());
    expect(s.winner).toBe('warga');
    expect(s.table.map((x) => [x.id, x.role, x.alive])).toEqual(
      g.m.table.map((x) => [x.id, x.role, x.alive]),
    );
    expect(s.nights.map((x) => [x.night, x.victim])).toEqual(g.m.nights.map((x) => [x.night, x.victim]));
    expect(s.days).toEqual(g.m.days.map((d) => ({ day: d.day, out: d.out })));
  });

  it('sends the Tabib save only when the chronicle shows it', () => {
    const g = make(6);
    toNight(g);
    const sil = byRole(g.m, 'siluman')[0]!;
    const tabib = byRole(g.m, 'tabib')[0]!;
    const target = byRole(g.m, 'warga')[0]!;
    g.m.nightPick(sil.id, target.id, g.at());
    g.step((TIMING.turnMs + TIMING.gapMs) * 2 + 50);
    g.m.nightPick(tabib.id, target.id, g.at());
    g.step(TIMING.turnMs + TIMING.gapMs + 50);
    expect(g.m.dawnVictim).toBeNull();
    g.m.phase = 'final';
    g.m.winner = 'siluman';
    const state = g.publish();
    expect(state.ni).toEqual([[1, null, target.id]]);
  });

  it('rejects malformed states without throwing', () => {
    const g = make(6);
    const good = JSON.parse(JSON.stringify(g.publish())) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      7,
      [],
      { ...good, v: 2 },
      { ...good, ph: 'party' },
      { ...good, sp: 'menu' },
      { ...good, st: ['dasar'] },
      { ...good, st: ['semua', 'sedang'] },
      { ...good, n: -1 },
      { ...good, w: 'nobody' },
      { ...good, cue: 'drum' },
      { ...good, call: 'warga' },
      { ...good, end: 'soon' },
      { ...good, left: -5 },
      { ...good, cl: 1.5 },
      { ...good, dv: 0 },
      { ...good, ta: { o: [1, 2, 3], x: null, t: false } },
      { ...good, ta: { o: [0, 2], x: null, t: false } },
      { ...good, se: [[1, 99, null]] },
      { ...good, se: [[1, 3, 'raja']] },
      { ...good, se: Array.from({ length: 40 }, (_, i) => [i + 1, 3, null]) },
      { ...good, ni: [[1, 'x', null]] },
      { ...good, da: [[0, null]] },
      { ...good, mk: [[2, 0]] },
      { ...good, pl: [{ id: 1, name: 'A', color: '#000', look: { c: 'nobody' } }] },
      { ...good, pl: [{ id: 1, name: 'x'.repeat(80), color: '#000', look: { c: 'putri' } }] },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for a full kampung', () => {
    const g = make(16);
    const { sil } = toDay(g);
    g.step(TIMING.dawnMs + 50);
    voteOut(g, sil.id);
    const tally = JSON.stringify(g.publish()).length;
    expect(tally).toBeLessThan(3_500);
    // The biggest case: the whole cast and a full chronicle at the end.
    for (let i = 2; i <= 8; i++) {
      g.m.nights.push({ night: i, attacked: i, protected: i, victim: null, sight: null });
      g.m.days.push({ day: i, out: i + 1, tie: false });
    }
    g.m.phase = 'final';
    g.m.winner = 'siluman';
    const final = JSON.stringify(g.publish()).length;
    expect(final).toBeLessThan(3_500);
  });
});
