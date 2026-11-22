/**
 * Seluncur Es DOM HUD over the WebGL canvas (stage px): round and shot chips, the big aim
 * countdown, skaters on the ice and locks, a row of player chips with their status and points,
 * call-outs (DUK!, BYUR!, NYARIS!, ES RETAK!), the round intro, the round summary and the final
 * per-round table.
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

export type ChipStatus = 'locked' | 'aiming' | 'out' | 'wait' | 'safe';

export interface PlayerChip extends Chip {
  status: ChipStatus;
  score: number;
  offline: boolean;
}

export interface Center {
  mode: 'aim' | 'slide';
  seconds: number;
}

export interface IntroCard {
  of: string;
  name: string;
  desc: string;
  double: boolean;
}

export interface EndRow extends Chip {
  points: number;
  winner: boolean;
}

export interface FinalRow extends Chip {
  rounds: number[];
  total: number;
  rank: number;
}

interface Float {
  key: number;
  text: string;
  x: number;
  y: number;
  tone: 'hit' | 'splash';
}

interface Toast {
  key: number;
  text: string;
  who?: Chip;
}

const STATUS_TEXT: Record<ChipStatus, string> = {
  locked: STR.statusLocked,
  aiming: STR.statusAiming,
  out: STR.statusOut,
  wait: STR.statusWait,
  safe: STR.statusSafe,
};

export class HudStore {
  readonly round = signal('');
  readonly shot = signal('');
  readonly double = signal(false);
  readonly center = signal<Center | null>(null);
  readonly onIce = signal('');
  readonly locks = signal('');
  readonly chips = signal<PlayerChip[]>([]);
  readonly intro = signal<IntroCard | null>(null);
  readonly end = signal<{ title: string; rows: EndRow[] } | null>(null);
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

  float(text: string, x: number, y: number, tone: Float['tone']): void {
    const f: Float = { key: ++this.key, text, x, y, tone };
    this.floats.value = [...this.floats.value.slice(-7), f];
    window.setTimeout(() => {
      this.floats.value = this.floats.value.filter((o) => o.key !== f.key);
    }, 1100);
  }

  toast(text: string, who?: Chip): void {
    const t: Toast = who ? { key: ++this.key, text, who } : { key: ++this.key, text };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((o) => o.key !== t.key);
    }, 2800);
  }

  flashBanner(text: string): void {
    const b = { key: ++this.key, text };
    this.banner.value = b;
    window.setTimeout(() => {
      if (this.banner.value?.key === b.key) this.banner.value = null;
    }, 2400);
  }
}

export function Hud({ store }: { store: HudStore }) {
  const center = store.center.value;
  const intro = store.intro.value;
  const end = store.end.value;
  const fin = store.final.value;
  const big = store.big.value;
  const banner = store.banner.value;
  const playing = !intro && !end && !fin;
  return (
    <div class={`es-hud ${store.paused.value ? 'is-paused' : ''}`}>
      {!fin && (
        <div class="es-chips-top">
          <span class="es-pill is-round">
            {store.round.value}
            {store.double.value && <span class="es-x2">{STR.double}</span>}
          </span>
          {store.shot.value && <span class="es-pill">{store.shot.value}</span>}
        </div>
      )}
      {!fin && store.onIce.value && (
        <div class="es-side">
          <span class="es-side-big display">{store.onIce.value}</span>
          <span class="es-side-label">{STR.onIce}</span>
          {store.locks.value && <span class="es-side-locks">{store.locks.value}</span>}
        </div>
      )}
      {center && playing && (
        <div class={`es-center is-${center.mode}`}>
          {center.mode === 'aim' ? (
            <>
              <span class={`es-count display ${center.seconds <= 2 ? 'is-low' : ''}`}>{center.seconds}</span>
              <span class="es-center-text">
                <b class="display">{STR.aimTitle}</b> {STR.aimSub}
              </span>
            </>
          ) : (
            <b class="es-center-slide display">{STR.slideTitle}</b>
          )}
        </div>
      )}
      {playing && (
        <div class="es-row">
          {store.chips.value.map((c) => (
            <div key={c.id} class={`es-chip is-${c.status} ${c.offline ? 'is-off' : ''}`}>
              <Avatar
                fruit={c.fruit}
                ring={c.color}
                size={34}
                dim={c.status === 'out' || c.status === 'wait'}
                face={c.status === 'out' ? 'sad' : 'happy'}
              />
              <span class="es-chip-text">
                <span class="es-chip-name">{c.name}</span>
                <span class="es-chip-status">{STATUS_TEXT[c.status]}</span>
              </span>
              <span class="es-chip-score display">{c.score}</span>
            </div>
          ))}
        </div>
      )}
      {store.floats.value.map((f) => (
        <div
          key={f.key}
          class={`es-float is-${f.tone} display`}
          style={{ left: `${f.x.toFixed(0)}px`, top: `${f.y.toFixed(0)}px` }}
        >
          {f.text}
        </div>
      ))}
      <div class="es-toasts">
        {store.toasts.value.map((t) => (
          <div key={t.key} class="es-toast">
            {t.who && <Avatar fruit={t.who.fruit} ring={t.who.color} size={28} face="sad" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.key} class="es-banner display">
          {banner.text}
        </div>
      )}
      {big && (
        <div key={big.key} class="es-big display">
          {big.text}
        </div>
      )}
      {intro && (
        <div class={`es-card ${intro.double ? 'is-double' : ''}`}>
          <div class="es-card-of">{intro.of}</div>
          <div class="es-card-name display">{intro.name}</div>
          {intro.double && <div class="es-card-x2">{STR.double}</div>}
          <div class="es-card-desc">{intro.desc}</div>
        </div>
      )}
      {end && (
        <div class="es-card">
          <div class="es-card-of">{STR.roundDone}</div>
          <div class="es-card-name display">{end.title}</div>
          <div class="es-end-rows">
            {end.rows.map((r) => (
              <div key={r.id} class={`es-end ${r.winner ? 'is-win' : ''}`}>
                <Avatar fruit={r.fruit} ring={r.color} size={44} face={r.winner ? 'happy' : 'sad'} />
                <span class="es-end-name">{r.name}</span>
                <span class="es-end-pts display">{STR.pointsPlus(r.points)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {fin && (
        <div class="es-final">
          <div class="es-final-title display">{STR.finalTitle}</div>
          <div class="es-final-sub">{STR.finalSub}</div>
          <table class="es-table">
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
                  <td class="es-t-rank">{r.rank}</td>
                  <td class="es-t-name">
                    <Avatar fruit={r.fruit} ring={r.color} size={30} />
                    <span>{r.name}</span>
                  </td>
                  {Array.from({ length: fin.cols }, (_, i) => (
                    <td key={i}>{r.rounds[i] ?? 0}</td>
                  ))}
                  <td class="es-t-total">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {store.help.value && playing && <div class="es-help">{STR.help}</div>}
    </div>
  );
}
