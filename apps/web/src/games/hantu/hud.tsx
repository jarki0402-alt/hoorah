/**
 * DOM HUD over the dark house: place and fright level, the shared goal (keys, fuse, exit) in the
 * middle, the clock and how many residents are still safe, a short centre callout, a feed, and
 * the centre cards (setup mirrored from the Host's phone, the secret role deal, the round end).
 */
import type { Look } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { THUMBS } from '../../controller/thumbs/hantu';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import { MAP_IDS, type MapId } from './maps';
import { FRIGHT_DESC, FRIGHT_NAME, MAP_DESC, MAP_NAME, STR } from './strings';
import type { Fright } from './world';

export interface Who {
  id: number;
  name: string;
  look: Look;
  color: string;
}

export interface EndRow extends Who {
  points: number;
  note: string;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'setup'; step: 'map' | 'fright'; map: MapId; fright: Fright; host: string }
  | { kind: 'reveal'; eyebrow: string; title: string; people: Who[] }
  | {
      kind: 'end';
      eyebrow: string;
      title: string;
      sub: string;
      ghost: string;
      good: boolean;
      rows: EndRow[];
      next: string;
    };

export interface HudState {
  show: boolean;
  place: string;
  fright: string;
  keys: string;
  fuse: string;
  fuseOn: boolean;
  exitOpen: boolean;
  timer: string;
  urgent: boolean;
  safe: string;
  callout: string;
  overlay: Overlay;
}

interface FeedLine {
  key: number;
  text: string;
  at: number;
}

const INITIAL: HudState = {
  show: false,
  place: '',
  fright: '',
  keys: '',
  fuse: '',
  fuseOn: false,
  exitOpen: false,
  timer: '',
  urgent: false,
  safe: '',
  callout: '',
  overlay: { kind: 'none' },
};

function Pic({ k }: { k: string }) {
  const build = THUMBS[k];
  if (!build) return null;
  return <img class="ht-card-img" src={svgUrl(`ht-thumb:${k}`, build)} alt="" draggable={false} />;
}

function OverlayView({ o }: { o: Overlay }) {
  if (o.kind === 'setup') {
    const mapStep = o.step === 'map';
    return (
      <div class="ht-overlay">
        <div class="ht-eyebrow">{STR.menuEyebrow(mapStep ? 1 : 2, 2)}</div>
        <h1 class="ht-title">{mapStep ? STR.menuMapTitle : STR.menuFrightTitle}</h1>
        <div class="ht-cards">
          {mapStep
            ? MAP_IDS.map((id) => (
                <div key={id} class={`ht-card ${o.map === id ? 'on' : ''}`}>
                  <Pic k={`map-${id}`} />
                  <div class="ht-card-name">{MAP_NAME[id]}</div>
                  <div class="ht-card-sub">{MAP_DESC[id]}</div>
                </div>
              ))
            : (['ringan', 'beneran'] as const).map((id) => (
                <div key={id} class={`ht-card ${o.fright === id ? 'on' : ''}`}>
                  <Pic k={`seram-${id}`} />
                  <div class="ht-card-name">{FRIGHT_NAME[id]}</div>
                  <div class="ht-card-sub">{FRIGHT_DESC[id]}</div>
                </div>
              ))}
        </div>
        <div class="ht-foot">{STR.hostPicks(o.host)}</div>
      </div>
    );
  }
  if (o.kind === 'reveal') {
    return (
      <div class="ht-overlay ht-reveal">
        <div class="ht-eyebrow">{o.eyebrow}</div>
        <h1 class="ht-title ht-whisper">{o.title}</h1>
        <div class="ht-faces">
          {o.people.map((p) => (
            <div key={p.id} class="ht-face">
              <Avatar look={p.look} ring={p.color} size={72} face="wow" />
              <span class="ht-q">?</span>
              <span class="ht-face-name">{p.name}</span>
            </div>
          ))}
        </div>
        <div class="ht-foot">{STR.screenRevealSub}</div>
      </div>
    );
  }
  if (o.kind === 'end') {
    return (
      <div class="ht-overlay">
        <div class={`ht-end ${o.good ? 'good' : 'bad'}`}>
          <div class="ht-eyebrow">{o.eyebrow}</div>
          <h1 class="ht-title">{o.title}</h1>
          <div class="ht-end-sub">{o.sub}</div>
          <div class="ht-end-ghost">{o.ghost}</div>
          <div class="ht-rows">
            {o.rows.map((r) => (
              <div key={r.id} class="ht-row">
                <Avatar look={r.look} ring={r.color} size={36} />
                <span class="ht-row-name">{r.name}</span>
                <span class="ht-row-note">{r.note}</span>
                <span class="ht-row-pts">+{r.points}</span>
              </div>
            ))}
          </div>
          <div class="ht-foot">{o.next}</div>
        </div>
      </div>
    );
  }
  return null;
}

function HudView({ hud }: { hud: Hud }) {
  const s = hud.state.value;
  const feed = hud.feed.value;
  return (
    <div class="ht-hud" ref={hud.refs.root}>
      {s.show && (
        <div class="ht-top">
          <div class="ht-pill ht-place">
            <span class="ht-place-name">{s.place}</span>
            <span class="ht-place-fright">{s.fright}</span>
          </div>
          <div class="ht-goal">
            <span class="ht-chip">{s.keys}</span>
            <span class={`ht-chip ${s.fuseOn ? 'on' : ''}`}>
              {STR.hudFuse} {s.fuse}
            </span>
            {s.exitOpen && <span class="ht-chip exit">{STR.hudExitOpen}</span>}
          </div>
          <div class="ht-pill ht-clock">
            <span class="ht-safe">{s.safe}</span>
            <span class={`ht-time ${s.urgent ? 'urgent' : ''}`}>{s.timer}</span>
          </div>
        </div>
      )}
      {s.show && s.callout && (
        <div class="ht-callout" key={s.callout}>
          {s.callout}
        </div>
      )}
      {s.show && (
        <div class="ht-feed">
          {feed.map((f) => (
            <div key={f.key} class="ht-feed-line">
              {f.text}
            </div>
          ))}
        </div>
      )}
      <OverlayView o={s.overlay} />
      <div class="ht-paused-veil" />
    </div>
  );
}

export class Hud {
  readonly state = signal<HudState>(INITIAL);
  readonly feed = signal<FeedLine[]>([]);
  private root: HTMLDivElement | null = null;
  private feedKey = 0;
  readonly refs = {
    root: (el: HTMLDivElement | null) => {
      this.root = el;
    },
  };

  constructor(host: HTMLElement) {
    render(<HudView hud={this} />, host);
  }

  setState(s: HudState): void {
    this.state.value = s;
  }

  setPaused(paused: boolean): void {
    this.root?.classList.toggle('ht-paused', paused);
  }

  pushFeed(text: string, now: number): void {
    this.feed.value = [...this.feed.value, { key: this.feedKey++, text, at: now }].slice(-4);
  }

  /** A far-away screen in long-distance play: the Host's feed lines exactly as they are. */
  setFeed(lines: readonly { key: number; text: string }[]): void {
    const cur = this.feed.value;
    if (
      cur.length === lines.length &&
      cur.every((f, i) => f.key === lines[i]!.key && f.text === lines[i]!.text)
    )
      return;
    this.feed.value = lines.map((l) => ({ key: l.key, text: l.text, at: 0 }));
  }

  pruneFeed(now: number, maxAge: number): void {
    const keep = this.feed.value.filter((f) => now - f.at < maxAge);
    if (keep.length !== this.feed.value.length) this.feed.value = keep;
  }
}
