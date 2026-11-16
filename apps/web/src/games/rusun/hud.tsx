/**
 * DOM HUD over the Phaser canvas (1280x720 stage units). Structure changes go through signals;
 * per-frame values (camera offset, countdown ring, card fades) are written straight to the DOM
 * so nothing re-renders at 60 fps.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import type { Face } from '../../shared/art/fruits';
import { Avatar } from '../../shared/ui';
import { type BalanceZone, FLOOR_H, GROUND_Y } from './logic';
import { STR } from './strings';

export interface PlayerCard {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

export interface HudPlayer extends PlayerCard {
  stat: string;
  score: number | null;
  active: boolean;
  dim: number;
  face: Face;
}

export type Banner =
  | { kind: 'intro'; key: number; title: string; sub: string; first: string | null }
  | {
      kind: 'roboh';
      key: number;
      collapser: PlayerCard;
      winner: PlayerCard | null;
      /** Text right after the collapser's name. */
      who: string;
      highlight: string;
      rest: string;
    }
  | { kind: 'topped'; key: number; title: string; sub: string; next: string | null }
  | {
      kind: 'finale';
      key: number;
      title: string;
      sub: string;
      winner: PlayerCard | null;
      /** Solo: how the tallest tower compares with the record. */
      record?: { text: string; isNew: boolean } | null;
    };

export interface HudModel {
  showTurn: boolean;
  floorNumber: number;
  turn: PlayerCard | null;
  recordHint: string;
  players: HudPlayer[];
  zone: BalanceZone;
  /** Tower balance ratio (0 = perfect, 1 = at the edge); the meter needle eases to it. */
  balance: number;
  /** Record height in floors; 0 hides the record label. */
  record: number;
  /** Solo: the ruler shows the player's own record, not "kalian". */
  recordSolo: boolean;
  banner: Banner | null;
}

export interface Popup {
  id: number;
  x: number;
  y: number;
  kind: 'pas' | 'land' | 'record';
  text: string;
  sub: string | null;
  tilt: number;
  until: number;
}

export interface Bubble {
  id: number;
  who: PlayerCard;
  text: string;
  tone: 'cheer' | 'boo' | 'rematch';
  x: number;
  until: number;
}

/** A big transient call-out (e.g. MELESET!) in the middle of the screen. */
export interface Shout {
  id: number;
  text: string;
  sub: string;
  until: number;
}

export interface FrameValues {
  camY: number;
  /** Countdown ring fill 0..1 and whole seconds left. */
  ring: number;
  secs: number;
  /** Game time, for expiring popups. */
  time: number;
  /** The hanging floor is behind the turn card / side panel. */
  fadeLeft: boolean;
  fadeRight: boolean;
}

const RING_R = 17;
const RING_LEN = 2 * Math.PI * RING_R;

const EMPTY: HudModel = {
  showTurn: false,
  floorNumber: 2,
  turn: null,
  recordHint: '',
  players: [],
  zone: 'green',
  balance: 0,
  record: 0,
  recordSolo: false,
  banner: null,
};

export class HudStore {
  readonly model = signal<HudModel>(EMPTY);
  readonly popups = signal<Popup[]>([]);
  readonly bubbles = signal<Bubble[]>([]);
  readonly paused = signal(false);
  readonly shout = signal<Shout | null>(null);

  world: HTMLDivElement | null = null;
  ringArc: SVGCircleElement | null = null;
  ringText: HTMLDivElement | null = null;
  ringBox: HTMLDivElement | null = null;
  turnCard: HTMLDivElement | null = null;
  sidePanel: HTMLDivElement | null = null;
  /** Stage px of world (0, 0) at camera height 0: the 1280x720 frame's offset on wider/taller stages. */
  private origin = { x: 0, y: 0 };

  private lastCam = Number.NaN;
  private lastRing = Number.NaN;
  private lastSecs = -1;
  /** null = unknown (element just (re)mounted): write the class on the next frame. */
  private lastUrgent: boolean | null = null;
  private lastFadeLeft: boolean | null = null;
  private lastFadeRight: boolean | null = null;

  addPopup(p: Popup): void {
    this.popups.value = [...this.popups.value.slice(-5), p];
  }

  addBubble(b: Bubble): void {
    this.bubbles.value = [...this.bubbles.value.slice(-9), b];
  }

  /**
   * Called once per rendered frame by the scene. Only touches the DOM when values change
   * (cached values start as NaN, so comparisons are written to treat NaN as "changed").
   */
  frame(f: FrameValues): void {
    const cam = Math.round(f.camY * 10) / 10;
    if (this.world && cam !== this.lastCam) {
      this.lastCam = cam;
      this.world.style.transform = `translate3d(${this.origin.x}px, ${this.origin.y - cam}px, 0)`;
      // The record tag follows the ruler, which stays at the stage's left edge.
      this.world.style.setProperty('--pad-x', `${this.origin.x}px`);
    }
    if (this.ringArc && !(Math.abs(f.ring - this.lastRing) <= 0.002)) {
      this.lastRing = f.ring;
      this.ringArc.setAttribute('stroke-dashoffset', (RING_LEN * (1 - f.ring)).toFixed(2));
    }
    if (this.ringText && f.secs !== this.lastSecs) {
      this.lastSecs = f.secs;
      this.ringText.textContent = String(f.secs);
    }
    const urgent = f.secs <= 3 && f.ring < 0.999;
    if (this.ringBox && urgent !== this.lastUrgent) {
      this.lastUrgent = urgent;
      this.ringBox.classList.toggle('is-urgent', urgent);
    }
    if (this.turnCard && f.fadeLeft !== this.lastFadeLeft) {
      this.lastFadeLeft = f.fadeLeft;
      this.turnCard.classList.toggle('is-faded', f.fadeLeft);
    }
    if (this.sidePanel && f.fadeRight !== this.lastFadeRight) {
      this.lastFadeRight = f.fadeRight;
      this.sidePanel.classList.toggle('is-faded', f.fadeRight);
    }
    const pops = this.popups.value;
    if (pops.length && pops[0]!.until <= f.time) this.popups.value = pops.filter((p) => p.until > f.time);
    const shout = this.shout.value;
    if (shout && shout.until <= f.time) this.shout.value = null;
    const bubs = this.bubbles.value;
    if (bubs.length && bubs[0]!.until <= f.time) this.bubbles.value = bubs.filter((b) => b.until > f.time);
  }

  /** Forget cached frame values so freshly mounted elements get written. */
  setOrigin(x: number, y: number): void {
    this.origin = { x, y };
    this.lastCam = Number.NaN;
  }

  invalidate(): void {
    this.lastCam = Number.NaN;
    this.lastRing = Number.NaN;
    this.lastSecs = -1;
    this.lastUrgent = null;
    this.lastFadeLeft = null;
    this.lastFadeRight = null;
  }
}

/* ------------------------------------------------------------------ components */

function TurnCard({ m, store }: { m: HudModel; store: HudStore }) {
  const t = m.turn;
  return (
    <div
      class="rs-card rs-turn"
      ref={(el) => {
        store.turnCard = el;
        store.invalidate();
      }}
    >
      <div class="rs-turn-head">
        <div class="display outline-text rs-logo">{STR.logo}</div>
        <div class="rs-chip">{STR.floorChip(m.floorNumber)}</div>
      </div>
      {t ? (
        <div class="rs-turn-who" key={t.id}>
          <Avatar fruit={t.fruit} ring={t.color} size={56} face="effort" />
          <div class="rs-turn-name">
            <div class="rs-eyebrow">{STR.turn}</div>
            <div class="rs-name">{t.name}</div>
          </div>
          <div
            class="rs-ring"
            ref={(el) => {
              store.ringBox = el;
              store.invalidate();
            }}
          >
            <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
              <circle cx="23" cy="23" r={RING_R} fill="none" stroke="#2A2B30" stroke-width="5" />
              <circle
                ref={(el) => {
                  store.ringArc = el;
                }}
                class="rs-ring-arc"
                cx="23"
                cy="23"
                r={RING_R}
                fill="none"
                stroke-width="5"
                stroke-linecap="round"
                stroke-dasharray={RING_LEN.toFixed(2)}
                stroke-dashoffset="0"
                transform="rotate(-90 23 23)"
              />
            </svg>
            <div
              class="rs-ring-num"
              ref={(el) => {
                store.ringText = el;
              }}
            />
          </div>
        </div>
      ) : (
        <div class="rs-turn-who">
          <div class="rs-turn-name">
            <div class="rs-eyebrow">{STR.turn}</div>
            <div class="rs-name rs-wait">{STR.waitingTitle}</div>
          </div>
        </div>
      )}
      <div class="rs-turn-hint">
        {t ? (
          <>
            {STR.turnHintLead}
            <b>{STR.turnHintButton}</b>
            {STR.turnHintTail} {m.recordHint}
          </>
        ) : (
          STR.waitingHint
        )}
      </div>
    </div>
  );
}

/**
 * Static balance meter: green < 0.5, yellow < 0.8, red from 0.8 (arc split at 90 and 144 deg).
 * The needle only moves when the model changes (a floor lands), eased by a CSS transition.
 */
function BalanceMeter({ zone, balance }: { zone: BalanceZone; balance: number }) {
  const deg = 180 * Math.max(0, Math.min(1, balance));
  return (
    <div class="rs-gauge">
      <svg width="120" height="68" viewBox="0 0 120 68" role="img" aria-label={STR.gaugeAria(zone)}>
        <path d="M12 60 A48 48 0 0 1 60 12" fill="none" stroke="#22B35E" stroke-width="10" />
        <path d="M60 12 A48 48 0 0 1 98.83 31.79" fill="none" stroke="#FFC928" stroke-width="10" />
        <path d="M98.83 31.79 A48 48 0 0 1 108 60" fill="none" stroke="#F2453D" stroke-width="10" />
        <line
          class="rs-needle"
          style={{ transform: `rotate(${deg.toFixed(1)}deg)` }}
          x1="60"
          y1="60"
          x2="20"
          y2="60"
          stroke="#FFFFFF"
          stroke-width="4"
          stroke-linecap="round"
        />
        <circle cx="60" cy="60" r="6" fill="#FFFFFF" />
      </svg>
      <div class={`rs-eyebrow rs-gauge-label is-${zone}`}>{STR.gauge}</div>
    </div>
  );
}

function SidePanel({ m, store }: { m: HudModel; store: HudStore }) {
  const compact = m.players.length > 5;
  return (
    <div
      class={`rs-card rs-side${compact ? ' is-compact' : ''}`}
      ref={(el) => {
        store.sidePanel = el;
        store.invalidate();
      }}
    >
      <BalanceMeter zone={m.zone} balance={m.balance} />
      <div class="rs-sep" />
      <div class="rs-players">
        {m.players.map((p) => (
          <div key={p.id} class={`rs-player${p.active ? ' is-active' : ''}`} style={{ opacity: p.dim }}>
            <Avatar fruit={p.fruit} ring={p.color} size={compact ? 32 : 40} face={p.face} />
            <div class="rs-player-text">
              <div class="rs-player-name">{p.name}</div>
              <div class="rs-player-stat">{p.stat}</div>
            </div>
            {p.score !== null && <div class="rs-player-score">{p.score}</div>}
          </div>
        ))}
      </div>
      <div class="rs-balance-text">{STR.balance[m.zone]}</div>
    </div>
  );
}

function BannerView({ b }: { b: Banner }) {
  if (b.kind === 'intro') {
    return (
      <div class="rs-banner rs-intro" key={b.key}>
        <div class="display outline-text rs-intro-title">{b.title}</div>
        <div class="rs-intro-sub">{b.sub}</div>
        {b.first && <div class="rs-intro-first">{b.first}</div>}
      </div>
    );
  }
  if (b.kind === 'roboh') {
    return (
      <div class="rs-banner rs-roboh" key={b.key}>
        <div class="rs-shake">
          <div class="display outline-text rs-roboh-title">{STR.roboh}</div>
        </div>
        <div class="rs-roboh-pill">
          <Avatar fruit={b.collapser.fruit} ring={b.collapser.color} size={40} face="sad" />
          <div class="rs-roboh-text">
            <b>{b.collapser.name}</b>
            {b.who}
            <br />
            {b.highlight && <span class="rs-hl">{b.highlight}</span>}
            {b.rest}
          </div>
          {b.winner && <Avatar fruit={b.winner.fruit} ring={b.winner.color} size={40} face="happy" />}
        </div>
      </div>
    );
  }
  if (b.kind === 'topped') {
    return (
      <div class="rs-banner rs-topped" key={b.key}>
        <div class="display outline-text rs-topped-title">{b.title}</div>
        <div class="rs-finale-sub">
          {b.sub}
          {b.next && (
            <>
              <br />
              <span class="rs-hl">{b.next}</span>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div class="rs-banner rs-finale" key={b.key}>
      {b.winner && (
        <Avatar fruit={b.winner.fruit} ring={b.winner.color} size={112} face="wow" class="rs-finale-avatar" />
      )}
      <div class="display outline-text rs-finale-title">{b.title}</div>
      {b.record && <div class={`rs-record-pill${b.record.isNew ? ' is-new' : ''}`}>{b.record.text}</div>}
      <div class="rs-finale-sub">{b.sub}</div>
    </div>
  );
}

function PopupView({ p }: { p: Popup }) {
  return (
    <div
      class={`rs-popup is-${p.kind}`}
      style={{ left: p.x, top: p.y, ['--tilt' as string]: `${p.tilt}deg` }}
    >
      <div class="display outline-text rs-popup-text">{p.text}</div>
      {p.sub && <div class="rs-popup-sub">{p.sub}</div>}
    </div>
  );
}

function BubbleView({ b }: { b: Bubble }) {
  return (
    <div class={`rs-bubble is-${b.tone}`} style={{ left: b.x }}>
      <Avatar fruit={b.who.fruit} ring={b.who.color} size={34} face={b.tone === 'boo' ? 'sad' : 'happy'} />
      <div class="rs-bubble-text">
        <span class="rs-bubble-name">{b.who.name}</span>
        <span class="rs-bubble-say">{b.text}</span>
      </div>
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const m = store.model.value;
  const recordTop = GROUND_Y - m.record * FLOOR_H - 16;
  return (
    <div class={`rs-hud${store.paused.value ? ' is-paused' : ''}`}>
      <div
        class="rs-world"
        ref={(el) => {
          store.world = el;
          store.invalidate();
        }}
      >
        {m.record > 0 && (
          <div class="rs-record" style={{ top: recordTop }}>
            {m.recordSolo ? STR.recordSolo(m.record) : STR.record(m.record)}
          </div>
        )}
        {store.popups.value.map((p) => (
          <PopupView key={p.id} p={p} />
        ))}
      </div>
      {m.showTurn && <TurnCard m={m} store={store} />}
      <SidePanel m={m} store={store} />
      {m.banner && <BannerView b={m.banner} />}
      {store.shout.value && (
        <div class="rs-shout" key={store.shout.value.id}>
          <div class="display outline-text rs-shout-text">{store.shout.value.text}</div>
          <div class="rs-shout-sub">{store.shout.value.sub}</div>
        </div>
      )}
      <div class="rs-bubbles">
        {store.bubbles.value.map((b) => (
          <BubbleView key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}
