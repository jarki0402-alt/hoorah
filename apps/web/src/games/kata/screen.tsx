/**
 * Main-screen renderer for Sambung Kata: a notebook page. The chain is written line by line on
 * the left (the joining syllables marked in yellow, the syllable to continue underlined), the
 * player whose turn it is sits on an index card on the right with the start as letter tiles and a
 * draining timer ring, and everyone's hearts run along the bottom.
 *
 * Re-renders on every `version` bump; the timer ring is driven per frame through refs.
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Face } from '../../shared/art/fruits';
import { confetti } from '../../shared/confetti';
import { Avatar, Icon } from '../../shared/ui';
import { paperUrl, RULE_GAP } from './backdrop';
import type { KataScene, SceneAttempt, SceneLink, SceneSeat, StartKind } from './logic';
import { TIMING } from './logic';
import { formatSeconds, STR } from './strings';

/* ------------------------------------------------------------------ plumbing */

/** Per-frame callbacks with the current game time, driven by the driver's loop. */
export class FrameBus {
  private readonly subs = new Set<(now: number) => void>();
  now = 0;

  subscribe(fn: (now: number) => void): () => void {
    this.subs.add(fn);
    fn(this.now);
    return () => this.subs.delete(fn);
  }

  emit(now: number): void {
    this.now = now;
    for (const fn of this.subs) fn(now);
  }
}

/** Confetti from a player's card in the players strip (the winner, on the final card). */
export function burstOver(id: number): void {
  const el = document.querySelector<HTMLElement>(`[data-pid="${id}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  confetti({
    x: (r.left + r.width / 2) / window.innerWidth,
    y: r.top / window.innerHeight,
    count: 70,
    spread: 0.7,
    power: 0.75,
  });
}

/** One line of the notebook. */
/** The fresh start dealt right after a line (a mistake or a dead end), shown at its end. */
export interface ThenStart {
  prefix: string;
  stuck: boolean;
}

export type LogEntry =
  | { kind: 'start'; key: string; prefix: string; start: StartKind; stuckFrom: string | null }
  | { kind: 'word'; key: string; link: SceneLink; after?: ThenStart }
  | { kind: 'miss'; key: string; attempt: SceneAttempt; after?: ThenStart };

export interface Banner {
  key: number;
  text: string;
}

export interface ScreenModel {
  match: KataScene;
  version: ReadonlySignal<number>;
  waiting: ReadonlySignal<boolean>;
  frame: FrameBus;
  log: () => readonly LogEntry[];
  banner: () => Banner | null;
  info: (id: number) => SeatInfo | undefined;
}

/** The part of a player card the page draws (a mirror screen gets it from the Host's state). */
export type SeatInfo = Pick<PlayerInfo, 'id' | 'name' | 'color' | 'look'>;

export interface StageSize {
  w: number;
  h: number;
}

type Vars = Record<`--${string}`, string>;
const vars = (v: Vars): JSX.CSSProperties => v as unknown as JSX.CSSProperties;
const px = (n: number) => `${n}px`;

const HEADER_H = 96;
const STRIP_SPACE = 144;

/** Bottom of the chain area, snapped to a notebook rule so lines sit on the paper's lines. */
export function chainBottom(h: number): number {
  return HEADER_H + RULE_GAP * Math.max(4, Math.floor((h - STRIP_SPACE - HEADER_H) / RULE_GAP));
}

/* ------------------------------------------------------------------ root */

export function KataScreen({ model, size }: { model: ScreenModel; size: ReadonlySignal<StageSize> }) {
  void model.version.value;
  const { w, h } = size.value;
  const m = model.match;
  const intro = m.phase === 'intro';
  const final = m.phase === 'final' || m.phase === 'ended';
  const bottom = chainBottom(h);
  const banner = model.banner();
  return (
    <div class="sk-root">
      <img class="sk-bg" src={paperUrl(w, h)} alt="" width={w} height={h} draggable={false} />
      <div class="sk-core" style={vars({ '--chain-bottom': px(bottom) })}>
        <Header m={m} />
        <ChainLog entries={model.log()} info={model.info} lines={(bottom - HEADER_H) / RULE_GAP} />
        {!intro && !final && <TurnCard model={model} />}
        {banner && (
          <div key={banner.key} class="sk-banner">
            <span>{banner.text}</span>
          </div>
        )}
      </div>
      {(intro || final || model.waiting.value) && <div class="sk-scrim" />}
      {intro && <IntroCard m={m} />}
      {final && <FinalCard model={model} />}
      <Players model={model} />
      {model.waiting.value && !final && (
        <div class="sk-waiting" role="status">
          {STR.waiting}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header({ m }: { m: KataScene }) {
  const live = m.phase !== 'intro';
  return (
    <div class="sk-head">
      <div class="display outline-text sk-logo">{STR.logo}</div>
      {live && m.round > 0 && <div class="sk-chip is-ink">{STR.roundChip(m.round)}</div>}
      <div class="sk-chip is-heart">
        <Icon name="heart" size={15} color="#E0453B" />
        {STR.livesChip(m.lives)}
      </div>
      {live && m.round > 0 && <div class="sk-chip">{STR.timeChip(Math.round(m.turnMs / 1000))}</div>}
      {m.chainLength > 0 && <div class="sk-chip is-marker">{STR.chainChip(m.chainLength)}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ chain */

function segments(word: string, join: number, tail: number): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  const tailFrom = word.length - tail;
  for (let i = 0; i < word.length; i++) {
    const cls = `${i < join ? ' is-join' : ''}${i >= tailFrom ? ' is-tail' : ''}`;
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += word[i]!;
    else out.push({ text: word[i]!, cls });
  }
  return out;
}

function ChainLog({
  entries,
  info,
  lines,
}: {
  entries: readonly LogEntry[];
  info: (id: number) => SeatInfo | undefined;
  lines: number;
}) {
  // Newest at the bottom; it takes two rules, everything else one.
  const visible = entries.slice(-Math.max(1, lines - 1));
  if (visible.length === 0) {
    return (
      <div class="sk-chain">
        <div class="sk-line is-empty">{STR.chainEmpty}</div>
      </div>
    );
  }
  return (
    <div class="sk-chain" role="log" aria-label={STR.chainTitle}>
      {visible.map((e, i) => {
        const age = visible.length - 1 - i;
        const style = vars({ '--fade': String(Math.max(0.28, 1 - age * 0.12)) });
        const cls = `sk-line${age === 0 ? ' is-new' : ''}`;
        if (e.kind === 'start') {
          return (
            <div key={e.key} class={`${cls} is-start`} style={style}>
              <span class="sk-start">{STR.startDivider(e.start, e.prefix, e.stuckFrom)}</span>
            </div>
          );
        }
        if (e.kind === 'miss') {
          const p = info(e.attempt.by);
          return (
            <div key={e.key} class={`${cls} is-miss`} style={style}>
              {p && <Avatar look={p.look} ring={p.color} size={age === 0 ? 44 : 32} face="sad" />}
              <s class="sk-word">{e.attempt.word ? e.attempt.word.toUpperCase() : STR.timeoutWord}</s>
              <span class="sk-reason">{STR.reason(e.attempt.reason ?? 'unknown', e.attempt.prefix)}</span>
              {e.after && <Then then={e.after} />}
            </div>
          );
        }
        const p = info(e.link.by);
        return (
          <div key={e.key} class={cls} style={style}>
            {p && <Avatar look={p.look} ring={p.color} size={age === 0 ? 44 : 32} />}
            <span class="sk-word">
              {segments(e.link.word.toUpperCase(), e.link.join, e.link.tail).map((s, k) => (
                <span key={k} class={`sk-seg${s.cls}`}>
                  {s.text}
                </span>
              ))}
            </span>
            <span class="sk-ms">{STR.msShort(e.link.ms)}</span>
            {e.after && <Then then={e.after} />}
          </div>
        );
      })}
    </div>
  );
}

function Then({ then }: { then: ThenStart }) {
  return (
    <span class={`sk-then${then.stuck ? ' is-stuck' : ''}`}>
      {then.stuck ? STR.thenStuck(then.prefix) : STR.thenFresh(then.prefix)}
    </span>
  );
}

/* ------------------------------------------------------------------ turn card */

const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

function TimerRing({ m, frame }: { m: KataScene; frame: FrameBus }) {
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      frame.subscribe((now) => {
        const live = m.phase === 'turn';
        const left = live ? Math.max(0, m.deadline - now) : 0;
        const frac = live ? Math.min(1, left / m.turnMs) : m.attempt?.ok ? 1 : 0;
        if (arc.current) arc.current.style.strokeDashoffset = String(RING_C * (1 - frac));
        const secs = Math.ceil(left / 1000);
        if (num.current) {
          const text = live ? String(secs) : '';
          if (num.current.textContent !== text) num.current.textContent = text;
        }
        box.current?.classList.toggle('is-hurry', live && left <= 3000);
      }),
    [m, frame],
  );
  return (
    <div ref={box} class="sk-ring" role="timer" aria-label={STR.timerLabel(Math.ceil(m.turnMs / 1000))}>
      <svg width="164" height="164" viewBox="0 0 164 164" aria-hidden="true">
        <circle cx="82" cy="82" r={RING_R} class="sk-ring-track" />
        <circle
          ref={arc}
          cx="82"
          cy="82"
          r={RING_R}
          class="sk-ring-arc"
          stroke-dasharray={String(RING_C)}
          transform="rotate(-90 82 82)"
        />
      </svg>
      <div ref={num} class="sk-secs" />
    </div>
  );
}

function Tiles({
  word,
  join,
  tail = 0,
  blanks,
  tone,
}: {
  word: string;
  join: number;
  tail?: number;
  blanks: number;
  tone: string;
}) {
  const letters = word.toUpperCase().split('');
  const tailFrom = letters.length - tail;
  const n = Math.max(1, letters.length + blanks);
  const size = Math.min(76, Math.floor((476 - (n - 1) * 8) / n));
  return (
    <div class={`sk-tiles is-${tone}`} style={vars({ '--tile': px(size) })}>
      {letters.map((l, i) => (
        <span
          key={`${i}${l}`}
          class={`sk-tile${i < join ? ' is-join' : ''}${tail && i >= tailFrom ? ' is-tail' : ''}`}
          style={vars({ '--i': String(i) })}
        >
          {l}
        </span>
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <span key={`b${i}`} class={`sk-tile is-blank${i === 0 ? ' has-caret' : ''}`} />
      ))}
    </div>
  );
}

function startNote(m: KataScene): string {
  switch (m.startKind) {
    case 'first':
      return STR.startFirst;
    case 'fresh':
      return STR.startFresh;
    case 'stuck':
      return STR.startStuck(m.stuckFrom ?? '');
    case 'chain':
      return STR.startWith;
  }
}

function TurnCard({ model }: { model: ScreenModel }) {
  const m = model.match;
  const seat = m.currentSeat;
  if (!seat) return null;
  const p = model.info(seat.id);
  const a = m.phase === 'verdict' ? m.attempt : null;
  const state = a ? (a.ok ? 'ok' : 'bad') : 'turn';
  const face: Face = a ? (a.ok ? 'wow' : 'sad') : 'effort';
  const next = m.next ? m.seats[m.next.index] : undefined;
  const nextName = next ? (model.info(next.id)?.name ?? STR.unknownPlayer) : null;

  let tiles: JSX.Element;
  if (!a) tiles = <Tiles word={m.prefix} join={m.prefix.length} blanks={3} tone="turn" />;
  else if (a.ok) {
    const link = m.lastLink;
    tiles = <Tiles word={a.word} join={a.prefix.length} tail={link?.tail ?? 0} blanks={0} tone="ok" />;
  } else if (a.word) tiles = <Tiles word={a.word} join={0} blanks={0} tone="bad" />;
  else tiles = <Tiles word={a.prefix} join={a.prefix.length} blanks={3} tone="timeout" />;

  return (
    <div class="sk-turn-slot">
      <div class={`sk-turn is-${state}`} key={`${m.turnNo}`}>
        <div class="sk-who">
          <div class="sk-avatar">
            <TimerRing m={m} frame={model.frame} />
            {p && <Avatar look={p.look} ring={p.color} size={112} face={face} class="sk-avatar-img" />}
          </div>
          <div class="sk-who-text">
            <div class="sk-eyebrow">{STR.turnEyebrow}</div>
            <div class="sk-name display">{p?.name ?? STR.unknownPlayer}</div>
            <Hearts left={seat.lives} total={m.lives} size={22} broke={a && !a.ok ? seat.lives : -1} />
          </div>
        </div>
        <div class={`sk-note${m.startKind === 'stuck' && !a ? ' is-stuck' : ''}`}>
          {a ? (a.ok ? STR.acceptedNote : STR.reason(a.reason ?? 'unknown', a.prefix)) : startNote(m)}
        </div>
        <div class="sk-tilebox">{tiles}</div>
        {a?.ok && (
          <div class="sk-stamp is-ok">
            {STR.accepted}
            <small>{STR.acceptedIn(formatSeconds(a.ms))}</small>
          </div>
        )}
        {a && !a.ok && <div class="sk-stamp is-bad">{a.out ? STR.outLabel : STR.lifeLost}</div>}
        <div class="sk-status">
          {a ? (
            nextName && m.next ? (
              <span>
                {m.next.kind === 'stuck' && m.next.stuckFrom ? `${STR.stuckShort(m.next.stuckFrom)} ` : ''}
                {STR.nextUp(nextName)} · <b>{m.next.prefix.toUpperCase()}</b>
              </span>
            ) : null
          ) : (
            <span class="sk-typing">{STR.thinking}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hearts + players */

function Hearts({ left, total, size, broke }: { left: number; total: number; size: number; broke: number }) {
  return (
    <div class="sk-hearts" role="img" aria-label={STR.livesLabel(left, total)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={`sk-heart${i < left ? ' is-full' : ''}${i === broke ? ' is-broke' : ''}`}>
          <Icon name="heart" size={size} color={i < left ? '#E0453B' : '#CFC6B4'} />
        </span>
      ))}
    </div>
  );
}

function Players({ model }: { model: ScreenModel }) {
  const m = model.match;
  const live = m.phase === 'turn' || m.phase === 'verdict';
  const a = m.phase === 'verdict' ? m.attempt : null;
  const many = m.seats.length > 6;
  return (
    <div class={`sk-players${many ? ' is-many' : ''}`}>
      {m.seats.map((s: SceneSeat) => {
        const p = model.info(s.id);
        const current = live && m.current === s.index;
        const out = s.lives <= 0;
        const winner = m.winner === s.id && (m.phase === 'final' || m.phase === 'ended');
        const broke = a && !a.ok && a.by === s.id ? s.lives : -1;
        return (
          <div
            key={s.id}
            class={`sk-player${current ? ' is-current' : ''}${out ? ' is-out' : ''}${winner ? ' is-winner' : ''}`}
            data-pid={s.id}
          >
            {current && <div class="sk-tab">{STR.turnEyebrow}</div>}
            {p && (
              <Avatar
                look={p.look}
                ring={p.color}
                size={many ? 40 : 50}
                dim={out}
                face={out ? 'sad' : current ? 'effort' : 'happy'}
              />
            )}
            <div class="sk-player-text">
              <div class="sk-player-name">{p?.name ?? STR.unknownPlayer}</div>
              {out ? (
                <div class="sk-out">{STR.outLabel}</div>
              ) : (
                <Hearts left={s.lives} total={m.lives} size={many ? 14 : 17} broke={broke} />
              )}
            </div>
            <div class="sk-count">{s.words}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ intro + final */

function IntroCard({ m }: { m: KataScene }) {
  const ex = STR.introExample;
  return (
    <div class="sk-card sk-intro">
      <div class="sk-eyebrow">{STR.introEyebrow}</div>
      <div class="sk-intro-title display">{STR.introTitle}</div>
      <div class="sk-example">
        {ex.map((w, i) => {
          const prev = i > 0 ? ex[i - 1]! : '';
          const join = i > 0 ? sharedStart(prev, w) : 0;
          const next = ex[i + 1];
          const tail = next ? sharedStart(w, next) : 0;
          return (
            <span key={w} class="sk-ex-word" style={vars({ '--i': String(i) })}>
              {segments(w.toUpperCase(), join, tail).map((s, k) => (
                <span key={k} class={`sk-seg${s.cls}`}>
                  {s.text}
                </span>
              ))}
            </span>
          );
        })}
      </div>
      <ol class="sk-steps">
        {STR.introSteps.map((s, i) => (
          <li key={s.t}>
            <span class="sk-step-n">{i + 1}</span>
            <div>
              <b>{s.t}</b>
              <span>{s.d}</span>
            </div>
          </li>
        ))}
      </ol>
      <div class="sk-intro-foot">
        <span>
          <Icon name="heart" size={18} color="#E0453B" /> {STR.introLives(m.lives)}
        </span>
        <span class="sk-progress" style={vars({ '--ms': `${TIMING.introMs}ms` })} />
      </div>
    </div>
  );
}

/** The tail of `a` that starts `b` (the example chain's joints). */
function sharedStart(a: string, b: string): number {
  for (let n = Math.min(a.length, b.length); n > 0; n--) if (b.startsWith(a.slice(-n))) return n;
  return 0;
}

function FinalCard({ model }: { model: ScreenModel }) {
  const m = model.match;
  const id = m.winner;
  const p = id !== null ? model.info(id) : undefined;
  const seat = id !== null ? m.seatOf(id) : undefined;
  return (
    <div class="sk-card sk-final">
      <div class="sk-final-crown">
        <Icon name="crown" size={56} color="#FFC928" />
      </div>
      {p && <Avatar look={p.look} ring={p.color} size={150} face="wow" />}
      <div class="sk-eyebrow">{STR.finalEyebrow}</div>
      <div class="sk-final-title display">{p ? STR.finalTitle(p.name) : STR.finalNone}</div>
      {seat && <div class="sk-final-stats">{STR.finalStats(seat.words, seat.lives)}</div>}
    </div>
  );
}
