import { lookAt, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { food, glass, plate } from './items';
import { COUNTDOWN_MS, type KitchenId, type Side } from './kitchens';
import { DapurMatch, STEP_MS } from './logic';
import { buildResult, helperOutcome, pickAwards, summarize, toNextStar } from './results';
import { Setup } from './setup';
import { STR } from './strings';
import { hintFor, PAD_BUTTONS, padView, playViewFor, setupView } from './views';

function match(kitchen: KitchenId = 'terbelah', sides: Side[] = [0, 1]) {
  const m = new DapurMatch({
    kitchen,
    difficulty: 'normal',
    cooks: sides.map((side, i) => ({
      id: i + 1,
      name: ['Rina', 'Sari', 'Budi'][i]!,
      fruit: 'jeruk' as const,
      look: lookAt(i),
      color: '#FF5A1F',
      side,
    })),
    now: 0,
  });
  let t = 0;
  while (t < COUNTDOWN_MS + STEP_MS) {
    t += STEP_MS;
    m.step(t);
  }
  m.drainEvents();
  return { m, t };
}

describe('setup views', () => {
  const names = new Map([
    [1, 'Rina'],
    [2, 'Sari'],
  ]);

  it('the Host gets the kitchen menu with the suggestion badge; others watch it locked', () => {
    const s = new Setup({ humans: 2 });
    s.sync([1, 2], 2);
    const host = setupView({ setup: s, me: 1, isHost: true, hostName: 'Rina', names, humans: 2, guests: [] });
    expect(host).toMatchObject({ kind: 'menu', selected: 'terbelah', confirm: { id: 'next' } });
    if (host.kind !== 'menu') throw new Error();
    expect(host.options.find((o) => o.id === 'terbelah')?.badge).toBe(STR.recommended);
    const other = setupView({
      setup: s,
      me: 2,
      isHost: false,
      hostName: 'Rina',
      names,
      humans: 2,
      guests: [],
    });
    expect(other).toMatchObject({ kind: 'menu', locked: true, waiting: STR.menuWaiting('Rina') });
    expect(other.kind === 'menu' && other.confirm).toBeFalsy();
  });

  it('open kitchens start from the level step; split kitchens list every cook with their side', () => {
    const s = new Setup({ humans: 2, kitchen: 'warung' });
    s.sync([1, 2], 2);
    s.act('next', undefined);
    const level = setupView({
      setup: s,
      me: 1,
      isHost: true,
      hostName: 'Rina',
      names,
      humans: 2,
      guests: [],
    });
    expect(level).toMatchObject({
      kind: 'menu',
      selected: 'normal',
      confirm: { id: 'start' },
      back: { id: 'back' },
    });
    const t = new Setup({ humans: 2, kitchen: 'terbelah' });
    t.sync([1, 2], 2);
    t.act('next', undefined);
    t.act('next', undefined);
    const sides = setupView({
      setup: t,
      me: 1,
      isHost: true,
      hostName: 'Rina',
      names,
      humans: 2,
      guests: [],
    });
    expect(sides.kind === 'menu' && sides.options.map((o) => [o.label, o.badge])).toEqual([
      ['Rina', STR.sideTag[0]],
      ['Sari', STR.sideTag[1]],
    ]);
  });
});

describe('play views', () => {
  it('a landscape stick pad with the three buttons, side, time and score', () => {
    const { m, t } = match();
    const v = padView(m, m.chef(1)!, t);
    expect(v).toMatchObject({ kind: 'pad', mode: 'stick', eyebrow: STR.sideTag[0], buttons: PAD_BUTTONS });
    expect(PAD_BUTTONS.map((b) => [b.id, b.press])).toEqual([
      ['grab', 'tap'],
      ['work', 'hold'],
      ['throw', 'tap'],
    ]);
    expect(v.kind === 'pad' && v.stats?.map((s) => s.label)).toEqual([STR.statTime, STR.statScore]);
  });

  it('shows what is carried and hints the next step', () => {
    const { m, t } = match();
    const rina = m.chef(1)!;
    rina.held = food('tomat');
    expect(hintFor(m, rina, t)).toBe(STR.hint.chop('Tomat'));
    rina.held = food('tomatPotong');
    expect(hintFor(m, rina, t)).toBe(STR.hint.throwTo('Sari'));
    const sari = m.chef(2)!;
    sari.held = food('daging');
    expect(hintFor(m, sari, t)).toBe(STR.hint.cookMeat);
    sari.held = glass(0);
    expect(hintFor(m, sari, t)).toBe(STR.hint.fillSoda);
    sari.held = plate(['kentangGoreng']);
    expect(hintFor(m, sari, t)).toBe(STR.hint.serve);
    const v = padView(m, sari, t);
    expect(v.kind === 'pad' && v.carry?.label).toBe(STR.items.kentangGoreng);
  });

  it('warns the receiver of a throw, in red when their hands are full, then after a hit', () => {
    const { m, t } = match();
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 8.5, 3.5);
    m.chef(1)!.held = food('telur');
    m.throwItem(1);
    const ok = padView(m, m.chef(2)!, t);
    expect(ok.kind === 'pad' && ok.alert).toEqual({
      title: STR.alertCatch,
      body: STR.alertCatchBody(STR.items.telur, 'Rina'),
      tone: 'yellow',
    });
    m.chef(2)!.held = food('roti');
    const full = padView(m, m.chef(2)!, t);
    expect(full.kind === 'pad' && full.alert).toMatchObject({ body: STR.alertFullBody, tone: 'red' });
    let now = t;
    for (let i = 0; i < 60; i++) {
      now += STEP_MS;
      m.step(now);
    }
    const hit = padView(m, m.chef(2)!, now);
    expect(hit.kind === 'pad' && hit.alert).toMatchObject({ title: STR.alertHit, tone: 'red' });
  });

  it('countdown, then the result with personal stats and awards', () => {
    const m = new DapurMatch({
      kitchen: 'warung',
      difficulty: 'normal',
      cooks: [{ id: 1, name: 'Rina', fruit: 'jeruk', look: lookAt(1), color: '#FF5A1F', side: 0 }],
      now: 0,
    });
    m.step(10);
    expect(playViewFor({ match: m, id: 1, t: 10, summary: null, guests: [] })).toMatchObject({
      kind: 'countdown',
      title: STR.countdownTitle,
      subtitle: STR.countdownSubOpen,
    });
    m.chef(1)!.stats.chops = 3;
    const awards = pickAwards(m.chefs.map((c) => ({ id: c.id, stats: c.stats })));
    const s = summarize(m, awards);
    m.phase = 'over';
    const v = playViewFor({ match: m, id: 1, t: 10, summary: s, guests: [] });
    expect(v).toMatchObject({ kind: 'result', title: STR.resultTitle[0], chips: [STR.awards.chops.title] });
  });
});

describe('results', () => {
  const stats = (o: Partial<Record<string, number>>) => ({
    chops: 0,
    deliveries: 0,
    firesOut: 0,
    burnt: 0,
    goodThrows: 0,
    catches: 0,
    stains: 0,
    badThrows: 0,
    washed: 0,
    ...o,
  });

  it('picks up to four non-zero awards, spread over the cooks first', () => {
    const a = pickAwards([
      { id: 1, stats: stats({ chops: 9, deliveries: 1, washed: 4, stains: 3 }) },
      { id: 2, stats: stats({ deliveries: 6, catches: 5 }) },
      { id: 3, stats: stats({ burnt: 2 }) },
    ]);
    expect(a).toHaveLength(4);
    expect(new Set(a.map((x) => x.playerId))).toEqual(new Set([1, 2, 3]));
    expect(a.find((x) => x.title === STR.awards.deliveries.title)?.playerId).toBe(2);
    expect(a.find((x) => x.title === STR.awards.chops.title)?.desc).toBe(STR.awards.chops.desc(9));
    expect(pickAwards([{ id: 1, stats: stats({}) }])).toEqual([]);
  });

  it('one team: everyone shares first place with the team score; stars in the headline', () => {
    const { m } = match('terbelah', [0, 1]);
    const s = { ...summarize(m, []), stars: 2 as const, score: 640 };
    const r = buildResult(
      m,
      s,
      [],
      [
        {
          id: -1,
          name: 'X',
          fruit: 'nanas',
          look: lookOfFruit('nanas'),
          color: '#fff',
          connected: true,
          isHost: false,
        },
      ],
    );
    expect(r.ranking.every((x) => x.rank === 1 && x.score === 640)).toBe(true);
    expect(r.title).toBe(STR.shellTitle(2));
    expect(r.cpuPlayers).toBeUndefined(); // no computer cook in this kitchen
  });

  it('next-star progress and the helper adapting to the lone player', () => {
    expect(toNextStar(100, [200, 400, 800])).toEqual({ left: 100, star: 1 });
    expect(toNextStar(500, [200, 400, 800])).toEqual({ left: 300, star: 3 });
    expect(toNextStar(900, [200, 400, 800])).toBeNull();
    expect(helperOutcome(0)).toBe('win'); // weak round: the helper sharpens
    expect(helperOutcome(2)).toBe('draw');
    expect(helperOutcome(3)).toBe('lose'); // easy round: it eases off
  });
});
