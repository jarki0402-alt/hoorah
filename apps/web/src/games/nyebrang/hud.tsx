/**
 * DOM/Preact HUD over the Phaser world: top bar (mode, map, ronde, clock, camera speed), the
 * live leaderboard, centre overlays (setup mirror, map intro, countdown, ronde results, final),
 * name tags over the runners and floating texts. Slow state goes through a signal (~10 Hz);
 * per-frame things (tags, pop-ups) are written straight to pooled elements so Preact never
 * re-renders at 60 fps.
 */
import type { Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { THUMBS } from '../../controller/thumbs/nyebrang';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import type { MapId } from './lanes';
import type { MapPick, Mode, SetupStep } from './logic';
import { MAP_DESC, MAP_NAME, MODE_DESC, MODE_NAME, STR } from './strings';

export interface BoardRow {
  id: number;
  name: string;
  look: Look;
  color: string;
  dist: number;
  state: 'run' | 'dead' | 'out' | 'done';
  back: number;
  place: number;
}

export interface ScoreRow {
  id: number;
  name: string;
  look: Look;
  color: string;
  dist: number;
  near: number;
  gained: number;
  total: number;
  rank: number;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'setup'; step: SetupStep; mode: Mode; map: MapPick; host: string }
  | { kind: 'intro'; map: MapId; mode: Mode; round: number; rounds: number; final: boolean }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'banner'; text: string; tone: 'yellow' | 'red' }
  | { kind: 'roundEnd'; round: number; rows: ScoreRow[]; next: string; record: string | null }
  | { kind: 'final'; rows: ScoreRow[] };

export interface HudState {
  show: boolean;
  mode: Mode;
  map: MapId;
  round: number;
  rounds: number;
  final: boolean;
  clock: string;
  urgent: boolean;
  level: number;
  rows: BoardRow[];
  overlay: Overlay;
  hint: boolean;
  danger: boolean;
}

const INITIAL: HudState = {
  show: false,
  mode: 'balapan',
  map: 'kota',
  round: 1,
  rounds: 3,
  final: false,
  clock: '0:00',
  urgent: false,
  level: 1,
  rows: [],
  overlay: { kind: 'none' },
  hint: false,
  danger: false,
};

const MAP_COLOR: Record<MapPick, string> = {
  kota: '#FFC928',
  sungai: '#14B8C4',
  rel: '#FF5A1F',
  malam: '#2F7DF6',
  acak: '#22B35E',
};

function Board({ rows }: { rows: BoardRow[] }) {
  return (
    <div class="nb-board">
      <div class="nb-board-title">{STR.board}</div>
      {rows.map((r, i) => (
        <div key={r.id} class={`nb-row is-${r.state}`}>
          <span class="nb-row-rank">{i + 1}</span>
          <Avatar look={r.look} ring={r.color} size={30} face={r.state === 'out' ? 'sad' : 'happy'} />
          <span class="nb-row-name">{r.name}</span>
          <span class="nb-row-val">
            {r.state === 'out'
              ? STR.boardOut
              : r.state === 'dead'
                ? STR.boardBack(r.back)
                : r.state === 'done'
                  ? STR.boardDone(r.place)
                  : r.dist}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The same picture the phones show on the option (controller/thumbs/nyebrang.ts). */
function SetupArt({ k }: { k: string }) {
  const build = THUMBS[k];
  if (!build) return null;
  return <img class="nb-card-img" src={svgUrl(`nb-thumb:${k}`, build)} alt="" draggable={false} />;
}

function Setup({ o }: { o: Extract<Overlay, { kind: 'setup' }> }) {
  return (
    <div class="nb-panel nb-setup">
      <div class="nb-logo">{STR.title}</div>
      <div class="nb-lead">{STR.setupLead}</div>
      <div class="nb-setup-label">{STR.setupMode}</div>
      <div class="nb-cards">
        {(['balapan', 'bertahan'] as const).map((m) => (
          <div
            key={m}
            class={`nb-card is-mode ${o.mode === m ? 'is-on' : ''} ${o.step === 'mode' ? 'is-step' : ''}`}
          >
            <SetupArt k={`mode-${m}`} />
            <div class="nb-card-text">
              <div class="nb-card-t">{MODE_NAME[m]}</div>
              <div class="nb-card-d">{MODE_DESC[m]}</div>
            </div>
          </div>
        ))}
      </div>
      <div class="nb-setup-label">{STR.setupMap}</div>
      <div class="nb-cards is-maps">
        {(['kota', 'sungai', 'rel', 'malam', 'acak'] as const).map((m) => (
          <div
            key={m}
            class={`nb-card is-map ${o.map === m ? 'is-on' : ''} ${o.step === 'map' ? 'is-step' : ''}`}
            style={{ ['--map' as string]: MAP_COLOR[m] }}
          >
            <SetupArt k={`map-${m}`} />
            <div class="nb-card-t">{MAP_NAME[m]}</div>
            <div class="nb-card-d">{MAP_DESC[m]}</div>
          </div>
        ))}
      </div>
      <div class="nb-note">{STR.setupHostPicks(o.host)}</div>
    </div>
  );
}

function Scores({ rows, title, foot }: { rows: ScoreRow[]; title: string; foot?: string }) {
  return (
    <div class="nb-panel nb-scores">
      <div class="nb-scores-title">{title}</div>
      <div class="nb-scores-head">
        <span />
        <span />
        <span>{STR.colDistance}</span>
        <span>{STR.colNear}</span>
        <span>{STR.colGained}</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} class={`nb-score ${r.rank === 1 ? 'is-top' : ''}`}>
          <span class="nb-score-rank">{r.rank}</span>
          <span class="nb-score-who">
            <Avatar look={r.look} ring={r.color} size={34} face={r.rank === 1 ? 'wow' : 'happy'} />
            {r.name}
          </span>
          <span>{r.dist}</span>
          <span>{r.near}</span>
          <span class="nb-score-pts">
            +{r.gained} <small>{r.total}</small>
          </span>
        </div>
      ))}
      {foot && <div class="nb-note">{foot}</div>}
    </div>
  );
}

function Center({ o }: { o: Overlay }) {
  switch (o.kind) {
    case 'none':
      return null;
    case 'setup':
      return <Setup o={o} />;
    case 'intro':
      return (
        <div class="nb-intro" style={{ ['--map' as string]: MAP_COLOR[o.map] }}>
          <div class="nb-intro-k">{o.final ? STR.introFinal : STR.introRound(o.round, o.rounds)}</div>
          <div class="nb-intro-map">{MAP_NAME[o.map].toUpperCase()}</div>
          <div class="nb-intro-mode">
            {MODE_NAME[o.mode]} · {MAP_DESC[o.map]}
          </div>
        </div>
      );
    case 'count':
      return (
        <div key={o.value} class="nb-count">
          {o.value}
        </div>
      );
    case 'go':
      return <div class="nb-count is-go">{STR.go}</div>;
    case 'banner':
      return <div class={`nb-banner is-${o.tone}`}>{o.text}</div>;
    case 'roundEnd':
      return (
        <div class="nb-end">
          {o.record && <div class="nb-record">{o.record}</div>}
          <Scores rows={o.rows} title={STR.roundEndTitle(o.round)} foot={o.next} />
        </div>
      );
    case 'final':
      return <Scores rows={o.rows} title={STR.finalTitle} />;
  }
}

function HudView({ s }: { s: HudState }) {
  if (!s.show) return <Center o={s.overlay} />;
  return (
    <>
      <div class={`nb-danger ${s.danger ? 'is-on' : ''}`} />
      <div class="nb-top">
        <span class="nb-chip is-mode">{MODE_NAME[s.mode].toUpperCase()}</span>
        <span class="nb-chip" style={{ ['--map' as string]: MAP_COLOR[s.map] }}>
          {MAP_NAME[s.map].toUpperCase()}
        </span>
        <span class={`nb-chip ${s.final ? 'is-final' : 'is-ghost'}`}>
          {s.final ? STR.finalChip : STR.roundChip(s.round, s.rounds)}
        </span>
        <span class={`nb-clock ${s.urgent ? 'is-urgent' : ''}`}>{s.clock}</span>
      </div>
      <div class="nb-cam">
        <span>{STR.camera}</span>
        <b>{STR.cameraLevel(s.level)}</b>
      </div>
      <Board rows={s.rows} />
      {s.hint && <div class="nb-hint">{STR.edgeHint}</div>}
      <Center o={s.overlay} />
    </>
  );
}

const TAGS = 16;
const POPS = 12;

export class Hud {
  private readonly state = signal<HudState>(INITIAL);
  private readonly tagEls: HTMLDivElement[] = [];
  private readonly popEls: { el: HTMLDivElement; until: number }[] = [];
  private popIdx = 0;
  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    const ui = document.createElement('div');
    ui.className = 'nb-ui';
    host.appendChild(ui);
    const layer = document.createElement('div');
    layer.className = 'nb-tags';
    host.appendChild(layer);
    for (let i = 0; i < TAGS; i++) {
      const el = document.createElement('div');
      el.className = 'nb-tag';
      el.style.display = 'none';
      layer.appendChild(el);
      this.tagEls.push(el);
    }
    for (let i = 0; i < POPS; i++) {
      const el = document.createElement('div');
      el.className = 'nb-pop';
      el.style.display = 'none';
      layer.appendChild(el);
      this.popEls.push({ el, until: 0 });
    }
    const App = () => <HudView s={this.state.value} />;
    render(<App />, ui);
  }

  set(next: Partial<HudState>): void {
    this.state.value = { ...this.state.value, ...next };
  }

  get overlay(): Overlay {
    return this.state.value.overlay;
  }

  setPaused(paused: boolean): void {
    this.host.classList.toggle('is-paused', paused);
  }

  /** Name tags over the runners, in stage px. */
  tags(list: { name: string; color: string; x: number; y: number; dim: boolean }[]): void {
    for (let i = 0; i < this.tagEls.length; i++) {
      const el = this.tagEls[i]!;
      const t = list[i];
      if (!t) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      if (el.style.display === 'none') el.style.display = '';
      if (el.textContent !== t.name) el.textContent = t.name;
      el.style.borderColor = t.color;
      el.style.opacity = t.dim ? '0.4' : '1';
      el.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
    }
  }

  /** A short floating text at a stage point (e.g. "NYARIS! +2"). */
  pop(text: string, x: number, y: number, tone: 'yellow' | 'red' | 'green'): void {
    const slot = this.popEls[this.popIdx]!;
    this.popIdx = (this.popIdx + 1) % this.popEls.length;
    const el = slot.el;
    el.textContent = text;
    el.className = `nb-pop is-${tone}`;
    el.style.display = '';
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    // Restart the CSS animation.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    slot.until = performance.now() + 1100;
  }

  /** Hide finished pop-ups (call each frame). */
  tidy(): void {
    const now = performance.now();
    for (const p of this.popEls)
      if (p.until && now > p.until) {
        p.until = 0;
        p.el.style.display = 'none';
      }
  }
}
