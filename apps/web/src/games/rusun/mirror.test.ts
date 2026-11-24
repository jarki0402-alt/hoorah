import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { HudModel, PlayerCard } from './hud';
import {
  FALL_MS,
  FAR_PRESS_MS,
  GameClock,
  INTRO_MS,
  MAX_HEIGHT,
  type RusunEvent,
  RusunLogic,
  STALE_PRESS_MS,
  TURN_MS,
} from './logic';
import {
  applyMirror,
  FX_KEPT,
  type FxRow,
  type MirrorFall,
  MirrorTower,
  mirrorHud,
  type RusunMirror,
  toMirror,
} from './mirror';

/* ------------------------------------------------------------------ fixtures */

const card = (id: number, name = `Pemain ${id}`): PlayerCard => ({
  id,
  name,
  fruit: 'semangka',
  look: lookOfFruit('semangka'),
  color: '#FF5A1F',
});

function hudFor(ids: number[], name?: (id: number) => string): HudModel {
  const cards = ids.map((id) => card(id, name?.(id)));
  return {
    showTurn: true,
    floorNumber: 2,
    turn: cards[0] ?? null,
    recordHint: 'Rekor 12 lantai',
    players: cards.map((c, i) => ({
      ...c,
      stat: '3 lantai · 1 PAS',
      score: 12 + i,
      active: i === 0,
      dim: i === 0 ? 1 : 0.75,
      face: 'happy',
    })),
    zone: 'yellow',
    balance: 0.61234,
    record: 12,
    recordSolo: false,
    banner: {
      kind: 'roboh',
      key: 7,
      collapser: cards[0]!,
      winner: cards[1] ?? null,
      who: ' merobohkan lantai 9',
      highlight: 'Pemain 2 menang!',
      rest: ' Tinggi 8 lantai.',
    },
  };
}

/**
 * The Host side in miniature: a game clock on a fake server time, the rules, and the same
 * bookkeeping the driver keeps for far-away screens.
 */
class Host {
  server = 1_700_000_000_000.5;
  readonly clock = new GameClock(() => this.server);
  readonly logic: RusunLogic;
  intros = 0;
  drops = 0;
  fall: MirrorFall | null = null;
  fx: FxRow[] = [];
  hud: HudModel;

  constructor(ids: number[], rounds = 1) {
    this.logic = new RusunLogic({
      rounds,
      roster: ids.map((id) => ({ id, connected: true })),
      now: this.clock.now(),
    });
    this.logic.pressWindowMs = FAR_PRESS_MS;
    this.hud = hudFor(ids);
    this.flush();
  }

  get now(): number {
    return this.clock.now();
  }

  advance(ms: number): void {
    this.server += ms;
    this.logic.tick(this.clock.now());
    this.flush();
  }

  /** A press stamped at server time `stampServer`, arriving now. */
  press(id: number, stampServer: number): boolean {
    const ok = this.logic.drop(id, this.clock.toGame(stampServer), this.clock.now());
    this.flush();
    return ok;
  }

  flush(): RusunEvent[] {
    const events = this.logic.drain();
    for (const e of events) {
      if (e.type === 'intro') {
        this.intros++;
        this.fall = null;
      } else if (e.type === 'drop') {
        this.fall = { n: ++this.drops, fall: e.fall, result: null };
      } else if ((e.type === 'land' || e.type === 'miss') && this.fall) {
        this.fall.result = { strikes: null, topped: false };
      } else if (e.type === 'collapse' && this.fall) {
        const i = e.info;
        this.fall.result = {
          strikes: i.reason === 'strikes' ? { fromIndex: i.fromIndex, dir: i.dir } : null,
          topped: false,
        };
      } else if (e.type === 'topped' && this.fall?.result) {
        this.fall.result.topped = true;
      }
    }
    return events;
  }

  publish(): RusunMirror {
    const L = this.logic;
    const state = toMirror({
      clock: { offset: this.clock.offsetMs, pausedAt: this.clock.pausedAtMs },
      phase: L.phase,
      round: L.round,
      rounds: L.rounds,
      intros: this.intros,
      phaseEndsAt: L.phaseEndsAt,
      deadline: L.deadline,
      swing: L.swing,
      floors: L.floors,
      fall: this.fall,
      fx: this.fx,
      hud: this.hud,
    });
    // Everything crosses the network as JSON.
    return JSON.parse(JSON.stringify(state)) as RusunMirror;
  }

  /** Game time of the next moment the swing is right over the tower top (within one period). */
  perfectAt(): number {
    const L = this.logic;
    const target = L.top.x;
    const from = this.now;
    let best = from;
    for (let t = from; t < from + L.swing.period; t += 0.5) {
      if (Math.abs(L.swingX(t) - target) < Math.abs(L.swingX(best) - target)) best = t;
    }
    return best;
  }
}

/** The far screen: a tower fed with what the Host published, collecting the scene events. */
function far(): { tower: MirrorTower; events: RusunEvent[] } {
  const tower = new MirrorTower();
  const events: RusunEvent[] = [];
  tower.onEvent((e) => events.push(e));
  return { tower, events };
}

/** Run the Host until the first turn, with the far screen connected from the start. */
function started(ids = [1, 2]) {
  const host = new Host(ids);
  const b = far();
  b.tower.push(applyMirror(host.publish())!, host.server);
  // The replica redraws the tower once on joining and clears the flag.
  expect(b.tower.resync).toBe(true);
  b.tower.resync = false;
  host.advance(INTRO_MS);
  expect(host.logic.phase).toBe('aim');
  b.tower.push(applyMirror(host.publish())!, host.server + 120);
  return { host, ...b };
}

/* ------------------------------------------------------------------ packing */

describe('toMirror / applyMirror', () => {
  it('round-trips a state through JSON unchanged', () => {
    const host = new Host([1, 2, 3]);
    host.advance(INTRO_MS + 900);
    host.press(1, host.server - 200);
    host.advance(FALL_MS);
    host.fx = [
      { n: 3, g: 1, ms: 1500, k: 'p', x: 700, y: 580, pk: 'pas', tx: 'PAS! +2', sb: '2x beruntun', tl: -6 },
      { n: 4, g: 1, ms: 1500, k: 's', tx: 'MELESET!', sb: 'Pemain 1 · 1/3' },
      {
        n: 5,
        g: 1,
        ms: 2600,
        k: 'b',
        w: [2, 'Pemain 2', 'semangka', lookOfFruit('semangka'), '#123456'],
        tx: 'Ayo!',
        tn: 'cheer',
        x: 300,
      },
    ];
    const state = host.publish();
    expect(state.fa?.r).not.toBeNull();
    const parsed = applyMirror(state);
    expect(parsed).toEqual(state);
    // The HUD comes back as the Host had it (balance rounded for the wire).
    const hud = mirrorHud(parsed!);
    expect(hud).toEqual({ ...host.hud, balance: 0.612 });
  });

  it('keeps only the latest call-outs', () => {
    const host = new Host([1]);
    host.fx = Array.from(
      { length: 10 },
      (_, i) => ({ n: i + 1, g: 0, ms: 1500, k: 's', tx: 'X', sb: 'y' }) as FxRow,
    );
    const fx = host.publish().fx;
    expect(fx).toHaveLength(FX_KEPT);
    expect(fx[0]!.n).toBe(10 - FX_KEPT + 1);
  });

  it('rejects malformed states', () => {
    const host = new Host([1, 2]);
    host.advance(INTRO_MS);
    host.press(1, host.server);
    const good = host.publish() as unknown as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad = (patch: (s: Record<string, unknown>) => void): unknown => {
      const s = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(s);
      return s;
    };
    const cases: unknown[] = [
      null,
      42,
      'state',
      [],
      { ...good, v: 2 },
      bad((s) => delete s.off),
      bad((s) => (s.off = 'x')),
      bad((s) => (s.pz = Number.NaN)),
      bad((s) => (s.ph = 'boom')),
      bad((s) => (s.rd = 0)),
      bad((s) => (s.rd = 9)),
      bad((s) => (s.rn = 6)),
      bad((s) => (s.sw = [1, 0])),
      bad((s) => (s.sw = [1])),
      bad((s) => (s.fl = [])),
      bad((s) => (s.fl = Array.from({ length: MAX_HEIGHT + 1 }, () => 640))),
      bad((s) => (s.fl = [640, 'x'])),
      bad((s) => ((s.fa as Record<string, unknown>).k = 'fly')),
      bad((s) => ((s.fa as Record<string, unknown>).i = 0)),
      bad((s) => ((s.fa as Record<string, unknown>).c = [3, 0])),
      bad((s) => ((s.fa as Record<string, unknown>).r = { s: null })),
      bad((s) => (s.fx = [{ n: 1, g: 0, ms: 100, k: 'z' }])),
      bad((s) => (s.fx = [{ n: 1, g: 0, ms: 99_999, k: 's', tx: 'a', sb: 'b' }])),
      bad((s) => (s.pl = [[1, 'A', 'apel', lookOfFruit('semangka'), '#fff']])),
      bad((s) => (s.pl = [[1, 'x'.repeat(41), 'semangka', lookOfFruit('semangka'), '#fff']])),
      bad((s) => (s.pl = [[1, 'A', 'semangka', { c: 'nobody' }, '#fff']])),
      // Every id the HUD draws needs a card.
      bad((s) => (s.pl = (s.pl as unknown[]).slice(1))),
      bad((s) => ((s.hud as Record<string, unknown>).tu = 99)),
      bad((s) => ((s.hud as Record<string, unknown>).zo = 'blue')),
      bad((s) => ((s.hud as Record<string, unknown>).bn = { kind: 'roboh', key: 1 })),
      bad((s) => ((s.hud as Record<string, unknown>).ps = [[1, 'a', 1, true, 2, 'happy']])),
    ];
    for (const c of cases) expect(applyMirror(c)).toBeNull();
  });

  it('stays well under the packet limit with a very tall tower and 8 players', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const host = new Host(ids);
    // Names at the longest the wire accepts.
    host.hud = hudFor(ids, (id) => `Nama Panjang ${id}`.padEnd(40, 'x'));
    // Stack straight up to the tallest tower that still stands.
    for (let i = 1; i < MAX_HEIGHT - 1; i++) host.logic.floors.push({ x: 640.123456, width: 50 });
    host.advance(INTRO_MS);
    host.press(host.logic.current!, host.server - 120);
    host.fx = Array.from(
      { length: FX_KEPT },
      (_, i): FxRow => ({
        n: i + 1,
        g: 1,
        ms: 2600,
        k: 'b',
        w: [1 + (i % 8), 'Nama Panjang Sekali 1', 'semangka', lookOfFruit('durian'), '#FF5A1F'],
        tx: 'Ayo, kamu pasti bisa!',
        tn: 'cheer',
        x: 300.123456,
      }),
    );
    const json = JSON.stringify(host.publish());
    expect(host.logic.floors.length).toBe(MAX_HEIGHT - 1);
    // About 2.7 KB measured; the shell's limit is about 7.5 KB.
    expect(json.length).toBeLessThan(4000);
    expect(applyMirror(JSON.parse(json))).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ swing sync */

describe('swing on the far screen', () => {
  it('hangs where the Host draws it at the same server time, paused or not', () => {
    const { host, tower } = started();
    const same = (server: number) => {
      host.server = server;
      const a = host.logic.swingX(host.clock.now());
      const b = tower.swingX(tower.gameNow(server));
      expect(b).toBeCloseTo(a, 9);
    };
    for (const dt of [0, 17, 333, 850, 1700, 2999]) same(host.server + dt);

    // The Host pauses: both freeze on the same spot, however long the pause lasts.
    host.clock.pause();
    tower.push(applyMirror(host.publish())!, host.server + 150);
    const frozen = host.logic.swingX(host.clock.now());
    for (const dt of [100, 5000, 60_000]) {
      host.server += dt;
      expect(tower.swingX(tower.gameNow(host.server))).toBeCloseTo(frozen, 9);
    }
    // Resumed: the swing picks up where it stopped on both screens.
    host.clock.resume();
    tower.push(applyMirror(host.publish())!, host.server + 150);
    expect(tower.swingX(tower.gameNow(host.server))).toBeCloseTo(frozen, 6);
    for (const dt of [0, 40, 777, 2500]) same(host.server + dt);
  });

  it('keeps following the schedule into the next turn without new packets', () => {
    const { host, tower } = started();
    const t = host.perfectAt();
    host.press(1, host.clock.toServer(t) - 1);
    tower.push(applyMirror(host.publish())!, host.server + 200);
    host.advance(FALL_MS);
    tower.push(applyMirror(host.publish())!, host.server + 200);
    tower.tick(host.server + 200 + FALL_MS);
    // The Host's crane already carries the next floor on its new schedule; so does the far one.
    for (const dt of [600, 1200, 2000]) {
      host.server += dt;
      host.logic.tick(host.clock.now());
      expect(tower.swingX(tower.gameNow(host.server))).toBeCloseTo(host.logic.swingX(host.clock.now()), 9);
    }
  });
});

/* ------------------------------------------------------------------ far presses */

describe('far presses (press window)', () => {
  it('judges a late press where both screens showed the floor at its stamp', () => {
    const { host, tower } = started();
    const stamp = host.server + 1000;
    const seenFar = tower.swingX(tower.gameNow(stamp));
    // The far phone's press reaches the Host 0.45 s later.
    host.server = stamp + 450;
    host.logic.tick(host.clock.now());
    expect(host.press(1, stamp)).toBe(true);
    const f = host.logic.fall!;
    expect(f.dropX).toBeCloseTo(seenFar, 9);
    expect(f.at).toBeCloseTo(host.clock.toGame(stamp), 9);
    // It lets go where it hangs on the Host now and glides to the judged spot.
    expect(f.startAt).toBe(host.clock.now());
    expect(f.fromX).toBeCloseTo(host.logic.swingX(host.clock.now()), 9);
  });

  it('never looks back further than the window, before the turn, or into the future', () => {
    const host = new Host([1]);
    host.advance(INTRO_MS);
    const L = host.logic;
    const start = L.turnStartAt;
    expect(L.judgedAt(start - STALE_PRESS_MS / 2, start + 100)).toBe(start);
    expect(L.judgedAt(start + 100, start + 5000)).toBe(start + 5000 - FAR_PRESS_MS);
    expect(L.judgedAt(start + 4000, start + 3000)).toBe(start + 3000);
    // Too old for this turn: ignored, as without far screens.
    expect(L.drop(1, start - STALE_PRESS_MS - 1, start + 300)).toBe(false);
  });

  it('keeps the turn open for the window after the ring empties', () => {
    const { host } = started();
    const L = host.logic;
    const deadline = L.deadline;
    expect(L.autoDropAt).toBe(deadline + FAR_PRESS_MS);
    host.advance(TURN_MS + 350);
    expect(L.phase).toBe('aim');
    // Pressed 0.1 s before the ring emptied, arriving 0.45 s later: still counts, at its stamp.
    const stamp = host.clock.toServer(deadline - 100);
    expect(host.press(1, stamp)).toBe(true);
    expect(L.fall!.auto).toBe(false);
    expect(L.fall!.at).toBeCloseTo(deadline - 100, 9);
  });

  it('drops by itself once the window has passed', () => {
    const { host } = started();
    const L = host.logic;
    const end = L.deadline + FAR_PRESS_MS;
    host.advance(TURN_MS + FAR_PRESS_MS + 10);
    expect(L.fall!.auto).toBe(true);
    expect(L.fall!.at).toBe(end);
    expect(L.fall!.fromX).toBe(L.fall!.dropX);
  });

  it('changes nothing while no far screen watches', () => {
    const host = new Host([1]);
    const L = host.logic;
    L.pressWindowMs = 0;
    host.advance(INTRO_MS);
    expect(L.autoDropAt).toBe(L.deadline);
    host.advance(1000);
    const now = host.clock.now();
    expect(L.judgedAt(now - 300, now)).toBe(now);
    expect(host.press(1, host.server - 300)).toBe(true);
    expect(L.fall!.at).toBe(now);
    expect(L.fall!.fromX).toBe(L.fall!.dropX);
  });
});

/* ------------------------------------------------------------------ replay */

describe('MirrorTower replay', () => {
  it('replays a drop from where it hangs here, then lands it on the same spot', () => {
    const { host, tower, events } = started();
    const t = host.perfectAt();
    host.server = host.clock.toServer(t) + 300;
    host.logic.tick(host.clock.now());
    host.press(1, host.clock.toServer(t));
    const arrive = host.server + 180;
    tower.push(applyMirror(host.publish())!, arrive);
    const drop = events.find((e) => e.type === 'drop');
    expect(drop?.type).toBe('drop');
    if (drop?.type !== 'drop') return;
    expect(tower.phase).toBe('falling');
    expect(drop.fall.fromX).toBeCloseTo(tower.swingX(tower.gameNow(arrive)), 9);
    expect(drop.fall.dropX).toBeCloseTo(host.logic.fall!.dropX, 2);
    expect(drop.fall.landAt - drop.fall.startAt).toBe(FALL_MS);

    // Landing waits for the Host's result.
    tower.tick(arrive + FALL_MS + 10);
    expect(tower.replaying).toBe(true);
    host.advance(FALL_MS);
    tower.push(applyMirror(host.publish())!, arrive + 120);
    expect(tower.replaying).toBe(true);
    tower.tick(arrive + FALL_MS);
    expect(tower.replaying).toBe(false);
    const land = events.find((e) => e.type === 'land');
    expect(land?.type === 'land' && land.pas).toBe(true);
    expect(tower.landed).toBe(1);
    expect(tower.floors.map((f) => f.x)).toEqual(host.logic.floors.map((f) => Math.round(f.x * 100) / 100));
    expect(tower.resync).toBe(false);
    expect(tower.phase).toBe(host.logic.phase);
  });

  it('replays a strike-out collapse after the third miss', () => {
    const host = new Host([1]);
    // A narrow top (floor 10 is 220 wide), so a swing end misses it.
    for (let i = 1; i <= 10; i++) host.logic.floors.push({ x: 640, width: 400 - 18 * i });
    const { tower, events } = far();
    tower.push(applyMirror(host.publish())!, host.server);
    host.advance(INTRO_MS);
    for (let k = 0; k < 3; k++) {
      // Wait until the floor is far off the tower, then press.
      while (Math.abs(host.logic.swingX(host.clock.now()) - host.logic.top.x) < 150) host.advance(20);
      host.press(1, host.server);
      tower.push(applyMirror(host.publish())!, host.server + 100);
      host.advance(FALL_MS + 5);
      tower.push(applyMirror(host.publish())!, host.server + 100);
      tower.tick(host.server + 400);
      host.advance(2000);
      tower.push(applyMirror(host.publish())!, host.server + 100);
    }
    expect(events.filter((e) => e.type === 'miss')).toHaveLength(3);
    const collapse = events.find((e) => e.type === 'collapse');
    expect(collapse?.type === 'collapse' && collapse.info.reason).toBe('strikes');
  });

  it('rebuilds the tower when joining mid-game and shows a new tower on the next round', () => {
    const host = new Host([1], 2);
    host.advance(INTRO_MS);
    for (let k = 0; k < 3; k++) {
      host.server = host.clock.toServer(host.perfectAt());
      host.logic.tick(host.clock.now());
      host.press(1, host.server);
      host.advance(FALL_MS + 1000);
    }
    expect(host.logic.floors.length).toBe(4);
    const { tower, events } = far();
    tower.push(applyMirror(host.publish())!, host.server + 100);
    expect(tower.resync).toBe(true);
    expect(tower.floors).toHaveLength(4);
    expect(tower.replaying).toBe(false);
    expect(events).toHaveLength(0);
    tower.resync = false;

    // Next round: the Host's tower starts over.
    host.logic.floors.length = MAX_HEIGHT - 1;
    host.logic.floors.fill({ x: 640, width: 50 }, 4);
    host.server = host.clock.toServer(host.perfectAt());
    host.logic.tick(host.clock.now());
    host.press(1, host.server);
    host.advance(FALL_MS);
    host.advance(10_000);
    expect(host.logic.round).toBe(2);
    tower.push(applyMirror(host.publish())!, host.server + 100);
    expect(events.at(-1)?.type).toBe('intro');
    expect(tower.floors).toHaveLength(1);
  });

  it('follows the Host clock and pause point from the state', () => {
    const { host, tower } = started();
    expect(tower.gameNow(host.server)).toBeCloseTo(host.clock.now(), 9);
    host.clock.pause();
    const at = host.clock.now();
    tower.push(applyMirror(host.publish())!, host.server);
    expect(tower.gameNow(host.server + 99_999)).toBe(at);
  });
});
