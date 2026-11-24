/**
 * DOM/Preact layer over the Phaser kitchen: the setup screen (kitchen cards, sides, difficulty),
 * the play bar (order tickets, time, score, stars), side labels, overlays and the round result.
 * Slow state goes through signals (about 10 Hz); score pop-ups are pooled elements animated with
 * WAAPI so Preact never re-renders at 60 fps. Laid out in world coordinates (1280x720), shifted
 * by `origin` like the Phaser camera.
 */
import type { Fruit, Look } from '@hoorah/protocol';
import type { GameIcon } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { svgUrl } from '../../shared/art/svg';
import { Avatar, Icon, type IconName } from '../../shared/ui';
import { chiliMarkup, iconSvg } from './art';
import { STR } from './strings';

export interface CookChip {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
}

export interface KitchenCard {
  id: string;
  no: number;
  name: string;
  desc: string;
  thumb: string;
  recommended: boolean;
  selected: boolean;
  best: number | null;
}

export interface SetupState {
  step: 'kitchen' | 'level' | 'sides';
  cooks: number;
  recommendedName: string;
  kitchens: KitchenCard[];
  /** Split kitchens: the two sides; open kitchen: null. */
  sides: [CookChip[], CookChip[]] | null;
  everyone: CookChip[];
  levels: { id: string; name: string; desc: string; chilies: number; selected: boolean }[];
  hostName: string;
}

export interface TicketView {
  id: number;
  title: string;
  icon: string;
  parts: string[];
  /** 0..1 patience left. */
  left: number;
  urgent: boolean;
  /** Paket: parts already handed in (icons dimmed with a tick). */
  done: string[];
}

export interface PlayState {
  kitchen: string;
  level: string;
  chilies: number;
  tickets: TicketView[];
  timer: string;
  urgent: boolean;
  score: string;
  stars: number;
  /** 0..1 progress toward the next star. */
  progress: number;
  sides: [string, string] | null;
  open: string | null;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'warning' }
  | { kind: 'move' }
  | { kind: 'timeUp' }
  | { kind: 'guideGo' }
  | { kind: 'guideDone' };

/** The practice card and arrow (world px, like the rest of the HUD). */
export interface GuideState {
  eyebrow: string;
  title: string;
  sub: string;
  /** The phone button to press, drawn like it ("Tekan AMBIL"). */
  button: { verb: string; label: string; tone: 'yellow' | 'orange' | 'cream' } | null;
  /** Arrow tip and direction, or null (the ticket arrow, or nothing to point at). */
  arrow: { x: number; y: number; up: boolean } | null;
  /** Point at the first order ticket instead. */
  ticket: boolean;
  /** Changes with every step so the card pops in again. */
  key: string;
}

export interface AwardCard {
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  title: string;
  desc: string;
  icon: GameIcon;
}

export interface ResultState {
  eyebrow: string;
  title: string;
  sub: string;
  stars: number;
  score: string;
  /** 0..1 along the bar, and where the next star's notch sits. */
  fill: number;
  notch: number | null;
  next: string;
  delivered: number;
  missed: number;
  tips: string;
  awards: AwardCard[];
  newBest: boolean;
}

export interface HudState {
  mode: 'setup' | 'play' | 'result';
  setup: SetupState | null;
  play: PlayState | null;
  overlay: Overlay;
  result: ResultState | null;
  hint: boolean;
  guide: GuideState | null;
}

const FLOAT_POOL = 14;

const icon = (id: string) => svgUrl(`dp-icon:${id}`, () => iconSvg(id, 80));

const AWARD_ICON: Record<GameIcon, { icon: IconName; tint: string }> = {
  zap: { icon: 'zap', tint: '#FFC928' },
  fire: { icon: 'fire', tint: '#FF8A3D' },
  heart: { icon: 'heart', tint: '#5AA9FF' },
  star: { icon: 'star', tint: '#FFC928' },
  crown: { icon: 'crown', tint: '#FF5A1F' },
  target: { icon: 'target', tint: '#2DD4BF' },
  brain: { icon: 'brain', tint: '#FF5C9A' },
  build: { icon: 'build', tint: '#22B35E' },
};

export class Hud {
  readonly state = signal<HudState>({
    mode: 'setup',
    setup: null,
    play: null,
    overlay: { kind: 'none' },
    result: null,
    hint: false,
    guide: null,
  });
  private root: HTMLDivElement | null = null;
  private readonly floats: HTMLDivElement[] = [];
  private floatIdx = 0;
  readonly origin = { x: 0, y: 0 };

  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
      this.place();
    },
    float: (el: HTMLDivElement | null) => {
      if (el && !this.floats.includes(el)) this.floats.push(el);
    },
  };

  constructor(host: HTMLElement) {
    render(<HudView hud={this} />, host);
  }

  set(patch: Partial<HudState>): void {
    this.state.value = { ...this.state.value, ...patch };
  }

  setOrigin(x: number, y: number): void {
    this.origin.x = x;
    this.origin.y = y;
    this.place();
  }

  private place(): void {
    if (this.root)
      this.root.style.transform = `translate(${Math.round(this.origin.x)}px, ${Math.round(this.origin.y)}px)`;
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('dp-paused', paused);
  }

  /** A pop-up at world coordinates ("+150" over the pass, "Gosong!" over a stove). */
  float(text: string, x: number, y: number, color: string, size = 30, sub?: string): void {
    const el = this.floats[this.floatIdx++ % FLOAT_POOL];
    if (!el) return;
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.innerHTML = '';
    const main = document.createElement('span');
    main.textContent = text;
    el.appendChild(main);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      el.appendChild(s);
    }
    el.style.fontSize = `${size}px`;
    el.style.color = color;
    el.style.left = `${Math.round(Math.max(120, Math.min(1160, x)))}px`;
    el.style.top = `${Math.round(Math.max(150, Math.min(640, y)))}px`;
    const at = (dy: number, s: number) => `translate(-50%, -50%) translateY(${dy}px) scale(${s})`;
    el.animate(
      [
        { opacity: 0, transform: at(10, 0.5) },
        { opacity: 1, transform: at(0, 1.12), offset: 0.15 },
        { opacity: 1, transform: at(-30, 1), offset: 0.72 },
        { opacity: 0, transform: at(-48, 0.96) },
      ],
      { duration: 1300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }
}

/* ------------------------------------------------------------------ components */

function HudView({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  return (
    <div class="dp-hud" ref={hud.refs.root}>
      {s.mode === 'setup' && s.setup && <SetupScreen s={s.setup} />}
      {s.mode === 'play' && s.play && <PlayBar p={s.play} guideTicket={!!s.guide?.ticket} />}
      {s.mode === 'play' && s.play && !s.hint && !s.guide && <SideLabels p={s.play} />}
      {s.mode === 'play' && s.guide && <GuideView g={s.guide} />}
      {s.hint && s.mode === 'play' && <div class="dp-hint">{STR.hintStart}</div>}
      <div class="dp-floats" aria-hidden="true">
        {Array.from({ length: FLOAT_POOL }, (_, i) => (
          <div key={i} class="dp-float display outline-text" ref={hud.refs.float} />
        ))}
      </div>
      <OverlayView o={s.overlay} />
      {s.mode === 'result' && s.result && <ResultScreen r={s.result} />}
    </div>
  );
}

function Chilies({ n, size = 1 }: { n: number; size?: number }) {
  return (
    <svg
      width={14 * n * size}
      height={18 * size}
      viewBox={`0 0 ${14 * n} 18`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: Array.from({ length: n }, (_, i) => chiliMarkup(i * 13, 0)).join(''),
      }}
    />
  );
}

function Star({ on, size }: { on: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z"
        fill={on ? '#FFC928' : 'none'}
        stroke={on ? '#FFC928' : '#5A5D66'}
        stroke-width={on ? 0 : 2}
        stroke-linejoin="round"
      />
    </svg>
  );
}

function PlayBar({ p, guideTicket }: { p: PlayState; guideTicket: boolean }) {
  const slots = [0, 1, 2, 3];
  return (
    <div class="dp-bar">
      <div class="dp-brand">
        <div class="dp-brand-title display">{STR.gameTitle}</div>
        <div class="dp-brand-kitchen">{p.kitchen.toUpperCase()}</div>
        <div class="dp-chili-pill">
          <Chilies n={p.chilies} />
          <span>{p.level}</span>
        </div>
      </div>
      <div class="dp-tickets">
        {slots.map((i) => {
          const k = p.tickets[i];
          if (!k) return <div key={`e${i}`} class="dp-ticket empty" />;
          return (
            <div
              key={k.id}
              class={`dp-ticket${k.urgent ? ' urgent' : ''}${guideTicket && i === 0 ? ' guided' : ''}`}
            >
              {guideTicket && i === 0 && <GuideArrow up />}
              <div class="dp-ticket-head">
                <img src={icon(k.icon)} width={34} height={34} alt="" />
                <div class="dp-ticket-title">{k.title}</div>
              </div>
              <div class="dp-ticket-parts">
                {k.parts.map((part, j) => (
                  <div key={`${part}${j}`} class={`dp-part${k.done.includes(part) ? ' done' : ''}`}>
                    <img src={icon(part)} width={20} height={20} alt="" />
                  </div>
                ))}
              </div>
              <div class="dp-ticket-time">
                <i
                  style={{
                    width: `${Math.round(k.left * 100)}%`,
                    background: k.left > 0.5 ? '#22B35E' : k.left > 0.25 ? '#E3A21A' : '#F2453D',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div class="dp-score-col">
        <div class="dp-boxes">
          <div class={`dp-box${p.urgent ? ' urgent' : ''}`}>
            <span class="dp-box-label">{STR.timeLabel}</span>
            <span class="dp-box-value display">{p.timer}</span>
          </div>
          <div class="dp-box">
            <span class="dp-box-label">{STR.scoreLabel}</span>
            <span class="dp-box-value display score">{p.score}</span>
          </div>
        </div>
        <div class="dp-stars">
          {[1, 2, 3].map((n) => (
            <Star key={n} on={p.stars >= n} size={20} />
          ))}
          <div class="dp-stars-bar">
            <i style={{ width: `${Math.round(p.progress * 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A big bouncing arrow; the tip sits at the element's anchor (bottom centre, or top when `up`). */
function GuideArrow({ up, style }: { up?: boolean; style?: Record<string, string> }) {
  return (
    <div class={`dp-guide-arrow${up ? ' up' : ''}`} style={style} aria-hidden="true">
      <svg width="64" height="78" viewBox="0 0 64 78" aria-hidden="true">
        <path
          d="M20 4 h24 a4 4 0 0 1 4 4 v30 h10 a3 3 0 0 1 2.2 5 l-25.8 30 a3 3 0 0 1 -4.6 0 l-25.8 -30 a3 3 0 0 1 2.2 -5 h10 v-30 a4 4 0 0 1 4 -4 z"
          fill="#FFC928"
          stroke="#111214"
          stroke-width="4"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  );
}

function GuideView({ g }: { g: GuideState }) {
  return (
    <>
      {g.arrow && (
        <GuideArrow
          up={g.arrow.up}
          style={{ left: `${Math.round(g.arrow.x)}px`, top: `${Math.round(g.arrow.y)}px` }}
        />
      )}
      <div class="dp-guide" key={g.key}>
        <div class="dp-guide-text">
          <span class="dp-guide-eyebrow">{g.eyebrow}</span>
          <b class="dp-guide-title">{g.title}</b>
          <span class="dp-guide-sub">{g.sub}</span>
        </div>
        {g.button && (
          <div class="dp-guide-button">
            <span>{g.button.verb}</span>
            <i class={`tone-${g.button.tone}`}>{g.button.label}</i>
          </div>
        )}
        <span class="dp-guide-skip">{STR.guide.skipNote}</span>
      </div>
    </>
  );
}

function SideLabels({ p }: { p: PlayState }) {
  if (p.sides) {
    return (
      <>
        <div class="dp-side left">
          <span class="dp-side-tag prep">{STR.sideTag[0]}</span>
          <span>{p.sides[0]}</span>
        </div>
        <div class="dp-side right">
          <span class="dp-side-tag cook">{STR.sideTag[1]}</span>
          <span>{p.sides[1]}</span>
        </div>
      </>
    );
  }
  return (
    <div class="dp-side left">
      <span class="dp-side-tag prep">{STR.openTag}</span>
      <span>{p.open}</span>
    </div>
  );
}

function OverlayView({ o }: { o: Overlay }) {
  switch (o.kind) {
    case 'none':
      return null;
    case 'count':
      return (
        <div class="dp-center" key={`c${o.value}`}>
          <div class="dp-count display outline-text">{o.value}</div>
          <div class="dp-count-label">{STR.countdownLabel}</div>
        </div>
      );
    case 'go':
      return (
        <div class="dp-center" key="go">
          <div class="dp-go display outline-text">{STR.go}</div>
        </div>
      );
    case 'warning':
      return (
        <div class="dp-center" key="warn">
          <div class="dp-warn display outline-text">{STR.warning}</div>
        </div>
      );
    case 'move':
      return (
        <div class="dp-center" key="move">
          <div class="dp-warn display outline-text">{STR.moveWarn}</div>
          <div class="dp-count-label">{STR.moveWarnSub}</div>
        </div>
      );
    case 'timeUp':
      return (
        <div class="dp-center" key="up">
          <div class="dp-go display outline-text">{STR.timeUp}</div>
        </div>
      );
    case 'guideGo':
      return (
        <div class="dp-center" key="guide-go">
          <div class="dp-warn dp-guide-go display outline-text">{STR.guide.go}</div>
          <div class="dp-count-label">{STR.guide.goSub}</div>
        </div>
      );
    case 'guideDone':
      return (
        <div class="dp-center" key="guide-done">
          <div class="dp-go display outline-text">{STR.guide.doneTitle}</div>
          <div class="dp-count-label">{STR.guide.doneSub}</div>
        </div>
      );
  }
}

function SetupScreen({ s }: { s: SetupState }) {
  return (
    <div class="dp-setup">
      <div class="dp-setup-head">
        <div class="dp-setup-titles">
          <span class="dp-eyebrow">{STR.setupEyebrow}</span>
          <h1 class="display">{STR.gameTitle}</h1>
          <span class="dp-setup-tag">{STR.setupTagline}</span>
        </div>
        <div class="dp-rec">
          <span class="dp-rec-count">{STR.cooksPill(s.cooks)}</span>
          <span>{STR.recommendedPill(s.recommendedName)}</span>
        </div>
      </div>
      <div class={`dp-cards${s.step === 'kitchen' ? ' focus' : ''}`}>
        {s.kitchens.map((k) => (
          <div key={k.id} class={`dp-card${k.selected ? ' selected' : ''}`}>
            <div class="dp-thumb" dangerouslySetInnerHTML={{ __html: k.thumb }} />
            <div class="dp-card-row">
              <span class="dp-card-no">{STR.kitchenNo(k.no)}</span>
              {k.recommended && <span class="dp-badge">{STR.recommended}</span>}
            </div>
            <div class="dp-card-name display">{k.name}</div>
            <div class="dp-card-desc">{k.desc}</div>
            <div class="dp-card-best">
              {[1, 2, 3].map((n) => (
                <Star key={n} on={(k.best ?? 0) >= n} size={14} />
              ))}
              <span>{k.best ? STR.best : STR.bestNone}</span>
            </div>
          </div>
        ))}
      </div>
      <div class="dp-setup-bottom">
        <div class={`dp-panel dp-sides${s.step === 'sides' ? ' focus' : ''}`}>
          <div class="dp-panel-head">
            <span>{STR.sidesTitle}</span>
            {s.sides && <span class="dp-panel-hint">{STR.sidesHint}</span>}
          </div>
          {s.sides ? (
            <div class="dp-sides-grid">
              <SideBox side={0} cooks={s.sides[0]} />
              <div class="dp-arc">
                <svg width="48" height="28" viewBox="0 0 48 28" aria-hidden="true">
                  <path
                    d="M6 22 Q24 -4 42 20"
                    stroke="#FFC928"
                    stroke-width="3"
                    stroke-dasharray="2 6"
                    stroke-linecap="round"
                    fill="none"
                  />
                  <path
                    d="M42 20 l-6 -1 M42 20 l1 -6"
                    stroke="#FFC928"
                    stroke-width="3"
                    stroke-linecap="round"
                  />
                </svg>
                <span>{STR.throwArc}</span>
              </div>
              <SideBox side={1} cooks={s.sides[1]} />
            </div>
          ) : (
            <div class="dp-open">
              <div class="dp-cooks">
                {s.everyone.map((c) => (
                  <CookPill key={c.id} c={c} />
                ))}
              </div>
              <span class="dp-side-task">{STR.sidesOpen}</span>
            </div>
          )}
        </div>
        <div class={`dp-panel dp-levels${s.step === 'level' ? ' focus' : ''}`}>
          <span class="dp-panel-head">{STR.levelTitle}</span>
          <fieldset class="dp-seg" aria-label={STR.levelTitle}>
            {s.levels.map((l) => (
              <div key={l.id} class={`dp-seg-item${l.selected ? ' on' : ''}`}>
                <span class="dp-seg-top">
                  <Chilies n={l.chilies} />
                  <b>{l.name}</b>
                </span>
                <span class="dp-seg-desc">{l.desc}</span>
              </div>
            ))}
          </fieldset>
          <div class="dp-start">
            <span>{STR.startButton}</span>
          </div>
          <div class="dp-host-note">{STR.hostPicks(s.hostName)}</div>
        </div>
      </div>
    </div>
  );
}

function CookPill({ c }: { c: CookChip }) {
  return (
    <div class="dp-cook">
      <Avatar look={c.look} fruit={c.fruit} ring={c.color} size={30} />
      <span>{c.name}</span>
    </div>
  );
}

function SideBox({ side, cooks }: { side: 0 | 1; cooks: CookChip[] }) {
  const jobs =
    side === 0 ? ['tomatPotong', 'seladaPotong', 'kentangPotong'] : ['dagingMatang', 'kentangGoreng', 'soda'];
  return (
    <div class="dp-sidebox">
      <div class="dp-sidebox-head">
        <span class={`dp-side-tag ${side === 0 ? 'prep' : 'cook'}`}>{STR.sideTag[side]}</span>
        <div class="dp-jobs">
          {jobs.map((j) => (
            <img key={j} src={icon(j)} width={24} height={24} alt="" />
          ))}
        </div>
      </div>
      <div class="dp-cooks">
        {cooks.map((c) => (
          <CookPill key={c.id} c={c} />
        ))}
      </div>
      <span class="dp-side-task">{STR.sideTask[side]}</span>
    </div>
  );
}

function ResultScreen({ r }: { r: ResultState }) {
  return (
    <div class="dp-result">
      <div class="dp-result-left">
        <span class="dp-eyebrow">{r.eyebrow}</span>
        <h1 class="display">{r.title}</h1>
        <span class="dp-setup-tag">{r.sub}</span>
        <div class="dp-result-stars">
          {[1, 2, 3].map((n) => (
            <div key={n} class={`dp-rstar s${n}${r.stars >= n ? ' on' : ''}`}>
              <Star on={r.stars >= n} size={n === 2 ? 92 : 72} />
            </div>
          ))}
          {r.newBest && <span class="dp-newbest">{STR.newBest}</span>}
        </div>
        <div class="dp-panel dp-team">
          <div class="dp-team-head">
            <span>{STR.teamScore}</span>
            <span class="display dp-team-score">{r.score}</span>
          </div>
          <div class="dp-team-bar">
            <i style={{ width: `${Math.round(r.fill * 100)}%` }} />
            {r.notch !== null && <b style={{ left: `${Math.round(r.notch * 100)}%` }} />}
          </div>
          <span class="dp-team-next">{r.next}</span>
          <div class="dp-team-stats">
            <div>
              <b class="display">{r.delivered}</b>
              <span>{STR.statDelivered}</span>
            </div>
            <div>
              <b class="display miss">{r.missed}</b>
              <span>{STR.statMissed}</span>
            </div>
            <div>
              <b class="display tip">{r.tips}</b>
              <span>{STR.statTip}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="dp-result-right">
        <span class="dp-panel-head">{STR.awardsTitle}</span>
        {r.awards.length === 0 && <div class="dp-award-none">{STR.awardsNone}</div>}
        <div class="dp-awards">
          {r.awards.map((a, i) => {
            const look = AWARD_ICON[a.icon];
            return (
              <div key={`${a.title}${i}`} class="dp-award" style={{ animationDelay: `${0.4 + i * 0.12}s` }}>
                <Avatar look={a.look} fruit={a.fruit} ring={a.color} size={52} />
                <div class="dp-award-text">
                  <span class="dp-award-who">{a.name}</span>
                  <b class="display">{a.title}</b>
                  <span>{a.desc}</span>
                </div>
                <div class="dp-award-icon" style={{ background: look.tint }}>
                  <Icon name={look.icon} size={22} color="#111214" />
                </div>
              </div>
            );
          })}
        </div>
        <div class="dp-result-soon">{STR.resultSoon}</div>
      </div>
    </div>
  );
}
