/**
 * DOM/Preact HUD over the Phaser world. Slow state goes through signals (a few Hz); floating
 * words come from a small pool of elements animated with CSS, so Preact never re-renders at
 * 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { memo } from 'preact/compat';
import { Avatar } from '../../shared/ui';
import type { Line } from './commentary';
import { BITES } from './logic';
import { num, STR } from './strings';

export interface PlateModel {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  bites: number;
  score: number;
  connected: boolean;
  choking: boolean;
  finished: boolean;
  /** Round result: points won this round (shown as a badge), null while playing. */
  gain: number | null;
  /** Lane centre in stage px. */
  x: number;
}

export interface ResultRow {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  /** 0 hides the rank (solo: there is nobody to rank against). */
  rank: number;
  detail: string;
  points: string;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | {
      kind: 'intro';
      key: number;
      title: string;
      sub: string;
      hint: string;
      count: string | null;
      /** Solo: the record to beat, e.g. "Rekor: 1.650 poin". */
      record?: string | null;
    }
  | { kind: 'roundEnd'; key: number; title: string; sub: string; next: string | null; rows: ResultRow[] }
  | {
      kind: 'finale';
      key: number;
      title: string;
      sub: string;
      rows: ResultRow[];
      /** Solo: how this score compares with the record. */
      record?: { text: string; isNew: boolean } | null;
    };

export interface HudModel {
  chip: string;
  /** Seconds left, or null to hide the timer. */
  secs: number | null;
  urgent: boolean;
  plates: PlateModel[];
  /** Plate width and top edge in stage px. */
  plateW: number;
  plateY: number;
  overlay: Overlay;
}

export type PopKind = 'bite' | 'perfect' | 'choke' | 'finish';

const POOL = 16;

export class Hud {
  readonly model = signal<HudModel>({
    chip: '',
    secs: null,
    urgent: false,
    plates: [],
    plateW: 200,
    plateY: 640,
    overlay: { kind: 'none' },
  });
  readonly line = signal<Line | null>(null);
  readonly paused = signal(false);
  private readonly pool: HTMLDivElement[] = [];
  private next = 0;

  readonly poolRef = (el: HTMLDivElement | null) => {
    if (el && !this.pool.includes(el)) this.pool.push(el);
  };

  constructor(host: HTMLElement) {
    render(<HudView hud={this} />, host);
  }

  /** A floating word at stage px (x, y). */
  pop(x: number, y: number, text: string, kind: PopKind): void {
    const el = this.pool[this.next++ % this.pool.length];
    if (!el) return;
    el.textContent = text;
    el.className = 'kp-pop';
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.setProperty('--tilt', `${(Math.random() - 0.5) * 16}deg`);
    // Restart the animation on a reused element.
    void el.offsetWidth;
    el.className = `kp-pop is-${kind} on`;
  }
}

function Pips({ bites, finished }: { bites: number; finished: boolean }) {
  const items = [];
  for (let i = 0; i < BITES; i++) {
    items.push(<span key={i} class={`kp-pip ${i < bites || finished ? 'eaten' : ''}`} />);
  }
  return (
    <div class="kp-pips" role="img" aria-label={STR.biteAria(bites, BITES)}>
      {items}
    </div>
  );
}

function Plate({ p, w }: { p: PlateModel; w: number }) {
  const cls = ['kp-plate', p.connected ? '' : 'off', p.choking ? 'choking' : '', p.finished ? 'done' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls} style={{ left: `${p.x - w / 2}px`, width: `${w}px`, ['--pc' as string]: p.color }}>
      <div class="kp-plate-top">
        <span class="kp-plate-name">{p.connected ? p.name : `${p.name} · ${STR.offline}`}</span>
        <span class="kp-plate-score">{num(p.score)}</span>
      </div>
      <Pips bites={p.bites} finished={p.finished} />
      {p.gain !== null && <div class="kp-gain">{STR.placePoints(p.gain)}</div>}
    </div>
  );
}

function Rows({ rows }: { rows: ResultRow[] }) {
  return (
    <div class="kp-rows">
      {rows.map((r) => (
        <div key={r.id} class={`kp-row ${r.rank <= 1 ? 'first' : ''}`}>
          {r.rank > 0 && <span class="kp-rank">{r.rank}</span>}
          <Avatar fruit={r.fruit} ring={r.color} size={40} face={r.rank <= 1 ? 'happy' : 'effort'} />
          <span class="kp-row-name">{r.name}</span>
          <span class="kp-row-detail">{r.detail}</span>
          <span class="kp-row-pts">{r.points}</span>
        </div>
      ))}
    </div>
  );
}

function OverlayView({ o }: { o: Overlay }) {
  switch (o.kind) {
    case 'none':
      return null;
    case 'waiting':
      return (
        <div class="kp-center">
          <div class="kp-card kp-waiting">
            <div class="kp-card-title">{STR.waitingTitle}</div>
            <div class="kp-card-sub">{STR.waitingHint}</div>
          </div>
        </div>
      );
    case 'intro':
      return (
        <div class="kp-center">
          {o.count === null ? (
            <div class="kp-intro" key={o.key}>
              <div class="kp-intro-title">{o.title}</div>
              <div class="kp-intro-sub">{o.sub}</div>
              {o.record && <div class="kp-record-chip">{o.record}</div>}
              <div class="kp-intro-hint">{o.hint}</div>
            </div>
          ) : (
            <div class={`kp-count ${o.count.length > 2 ? 'go' : ''}`} key={o.count}>
              {o.count}
            </div>
          )}
        </div>
      );
    case 'roundEnd':
      return (
        <div class="kp-center">
          <div class="kp-card" key={o.key}>
            <div class="kp-card-title">{o.title}</div>
            <div class="kp-card-sub">{o.sub}</div>
            <Rows rows={o.rows} />
            {o.next && <div class="kp-card-next">{o.next}</div>}
          </div>
        </div>
      );
    case 'finale':
      return (
        <div class="kp-center">
          <div class="kp-card finale" key={o.key}>
            <div class="kp-card-title">{o.title}</div>
            {o.record ? (
              <div class={`kp-record ${o.record.isNew ? 'is-new' : ''}`}>{o.record.text}</div>
            ) : (
              <div class="kp-card-sub">{o.sub}</div>
            )}
            <Rows rows={o.rows} />
          </div>
        </div>
      );
  }
}

/** The floating-word pool: rendered once, then animated imperatively (never re-rendered). */
const Pops = memo(function Pops({ hud }: { hud: Hud }) {
  const pops = [];
  for (let i = 0; i < POOL; i++) pops.push(<div key={i} class="kp-pop" ref={hud.poolRef} />);
  return <div class="kp-pops">{pops}</div>;
});

function HudView({ hud }: { hud: Hud }) {
  const m = hud.model.value;
  const line = hud.line.value;
  const showPlates = m.overlay.kind !== 'finale';
  return (
    <div class={`kp-hud ${hud.paused.value ? 'kp-paused' : ''}`}>
      <div class="kp-top">
        <div class="kp-brand">
          <span class="kp-logo">{STR.logo}</span>
          {m.chip && <span class="kp-chip">{m.chip}</span>}
        </div>
        <div class="kp-mc">
          {line && (
            <div class="kp-line" key={line.key}>
              <svg class="kp-toa" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path d="M3 9 H7 L16 4 V20 L7 15 H3 Z" fill="#FFC928" stroke="#111214" stroke-width="1.8" />
                <path d="M19 8 Q22 12 19 16" fill="none" stroke="#111214" stroke-width="1.8" />
              </svg>
              <span class="kp-who">{STR.announcer}</span>
              <span class="kp-say">
                <b>{line.bold}</b>
                {line.text}
              </span>
            </div>
          )}
        </div>
        <div class="kp-time-wrap">
          {m.secs !== null && (
            <div
              class={`kp-time ${m.urgent ? 'urgent' : ''}`}
              role="timer"
              aria-label={STR.timerAria(m.secs)}
            >
              {`0:${String(m.secs).padStart(2, '0')}`}
            </div>
          )}
        </div>
      </div>
      {showPlates && (
        <div class="kp-plates" style={{ top: `${m.plateY}px` }}>
          {m.plates.map((p) => (
            <Plate key={p.id} p={p} w={m.plateW} />
          ))}
        </div>
      )}
      <Pops hud={hud} />
      <OverlayView o={m.overlay} />
    </div>
  );
}
