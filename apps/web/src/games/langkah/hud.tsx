/**
 * Langkah Maut DOM HUD over the WebGL canvas (stage px): the Host's babak choice mirrored as
 * picture cards, the babak title, step counter, survivors and speed, the big cue strip (NOW arrow
 * with its time bar, the next arrows; the memory row in Ingat Jalan), the session record, the
 * walker list, call-outs, the babak intro card with its picture, the babak summary and the final
 * per-babak table.
 */
import type { Fruit, Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { THUMBS } from '../../controller/thumbs/langkah';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import type { Dir } from './logic';
import { ARROW, STR } from './strings';

export interface Chip {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
}

export interface SetupCard {
  id: string;
  label: string;
  sub: string;
}

export interface CueTile {
  dir: Dir;
  word: string;
  /** The arrow has gone dark (cave): show a question mark. */
  hidden: boolean;
  /** 0..1 of the window left. */
  left: number;
}

export interface CueStrip {
  mode: 'walk' | 'memo' | 'recall' | 'wait';
  now: CueTile | null;
  next: Dir[];
  memo: Dir[];
  memoSeconds: number;
  recallLen: number;
}

export interface WalkerRow extends Chip {
  steps: number;
  fallen: boolean;
  waiting: boolean;
  offline: boolean;
}

export interface IntroCard {
  of: string;
  stage: string;
  name: string;
  desc: string;
  double: boolean;
}

export interface EndRow extends Chip {
  points: number;
  steps: number;
  safe: boolean;
}

export interface FinalRow extends Chip {
  rounds: number[];
  best: number;
  total: number;
  rank: number;
}

interface Float {
  key: number;
  text: string;
  x: number;
  y: number;
}

interface Toast {
  key: number;
  text: string;
  who?: Chip;
}

export function thumbUrl(key: string): string | null {
  const build = THUMBS[key];
  return build ? svgUrl(`langkah:${key}`, build) : null;
}

export class HudStore {
  readonly setup = signal<{ cards: SetupCard[]; selected: string; waiting: string } | null>(null);
  readonly title = signal('');
  readonly double = signal(false);
  readonly step = signal(0);
  readonly alive = signal('');
  readonly speed = signal('');
  readonly cue = signal<CueStrip | null>(null);
  readonly record = signal('');
  readonly seconds = signal<number | null>(null);
  readonly rows = signal<WalkerRow[]>([]);
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
    this.floats.value = [...this.floats.value.slice(-7), f];
    window.setTimeout(() => {
      this.floats.value = this.floats.value.filter((o) => o.key !== f.key);
    }, 900);
  }

  toast(text: string, who?: Chip): void {
    const t: Toast = who ? { key: ++this.key, text, who } : { key: ++this.key, text };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((o) => o.key !== t.key);
    }, 2600);
  }

  flashBanner(text: string): void {
    const b = { key: ++this.key, text };
    this.banner.value = b;
    window.setTimeout(() => {
      if (this.banner.value?.key === b.key) this.banner.value = null;
    }, 2000);
  }
}

function Thumb({ id, class: cls }: { id: string; class?: string }) {
  const url = thumbUrl(id);
  return url ? <img class={cls} src={url} alt="" draggable={false} /> : null;
}

function Strip({ cue }: { cue: CueStrip }) {
  if (cue.mode === 'memo')
    return (
      <div class="lm-strip is-memo">
        <div class="lm-strip-label">{STR.remember(cue.memoSeconds)}</div>
        <div class="lm-memo-row">
          {cue.memo.map((d, i) => (
            <span key={i} class="lm-tile is-memo display">
              {ARROW[d]}
            </span>
          ))}
        </div>
      </div>
    );
  if (cue.mode === 'recall')
    return (
      <div class="lm-strip is-recall">
        <div class="lm-strip-label">{STR.recall}</div>
        <div class="lm-memo-row">
          {Array.from({ length: cue.recallLen }, (_, i) => (
            <span key={i} class="lm-tile is-dark display">
              ?
            </span>
          ))}
        </div>
      </div>
    );
  if (!cue.now) return null;
  return (
    <div class="lm-strip">
      <div class="lm-now">
        <div class="lm-strip-label">{STR.now}</div>
        <span class={`lm-tile is-now display ${cue.now.hidden ? 'is-dark' : ''}`}>
          {cue.now.hidden ? '?' : ARROW[cue.now.dir]}
        </span>
        <span class="lm-word">{cue.now.hidden ? '' : cue.now.word}</span>
        <span class="lm-bar">
          <span class="lm-bar-fill" style={{ width: `${Math.round(cue.now.left * 100)}%` }} />
        </span>
      </div>
      {cue.next.length > 0 && (
        <div class="lm-next">
          <div class="lm-strip-label">{STR.next}</div>
          <div class="lm-next-row">
            {cue.next.map((d, i) => (
              <span key={i} class="lm-tile is-next display">
                {ARROW[d]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const setup = store.setup.value;
  const intro = store.intro.value;
  const end = store.end.value;
  const fin = store.final.value;
  const cue = store.cue.value;
  const big = store.big.value;
  const banner = store.banner.value;
  const playing = !setup && !intro && !end && !fin;
  const rows = store.rows.value;
  return (
    <div class={`lm-hud ${store.paused.value ? 'is-paused' : ''}`}>
      {setup && (
        <div class="lm-setup">
          <div class="lm-setup-eyebrow">{STR.setupScreen}</div>
          <div class="lm-setup-title display">{STR.gameTitle}</div>
          <div class="lm-setup-sub">{STR.setupScreenSub}</div>
          <div class="lm-setup-grid">
            {setup.cards.map((c) => (
              <div key={c.id} class={`lm-pick ${setup.selected === c.id ? 'is-on' : ''}`}>
                <Thumb id={c.id} class="lm-pick-img" />
                <span class="lm-pick-label">{c.label}</span>
                <span class="lm-pick-sub">{c.sub}</span>
              </div>
            ))}
          </div>
          <div class="lm-setup-wait">{setup.waiting}</div>
        </div>
      )}
      {playing && store.title.value && (
        <div class="lm-head">
          <span class="lm-title">
            {store.title.value}
            {store.double.value && <span class="lm-x2">{STR.double}</span>}
          </span>
          {store.record.value && <span class="lm-record">{store.record.value}</span>}
        </div>
      )}
      {playing && store.title.value && (
        <div class="lm-step">
          <span class="lm-step-label">{STR.step}</span>
          <span class="lm-step-value display">{store.step.value}</span>
        </div>
      )}
      {playing && store.title.value && (
        <div class="lm-meters">
          <span class="lm-meter">
            <span class="lm-meter-label">{STR.alive}</span>
            <span class="lm-meter-value display">{store.alive.value}</span>
          </span>
          <span class="lm-meter">
            <span class="lm-meter-label">{STR.speed}</span>
            <span class="lm-meter-value display">{store.speed.value}</span>
          </span>
          {store.seconds.value !== null && (
            <span class="lm-meter is-time">
              <span class="lm-meter-value display">{store.seconds.value}</span>
            </span>
          )}
        </div>
      )}
      {playing && rows.length > 0 && (
        <div class={`lm-rows ${rows.length > 10 ? 'is-dense' : ''}`}>
          {rows.map((r) => (
            <div
              key={r.id}
              class={`lm-row ${r.fallen ? 'is-out' : ''} ${r.waiting ? 'is-wait' : ''} ${r.offline ? 'is-off' : ''}`}
            >
              <Avatar
                look={r.look}
                fruit={r.fruit}
                ring={r.color}
                size={rows.length > 10 ? 22 : 28}
                dim={r.fallen || r.waiting}
                face={r.fallen ? 'sad' : 'happy'}
              />
              <span class="lm-row-name">{r.name}</span>
              <span class="lm-row-steps">{r.steps}</span>
            </div>
          ))}
        </div>
      )}
      {playing && cue && <Strip cue={cue} />}
      {store.floats.value.map((f) => (
        <div
          key={f.key}
          class="lm-float display"
          style={{ left: `${f.x.toFixed(0)}px`, top: `${f.y.toFixed(0)}px` }}
        >
          {f.text}
        </div>
      ))}
      <div class="lm-toasts">
        {store.toasts.value.map((t) => (
          <div key={t.key} class="lm-toast">
            {t.who && (
              <Avatar look={t.who.look} fruit={t.who.fruit} ring={t.who.color} size={28} face="sad" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.key} class="lm-banner display">
          {banner.text}
        </div>
      )}
      {big && (
        <div key={big.key} class="lm-big display">
          {big.text}
        </div>
      )}
      {intro && (
        <div class={`lm-card ${intro.double ? 'is-double' : ''}`}>
          <Thumb id={intro.stage} class="lm-card-img" />
          <div class="lm-card-body">
            <div class="lm-card-of">{intro.of}</div>
            <div class="lm-card-name display">{intro.name}</div>
            {intro.double && <div class="lm-card-x2">{STR.double}</div>}
            <div class="lm-card-desc">{intro.desc}</div>
          </div>
        </div>
      )}
      {end && (
        <div class="lm-card is-end">
          <div class="lm-card-body">
            <div class="lm-card-of">{STR.babakDone}</div>
            <div class="lm-card-name display">{end.title}</div>
            <div class="lm-card-desc">{end.sub}</div>
            <div class="lm-end-rows">
              {end.rows.map((r) => (
                <div key={r.id} class={`lm-end ${r.safe ? 'is-safe' : ''}`}>
                  <Avatar
                    look={r.look}
                    fruit={r.fruit}
                    ring={r.color}
                    size={36}
                    face={r.safe ? 'happy' : 'sad'}
                  />
                  <span class="lm-end-name">{r.name}</span>
                  <span class="lm-end-pts display">{STR.pointsPlus(r.points)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {fin && (
        <div class="lm-final">
          <div class="lm-final-title display">{STR.finalTitle}</div>
          <div class="lm-final-sub">{STR.finalSub}</div>
          <table class={`lm-table ${fin.rows.length > 8 ? 'is-dense' : ''}`}>
            <thead>
              <tr>
                <th />
                <th />
                {Array.from({ length: fin.cols }, (_, i) => (
                  <th key={i}>{STR.babakCol(i)}</th>
                ))}
                <th>{STR.stepsCol}</th>
                <th>{STR.totalCol}</th>
              </tr>
            </thead>
            <tbody>
              {fin.rows.map((r) => (
                <tr key={r.id} class={r.rank === 1 ? 'is-top' : ''}>
                  <td class="lm-t-rank">{r.rank}</td>
                  <td class="lm-t-name">
                    <Avatar
                      look={r.look}
                      fruit={r.fruit}
                      ring={r.color}
                      size={fin.rows.length > 8 ? 22 : 28}
                    />
                    <span>{r.name}</span>
                  </td>
                  {Array.from({ length: fin.cols }, (_, i) => (
                    <td key={i}>{r.rounds[i] ?? 0}</td>
                  ))}
                  <td>{r.best}</td>
                  <td class="lm-t-total">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {store.help.value && playing && <div class="lm-help">{STR.help}</div>}
    </div>
  );
}
