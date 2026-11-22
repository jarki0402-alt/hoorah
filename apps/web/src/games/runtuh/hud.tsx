/**
 * Lantai Runtuh DOM HUD over the WebGL canvas (stage px): round and survivor chips, the rule card
 * with the big instruction and countdown, the live scoreboard, call-outs (falls, shoves, near
 * misses), the round intro card, the round summary and the final per-round score table.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { Avatar } from '../../shared/ui';
import { STR } from './strings';

export interface Chip {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

export interface ScoreRow extends Chip {
  score: number;
  out: boolean;
  offline: boolean;
}

export interface RuleCard {
  title: string;
  head: string;
  target: string;
  /** Colour of the target (warna) or null. */
  tint: string | null;
  seconds: number | null;
  double: boolean;
}

export interface IntroCard {
  of: string;
  name: string;
  desc: string;
  double: boolean;
}

export interface EndRow extends Chip {
  points: number;
  survived: boolean;
}

export interface FinalRow extends Chip {
  rounds: number[];
  total: number;
  rank: number;
}

export interface Float {
  key: number;
  text: string;
  x: number;
  y: number;
}

export interface Toast {
  key: number;
  text: string;
  fruit?: Fruit;
  color?: string;
  tone: 'bad' | 'good' | 'info';
}

export class HudStore {
  readonly round = signal('');
  readonly alive = signal('');
  readonly rule = signal<RuleCard | null>(null);
  readonly scores = signal<ScoreRow[]>([]);
  readonly intro = signal<IntroCard | null>(null);
  readonly end = signal<{ title: string; sub: string; rows: EndRow[] } | null>(null);
  readonly final = signal<{ rows: FinalRow[]; cols: number } | null>(null);
  readonly big = signal<{ key: number; text: string } | null>(null);
  readonly floats = signal<Float[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly banner = signal<{ key: number; text: string } | null>(null);
  readonly help = signal(false);
  readonly paused = signal(false);
  private key = 0;

  shout(text: string): void {
    this.big.value = { key: ++this.key, text };
  }

  float(text: string, x: number, y: number): void {
    const f: Float = { key: ++this.key, text, x, y };
    this.floats.value = [...this.floats.value.slice(-6), f];
    window.setTimeout(() => {
      this.floats.value = this.floats.value.filter((o) => o.key !== f.key);
    }, 1200);
  }

  toast(text: string, tone: Toast['tone'], who?: Chip): void {
    const t: Toast = { key: ++this.key, text, tone, ...(who ? { fruit: who.fruit, color: who.color } : {}) };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((o) => o.key !== t.key);
    }, 2800);
  }

  /** A line across the middle (near misses). */
  flashBanner(text: string): void {
    const b = { key: ++this.key, text };
    this.banner.value = b;
    window.setTimeout(() => {
      if (this.banner.value?.key === b.key) this.banner.value = null;
    }, 2600);
  }
}

export function Hud({ store }: { store: HudStore }) {
  const rule = store.rule.value;
  const intro = store.intro.value;
  const end = store.end.value;
  const fin = store.final.value;
  const big = store.big.value;
  const banner = store.banner.value;
  return (
    <div class={`lr2-hud ${store.paused.value ? 'is-paused' : ''}`}>
      {!fin && (
        <div class="lr2-chips">
          <span class="lr2-chip is-round">{store.round.value}</span>
          <span class="lr2-chip">{store.alive.value}</span>
        </div>
      )}
      {rule && !intro && !end && !fin && (
        <div class={`lr2-rule ${rule.double ? 'is-double' : ''}`}>
          <div class="lr2-rule-title">
            {rule.title}
            {rule.double && <span class="lr2-x2">{STR.double}</span>}
          </div>
          {rule.head && <div class="lr2-rule-head">{rule.head}</div>}
          <div class="lr2-rule-row">
            <span
              class={`lr2-target display ${rule.tint ? 'is-tinted' : ''} ${rule.target.length > 12 ? 'is-long' : ''}`}
              style={rule.tint ? { background: rule.tint } : undefined}
            >
              {rule.target}
            </span>
            {rule.seconds !== null && <span class="lr2-count display">{rule.seconds}</span>}
          </div>
        </div>
      )}
      {!fin && (
        <div class="lr2-board">
          <div class="lr2-board-title">{STR.statScore}</div>
          {store.scores.value.map((r) => (
            <div key={r.id} class={`lr2-score ${r.out ? 'is-out' : ''} ${r.offline ? 'is-off' : ''}`}>
              <Avatar fruit={r.fruit} ring={r.color} size={28} dim={r.out} face={r.out ? 'sad' : 'happy'} />
              <span class="lr2-score-name">{r.name}</span>
              <span class="lr2-score-value">{r.score}</span>
            </div>
          ))}
        </div>
      )}
      {store.floats.value.map((f) => (
        <div
          key={f.key}
          class="lr2-float"
          style={{ left: `${f.x.toFixed(0)}px`, top: `${f.y.toFixed(0)}px` }}
        >
          {f.text}
        </div>
      ))}
      <div class="lr2-toasts">
        {store.toasts.value.map((t) => (
          <div key={t.key} class={`lr2-toast tone-${t.tone}`}>
            {t.fruit && t.color && <Avatar fruit={t.fruit} ring={t.color} size={28} face="sad" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.key} class="lr2-banner">
          {banner.text}
        </div>
      )}
      {big && (
        <div key={big.key} class="lr2-big">
          {big.text}
        </div>
      )}
      {intro && (
        <div class={`lr2-card ${intro.double ? 'is-double' : ''}`}>
          <div class="lr2-card-of">{intro.of}</div>
          <div class="lr2-card-name display">{intro.name}</div>
          {intro.double && <div class="lr2-card-x2">{STR.double}</div>}
          <div class="lr2-card-desc">{intro.desc}</div>
        </div>
      )}
      {end && (
        <div class="lr2-card">
          <div class="lr2-card-name display">{end.title}</div>
          <div class="lr2-card-desc">{end.sub}</div>
          <div class="lr2-end-rows">
            {end.rows.map((r) => (
              <div key={r.id} class={`lr2-end ${r.survived ? 'is-safe' : ''}`}>
                <Avatar fruit={r.fruit} ring={r.color} size={44} face={r.survived ? 'happy' : 'sad'} />
                <span class="lr2-end-name">{r.name}</span>
                <span class="lr2-end-pts">{STR.pointsPlus(r.points)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {fin && (
        <div class="lr2-final">
          <div class="lr2-final-title display">{STR.finalTitle}</div>
          <div class="lr2-final-sub">{STR.finalSub}</div>
          <table class="lr2-table">
            <thead>
              <tr>
                <th />
                <th />
                {Array.from({ length: fin.cols }, (_, i) => (
                  <th key={i}>{STR.roundCol(i)}</th>
                ))}
                <th>{STR.totalCol}</th>
              </tr>
            </thead>
            <tbody>
              {fin.rows.map((r) => (
                <tr key={r.id} class={r.rank === 1 ? 'is-top' : ''}>
                  <td class="lr2-t-rank">{r.rank}</td>
                  <td class="lr2-t-name">
                    <Avatar fruit={r.fruit} ring={r.color} size={30} />
                    <span>{r.name}</span>
                  </td>
                  {Array.from({ length: fin.cols }, (_, i) => (
                    <td key={i}>{r.rounds[i] ?? 0}</td>
                  ))}
                  <td class="lr2-t-total">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {store.help.value && <div class="lr2-help">{STR.help}</div>}
    </div>
  );
}
