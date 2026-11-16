/**
 * Main-screen renderer for Kompak Gak?. Reads the match on every `version` bump (events, roster
 * changes); per-frame visuals (timer ring, score count-ups) write to the DOM through refs so the
 * component tree does not re-render 60 times a second. Animations use transform and opacity only
 * so weak Smart TV browsers stay smooth.
 */

import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { Face } from '../../shared/art/fruits';
import { Avatar } from '../../shared/ui';
import { backdropUrl } from './backdrop';
import { coopTitle, type KompakMatch, type PlayerRecord, type RoundOutcome, TIMING } from './logic';
import { formatNumber, LETTERS, STR } from './strings';
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
  match: KompakMatch;
  version: ReadonlySignal<number>;
  waiting: ReadonlySignal<boolean>;
  frame: FrameBus;
  info(id: number): PlayerInfo | undefined;
}

export interface StageSize {
  w: number;
  h: number;
}

type Vars = Record<`--${string}`, string>;
const vars = (v: Vars): JSX.CSSProperties => v as unknown as JSX.CSSProperties;
const px = (n: number) => `${n}px`;

interface Seat {
  rec: PlayerRecord;
  info: PlayerInfo;
}

/* Layout constants (stage px), mirrored in kompak.css. */
/** Lowest point of the verdict tag under the board, plus room for a stamp. */
const STAMP_CLEAR = 300;
const COLS_BOTTOM = 172;
const CARD_H = 74;
const COUNT_H = 40;
/** Bar width minus its side padding, where the pickers' avatars wrap. */
const BAR_INNER_W = 208;

/* ------------------------------------------------------------------ root */

export function KompakTv({ model, size }: { model: TvModel; size: ReadonlySignal<StageSize> }) {
  void model.version.value;
  const { w, h } = size.value;
  const { match } = model;
  const seats = match.roster
    .map((rec) => ({ rec, info: model.info(rec.id) }))
    .filter((p): p is Seat => p.info !== undefined);
  const showFinal = match.phase === 'final' || match.phase === 'ended';
  const showCols = match.phase === 'question' || match.phase === 'reveal';

  return (
    <div class="kp-root">
      <img class="kp-bg" src={backdropUrl(w, h)} alt="" width={w} height={h} draggable={false} />
      <div class="kp-core">
        {showFinal ? (
          <FinalCard match={match} seats={seats} />
        ) : (
          <>
            <Header match={match} />
            <TimerRing match={match} frame={model.frame} />
            <Board match={match} />
            {showCols && <Columns key={match.round} match={match} info={model.info} stageH={h} />}
            {match.phase === 'start' && <HowTo coop={match.coop} />}
            {match.coop ? <CoopSeats match={match} seats={seats} /> : <Seats match={match} seats={seats} />}
          </>
        )}
      </div>
      {model.waiting.value && !showFinal && <WaitingOverlay />}
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header({ match }: { match: KompakMatch }) {
  const total = match.total;
  const doneUpTo = match.phase === 'reveal' ? match.round + 1 : match.round;
  const current = match.phase === 'intro' || match.phase === 'question' ? match.round : -1;
  const pipWidth = total > 12 ? Math.max(5, Math.floor((12 * 12) / total)) : 12;
  return (
    <div class="kp-head">
      <div class="display outline-text kp-logo">{STR.logo}</div>
      <div class="kp-chip">{STR.questionChip(Math.min(match.round + 1, total), total)}</div>
      <div class="kp-pips" role="img" aria-label={STR.progressLabel} style={vars({ '--pw': px(pipWidth) })}>
        {match.prompts.map((q, i) => (
          <div key={q.id} class={`kp-pip${i < doneUpTo ? ' is-done' : i === current ? ' is-now' : ''}`} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ timer ring */

const RING_R = 24;
const RING_C = 2 * Math.PI * RING_R;

function TimerRing({ match, frame }: { match: KompakMatch; frame: FrameBus }) {
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
      let cls = 'kp-timer is-hidden';
      if (match.phase === 'question') {
        const left = match.timeLeft(now);
        const done = match.allAnsweredAt !== null;
        const secs = Math.ceil(left / 1000);
        frac = left / TIMING.questionMs;
        text = String(secs);
        aria = STR.timerLabel(secs);
        const urgent = left <= TIMING.cueFromSec * 1000 && left > 0 && !done;
        color = done ? '#3FC489' : urgent ? '#FF5A1F' : '#FFC928';
        cls = `kp-timer${urgent ? ' is-urgent' : ''}`;
        if (left <= 0 && !done) captionText = STR.timeUp;
      } else if (match.phase === 'reveal') {
        const left = match.timeLeft(now);
        const secs = Math.ceil(left / 1000);
        frac = left / TIMING.revealMs;
        text = String(secs);
        aria = STR.nextLabel(secs);
        color = '#3FC489';
        cls = 'kp-timer';
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
    <div ref={wrap} class="kp-timer is-hidden" role="timer">
      <div class="kp-timer-face">
        <svg width="84" height="84" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="29" fill="#0E151D" stroke="#8A5A2B" stroke-width="3" />
          <circle cx="32" cy="32" r={RING_R} fill="none" stroke="#26313D" stroke-width="6" />
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
        <div ref={num} class="kp-timer-num" />
      </div>
      <div ref={cap} class="kp-timer-cap" />
    </div>
  );
}

/* ------------------------------------------------------------------ chalkboard */

function Board({ match }: { match: KompakMatch }) {
  const q = match.prompt;
  let content: JSX.Element;
  switch (match.phase) {
    case 'start':
      content = (
        <div key="start" class="kp-board-in">
          <div class="kp-cat">{STR.startEyebrow(match.total)}</div>
          <div class="display kp-big">{STR.startTitle}</div>
          <div class="kp-sub">{match.coop ? STR.startTextCoop : STR.startTextGroup}</div>
        </div>
      );
      break;
    case 'intro':
      content = (
        <div key={`intro-${match.round}`} class="kp-board-in">
          <div class="kp-cat">{STR.introEyebrow(match.round + 1, match.total)}</div>
          <div class="display kp-big is-cat">{q.category}</div>
          <div class="kp-sub">{match.coop ? STR.hintCoop : STR.hintGroup}</div>
        </div>
      );
      break;
    default:
      content = (
        <div key={`q-${match.round}`} class="kp-board-in">
          <div class="kp-cat">{q.category.toUpperCase()}</div>
          <h1 class={`display kp-q${q.q.length > 60 ? ' is-long' : ''}`}>{q.q}</h1>
        </div>
      );
  }
  return (
    <div class="kp-board">
      {content}
      {match.phase === 'reveal' && <Verdict match={match} />}
    </div>
  );
}

/** Paper tag pinned under the chalkboard with the round's verdict. */
function Verdict({ match }: { match: KompakMatch }) {
  const r = match.result;
  if (!r) return null;
  let title: string;
  let text: string;
  let good = r.winners.length > 0;
  const answered = r.outcomes.filter((o) => o.option !== null).length;
  if (r.mode === 'sehati') {
    title = good ? STR.stampSehati : answered === 0 ? STR.verdictMissed : STR.verdictApart;
    text = good
      ? STR.verdictSehatiText
      : answered === 0
        ? STR.verdictMissedText
        : answered === 1
          ? STR.verdictLateText
          : STR.verdictApartText;
  } else if (answered === 0) {
    title = STR.verdictMissed;
    text = STR.verdictMissedText;
    good = false;
  } else if (!good) {
    title = STR.verdictNone;
    text = STR.verdictNoneText;
  } else if (r.unanimous) {
    title = STR.stampAll;
    text = STR.verdictAllText;
  } else {
    title = STR.stampKompak;
    const n = r.counts[r.winners[0]!] ?? 0;
    text = r.winners.length > 1 ? STR.verdictTieText : STR.verdictKompakText(n);
  }
  return (
    <div class={`kp-verdict${good ? ' is-good' : ''}`}>
      <span class="kp-verdict-title">{title}</span>
      <span class="kp-verdict-text">{text}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ option columns */

function avatarSize(n: number): number {
  if (n <= 4) return 56;
  if (n <= 8) return 46;
  return 38;
}

function Columns({
  match,
  info,
  stageH,
}: {
  match: KompakMatch;
  info: (id: number) => PlayerInfo | undefined;
  stageH: number;
}) {
  const q = match.prompt;
  const revealed = match.phase === 'reveal' && match.result !== null;
  const result = match.result;
  const n = Math.max(1, match.participants.length);
  const av = avatarSize(n);
  // Big rooms overlap the avatars a little so a unanimous 16 still fits the bar.
  const crowd = n > 8;
  const step = crowd ? av - 6 : av + 6;
  const perRow = Math.max(1, Math.floor((BAR_INNER_W - av) / step) + 1);
  const rowH = av + (crowd ? 4 : 6);
  // Bars stop below the verdict tag hanging from the board, so a winner's stamp stays clear.
  const zoneH = stageH - STAMP_CLEAR - COLS_BOTTOM - CARD_H - COUNT_H - 8;
  const pickers: PlayerInfo[][] = q.options.map(() => []);
  const outcomes = new Map<number, RoundOutcome>();
  if (revealed && result) {
    for (const o of result.outcomes) {
      outcomes.set(o.playerId, o);
      if (o.option === null) continue;
      const p = info(o.playerId);
      if (p) pickers[o.option]?.push(p);
    }
  }
  const stamp =
    result?.mode === 'sehati' ? STR.stampSehati : result?.unanimous ? STR.stampAll : STR.stampKompak;
  return (
    <div class="kp-cols">
      {!revealed && <Answered match={match} info={info} />}
      {q.options.map((label, i) => {
        const color = OPTION_COLORS[i]!;
        const win = revealed && (result?.winners.includes(i) ?? false);
        const dim = revealed && !win;
        const picked = pickers[i] ?? [];
        const rows = Math.ceil(picked.length / perRow);
        const minH = rows * rowH + 10;
        // One row of avatars as the base, the rest of the zone shared by vote share.
        const base = rowH + 10;
        const share = base + ((zoneH - base) * picked.length) / n;
        const barH = picked.length ? Math.round(Math.max(minH, Math.min(zoneH, share))) : 0;
        return (
          <div
            key={LETTERS[i]}
            class={`kp-col${win ? ' is-win' : ''}${dim ? ' is-dim' : ''}${crowd ? ' is-crowd' : ''}`}
            style={vars({ '--c': color.color, '--d': color.dark, '--i': String(i) })}
          >
            {revealed && (
              <div class="kp-stack">
                {win && <div class="display kp-stamp">{stamp}</div>}
                <div class="kp-count">
                  <span class="display">{picked.length}</span>
                </div>
                {barH > 0 && (
                  <div class="kp-bar" style={{ height: px(barH) }}>
                    <div class="kp-bar-fill" />
                    <div class="kp-bar-avs">
                      {picked.map((p, j) => {
                        const o = outcomes.get(p.id);
                        const face: Face = o && o.points > 0 ? 'wow' : 'sad';
                        return (
                          <span key={p.id} class="kp-bar-av" style={vars({ '--j': String(j) })}>
                            <Avatar fruit={p.fruit} ring={p.color} size={av} face={face} />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div class="kp-card">
              <div class="kp-key">{LETTERS[i]}</div>
              <div class={`kp-opt${label.length > 13 ? ' is-long' : ''}`}>{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Three-step how-to under the board on the title card. */
function HowTo({ coop }: { coop: boolean }) {
  return (
    <div class="kp-howto">
      <div class="kp-answered-title">{STR.howToTitle}</div>
      <div class="kp-howto-steps">
        {STR.howToSteps(coop).map((step, i) => (
          <div key={step.t} class="kp-howto-step" style={vars({ '--i': String(i) })}>
            <div class="display kp-howto-n">{i + 1}</div>
            <div class="kp-howto-t">{step.t}</div>
            <div class="kp-howto-d">{step.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Sudah menjawab" row: avatars hop in as players lock their pick. */
function Answered({ match, info }: { match: KompakMatch; info: (id: number) => PlayerInfo | undefined }) {
  const ids = match.participants.filter((id) => match.answers.has(id));
  const n = match.participants.length;
  const size = n > 10 ? 48 : 62;
  return (
    <div class="kp-answered">
      <div class="kp-answered-head">
        <span class="kp-answered-title">{STR.answeredTitle}</span>
        <span class="kp-answered-count">{STR.answeredCount(ids.length, n)}</span>
      </div>
      <div class="kp-answered-row">
        {ids.length === 0 && <div class="kp-answered-none">{STR.answeredNone}</div>}
        {ids.map((id) => {
          const p = info(id);
          if (!p) return null;
          return (
            <span key={id} class="kp-answered-av">
              <Avatar fruit={p.fruit} ring={p.color} size={size} face="happy" />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ seats (players) */

interface Status {
  label: string;
  tone: 'off' | 'idle' | 'wait' | 'done' | 'good' | 'bad';
  face: Face;
  outcome: RoundOutcome | null;
}

function statusOf(match: KompakMatch, rec: PlayerRecord): Status {
  if (match.phase === 'reveal') {
    const o = match.outcomeOf(rec.id) ?? null;
    if (o) {
      const label =
        o.kind === 'kompak'
          ? STR.statusKompak
          : o.kind === 'sehati'
            ? STR.statusSehati
            : o.kind === 'alone'
              ? STR.statusAlone
              : o.kind === 'minority'
                ? STR.statusMinority
                : o.kind === 'apart'
                  ? STR.statusApart
                  : o.kind === 'missed'
                    ? STR.statusMissed
                    : STR.statusReady;
      const good = o.points > 0;
      return { label, tone: good ? 'good' : 'bad', face: good ? 'wow' : 'sad', outcome: o };
    }
  }
  const base = { outcome: null, face: 'happy' as Face };
  if (!rec.connected) return { ...base, label: STR.statusOffline, tone: 'off' };
  if (rec.joinedRound > match.round || (match.phase === 'question' && !match.isParticipant(rec.id))) {
    return { ...base, label: STR.statusNext, tone: 'off' };
  }
  if (match.phase === 'question') {
    if (match.answers.has(rec.id)) return { ...base, label: STR.statusAnswered, tone: 'done' };
    return { ...base, label: STR.statusThinking, tone: 'wait', face: 'effort' };
  }
  return { ...base, label: STR.statusReady, tone: 'idle' };
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
    const dur = 800;
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
  return <div ref={ref} class="kp-score" />;
}

const REVEAL_SCORE_DELAY = 1500;

function Seats({ match, seats }: { match: KompakMatch; seats: Seat[] }) {
  if (!seats.length) return null;
  const compact = seats.length > 8;
  const revealing = match.phase === 'reveal';
  return (
    <div class={`kp-seats${compact ? ' is-compact' : ''}`}>
      {seats.map(({ rec, info }, i) => {
        const st = statusOf(match, rec);
        const pts = st.outcome?.points ?? 0;
        return (
          <div
            key={rec.id}
            data-pid={rec.id}
            class={`kp-seat is-${st.tone}${revealing && pts > 0 ? ' has-burst' : ''}`}
            style={vars({ '--i': String(i), '--ring': info.color })}
          >
            {revealing && pts > 0 && <div class="display outline-text kp-burst">+{formatNumber(pts)}</div>}
            <span
              key={st.tone === 'done' ? 'in' : 'wait'}
              class={`kp-seat-av${st.tone === 'done' ? ' kp-hop' : ''}`}
            >
              <Avatar
                fruit={info.fruit}
                ring={info.color}
                size={compact ? 40 : 58}
                face={st.face}
                dim={!rec.connected}
              />
            </span>
            <div class="kp-seat-body">
              <div class="kp-seat-name">{info.name}</div>
              <ScoreLed from={rec.prevScore} to={rec.score} delay={revealing ? REVEAL_SCORE_DELAY : 0} />
              {!compact && <div class="kp-seat-status">{st.label}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Two players: both seats with the "persen kompak" meter between them. */
function CoopSeats({ match, seats }: { match: KompakMatch; seats: Seat[] }) {
  const pct = match.coopPercent;
  const revealing = match.phase === 'reveal';
  const [a, b] = seats;
  const seat = (s: Seat | undefined, side: 'l' | 'r') => {
    if (!s) return <div class={`kp-coop-seat is-${side}`} />;
    const st = statusOf(match, s.rec);
    const pts = st.outcome?.points ?? 0;
    return (
      <div
        data-pid={s.rec.id}
        class={`kp-seat kp-coop-seat is-${side} is-${st.tone}`}
        style={vars({ '--ring': s.info.color })}
      >
        {revealing && pts > 0 && <div class="display outline-text kp-burst">+{formatNumber(pts)}</div>}
        <span
          key={st.tone === 'done' ? 'in' : 'wait'}
          class={`kp-seat-av${st.tone === 'done' ? ' kp-hop' : ''}`}
        >
          <Avatar fruit={s.info.fruit} ring={s.info.color} size={64} face={st.face} dim={!s.rec.connected} />
        </span>
        <div class="kp-seat-body">
          <div class="kp-seat-name">{s.info.name}</div>
          <ScoreLed from={s.rec.prevScore} to={s.rec.score} delay={revealing ? REVEAL_SCORE_DELAY : 0} />
          <div class="kp-seat-status">{st.label}</div>
        </div>
      </div>
    );
  };
  return (
    <div class="kp-seats is-coop">
      {seat(a, 'l')}
      <div class="kp-meter">
        <div class="kp-meter-head">
          <span>{STR.meterLabel}</span>
          <span class="display kp-meter-pct">{STR.meterValue(pct)}</span>
        </div>
        <div class="kp-meter-track">
          <div class="kp-meter-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div class="kp-meter-sub">
          {match.coopRounds > 0 ? STR.meterSub(match.coopHits, match.coopRounds) : STR.hintCoop}
        </div>
      </div>
      {seat(b, 'r')}
    </div>
  );
}

/* ------------------------------------------------------------------ final */

function FinalCard({ match, seats }: { match: KompakMatch; seats: Seat[] }) {
  if (match.coop && match.coopRounds > 0) return <CoopFinal match={match} seats={seats} />;
  const byId = new Map(seats.map((s) => [s.rec.id, s]));
  const ranked = match
    .ranking()
    .map((r) => ({ r, seat: byId.get(r.playerId) }))
    .filter((x): x is { r: (typeof x)['r']; seat: Seat } => x.seat !== undefined);
  const twoCols = ranked.length > 6;
  return (
    <div class="kp-final">
      <div class="kp-final-head">
        <div class="kp-cat">{STR.logo}</div>
        <h1 class="display outline-text kp-final-title">{STR.finalTitle}</h1>
        <div class="kp-final-sub">{STR.finalSubtitle(match.total)}</div>
      </div>
      <div class={`kp-rank${twoCols ? ' is-two' : ''}`}>
        {ranked.map(({ r, seat }, i) => {
          const top = r.rank === 1 && r.score > 0;
          return (
            <div
              key={r.playerId}
              class={`kp-rank-row${top ? ' is-top' : ''}`}
              style={vars({ '--i': String(i), '--ring': seat.info.color })}
            >
              <div class="display kp-rank-n">{r.rank}</div>
              <Avatar
                fruit={seat.info.fruit}
                ring={seat.info.color}
                size={twoCols ? 38 : 48}
                face={top ? 'wow' : 'happy'}
              />
              <div class="kp-rank-name">{seat.info.name}</div>
              <div class="kp-rank-meta">{STR.finalRow(seat.rec.hits, seat.rec.played)}</div>
              <div class="display kp-rank-score">{formatNumber(r.score)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoopFinal({ match, seats }: { match: KompakMatch; seats: Seat[] }) {
  const pct = match.coopPercent;
  const t = coopTitle(pct);
  const [a, b] = seats;
  const av = (s: Seat | undefined, side: string) =>
    s ? (
      <div class={`kp-cf-av is-${side}`}>
        <Avatar fruit={s.info.fruit} ring={s.info.color} size={150} face={pct >= 50 ? 'wow' : 'happy'} />
        <div class="kp-cf-name">{s.info.name}</div>
      </div>
    ) : null;
  return (
    <div class="kp-final is-coop">
      <div class="kp-final-head">
        <div class="kp-cat">{STR.meterLabel}</div>
      </div>
      <div class="kp-cf">
        {av(a, 'l')}
        <div class="kp-cf-mid">
          <div class="display outline-text kp-cf-pct">{STR.meterValue(pct)}</div>
          <div class="display kp-cf-title">{STR.finalCoopTitle(t.title)}</div>
          <div class="kp-cf-text">{t.text}</div>
          <div class="kp-cf-sub">{STR.finalCoopSubtitle(match.coopHits, match.coopRounds)}</div>
        </div>
        {av(b, 'r')}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ waiting overlay */

function WaitingOverlay() {
  return (
    <div class="kp-wait" role="status">
      <div class="kp-wait-card">
        <div class="kp-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h2 class="display kp-wait-title">{STR.waitingTitle}</h2>
        <p class="kp-wait-text">{STR.waitingText}</p>
      </div>
    </div>
  );
}
