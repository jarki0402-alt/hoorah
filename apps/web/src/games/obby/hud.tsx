/**
 * Obby DOM HUD over the WebGL canvas (stage px): track chip, clock, live standings, the progress
 * bar with save pads and runner dots, off-screen warnings, call-outs, the intro card and the
 * podium between tracks. Structure changes go through signals a few times a second; name tags are
 * moved by the box-world renderer every frame.
 */
import type { Fruit } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { Avatar } from '../../shared/ui';
import { STR } from './strings';

export interface RunnerChip {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

export interface StandRow extends RunnerChip {
  place: number;
  finished: boolean;
  offline: boolean;
  /** 0..1 along the course. */
  progress: number;
}

export interface OffChip extends RunnerChip {
  /** 0..1 of the 2 s allowance used. */
  k: number;
  left: number;
}

export interface Float {
  key: number;
  text: string;
  x: number;
  y: number;
  tone: 'good' | 'bad' | 'info';
}

export interface Toast {
  key: number;
  text: string;
  fruit?: Fruit;
  color?: string;
}

export interface IntroCard {
  name: string;
  of: string;
  level: string;
  segments: string[];
}

export interface PodiumRow extends RunnerChip {
  place: number;
  value: string;
  points: string;
  total: string;
  note?: string;
}

export interface PodiumCard {
  title: string;
  sub: string;
  rows: PodiumRow[];
}

export class HudStore {
  readonly brand = signal('');
  readonly clock = signal('');
  readonly urgent = signal(false);
  readonly standings = signal<StandRow[]>([]);
  readonly saves = signal<number[]>([]);
  readonly off = signal<OffChip[]>([]);
  readonly big = signal<{ key: number; text: string; tone: 'count' | 'go' | 'end' } | null>(null);
  readonly floats = signal<Float[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly intro = signal<IntroCard | null>(null);
  readonly podium = signal<PodiumCard | null>(null);
  readonly help = signal(false);
  readonly racing = signal(false);
  readonly paused = signal(false);
  private key = 0;

  shout(text: string, tone: 'count' | 'go' | 'end'): void {
    this.big.value = { key: ++this.key, text, tone };
  }

  float(text: string, x: number, y: number, tone: Float['tone']): void {
    const f: Float = { key: ++this.key, text, x, y, tone };
    this.floats.value = [...this.floats.value.slice(-7), f];
    window.setTimeout(() => {
      this.floats.value = this.floats.value.filter((o) => o.key !== f.key);
    }, 1300);
  }

  toast(text: string, who?: RunnerChip): void {
    const t: Toast = { key: ++this.key, text, ...(who ? { fruit: who.fruit, color: who.color } : {}) };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((o) => o.key !== t.key);
    }, 2600);
  }
}

function Standings({ rows }: { rows: StandRow[] }) {
  return (
    <div class="ob-stand">
      {rows.map((r) => (
        <div key={r.id} class={`ob-row ${r.finished ? 'is-done' : ''} ${r.offline ? 'is-off' : ''}`}>
          <span class="ob-place">{r.place}</span>
          <Avatar fruit={r.fruit} ring={r.color} size={30} dim={r.offline} />
          <span class="ob-name">{r.name}</span>
          {r.finished && <span class="ob-pill">{STR.finished}</span>}
        </div>
      ))}
    </div>
  );
}

function Progress({ rows, saves }: { rows: StandRow[]; saves: number[] }) {
  return (
    <div class="ob-progress">
      <div class="ob-track">
        {saves.map((s) => (
          <span key={s} class="ob-save" style={{ left: `${(s * 100).toFixed(2)}%` }} />
        ))}
        <span class="ob-flag" />
        {[...rows].reverse().map((r) => (
          <span
            key={r.id}
            class="ob-dot"
            style={{ left: `${(r.progress * 100).toFixed(2)}%`, borderColor: r.color }}
          >
            <Avatar fruit={r.fruit} ring={r.color} size={26} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const big = store.big.value;
  const intro = store.intro.value;
  const podium = store.podium.value;
  const racing = store.racing.value;
  return (
    <div class={`ob-hud ${store.paused.value ? 'is-paused' : ''}`}>
      <div class="ob-brand">{store.brand.value}</div>
      {racing && (
        <div class={`ob-clock ${store.urgent.value ? 'is-urgent' : ''}`}>
          <span class="ob-clock-label">{STR.timeLabel}</span>
          <span class="ob-clock-value">{store.clock.value}</span>
        </div>
      )}
      {!podium && <Standings rows={store.standings.value} />}
      {racing && <Progress rows={store.standings.value} saves={store.saves.value} />}
      <div class="ob-offs">
        {store.off.value.map((o) => (
          <div
            key={o.id}
            class="ob-off"
            style={{ ['--k' as string]: o.k.toFixed(3), ['--c' as string]: o.color }}
          >
            <Avatar fruit={o.fruit} ring={o.color} size={34} />
            <span class="ob-off-text">
              <b>{o.name}</b>
              <span>{STR.offIn(o.left)}</span>
            </span>
          </div>
        ))}
      </div>
      {store.floats.value.map((f) => (
        <div
          key={f.key}
          class={`ob-float tone-${f.tone}`}
          style={{ left: `${f.x.toFixed(0)}px`, top: `${f.y.toFixed(0)}px` }}
        >
          {f.text}
        </div>
      ))}
      <div class="ob-toasts">
        {store.toasts.value.map((t) => (
          <div key={t.key} class="ob-toast">
            {t.fruit && t.color && <Avatar fruit={t.fruit} ring={t.color} size={28} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {big && (
        <div key={big.key} class={`ob-big tone-${big.tone}`}>
          {big.text}
        </div>
      )}
      {intro && (
        <div class="ob-intro">
          <div class="ob-intro-of">{intro.of}</div>
          <div class="ob-intro-name display">{intro.name}</div>
          <div class="ob-intro-level">{intro.level}</div>
          <div class="ob-intro-goal">{STR.introGoal}</div>
          <div class="ob-intro-ahead">{STR.introAhead}</div>
          <div class="ob-intro-segs">
            {intro.segments.map((s, i) => (
              <span key={`${s}-${i}`} class="ob-seg">
                {s}
              </span>
            ))}
          </div>
          <div class="ob-intro-how">
            <div>
              <b>{STR.howStick}</b>
              <span>{STR.howStickSub}</span>
            </div>
            <div>
              <b>{STR.howJump}</b>
              <span>{STR.howJumpSub}</span>
            </div>
            <div>
              <b>{STR.howSave}</b>
              <span>{STR.howSaveSub}</span>
            </div>
          </div>
        </div>
      )}
      {podium && (
        <div class="ob-podium">
          <div class="ob-podium-title display">{podium.title}</div>
          <div class="ob-podium-rows">
            {podium.rows.map((r) => (
              <div key={r.id} class={`ob-prow place-${Math.min(4, r.place)}`}>
                <span class="ob-prow-place">{r.place}</span>
                <Avatar fruit={r.fruit} ring={r.color} size={40} />
                <span class="ob-prow-name">
                  {r.name}
                  {r.note && <em>{r.note}</em>}
                </span>
                <span class="ob-prow-value">{r.value}</span>
                <span class="ob-prow-points">{r.points}</span>
                <span class="ob-prow-total">{r.total}</span>
              </div>
            ))}
          </div>
          <div class="ob-podium-sub">{podium.sub}</div>
        </div>
      )}
      {store.help.value && <div class="ob-help">{STR.help}</div>}
    </div>
  );
}
