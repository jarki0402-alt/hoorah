/**
 * Satu Tali DOM HUD over the WebGL canvas (stage px): route chip, the flag row with the team clock,
 * the roster (who grips, who hangs), the rope tension meter, the team's catches, call-outs, the
 * route picker, the intro card and the flag card between sections. Structure changes go through
 * signals a few times a second; name tags are moved by the box-world renderer every frame.
 */
import type { Fruit, Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { THUMBS } from '../../controller/thumbs/tali';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import type { RouteId } from './course';
import { STR } from './strings';

export interface ClimberChip {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
}

export interface RosterRow extends ClimberChip {
  state: 'ok' | 'grip' | 'hang' | 'off';
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
  look?: Look;
  color?: string;
}

export interface IntroCard {
  of: string;
  name: string;
  level: string;
  segments: string[];
  solo: boolean;
}

export interface FlagCard {
  title: string;
  done: boolean;
  stars: number;
  lines: string[];
  sub: string;
}

export interface PickCard {
  selected: RouteId;
  options: { id: RouteId; name: string; sub: string }[];
  sub: string;
  note: string;
}

export class HudStore {
  readonly brand = signal('');
  readonly clock = signal('');
  readonly left = signal<string | null>(null);
  readonly flags = signal<{ total: number; done: boolean[]; current: number }>({
    total: 0,
    done: [],
    current: 0,
  });
  readonly progress = signal(0);
  readonly roster = signal<RosterRow[]>([]);
  readonly tension = signal(0);
  readonly catches = signal(0);
  readonly playing = signal(false);
  readonly big = signal<{ key: number; text: string; tone: 'count' | 'go' | 'end' } | null>(null);
  readonly floats = signal<Float[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly intro = signal<IntroCard | null>(null);
  readonly flagCard = signal<FlagCard | null>(null);
  readonly pick = signal<PickCard | null>(null);
  readonly help = signal<string | null>(null);
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

  toast(text: string, who?: ClimberChip): void {
    const t: Toast = {
      key: ++this.key,
      text,
      ...(who ? { fruit: who.fruit, look: who.look, color: who.color } : {}),
    };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((o) => o.key !== t.key);
    }, 2800);
  }
}

function Flag({ state }: { state: 'done' | 'now' | 'todo' }) {
  return (
    <svg class={`tl-flag is-${state}`} viewBox="0 0 24 28" width="26" height="30" aria-hidden="true">
      <rect x="3" y="2" width="2.6" height="25" rx="1.2" fill="currentColor" />
      <path d="M6 3h14l-3.6 5L20 13H6Z" class="tl-flag-cloth" />
    </svg>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div class="tl-stars">
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width="54"
          height="54"
          class={i < n ? 'is-on' : ''}
          aria-hidden="true"
        >
          <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8Z" />
        </svg>
      ))}
    </div>
  );
}

const STATE_LABEL: Record<RosterRow['state'], string> = {
  ok: '',
  grip: 'PEGANG',
  hang: 'TERGANTUNG',
  off: '...',
};

function Picker({ card }: { card: PickCard }) {
  return (
    <div class="tl-pick">
      <div class="tl-pick-eyebrow">{STR.pickEyebrow}</div>
      <div class="tl-pick-title display">{STR.pickTitle}</div>
      <div class="tl-pick-sub">{card.sub}</div>
      <div class="tl-pick-cards">
        {card.options.map((o) => (
          <div key={o.id} class={`tl-pick-card ${o.id === card.selected ? 'is-on' : ''}`}>
            <img src={svgUrl(`thumb:tali:${o.id}`, THUMBS[o.id]!)} alt="" width={320} height={240} />
            <b class="tl-pick-card-name">{o.name}</b>
            <span class="tl-pick-card-sub">{o.sub}</span>
          </div>
        ))}
      </div>
      <div class="tl-pick-note">{card.note}</div>
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const big = store.big.value;
  const intro = store.intro.value;
  const flag = store.flagCard.value;
  const pick = store.pick.value;
  const playing = store.playing.value;
  const flags = store.flags.value;
  const t = store.tension.value;
  const word = t < 0.25 ? 0 : t < 0.75 ? 1 : 2;
  return (
    <div class={`tl-hud ${store.paused.value ? 'is-paused' : ''}`}>
      {!pick && <div class="tl-brand">{store.brand.value}</div>}
      {!pick && flags.total > 0 && (
        <div class="tl-top">
          <div class="tl-flags">
            <span class="tl-flags-label">{STR.flagsLabel}</span>
            {Array.from({ length: flags.total }, (_, i) => (
              <Flag key={i} state={flags.done[i] ? 'done' : i === flags.current ? 'now' : 'todo'} />
            ))}
          </div>
          <div class="tl-clock">
            <span class="tl-clock-label">{STR.timeLabel}</span>
            <span class="tl-clock-value">{store.clock.value}</span>
          </div>
          {playing && (
            <div class="tl-progress">
              <span
                class="tl-progress-fill"
                style={{ width: `${(store.progress.value * 100).toFixed(1)}%` }}
              />
            </div>
          )}
          {store.left.value && <div class="tl-left">{store.left.value}</div>}
        </div>
      )}
      {!pick && (
        <div class="tl-roster">
          {store.roster.value.map((r) => (
            <div key={r.id} class={`tl-row is-${r.state}`}>
              <Avatar look={r.look} fruit={r.fruit} ring={r.color} size={30} dim={r.state === 'off'} />
              <span class="tl-name">{r.name}</span>
              {STATE_LABEL[r.state] && <span class="tl-pill">{STATE_LABEL[r.state]}</span>}
            </div>
          ))}
        </div>
      )}
      {playing && (
        <div class={`tl-tension is-${word}`}>
          <span class="tl-tension-label">{STR.tensionLabel}</span>
          <span class="tl-tension-bar">
            <span class="tl-tension-fill" style={{ width: `${Math.round(t * 100)}%` }} />
          </span>
          <b class="tl-tension-word">{STR.tension[word]}</b>
        </div>
      )}
      {playing && (
        <div class="tl-catches">
          <span>{STR.catchesLabel}</span>
          <b class="tl-catches-value">{store.catches.value}</b>
        </div>
      )}
      {store.floats.value.map((f) => (
        <div
          key={f.key}
          class={`tl-float tone-${f.tone}`}
          style={{ left: `${f.x.toFixed(0)}px`, top: `${f.y.toFixed(0)}px` }}
        >
          {f.text}
        </div>
      ))}
      <div class="tl-toasts">
        {store.toasts.value.map((x) => (
          <div key={x.key} class="tl-toast">
            {x.fruit && x.color && <Avatar look={x.look} fruit={x.fruit} ring={x.color} size={28} />}
            <span>{x.text}</span>
          </div>
        ))}
      </div>
      {big && (
        <div key={big.key} class={`tl-big tone-${big.tone}`}>
          {big.text}
        </div>
      )}
      {pick && <Picker card={pick} />}
      {intro && (
        <div class="tl-intro">
          <div class="tl-intro-of">{intro.of}</div>
          <div class="tl-intro-name display">{intro.name}</div>
          <div class="tl-intro-level">{intro.level}</div>
          <div class="tl-intro-goal">{STR.introGoal}</div>
          <div class="tl-intro-ahead">{STR.introAhead}</div>
          <div class="tl-intro-segs">
            {intro.segments.map((s, i) => (
              <span key={`${s}-${i}`} class="tl-seg">
                {s}
              </span>
            ))}
          </div>
          <div class="tl-intro-how">
            <div class="tl-how">
              <b class="tl-how-key">{STR.howStick}</b>
              <span>{STR.howStickSub}</span>
            </div>
            <div class="tl-how">
              <b class="tl-how-key">{STR.howJump}</b>
              <span>{STR.howJumpSub}</span>
            </div>
            <div class="tl-how">
              <b class="tl-how-key">{intro.solo ? STR.howSack : STR.howGrip}</b>
              <span>{intro.solo ? STR.howSackSub : STR.howGripSub}</span>
            </div>
          </div>
        </div>
      )}
      {flag && (
        <div class={`tl-flagcard ${flag.done ? '' : 'is-timeout'}`}>
          <div class="tl-flagcard-title display">{flag.title}</div>
          {flag.done && <Stars n={flag.stars} />}
          <div class="tl-flagcard-lines">
            {flag.lines.map((l) => (
              <span key={l} class="tl-line">
                {l}
              </span>
            ))}
          </div>
          <div class="tl-flagcard-sub">{flag.sub}</div>
        </div>
      )}
      {store.help.value && <div class="tl-help">{store.help.value}</div>}
    </div>
  );
}
