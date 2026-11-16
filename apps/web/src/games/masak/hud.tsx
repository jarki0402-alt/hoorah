/**
 * DOM HUD over the WebGL canvas (stage px). Structure changes go through one signal; per-frame
 * values (timer ring, progress bars, hold needles) are written straight to the DOM so nothing
 * re-renders at 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { Face } from '../../shared/art/fruits';
import { Avatar, Icon } from '../../shared/ui';
import { CHEF_RECT, type Rect } from './layout';
import type { Grade, GradeReason, Phase } from './logic';
import { DISH_COLOR, type DishId, type StepDef } from './recipes';
import { STR } from './strings';

export interface HudPlayer {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  connected: boolean;
  score: number;
}

export interface HudStation extends HudPlayer {
  grade: Grade | null;
  reason: GradeReason | null;
  points: number;
  streak: number;
  /** Showcase only. */
  stars: number | null;
  dishPoints: number | null;
}

export interface FinalRow extends HudPlayer {
  rank: number;
  stars: number;
}

export interface HudModel {
  mode: 'grid' | 'hero';
  phase: Phase;
  dish: DishId;
  dishIndex: number;
  dishCount: number;
  stepIndex: number;
  step: StepDef;
  steps: StepDef[];
  chefLine: string | null;
  stations: HudStation[];
  rects: Rect[];
  players: HudPlayer[];
  final: {
    title: string;
    rows: FinalRow[];
    /** Solo: eyebrow without "Juara", and how the score compares with the record. */
    solo?: boolean;
    record?: { text: string; isNew: boolean } | null;
  } | null;
  /** Solo: the record to beat, shown on the dish intro card ("Rekor: 1.250 poin"). */
  recordBefore?: string | null;
  /** Bumped when cooking starts, to flash "MASAK!". */
  goKey: number;
}

export interface FrameValues {
  /** Cook phase: seconds left and the ring fill (1 = full); null hides the timer. */
  secs: number | null;
  ring: number;
  /** Per station (same order as the model): progress 0..1. */
  progress: number[];
}

const RING_R = 26;
const RING_LEN = 2 * Math.PI * RING_R;

export class HudStore {
  readonly model = signal<HudModel | null>(null);
  readonly paused = signal(false);
  timerText: HTMLDivElement | null = null;
  timerArc: SVGCircleElement | null = null;
  timerBox: HTMLDivElement | null = null;
  readonly bars: (HTMLDivElement | null)[] = [];
  readonly needles: (HTMLDivElement | null)[] = [];
  private lastSecs = -2;
  private lastRing = -1;
  private readonly lastP: number[] = [];

  frame(f: FrameValues): void {
    const secs = f.secs ?? -1;
    if (secs !== this.lastSecs && this.timerText && this.timerBox) {
      this.lastSecs = secs;
      this.timerText.textContent = secs >= 0 ? String(secs) : '';
      this.timerBox.classList.toggle('is-hidden', secs < 0);
      this.timerBox.classList.toggle('is-urgent', secs >= 0 && secs <= 3);
    }
    const ring = Math.round(f.ring * 400) / 400;
    if (ring !== this.lastRing && this.timerArc) {
      this.lastRing = ring;
      this.timerArc.style.strokeDashoffset = String(RING_LEN * (1 - ring));
    }
    for (let i = 0; i < f.progress.length; i++) {
      const p = Math.round((f.progress[i] ?? 0) * 1000) / 1000;
      if (this.lastP[i] === p) continue;
      this.lastP[i] = p;
      const bar = this.bars[i];
      if (bar) bar.style.transform = `scaleX(${p})`;
      const needle = this.needles[i];
      if (needle) needle.style.left = `${p * 100}%`;
    }
  }

  /** DOM nodes were re-created: write everything again on the next frame. */
  invalidate(): void {
    this.lastSecs = -2;
    this.lastRing = -1;
    this.lastP.length = 0;
  }
}

const GRADE_CLASS: Record<Grade, string> = {
  sempurna: 'g-sempurna',
  bagus: 'g-bagus',
  lumayan: 'g-lumayan',
  gagal: 'g-gagal',
};

const FACE_OF: Record<Grade, Face> = { sempurna: 'wow', bagus: 'happy', lumayan: 'effort', gagal: 'sad' };

export function Hud({ store }: { store: HudStore }) {
  const m = store.model.value;
  useEffect(() => store.invalidate());
  if (!m) return null;
  return (
    <div class={`mk-hud ${store.paused.value ? 'is-paused' : ''}`}>
      {m.mode === 'grid' ? <Grid m={m} store={store} /> : <Hero m={m} />}
    </div>
  );
}

/* ------------------------------------------------------------------ grid */

function Grid({ m, store }: { m: HudModel; store: HudStore }) {
  const density = m.stations.length <= 2 ? 'large' : m.stations.length <= 4 ? 'medium' : 'compact';
  return (
    <>
      <div
        class="mk-chef-frame"
        style={{ left: CHEF_RECT.x, top: CHEF_RECT.y, width: CHEF_RECT.w, height: CHEF_RECT.h }}
      />
      <Header m={m} store={store} />
      {m.stations.map((s, i) => {
        const r = m.rects[i];
        return r ? <Station key={s.id} s={s} r={r} i={i} m={m} store={store} density={density} /> : null;
      })}
      {m.phase === 'ready' && <ReadyCard m={m} />}
      {m.phase === 'cook' && m.goKey > 0 && (
        <div key={m.goKey} class="mk-go display outline-text">
          {STR.goShout}
        </div>
      )}
    </>
  );
}

function Header({ m, store }: { m: HudModel; store: HudStore }) {
  const st = m.step;
  const text = STR.step(st.id);
  const speech = m.chefLine;
  const over = st.hold?.over ?? null;
  return (
    <div class="mk-header">
      {speech ? (
        <div key={`s${speech}`} class="mk-speech">
          <div class="mk-eyebrow">{STR.chefName}</div>
          <div class="mk-speech-line display">{speech}</div>
        </div>
      ) : (
        <div key={`t${st.id}`} class="mk-title-block">
          <div class="mk-eyebrow-row">
            <span class="mk-dish-chip" style={{ background: DISH_COLOR[m.dish] }}>
              {STR.dish(m.dish)}
            </span>
            <span class="mk-eyebrow">
              {m.phase === 'showcase'
                ? STR.dishOf(m.dishIndex + 1, m.dishCount)
                : STR.stepOf(m.stepIndex + 1, m.steps.length)}
            </span>
          </div>
          <div class="mk-step-title display">
            {m.phase === 'showcase' ? STR.showcaseTitle(m.dish) : text.title}
          </div>
          {m.phase !== 'showcase' && (
            <div class="mk-cue">
              <span class="mk-cue-gesture">
                <Icon name={st.icon ?? 'hand'} size={18} stroke={2.4} />
                {STR.modeCue(st.mode, st.dir, over)}
              </span>
              <span class="mk-cue-text">{text.cue}</span>
            </div>
          )}
        </div>
      )}
      <div class="mk-header-right">
        <div class="mk-dots" aria-hidden="true">
          {m.steps.map((s, i) => (
            <span
              key={s.id}
              class={`mk-dot ${i < m.stepIndex || m.phase === 'showcase' ? 'done' : i === m.stepIndex ? 'now' : ''}`}
            />
          ))}
        </div>
        <div
          class="mk-timer is-hidden"
          ref={(el) => {
            store.timerBox = el;
          }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r={RING_R} class="mk-timer-track" />
            <circle
              cx="32"
              cy="32"
              r={RING_R}
              class="mk-timer-arc"
              stroke-dasharray={RING_LEN}
              ref={(el) => {
                store.timerArc = el;
              }}
            />
          </svg>
          <div
            class="mk-timer-text display"
            ref={(el) => {
              store.timerText = el;
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Station({
  s,
  r,
  i,
  m,
  store,
  density,
}: {
  s: HudStation;
  r: Rect;
  i: number;
  m: HudModel;
  store: HudStore;
  density: string;
}) {
  const hold = m.step.hold;
  const showMeter = Boolean(hold) && (m.phase === 'cook' || m.phase === 'reveal' || m.phase === 'ready');
  const showStamp = s.grade !== null && (m.phase === 'cook' || m.phase === 'reveal');
  const over = hold?.over ?? null;
  const face: Face = s.grade ? FACE_OF[s.grade] : 'happy';
  return (
    <div
      class={`mk-station d-${density} ${s.connected ? '' : 'is-off'}`}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, '--pc': s.color }}
    >
      <div class="mk-station-mask" />
      {m.phase === 'showcase' && s.stars !== null && (
        <div class="mk-stars">
          <div class="mk-star-row">
            {[0, 1, 2].map((k) => (
              <span
                key={k}
                class={`mk-star ${k < (s.stars ?? 0) ? 'on' : ''}`}
                style={{ animationDelay: `${0.5 + k * 0.35}s` }}
              >
                <Icon name="star" size={density === 'compact' ? 34 : 50} color="currentColor" />
              </span>
            ))}
          </div>
          {s.dishPoints !== null && (
            <div class="mk-dish-points display outline-text">{STR.dishScore(s.dishPoints)}</div>
          )}
        </div>
      )}
      {showStamp && s.grade && (
        <div key={`${m.stepIndex}-${s.grade}`} class={`mk-stamp ${GRADE_CLASS[s.grade]}`}>
          <div class="mk-stamp-word display outline-text">{STR.gradeShort(s.grade)}</div>
          <div class="mk-stamp-sub">
            {s.reason ? STR.reason(s.reason, over) : ''}
            <b>{STR.popup(s.points)}</b>
          </div>
          {s.streak >= 2 && s.grade === 'sempurna' && <div class="mk-streak">{STR.streak(s.streak)}</div>}
        </div>
      )}
      {!s.connected && <div class="mk-off">{STR.offline}</div>}
      <div class="mk-plate">
        <Avatar fruit={s.fruit} ring={s.color} size={density === 'compact' ? 30 : 40} face={face} />
        <div class="mk-plate-main">
          <div class="mk-plate-row">
            <span class="mk-name">{s.name}</span>
            <span class="mk-score">{STR.points(s.score)}</span>
          </div>
          {showMeter && hold ? (
            <div class="mk-meter">
              <div class="mk-zone raw" style={{ width: `${(hold.lo / hold.burn) * 100}%` }} />
              <div
                class="mk-zone gold"
                style={{
                  left: `${(hold.lo / hold.burn) * 100}%`,
                  width: `${((hold.hi - hold.lo) / hold.burn) * 100}%`,
                }}
              >
                <span>{STR.zoneGold}</span>
              </div>
              <div
                class="mk-zone perfect"
                style={{
                  left: `${((hold.sweet - hold.perfect) / hold.burn) * 100}%`,
                  width: `${((2 * hold.perfect) / hold.burn) * 100}%`,
                }}
              />
              <div
                class={`mk-zone over ${over === 'spill' ? 'spill' : ''}`}
                style={{ left: `${(hold.hi / hold.burn) * 100}%`, right: 0 }}
              />
              <div
                class="mk-needle"
                ref={(el) => {
                  store.needles[i] = el;
                }}
              />
            </div>
          ) : (
            <div class="mk-bar">
              <div
                class="mk-bar-fill"
                ref={(el) => {
                  store.bars[i] = el;
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadyCard({ m }: { m: HudModel }) {
  const st = m.step;
  const text = STR.step(st.id);
  const over = st.hold?.over ?? null;
  return (
    <div key={`r${m.dishIndex}-${m.stepIndex}`} class="mk-ready">
      <div class="mk-ready-num display">{m.stepIndex + 1}</div>
      <div>
        <div class="mk-eyebrow">{STR.stepOf(m.stepIndex + 1, m.steps.length)}</div>
        <div class="mk-ready-title display">{text.title}</div>
        <div class="mk-ready-cue">
          <Icon name={st.icon ?? 'hand'} size={22} stroke={2.4} />
          {STR.modeCue(st.mode, st.dir, over)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ m }: { m: HudModel }) {
  if (m.phase === 'final' && m.final) return <FinalPanel m={m} />;
  return <IntroPanel m={m} />;
}

function IntroPanel({ m }: { m: HudModel }) {
  return (
    <>
      {m.chefLine && (
        <div key={m.chefLine} class="mk-bubble">
          <div class="mk-eyebrow">{STR.chefName}</div>
          <div class="mk-bubble-line display">{m.chefLine}</div>
        </div>
      )}
      <div key={`i${m.dishIndex}`} class="mk-card mk-intro">
        <div class="mk-eyebrow">{STR.dishOf(m.dishIndex + 1, m.dishCount)}</div>
        <div class="mk-intro-name display" style={{ color: DISH_COLOR[m.dish] }}>
          {STR.dish(m.dish)}
        </div>
        <div class="mk-intro-desc">{STR.dishDesc(m.dish)}</div>
        <div class="mk-intro-steps">
          {m.steps.map((s, i) => (
            <div key={s.id} class="mk-intro-step" style={{ animationDelay: `${0.25 + i * 0.09}s` }}>
              <span class="mk-intro-n">{i + 1}</span>
              <span class="mk-intro-t">{STR.step(s.id).title}</span>
              <span class="mk-intro-g">
                <Icon name={s.icon ?? 'hand'} size={16} stroke={2.4} />
                {STR.modeCue(s.mode, s.dir, s.hold?.over ?? null)}
              </span>
            </div>
          ))}
        </div>
        <div class="mk-intro-foot">
          {m.players.map((p) => (
            <span key={p.id} class={`mk-chip ${p.connected ? '' : 'is-off'}`}>
              <Avatar fruit={p.fruit} ring={p.color} size={26} />
              {p.name}
            </span>
          ))}
          {m.players.length === 0 && <span class="mk-wait">{STR.waitingPlayers}</span>}
          {m.recordBefore && <span class="mk-chip is-record">{m.recordBefore}</span>}
        </div>
      </div>
    </>
  );
}

function FinalPanel({ m }: { m: HudModel }) {
  const f = m.final!;
  return (
    <>
      {m.chefLine && (
        <div class="mk-bubble">
          <div class="mk-eyebrow">{STR.chefName}</div>
          <div class="mk-bubble-line display">{m.chefLine}</div>
        </div>
      )}
      <div class="mk-card mk-final">
        <div class="mk-eyebrow">{f.solo ? STR.finalTitleSolo : STR.finalTitle}</div>
        <div class="mk-final-title display">{f.title}</div>
        {f.record && <div class={`mk-record${f.record.isNew ? ' is-new' : ''}`}>{f.record.text}</div>}
        <div class="mk-final-rows">
          {f.rows.map((r, i) => (
            <div
              key={r.id}
              class={`mk-final-row ${r.rank === 1 ? 'top' : ''}`}
              style={{ animationDelay: `${0.2 + i * 0.1}s` }}
            >
              {!f.solo && <span class="mk-final-rank display">{r.rank}</span>}
              <Avatar fruit={r.fruit} ring={r.color} size={34} face={r.rank === 1 ? 'wow' : 'happy'} />
              <span class="mk-final-name">{r.name}</span>
              <span class="mk-final-stars">
                <Icon name="star" size={16} color="#FFC928" />
                {r.stars}
              </span>
              <span class="mk-final-score display">{r.score}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
