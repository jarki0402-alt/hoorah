import { describe, expect, it } from 'vitest';
import { CATALOG, GAMES, playsRemote } from '../shared/games';
import { changedKeys, mirrorPath, parseMirrorPacket, parseShellSnap, type ShellSnap } from './mirror';
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
});

describe('games a far-away screen can show (staged rollout)', () => {
  it('marks exactly the games released so far', () => {
    expect(CATALOG.filter(playsRemote).sort()).toEqual(
      [
        ...['catur', 'congklak', 'eja', 'kata', 'kompak', 'kuis', 'ludo', 'ular'],
        ...['penyusup', 'siluman', 'juragan', 'tarik', 'bom', 'es', 'karung', 'runtuh', 'wilayah'],
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
