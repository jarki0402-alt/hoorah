/**
 * DOM HUD over the WebGL canvas (stage px). Left column: the putaran count and the players with
 * cash and net worth. Right column: whose turn it is with the decision countdown, then the card of
 * the tile in focus (price, rent per building level, upgrade and takeover price, owner). Kabar
 * cards are revealed over the board; toasts and the intro, last-putaran and finale banners float
 * on top. Structure changes go through one signal; the countdown ring is written straight to the
 * DOM every frame so nothing re-renders at 60 fps.
 */
import type { Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { Avatar, Icon } from '../../shared/ui';
import { rp, STR } from './strings';

export interface HudPlayer {
  id: number;
  name: string;
  look: Look;
  color: string;
  cash: number;
  worth: number;
  cities: number;
  rank: number;
  active: boolean;
  jailed: boolean;
  bankrupt: boolean;
  connected: boolean;
  /** Recent cash changes, newest last; `key` restarts the float animation. */
  deltas: { key: number; amount: number }[];
}

export interface RentRow {
  label: string;
  value: number;
  current: boolean;
}

export interface CardLine {
  label: string;
  value: string;
  /** Highlighted (the takeover price, or a Hotel's immunity). */
  strong?: boolean;
}

export interface TileCardModel {
  tile: number;
  eyebrow: string;
  name: string;
  /** Header colour (island band, or the special tile's colour). */
  color: string;
  price: number | null;
  rows: RentRow[];
  /** The owner holds the whole island: the rents shown are doubled. */
  double: boolean;
  /** Upgrade cost, takeover price or the Hotel's immunity. */
  lines: CardLine[];
  owner: { name: string; look: Look; color: string } | null;
  note: string | null;
  forSale: boolean;
  /** Building level for the badge (cities only). */
  level: number;
}

export interface CardModel {
  key: number;
  title: string;
  body: string;
  tone: 'good' | 'bad' | 'move';
}

export interface Banner {
  kind: 'intro' | 'last' | 'finale';
  key: number;
  title: string;
  sub: string;
  line: string | null;
  winner: { name: string; look: Look; color: string } | null;
}

export interface Toast {
  key: number;
  text: string;
  amount: string | null;
  tone: 'good' | 'bad' | 'neutral' | 'gold';
}

export interface HudModel {
  players: HudPlayer[];
  turn: {
    id: number;
    name: string;
    look: Look;
    color: string;
    hint: string;
    bonus: boolean;
  } | null;
  dice: [number, number] | null;
  rolling: boolean;
  tile: TileCardModel | null;
  card: CardModel | null;
  banner: Banner | null;
  toast: Toast | null;
  /** Running putaran (0 during the intro) of `of`. */
  round: { n: number; of: number };
  lastRound: boolean;
}

export interface FrameValues {
  /** Decision countdown: fraction left (1 = full) and whole seconds; null hides it. */
  decision: { frac: number; secs: number } | null;
}

const RING_R = 19;
const RING_LEN = 2 * Math.PI * RING_R;

export class HudStore {
  readonly model = signal<HudModel | null>(null);
  readonly paused = signal(false);
  ringEl: SVGCircleElement | null = null;
  ringText: HTMLSpanElement | null = null;
  ringWrap: HTMLDivElement | null = null;
  private lastSecs = -1;

  frame(v: FrameValues): void {
    if (this.ringWrap) this.ringWrap.style.opacity = v.decision ? '1' : '0';
    if (v.decision && this.ringEl) {
      this.ringEl.style.strokeDashoffset = String(RING_LEN * (1 - v.decision.frac));
      if (this.ringText && v.decision.secs !== this.lastSecs) {
        this.lastSecs = v.decision.secs;
        this.ringText.textContent = String(v.decision.secs);
      }
    }
  }
}

/* ------------------------------------------------------------------ pieces */

function PlayerCard({ p }: { p: HudPlayer }) {
  const cls = ['jg-player', p.active && 'is-active', p.bankrupt && 'is-out', !p.connected && 'is-away']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls} style={{ ['--pc' as string]: p.color }}>
      <div class="jg-player-rank">{p.bankrupt ? '' : p.rank}</div>
      <Avatar look={p.look} ring={p.color} size={44} face={p.bankrupt ? 'sad' : 'happy'} dim={p.bankrupt} />
      <div class="jg-player-text">
        <div class="jg-player-name">
          <span class="jg-pname">{p.name}</span>
          {p.jailed && <em class="jg-badge is-jail">{STR.jailedBadge}</em>}
          {p.bankrupt && <em class="jg-badge is-out">{STR.bankruptBadge}</em>}
        </div>
        <div class="jg-player-cash">{p.bankrupt ? rp(0) : rp(p.cash)}</div>
        <div class="jg-player-sub">
          {STR.worth} {rp(p.worth)} · {p.cities} {STR.cities.toLowerCase()}
        </div>
      </div>
      <div class="jg-deltas">
        {p.deltas.map((d) => (
          <div key={d.key} class={`jg-delta ${d.amount >= 0 ? 'is-plus' : 'is-minus'}`}>
            {`${d.amount >= 0 ? '+' : '−'}${rp(Math.abs(d.amount))}`}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pip({ n }: { n: number }) {
  const spots: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [
      [28, 28],
      [72, 72],
    ],
    3: [
      [26, 26],
      [50, 50],
      [74, 74],
    ],
    4: [
      [28, 28],
      [72, 28],
      [28, 72],
      [72, 72],
    ],
    5: [
      [27, 27],
      [73, 27],
      [50, 50],
      [27, 73],
      [73, 73],
    ],
    6: [
      [29, 25],
      [71, 25],
      [29, 50],
      [71, 50],
      [29, 75],
      [71, 75],
    ],
  };
  const red = n === 1 || n === 4;
  return (
    <svg class="jg-die" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#FFF8EC" stroke="#1E1F24" stroke-width="6" />
      {(spots[n] ?? []).map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={n === 1 ? 14 : 9} fill={red ? '#D8322A' : '#1E1F24'} />
      ))}
    </svg>
  );
}

function TurnPanel({ store, m }: { store: HudStore; m: HudModel }) {
  const t = m.turn;
  return (
    <div class="jg-turn" style={{ ['--pc' as string]: t?.color ?? '#FFC928' }}>
      {t ? (
        <>
          <div class="jg-turn-head">
            <Avatar look={t.look} ring={t.color} size={48} />
            <div class="jg-turn-text">
              <div class="jg-eyebrow">{t.bonus ? `${STR.doubles} ${STR.doublesSub}` : STR.turnEyebrow}</div>
              <div class="jg-turn-name">{t.name}</div>
            </div>
            <div
              class="jg-ring"
              ref={(el) => {
                store.ringWrap = el;
              }}
            >
              <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
                <circle
                  cx="24"
                  cy="24"
                  r={RING_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.14)"
                  stroke-width="5"
                />
                <circle
                  ref={(el) => {
                    store.ringEl = el;
                  }}
                  cx="24"
                  cy="24"
                  r={RING_R}
                  fill="none"
                  stroke="var(--pc)"
                  stroke-width="5"
                  stroke-linecap="round"
                  stroke-dasharray={String(RING_LEN)}
                  transform="rotate(-90 24 24)"
                />
              </svg>
              <span
                class="jg-ring-num"
                ref={(el) => {
                  store.ringText = el;
                }}
              />
            </div>
          </div>
          <div class="jg-turn-foot">
            <div class="jg-hint" key={t.hint}>
              {t.hint}
            </div>
            {m.dice && (
              <div
                class={`jg-dice ${m.rolling ? 'is-rolling' : ''}`}
                key={`${m.dice[0]}${m.dice[1]}${m.rolling}`}
              >
                <Pip n={m.dice[0]} />
                <Pip n={m.dice[1]} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div class="jg-turn-empty">{STR.title}</div>
      )}
    </div>
  );
}

function TileCard({ c }: { c: TileCardModel }) {
  return (
    <div
      class={`jg-tile ${c.forSale ? 'is-sale' : ''}`}
      key={c.tile}
      style={{ ['--band' as string]: c.color }}
    >
      <div class="jg-tile-band">
        <div class="jg-tile-eyebrow">{c.eyebrow}</div>
        <div class="jg-tile-name">{c.name}</div>
        {c.level > 0 && <div class="jg-tile-level">{STR.cardLevel(c.level)}</div>}
      </div>
      <div class="jg-tile-body">
        {c.price !== null && (
          <div class="jg-tile-price">
            <span>{STR.cardPrice}</span>
            <b>{rp(c.price)}</b>
            {c.forSale && <em>{STR.cardForSale}</em>}
          </div>
        )}
        {c.rows.length > 0 && (
          <div class="jg-rents">
            {c.double && <div class="jg-double">{STR.cardDouble}</div>}
            {c.rows.map((r) => (
              <div class={`jg-rent ${r.current ? 'is-current' : ''}`} key={r.label}>
                <span>{r.label}</span>
                <b>{rp(r.value)}</b>
              </div>
            ))}
          </div>
        )}
        {c.lines.map((l) => (
          <div class={`jg-tile-line ${l.strong ? 'is-strong' : ''}`} key={l.label}>
            <span>{l.label}</span>
            <b>{l.value}</b>
          </div>
        ))}
        {c.note && <div class="jg-tile-note">{c.note}</div>}
        {c.price !== null && (
          <div class="jg-owner">
            <span>{STR.cardOwner}</span>
            {c.owner ? (
              <div class="jg-owner-who">
                <Avatar look={c.owner.look} ring={c.owner.color} size={26} />
                <b>{c.owner.name}</b>
              </div>
            ) : (
              <b class="jg-owner-none">{STR.cardNoOwner}</b>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CardReveal({ c }: { c: CardModel }) {
  return (
    <div class="jg-card-stage" key={c.key}>
      <div class={`jg-card is-${c.tone}`}>
        <div class="jg-card-eyebrow">{STR.hintCard.toUpperCase()}</div>
        <div class="jg-card-title">{c.title}</div>
        <div class="jg-card-body">{c.body}</div>
      </div>
    </div>
  );
}

function BannerView({ b }: { b: Banner }) {
  return (
    <div class={`jg-banner is-${b.kind}`} key={b.key}>
      <div class="jg-banner-card">
        {b.winner && (
          <div class="jg-banner-avatar">
            <Avatar look={b.winner.look} ring={b.winner.color} size={120} face="wow" />
            <Icon name="crown" size={44} color="#FFC928" />
          </div>
        )}
        <div class="jg-banner-title">{b.title}</div>
        <div class="jg-banner-sub">{b.sub}</div>
        {b.line && <div class="jg-banner-line">{b.line}</div>}
      </div>
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const m = store.model.value;
  const paused = store.paused.value;
  if (!m) return null;
  return (
    <div class={`jg-hud ${paused ? 'is-paused' : ''}`}>
      <div class="jg-left">
        <div class="jg-brand">
          <div class="jg-brand-name">{STR.title}</div>
          <div class={`jg-timer ${m.lastRound ? 'is-late' : ''}`}>
            <Icon name="restart" size={18} />
            <small>{STR.roundLabel}</small>
            <span class="jg-time" key={m.round.n}>
              {STR.roundOf(Math.max(1, m.round.n), m.round.of)}
            </span>
          </div>
        </div>
        <div class="jg-players">
          {m.players.map((p) => (
            <PlayerCard p={p} key={p.id} />
          ))}
        </div>
      </div>
      <div class="jg-right">
        <TurnPanel store={store} m={m} />
        {m.tile && <TileCard c={m.tile} />}
      </div>
      {m.toast && (
        <div class={`jg-toast is-${m.toast.tone}`} key={m.toast.key}>
          <span>{m.toast.text}</span>
          {m.toast.amount && <b class="jg-toast-amt">{m.toast.amount}</b>}
        </div>
      )}
      {m.card && <CardReveal c={m.card} />}
      {m.banner && <BannerView b={m.banner} />}
    </div>
  );
}
