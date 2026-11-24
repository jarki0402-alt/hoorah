import { describe, expect, it } from 'vitest';
import { CATALOG, GAMES, playsRemote } from '../shared/games';
import {
  beatText,
  changedKeys,
  type MirrorPacket,
  mirrorPath,
  PacketOrder,
  parseBeat,
  parseMirrorPacket,
  parseShellSnap,
  relayNeeded,
  type ShellSnap,
  secondsLeft,
  smoothRtt,
  splitForLink,
} from './mirror';
import { partyPool, pickLineup } from './party';

function snap(over: Partial<ShellSnap> = {}): ShellSnap {
  return {
    page: 'home',
    focus: 'card-kuis@all',
    selected: 'kuis',
    tab: 'all',
    home: { shelf: 'all', top: 1, pinned: 'kuis', art: { party: ['kuis', 'kata'], wheel: ['eja'] } },
    wheel: null,
    inviting: false,
    game: null,
    result: null,
    party: null,
    partyRun: 0,
    tutorial: null,
    offer: null,
    adBreak: null,
    recent: ['ludo', 'kuis'],
    music: { track: 'menu', intensity: 0, hurry: false },
    settings: null,
    timer: null,
    ...over,
  };
}

/** Through JSON like the relay does. */
const wire = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe('far-away main screen snapshot', () => {
  it('round-trips every part of the shell state', () => {
    const full = snap({
      page: 'results',
      wheel: { slices: ['kuis', 'kata', 'eja'], pick: 2, spin: 4, jitter: -0.2 },
      game: { id: 'ludo', run: 12, ready: true, paused: false },
      result: {
        gameId: 'kuis',
        result: {
          title: 'Rina juara!',
          ranking: [
            { playerId: 1, score: 900, rank: 1 },
            { playerId: -1, score: 300, rank: 2, label: 'Komputer' },
          ],
          awards: [{ playerId: 1, title: 'Kilat', desc: 'Paling cepat', icon: 'zap' }],
        },
      },
      party: { lineup: ['kuis', 'kata'], index: 1, points: { 1: 5, 2: 3 }, gained: { 1: 2 }, scored: 1 },
      partyRun: 3,
      tutorial: { id: 'ular', mode: 'intro', ready: [1, 2] },
      offer: { kind: 'game', game: 'catur' },
      adBreak: { next: 'eja' },
      music: { track: 'kuis', intensity: 2, hurry: true },
      settings: { run: 12, values: { rounds: 64, limited: false, mode: 'x' } },
    });
    expect(parseShellSnap(wire(full))).toEqual(full);
    expect(parseShellSnap(wire(snap()))).toEqual(snap());
    expect(parseShellSnap(wire(snap({ home: null, offer: { kind: 'party' } })))).toEqual(
      snap({ home: null, offer: { kind: 'party' } }),
    );
  });

  it('refuses broken or foreign state', () => {
    const bad: unknown[] = [
      null,
      'home',
      { ...snap(), page: 'admin' },
      { ...snap(), selected: 'toString' },
      { ...snap(), tab: 'nope' },
      { ...snap(), focus: 'x'.repeat(200) },
      { ...snap(), recent: ['kuis', 'zzz'] },
      { ...snap(), home: { shelf: 'all', top: -1, pinned: 'kuis', art: { party: [], wheel: [] } } },
      { ...snap(), wheel: { slices: ['kuis'], pick: 3, spin: 1, jitter: 0 } },
      { ...snap(), wheel: { slices: [], pick: 0, spin: 1, jitter: 0 } },
      { ...snap(), game: { id: 'kuis', run: 1, ready: 'yes', paused: false } },
      { ...snap(), result: { gameId: 'kuis', result: { title: 1, ranking: [] } } },
      { ...snap(), result: { gameId: 'kuis', result: { title: 'x', ranking: [{ playerId: 1 }] } } },
      { ...snap(), party: { lineup: [], index: 0, points: {}, gained: {}, scored: 0 } },
      { ...snap(), party: { lineup: ['kuis'], index: 0, points: { a: 1 }, gained: {}, scored: 0 } },
      { ...snap(), tutorial: { id: 'kuis', mode: 'skip', ready: [] } },
      { ...snap(), offer: { kind: 'game' } },
      { ...snap(), adBreak: { next: 'nope' } },
      { ...snap(), music: { track: 'menu', intensity: 4, hurry: false } },
      { ...snap(), music: undefined },
      { ...snap(), settings: { run: 1, values: { rounds: { deep: 1 } } } },
      { ...snap(), settings: { run: -1, values: {} } },
      { ...snap(), timer: { id: 'bomb', step: 0, end: 5 } },
      { ...snap(), timer: { id: 'results', step: -1, end: 5 } },
      { ...snap(), timer: { id: 'results', step: 0, end: 'soon' } },
    ];
    for (const v of bad) expect(parseShellSnap(wire(v))).toBeNull();
  });

  it('reads packets part by part and keeps sound names plain', () => {
    expect(
      parseMirrorPacket(wire({ s: snap(), g: { run: 3, state: { q: 1 } }, fx: ['tick', 'win'] })),
    ).toEqual({
      s: snap(),
      g: { run: 3, state: { q: 1 } },
      fx: ['tick', 'win'],
    });
    // A broken shell part is dropped; the rest still counts.
    expect(parseMirrorPacket({ s: { page: 'x' }, fx: ['tick', '<b>', 7, 'stinger-win'] })).toEqual({
      fx: ['tick', 'stinger-win'],
    });
    expect(parseMirrorPacket({ fx: Array.from({ length: 40 }, () => 'tick') })?.fx).toHaveLength(16);
    expect(parseMirrorPacket({ g: { run: 1 } })).toBeNull();
    expect(parseMirrorPacket({})).toBeNull();
    expect(parseMirrorPacket([1])).toBeNull();
  });

  it('names only the parts that changed', () => {
    const a = snap();
    expect(changedKeys(null, a)).toEqual(Object.keys(a));
    expect(changedKeys(a, snap())).toEqual([]);
    expect(changedKeys(a, snap({ focus: 'party', recent: ['kuis'] }))).toEqual(['focus', 'recent']);
    expect(changedKeys(a, snap({ home: { ...a.home!, top: 2 } }))).toEqual(['home']);
  });

  it('builds the short link in capitals for a compact QR', () => {
    expect(mirrorPath('482917', 'k7m2q9xa')).toBe('/J/482917-K7M2Q9XA');
  });

  it("carries the Host's countdown deadline; older packets without one mean none runs", () => {
    const timed = snap({ page: 'results', timer: { id: 'results', step: 0, end: 1_700_000_012_345 } });
    expect(parseShellSnap(wire(timed))).toEqual(timed);
    const { timer: _gone, ...old } = snap();
    expect(parseShellSnap(wire(old))).toEqual(snap());
  });

  it('shows whole seconds left of a deadline, never below zero', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 1)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 99_000)).toBe(0);
  });
});

describe('far-away main screen direct link', () => {
  const g = (run: number, q: number) => ({ run, state: { q } });

  it('reads the packet number only with its page session', () => {
    expect(parseMirrorPacket({ fx: ['tick'], e: 'k3x9a', n: 4 })).toEqual({ fx: ['tick'], e: 'k3x9a', n: 4 });
    expect(parseMirrorPacket({ fx: ['tick'], n: 4 })).toEqual({ fx: ['tick'] });
    expect(parseMirrorPacket({ fx: ['tick'], e: 'k3x9a', n: 0 })).toEqual({ fx: ['tick'] });
    expect(parseMirrorPacket({ fx: ['tick'], e: '<x>', n: 2 })).toEqual({ fx: ['tick'] });
  });

  it('drops shell and game parts older than the newest applied, per part', () => {
    const order = new PacketOrder();
    const shell2 = snap({ focus: 'two' });
    // Packet 3 (game) came first over the direct link; 2 (shell + game) arrives late over the relay.
    expect(order.filter({ g: g(1, 3), e: 'a', n: 3 })).toEqual({ g: g(1, 3) });
    expect(order.filter({ s: shell2, g: g(1, 2), fx: ['tick'], e: 'a', n: 2 })).toEqual({
      s: shell2,
      fx: ['tick'],
    });
    // The same shell again (or older) is dropped; sounds still play.
    expect(order.filter({ s: snap(), e: 'a', n: 1 })).toBeNull();
    expect(order.filter({ s: snap(), fx: ['win'], e: 'a', n: 2 })).toEqual({ fx: ['win'] });
    expect(order.filter({ g: g(1, 3), e: 'a', n: 3 })).toBeNull();
    expect(order.filter({ g: g(1, 5), e: 'a', n: 5 })).toEqual({ g: g(1, 5) });
    // A reloaded Host page starts its own numbers again.
    expect(order.filter({ s: snap(), g: g(2, 1), e: 'b', n: 1 })).toEqual({ s: snap(), g: g(2, 1) });
    // Packets without numbers (older Host pages) always pass.
    expect(order.filter({ g: g(2, 0) })).toEqual({ g: g(2, 0) });
  });

  it('splits a packet by channel and keeps its number on both halves', () => {
    const p: MirrorPacket = { s: snap(), g: g(1, 1), fx: ['tick'], e: 'a', n: 9 };
    expect(splitForLink(p)).toEqual({
      shell: { s: snap(), fx: ['tick'], e: 'a', n: 9 },
      game: { g: g(1, 1), e: 'a', n: 9 },
    });
    expect(splitForLink({ g: g(1, 1), e: 'a', n: 2 })).toEqual({
      shell: null,
      game: { g: g(1, 1), e: 'a', n: 2 },
    });
    expect(splitForLink({ fx: ['win'] })).toEqual({ shell: { fx: ['win'] }, game: null });
  });

  it('turns heartbeats into text that never looks like a packet', () => {
    expect(beatText('ping', 1234.6)).toBe('p1235');
    expect(parseBeat(beatText('pong', 77))).toEqual({ kind: 'pong', stamp: 77 });
    expect(parseBeat('{"s":1}')).toBeNull();
    expect(parseBeat('p')).toBeNull();
    expect(parseBeat('x12')).toBeNull();
    expect(parseBeat('p-3')).toBeNull();
  });

  it('smooths the measured round trip', () => {
    expect(smoothRtt(null, 40)).toBe(40);
    expect(smoothRtt(40, 140)).toBeCloseTo(70);
    expect(smoothRtt(null, -5)).toBe(0);
    expect(smoothRtt(null, 1e9)).toBe(10_000);
  });

  it('uses the relay only for far-away screens the direct links did not reach', () => {
    expect(relayNeeded([1, 2], [1, 2])).toBe(false);
    expect(relayNeeded([1, 2], [2])).toBe(true);
    expect(relayNeeded([1], [])).toBe(true);
    // Ids not known yet: the relay reaches whoever watches.
    expect(relayNeeded([], [])).toBe(true);
  });
});

describe('games a far-away screen can show (staged rollout)', () => {
  it('marks exactly the games released so far', () => {
    expect(CATALOG.filter(playsRemote).sort()).toEqual(
      [
        ...['catur', 'congklak', 'eja', 'kata', 'kompak', 'kuis', 'ludo', 'ular'],
        ...[
          'penyusup',
          'siluman',
          'juragan',
          'tarik',
          'bom',
          'es',
          'karung',
          'runtuh',
          'wilayah',
          'kerupuk',
          'rusun',
          'langkah',
        ],
      ].sort(),
    );
  });

  it('keeps Mode Pesta to those games while a far-away screen watches', () => {
    for (const n of [1, 2, 4, 8]) {
      const pool = partyPool(n, true);
      expect(pool.every(playsRemote)).toBe(true);
      expect(pool.every((id) => !GAMES[id].long)).toBe(true);
      for (let i = 0; i < 10; i++) expect(pickLineup(n, [], Math.random, true).every(playsRemote)).toBe(true);
    }
    // Without one, the party draws from everything as before.
    expect(partyPool(2).some((id) => !playsRemote(id))).toBe(true);
  });
});
