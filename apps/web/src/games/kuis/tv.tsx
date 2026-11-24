/**
 * TV renderer for Kuis Nusantara. Reads the match on every `version` bump (events, roster
 * changes); per-frame visuals (timer ring, score count-ups) write to the DOM through refs so the
 * component tree does not re-render 60 times a second.
 */

import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { Face } from '../../shared/art/fruits';
import { Avatar, Icon } from '../../shared/ui';
import { backdropUrl } from './backdrop';
import { type KuisScene, type SceneOutcome, type SceneRecord, type SoloRecord, TIMING } from './logic';
import { formatNumber, formatSeconds, LETTERS, STR } from './strings';
import { OPTION_COLORS } from './views';

/* ------------------------------------------------------------------ plumbing */

/** Per-frame callbacks with the current server time, driven by the main loop. */
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

export interface TvModel {
  match: KuisScene;
  version: ReadonlySignal<number>;
  waiting: ReadonlySignal<boolean>;
  frame: FrameBus;
  info(id: number): SeatInfo | undefined;
  /** Solo: the record when the match started (null before the first solo match on this screen). */
  recordBefore: number | null;
  /** Solo: how the final score compares with the record, once the final card is up. */
  record: SoloRecord | null;
}

/** The part of a player card the stage draws (a mirror screen gets it from the Host's state). */
export type SeatInfo = Pick<PlayerInfo, 'id' | 'name' | 'color' | 'look'>;

/** Live stage size in stage px (see `mountStage`). */
export interface StageSize {
  w: number;
  h: number;
}

type Vars = Record<`--${string}`, string>;
const vars = (v: Vars): JSX.CSSProperties => v as unknown as JSX.CSSProperties;
const px = (n: number) => `${n}px`;

const LAMP = { off: '#5B5E66', green: '#22B35E', orange: '#FF8A3D' } as const;

/** Light podium tints for the player colors (dark ink text stays readable on all of them). */
const TINTS: Record<string, string> = {
  '#F2453D': '#FF5A1F',
  '#2F8CFF': '#5AA9FF',
  '#22B35E': '#3DD17A',
  '#FFC928': '#FFC928',
  '#FF8A3D': '#FF8A3D',
  '#FF5C9A': '#FF7EB0',
  '#14B8A6': '#2DD4BF',
  '#C4C7CC': '#C4C7CC',
};
const tintOf = (color: string) => TINTS[color.toUpperCase()] ?? color;

/* ------------------------------------------------------------------ root */

export function KuisTv({ model, size }: { model: TvModel; size: ReadonlySignal<StageSize> }) {
  // Subscribing here re-renders the stage whenever the driver bumps the version.
  void model.version.value;
  const { w, h } = size.value;
  const { match } = model;
  const players = match.roster
    .map((rec) => ({ rec, info: model.info(rec.id) }))
    .filter((p): p is { rec: SceneRecord; info: SeatInfo } => p.info !== undefined);
  const showTiles = match.phase === 'question' || match.phase === 'reveal';
  const showFinal = match.phase === 'final' || match.phase === 'ended';

  return (
    <div class="kz-root">
      <img class="kz-bg" src={backdropUrl(w, h)} alt="" width={w} height={h} draggable={false} />
      <TimerRing match={match} frame={model.frame} />
      {showFinal ? (
        <FinalCard match={match} players={players} record={model.record} />
      ) : (
        <>
          <Header match={match} recordBefore={match.solo ? model.recordBefore : null} />
          <InfoBox match={match} />
          {/* Board, tiles and podiums keep their 1280-wide layout centred on wider stages. */}
          <div class="kz-core">
            <Board match={match} recordBefore={match.solo ? model.recordBefore : null} />
            {showTiles && <Tiles key={match.round} match={match} info={model.info} />}
            {players.length <= 6 ? (
              <Podiums match={match} players={players} />
            ) : (
              <Chips match={match} players={players} />
            )}
          </div>
          {model.waiting.value && <WaitingOverlay />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header({ match, recordBefore }: { match: KuisScene; recordBefore: number | null }) {
  const total = match.total;
  const doneUpTo =
    match.phase === 'reveal' || match.phase === 'final' || match.phase === 'ended'
      ? match.round + 1
      : match.round;
  const current = match.phase === 'intro' || match.phase === 'question' ? match.round : -1;
  const pipWidth = total > 12 ? Math.max(6, Math.floor((14 * 12) / total)) : 14;
  return (
    <div class="kz-head">
      <div class="display outline-text kz-logo">{STR.logo}</div>
      <div class="kz-chip">{STR.questionChip(Math.min(match.round + 1, total), total)}</div>
      {recordBefore !== null && <div class="kz-chip is-record">{STR.startRecord(recordBefore)}</div>}
      <div class="kz-pips" role="img" aria-label={STR.progressLabel} style={vars({ '--pw': px(pipWidth) })}>
        {match.questions.map((q, i) => (
          <div key={q.id} class={`kz-pip${i < doneUpTo ? ' is-done' : i === current ? ' is-now' : ''}`} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ timer ring */

const RING_R = 24;
const RING_C = 2 * Math.PI * RING_R;

function TimerRing({ match, frame }: { match: KuisScene; frame: FrameBus }) {
  const wrap = useRef<HTMLDivElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastText = '';
    let lastCap = '';
    let lastColor = '';
    let lastClass = '';
    let lastOffset = -1;
    return frame.subscribe((now) => {
      const el = wrap.current;
      const ring = arc.current;
      const label = num.current;
      const caption = cap.current;
      if (!el || !ring || !label || !caption) return;
      let frac = 1;
      let text = '';
      let aria = '';
      let color = '#FFC928';
      let captionText = '';
      let cls = 'kz-timer is-hidden';
      if (match.phase === 'question') {
        const left = match.timeLeft(now);
        const done = match.allAnsweredAt !== null;
        const secs = Math.ceil(left / 1000);
        frac = left / TIMING.questionMs;
        text = String(secs);
        aria = STR.timerLabel(secs);
        const urgent = left <= TIMING.cueFromSec * 1000 && left > 0 && !done;
        color = done ? '#22B35E' : urgent ? '#FF5A1F' : '#FFC928';
        cls = `kz-timer${urgent ? ' is-urgent' : ''}`;
        if (left <= 0 && !done) captionText = STR.timeUp;
      } else if (match.phase === 'reveal') {
        const left = match.timeLeft(now);
        const secs = Math.ceil(left / 1000);
        frac = left / TIMING.revealMs;
        text = String(secs);
        aria = STR.nextLabel(secs);
        color = '#22B35E';
        cls = 'kz-timer';
        captionText = match.round + 1 < match.total ? STR.nextCaption : STR.finalCaption;
      }
      const offset = Math.round(RING_C * (1 - Math.max(0, Math.min(1, frac))) * 10) / 10;
      if (offset !== lastOffset) {
        ring.style.strokeDashoffset = String(offset);
        lastOffset = offset;
      }
      if (color !== lastColor) {
        ring.style.stroke = color;
        lastColor = color;
      }
      if (cls !== lastClass) {
        el.className = cls;
        lastClass = cls;
      }
      if (text !== lastText) {
        label.textContent = text;
        el.setAttribute('aria-label', aria);
        // Heartbeat on every second of the final countdown. `lastClass` keeps tracking the base
        // class only, so the beat class survives until the next second restarts it.
        if (cls.includes('is-urgent')) {
          el.classList.remove('is-beat');
          void el.offsetWidth;
          el.classList.add('is-beat');
        }
        lastText = text;
      }
      if (captionText !== lastCap) {
        caption.textContent = captionText;
        lastCap = captionText;
      }
    });
  }, [match, frame]);

  return (
    <div ref={wrap} class="kz-timer is-hidden" role="timer">
      <div class="kz-timer-face">
        <svg width="76" height="76" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="#111214" />
          <circle cx="32" cy="32" r={RING_R} fill="none" stroke="#2A2B30" stroke-width="6" />
          <circle
            ref={arc}
            cx="32"
            cy="32"
            r={RING_R}
            fill="none"
            stroke="#FFC928"
            stroke-width="6"
            stroke-linecap="round"
            stroke-dasharray={String(RING_C)}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <div ref={num} class="kz-timer-num" />
      </div>
      <div ref={cap} class="kz-timer-cap" />
    </div>
  );
}

/* ------------------------------------------------------------------ board */

function Board({ match, recordBefore }: { match: KuisScene; recordBefore: number | null }) {
  const q = match.question;
  const chip = [q.category, q.topic].filter(Boolean).join(' · ').toUpperCase();
  let content: JSX.Element;
  switch (match.phase) {
    case 'start':
      content = (
        <div key="start" class="kz-board-in">
          <div class="kz-cat">{STR.startEyebrow(match.total)}</div>
          <div class="display outline-text kz-big">{STR.startTitle}</div>
          <div class="kz-sub">{STR.startText}</div>
          {recordBefore !== null && <div class="kz-record">{STR.startRecord(recordBefore)}</div>}
        </div>
      );
      break;
    case 'intro':
      content = (
        <div key={`intro-${match.round}`} class="kz-board-in">
          <div class="kz-cat">{STR.introEyebrow(match.round + 1, match.total)}</div>
          <div class="display outline-text kz-big is-cat">{q.category.toUpperCase()}</div>
          {q.topic && <div class="kz-sub">{q.topic}</div>}
        </div>
      );
      break;
    default:
      content = (
        <div key={`q-${match.round}`} class="kz-board-in">
          <div class="kz-cat">{chip}</div>
          <h1 class={`kz-q${q.q.length > 95 ? ' is-long' : ''}`}>{q.q}</h1>
        </div>
      );
  }
  const lit = match.phase === 'intro' || match.phase === 'start';
  return (
    <div key={lit ? `lit-${match.round}` : 'board'} class={`kz-board${lit ? ' is-lit' : ''}`}>
      {content}
    </div>
  );
}

/* ------------------------------------------------------------------ tiles */

function Tiles({ match, info }: { match: KuisScene; info: (id: number) => SeatInfo | undefined }) {
  const q = match.question;
  const revealed = match.phase === 'reveal';
  const pickers: SeatInfo[][] = q.options.map(() => []);
  if (revealed) {
    for (const o of match.outcomes) {
      if (o.option === null) continue;
      const p = info(o.playerId);
      if (p) pickers[o.option]?.push(p);
    }
  }
  return (
    <div class="kz-tiles">
      {q.options.map((label, i) => {
        const correct = revealed && i === q.answer;
        const picked = pickers[i] ?? [];
        const cls = [
          'kz-tile',
          correct ? 'is-correct' : '',
          revealed && !correct ? 'is-dim' : '',
          revealed && !correct && picked.length > 0 ? 'is-shake' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const color = OPTION_COLORS[i]!;
        return (
          <div
            key={LETTERS[i]}
            class={cls}
            style={vars({ '--c': color.color, '--d': color.dark, '--i': String(i) })}
          >
            <div class="kz-key">{LETTERS[i]}</div>
            <div class={`kz-opt${label.length > 16 ? ' is-long' : ''}`}>{label}</div>
            {correct && (
              <div class="kz-check" role="img" aria-label={STR.correctBadge}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#111214"
                  stroke-width="3.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12 L10 18 L20 6" />
                </svg>
              </div>
            )}
            {picked.length > 0 && (
              <div class="kz-pickers">
                {picked.slice(0, 5).map((p, j) => (
                  <span key={p.id} class="kz-picker" style={vars({ '--j': String(j) })}>
                    <Avatar look={p.look} ring={p.color} size={36} face={correct ? 'happy' : 'sad'} />
                  </span>
                ))}
                {picked.length > 5 && <span class="kz-picker-more">+{picked.length - 5}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ info box */

function InfoBox({ match }: { match: KuisScene }) {
  if (match.phase === 'final' || match.phase === 'ended') return null;
  if (match.phase === 'reveal') {
    return (
      <div key={`fact-${match.round}`} class="kz-info is-fact">
        <div class="kz-info-title">{STR.factTitle}</div>
        <div class="kz-info-text">{match.question.fact}</div>
      </div>
    );
  }
  const streakTip = match.round > 0 && match.round % 2 === 1;
  return (
    <div key="howto" class="kz-info">
      <div class="kz-info-title">{STR.howToTitle}</div>
      <div class="kz-info-text">{streakTip ? STR.streakTipText : STR.howToText}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ player status */

interface Status {
  label: string;
  short: string;
  lamp: string;
  face: Face;
  answered: boolean;
  outcome: SceneOutcome | null;
}

function statusOf(match: KuisScene, rec: SceneRecord): Status {
  const base = { answered: false, outcome: null, face: 'happy' as Face };
  if (match.phase === 'reveal') {
    const o = match.outcomes.find((x) => x.playerId === rec.id) ?? null;
    if (o?.score.correct) {
      const sec = formatSeconds(o.timeMs ?? 0);
      return {
        ...base,
        outcome: o,
        label: STR.statusCorrect(sec),
        short: STR.statusCorrectShort(sec),
        lamp: LAMP.green,
        face: 'wow',
      };
    }
    if (o) {
      const label = o.option === null ? STR.statusMissed : STR.statusWrong;
      return {
        ...base,
        outcome: o,
        label,
        short: label,
        lamp: o.option === null ? LAMP.off : LAMP.orange,
        face: 'sad',
      };
    }
  }
  if (!rec.connected) return { ...base, label: STR.statusOffline, short: STR.statusOffline, lamp: LAMP.off };
  if (rec.joinedRound > match.round || (match.phase === 'question' && !match.isParticipant(rec.id))) {
    return { ...base, label: STR.statusNext, short: STR.statusNext, lamp: LAMP.off };
  }
  if (match.phase === 'question') {
    if (match.answers.has(rec.id)) {
      return {
        ...base,
        answered: true,
        label: STR.statusAnswered,
        short: STR.statusAnswered,
        lamp: LAMP.green,
      };
    }
    return { ...base, label: STR.statusThinking, short: STR.statusThinking, lamp: LAMP.off, face: 'effort' };
  }
  return { ...base, label: STR.statusReady, short: STR.statusReady, lamp: LAMP.off };
}

/** Score that counts up from the pre-reveal value. */
function ScoreLed({ from, to, delay }: { from: number; to: number; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(from);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = shown.current;
    if (start === to) {
      el.textContent = formatNumber(to);
      return;
    }
    el.textContent = formatNumber(start);
    const t0 = performance.now() + delay;
    const dur = 850;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      const v = Math.round(start + (to - start) * (1 - (1 - k) ** 3));
      if (v !== shown.current) {
        shown.current = v;
        el.textContent = formatNumber(v);
      }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      shown.current = to;
      el.textContent = formatNumber(to);
    };
  }, [to, delay]);
  return <div ref={ref} class="kz-led" />;
}

function Burst({ outcome, fastest }: { outcome: SceneOutcome; fastest: boolean }) {
  return (
    <div class="kz-burst">
      <div class="display outline-text kz-burst-num">+{formatNumber(outcome.score.total)}</div>
      {(fastest || outcome.score.doubled) && (
        <div class="kz-burst-tag">
          <Icon name={fastest ? 'zap' : 'fire'} size={11} color="#111214" />
          {fastest ? STR.fastestTag : STR.doubleTag}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ podiums */

interface PodSize {
  w: number;
  gap: number;
  av: number;
  bh: number;
  fn: number;
  lw: number;
  lh: number;
  lf: number;
  fs: number;
  bf: number;
  wide: boolean;
}

const POD_SIZES: readonly PodSize[] = [
  { w: 180, gap: 0, av: 76, bh: 120, fn: 16, lw: 120, lh: 32, lf: 22, fs: 12, bf: 30, wide: true },
  { w: 180, gap: 160, av: 76, bh: 120, fn: 16, lw: 120, lh: 32, lf: 22, fs: 12, bf: 30, wide: true },
  { w: 170, gap: 60, av: 74, bh: 116, fn: 16, lw: 116, lh: 32, lf: 22, fs: 12, bf: 30, wide: true },
  { w: 160, gap: 24, av: 70, bh: 112, fn: 15, lw: 112, lh: 30, lf: 21, fs: 11, bf: 28, wide: true },
  { w: 134, gap: 16, av: 62, bh: 104, fn: 14, lw: 100, lh: 28, lf: 19, fs: 10, bf: 24, wide: false },
  { w: 112, gap: 14, av: 56, bh: 100, fn: 13, lw: 92, lh: 26, lf: 18, fs: 10, bf: 22, wide: false },
];

/** Podium area: right of the info box, left of the right curtain. Centered on stage if it fits. */
const POD_MIN_X = 380;
const POD_MAX_X = 1122;

interface Seat {
  rec: SceneRecord;
  info: SeatInfo;
}

function Podiums({ match, players }: { match: KuisScene; players: Seat[] }) {
  if (!players.length) return null;
  const size = POD_SIZES[Math.min(players.length, POD_SIZES.length) - 1]!;
  const total = players.length * size.w + (players.length - 1) * size.gap;
  const left = Math.max(POD_MIN_X, Math.min(640 - total / 2, POD_MAX_X - total));
  const revealing = match.phase === 'reveal';
  return (
    <div
      class="kz-pods"
      style={vars({
        '--w': px(size.w),
        '--bh': px(size.bh),
        '--fn': px(size.fn),
        '--lw': px(size.lw),
        '--lh': px(size.lh),
        '--lf': px(size.lf),
        '--fs': px(size.fs),
        '--bf': px(size.bf),
      })}
    >
      {players.map(({ rec, info }, i) => {
        const st = statusOf(match, rec);
        const shake = revealing && st.outcome !== null && !st.outcome.score.correct;
        return (
          <div
            key={rec.id}
            data-pid={rec.id}
            class={`kz-pod${shake ? ' is-shake' : ''}`}
            style={{
              ...vars({ '--i': String(i), '--tint': tintOf(info.color) }),
              marginLeft: i === 0 ? px(left) : px(size.gap),
            }}
          >
            {revealing && st.outcome && st.outcome.score.total > 0 && (
              <Burst outcome={st.outcome} fastest={!match.solo && match.fastestCorrect === rec.id} />
            )}
            <span key={st.answered ? 'in' : 'wait'} class={`kz-pod-av${st.answered ? ' kz-hop' : ''}`}>
              <Avatar look={info.look} ring={info.color} size={size.av} face={st.face} dim={!rec.connected} />
            </span>
            <div class="kz-pod-body">
              <div class="kz-pod-name">{info.name}</div>
              <ScoreLed from={rec.prevScore} to={rec.score} delay={revealing ? 550 : 0} />
              <div class="kz-status">
                <div
                  key={st.lamp}
                  class={`kz-lamp${st.lamp !== LAMP.off ? ' is-on' : ''}`}
                  style={vars({ '--lamp': st.lamp })}
                />
                {size.wide ? st.label : st.short}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ compact chips (7-16) */

function Chips({ match, players }: { match: KuisScene; players: Seat[] }) {
  const cols = Math.min(8, Math.ceil(players.length / 2));
  const revealing = match.phase === 'reveal';
  return (
    <div class="kz-chips" style={vars({ '--cols': String(cols) })}>
      {players.map(({ rec, info }, i) => {
        const st = statusOf(match, rec);
        const shake = revealing && st.outcome !== null && !st.outcome.score.correct;
        return (
          <div
            key={rec.id}
            data-pid={rec.id}
            class={`kz-pchip${shake ? ' is-shake' : ''}`}
            style={vars({ '--i': String(i), '--tint': tintOf(info.color) })}
            title={st.label}
          >
            <span key={st.answered ? 'in' : 'wait'} class={`kz-pchip-av${st.answered ? ' kz-hop' : ''}`}>
              <Avatar look={info.look} ring={info.color} size={40} face={st.face} dim={!rec.connected} />
            </span>
            <div
              key={st.lamp}
              class={`kz-lamp${st.lamp !== LAMP.off ? ' is-on' : ''}`}
              style={vars({ '--lamp': st.lamp })}
            />
            {revealing && st.outcome && st.outcome.score.total > 0 && (
              <Burst outcome={st.outcome} fastest={!match.solo && match.fastestCorrect === rec.id} />
            )}
            <div class="kz-pod-name">{info.name}</div>
            <ScoreLed from={rec.prevScore} to={rec.score} delay={revealing ? 550 : 0} />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ final standings */

const STEP_STYLE = [
  { av: 132, w: 190, h: 150, rf: 46, delay: 350 },
  { av: 96, w: 170, h: 106, rf: 36, delay: 150 },
  { av: 88, w: 160, h: 80, rf: 32, delay: 0 },
] as const;

function FinalCard({
  match,
  players,
  record,
}: {
  match: KuisScene;
  players: Seat[];
  record: SoloRecord | null;
}) {
  const solo = match.solo && record !== null;
  const byId = new Map(players.map((p) => [p.rec.id, p]));
  const ranked = match
    .ranking()
    .map((r) => ({ r, seat: byId.get(r.playerId) }))
    .filter((x): x is { r: (typeof x)['r']; seat: Seat } => x.seat !== undefined);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // Podium order on screen: 2nd, 1st, 3rd. Narrower when the rank list sits beside it.
  const order = [top[1], top[0], top[2]];
  const k = rest.length ? 0.86 : 1;
  const restTop = Math.round(Math.max(196, Math.min(470 - (rest.length * 36) / 2, 690 - rest.length * 36)));
  return (
    <div class="kz-final">
      <div class="kz-core">
        <div class="kz-final-head">
          <div class="kz-final-eyebrow">{STR.logo}</div>
          <h1 class="display outline-text kz-final-title">{solo ? STR.finalTitleSolo : STR.finalTitle}</h1>
          {solo ? (
            <div class={`kz-record is-final${record.isNew ? ' is-new' : ''}`}>{record.text}</div>
          ) : (
            <div class="kz-final-sub">{STR.finalSubtitle(match.total)}</div>
          )}
        </div>
        <div class={`kz-trio${rest.length ? ' is-side' : ''}`}>
          {order.map((entry) => {
            if (!entry) return null;
            const place = Math.min(entry.r.rank, 3) - 1;
            const s = STEP_STYLE[place] ?? STEP_STYLE[2];
            const { info, rec } = entry.seat;
            return (
              <div
                key={rec.id}
                class="kz-step"
                style={vars({
                  '--delay': `${s.delay}ms`,
                  '--w': px(Math.round(s.w * k)),
                  '--h': px(s.h),
                  '--rf': px(s.rf),
                  '--tint': tintOf(info.color),
                })}
              >
                {entry.r.rank === 1 && !solo && (
                  <svg
                    class="kz-step-crown"
                    width="44"
                    height="34"
                    viewBox="0 0 24 18"
                    role="img"
                    aria-label={STR.winnerCaption}
                  >
                    <path
                      d="M2 16 L4 4 L9 9 L12 1 L15 9 L20 4 L22 16 Z"
                      fill="#FFC928"
                      stroke="#111214"
                      stroke-width="1.5"
                      stroke-linejoin="round"
                    />
                  </svg>
                )}
                <Avatar
                  look={info.look}
                  ring={info.color}
                  size={Math.round(s.av * (k < 1 ? 0.9 : 1))}
                  face={entry.r.rank === 1 ? 'wow' : 'happy'}
                />
                <div class="kz-step-block">
                  {!solo && <div class="kz-step-rank">{entry.r.rank}</div>}
                  <div class="kz-step-name">{info.name}</div>
                  <div class="kz-step-score">{formatNumber(rec.score)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {rest.length > 0 && (
          <div class="kz-rest" style={{ top: px(restTop) }}>
            {rest.map(({ r, seat }, i) => (
              <div key={r.playerId} class="kz-rest-row" style={vars({ '--i': String(i) })}>
                <div class="kz-rest-rank">{r.rank}</div>
                <Avatar look={seat.info.look} ring={seat.info.color} size={24} />
                <div class="kz-rest-name">{seat.info.name}</div>
                <div class="kz-rest-meta">{STR.finalRow(seat.rec.correct, seat.rec.asked)}</div>
                <div class="kz-rest-score">{formatNumber(r.score)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ waiting overlay */

function WaitingOverlay() {
  return (
    <div class="kz-wait" role="status">
      <div class="kz-wait-card">
        <div class="kz-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h2 class="display outline-text kz-wait-title">{STR.waitingTitle}</h2>
        <p class="kz-wait-text">{STR.waitingText}</p>
      </div>
    </div>
  );
}
