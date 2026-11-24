/**
 * Bom Oper DOM HUD over the WebGL canvas (stage px), comic style: the round tag, the banner naming
 * who holds the bomb (never a number: the time is secret), a row of player cards with hearts (the
 * holder's card turns yellow), call-outs over heads, the arena picker, the round card and the
 * scoreboard between rounds.
 */
import type { Fruit, Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { THUMBS } from '../../controller/thumbs/bom';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import type { ArenaId } from './arena';
import { RULES } from './logic';
import { STR } from './strings';

export interface RunnerChip {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
}

export interface CardRow extends RunnerChip {
  lives: number;
  bomb: boolean;
  out: boolean;
  immune: boolean;
  offline: boolean;
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

export interface Banner {
  title: string;
  sub: string;
  tone: 'bomb' | 'drop' | 'boom';
}

export interface IntroCard {
  of: string;
  name: string;
  line: string;
  final: boolean;
  how: boolean;
}

export interface ScoreCard {
  title: string;
  line: string;
  sub: string;
  rows: (RunnerChip & { lives: number; lost: boolean; out: boolean })[];
}

export interface PickCard {
  selected: ArenaId;
  options: { id: ArenaId; name: string; sub: string }[];
  sub: string;
  note: string;
}

export class HudStore {
  readonly brand = signal('');
  readonly banner = signal<Banner | null>(null);
  readonly cards = signal<CardRow[]>([]);
  readonly big = signal<{ key: number; text: string; tone: 'go' | 'boom' | 'end' } | null>(null);
  readonly floats = signal<Float[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly intro = signal<IntroCard | null>(null);
  readonly score = signal<ScoreCard | null>(null);
  readonly pick = signal<PickCard | null>(null);
  readonly paused = signal(false);
  private key = 0;

  shout(text: string, tone: 'go' | 'boom' | 'end'): void {
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
    const t: Toast = {
      key: ++this.key,
      text,
      ...(who ? { fruit: who.fruit, look: who.look, color: who.color } : {}),
    };
    this.toasts.value = [...this.toasts.value.slice(-2), t];
    window.setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((o) => o.key !== t.key);
    }, 2600);
  }
}

function Hearts({ n }: { n: number }) {
  return (
    <span class="bo-hearts" role="img" aria-label={`${n} ${STR.livesLabel}`}>
      {Array.from({ length: RULES.lives }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 22"
          width="22"
          height="20"
          class={i < n ? 'is-on' : ''}
          aria-hidden="true"
        >
          <path d="M12 21 2.6 11.6A5.6 5.6 0 0 1 12 4.3a5.6 5.6 0 0 1 9.4 7.3Z" />
        </svg>
      ))}
    </span>
  );
}

function Picker({ card }: { card: PickCard }) {
  return (
    <div class="bo-pick">
      <div class="bo-pick-eyebrow">{STR.pickEyebrow}</div>
      <div class="bo-pick-title">{STR.pickTitle}</div>
      <div class="bo-pick-sub">{card.sub}</div>
      <div class="bo-pick-cards">
        {card.options.map((o) => (
          <div key={o.id} class={`bo-pick-card ${o.id === card.selected ? 'is-on' : ''}`}>
            <img src={svgUrl(`thumb:bom:${o.id}`, THUMBS[o.id]!)} alt="" width={320} height={240} />
            <b class="bo-pick-name">{o.name}</b>
            <span class="bo-pick-desc">{o.sub}</span>
          </div>
        ))}
      </div>
      <div class="bo-pick-note">{card.note}</div>
    </div>
  );
}

export function Hud({ store }: { store: HudStore }) {
  const big = store.big.value;
  const intro = store.intro.value;
  const score = store.score.value;
  const pick = store.pick.value;
  const banner = store.banner.value;
  return (
    <div class={`bo-hud ${store.paused.value ? 'is-paused' : ''}`}>
      {!pick && store.brand.value && <div class="bo-brand">{store.brand.value}</div>}
      {!pick && banner && (
        <div class={`bo-banner tone-${banner.tone}`}>
          <b class="bo-banner-title">{banner.title}</b>
          <span class="bo-banner-sub">{banner.sub}</span>
        </div>
      )}
      {!pick && (
        <div class="bo-cards">
          {store.cards.value.map((c) => (
            <div
              key={c.id}
              class={`bo-card ${c.bomb ? 'is-bomb' : ''} ${c.out ? 'is-out' : ''} ${c.offline ? 'is-off' : ''}`}
              style={{ ['--c' as string]: c.color }}
            >
              <Avatar look={c.look} fruit={c.fruit} ring={c.color} size={34} dim={c.out || c.offline} />
              <span class="bo-card-text">
                <b class="bo-card-name">{c.name}</b>
                <Hearts n={c.lives} />
              </span>
              {c.bomb && <span class="bo-pill is-bomb">{STR.bombPill}</span>}
              {c.out && <span class="bo-pill">{STR.outPill}</span>}
              {c.immune && !c.bomb && !c.out && <span class="bo-pill is-immune">{STR.immunePill}</span>}
            </div>
          ))}
        </div>
      )}
      {store.floats.value.map((f) => (
        <div
          key={f.key}
          class={`bo-float tone-${f.tone}`}
          style={{ left: `${f.x.toFixed(0)}px`, top: `${f.y.toFixed(0)}px` }}
        >
          {f.text}
        </div>
      ))}
      <div class="bo-toasts">
        {store.toasts.value.map((t) => (
          <div key={t.key} class="bo-toast">
            {t.fruit && t.color && <Avatar look={t.look} fruit={t.fruit} ring={t.color} size={28} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {big && (
        <div key={big.key} class={`bo-big tone-${big.tone}`}>
          {big.text}
        </div>
      )}
      {pick && <Picker card={pick} />}
      {intro && (
        <div class={`bo-intro ${intro.final ? 'is-final' : ''}`}>
          <div class="bo-intro-of">{intro.of}</div>
          <div class="bo-intro-name">{intro.name}</div>
          <div class="bo-intro-line">{intro.line}</div>
          {intro.how && (
            <div class="bo-intro-how">
              <div class="bo-how">
                <b class="bo-how-key">{STR.howStick}</b>
                <span>{STR.howStickSub}</span>
              </div>
              <div class="bo-how">
                <b class="bo-how-key">{STR.howPass}</b>
                <span>{STR.howPassSub}</span>
              </div>
              <div class="bo-how">
                <b class="bo-how-key">{STR.howImmune}</b>
                <span>{STR.howImmuneSub}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {score && (
        <div class="bo-score">
          <div class="bo-score-title">{score.title}</div>
          <div class="bo-score-line">{score.line}</div>
          <div class="bo-score-rows">
            {score.rows.map((r) => (
              <div key={r.id} class={`bo-srow ${r.lost ? 'is-lost' : ''} ${r.out ? 'is-out' : ''}`}>
                <Avatar look={r.look} fruit={r.fruit} ring={r.color} size={36} dim={r.out} />
                <b class="bo-srow-name">{r.name}</b>
                <Hearts n={r.lives} />
              </div>
            ))}
          </div>
          <div class="bo-score-sub">{score.sub}</div>
        </div>
      )}
    </div>
  );
}
