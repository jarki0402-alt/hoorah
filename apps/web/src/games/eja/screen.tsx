/**
 * Main-screen renderer for Juara Eja: an editorial page of cream paper and ink. One big
 * definition, a "Dengar lagi" button, the letter boxes with the word's length, one clock, the
 * language badge and a row of avatars that tick when they lock in. Reads the match on every
 * `version` bump; the clock writes to the DOM from the frame bus so the tree never re-renders
 * every frame. Animations touch transform and opacity only (weak Smart TV browsers).
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { THUMBS } from '../../controller/thumbs/eja';
import { svgUrl } from '../../shared/art/svg';
import { Avatar, Icon } from '../../shared/ui';
import { type EjaScene, LIVES, type SceneSeat } from './logic';
import { LANG_NAME, LANG_TAG, NEAR_TEXT, STR, TIER_NAME } from './strings';

/** Per-frame callbacks, driven by the driver's loop. */
export class FrameBus {
  private readonly subs = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    fn();
    return () => this.subs.delete(fn);
  }

  emit(): void {
    for (const fn of this.subs) fn();
  }
}

/** The part of a player card the page draws (a mirror screen gets it from the Host's state). */
export type SeatInfo = Pick<PlayerInfo, 'id' | 'name' | 'color' | 'look'>;

export interface FinalRecord {
  best: number;
  isNew: boolean;
}

export interface ScreenModel {
  match: EjaScene;
  version: ReadonlySignal<number>;
  frame: FrameBus;
  /** Show the first letter (no voice on this device, or speech was blocked). */
  hint: ReadonlySignal<boolean>;
  /** The voice is reading the word right now. */
  speaking: ReadonlySignal<boolean>;
  record: ReadonlySignal<FinalRecord | null>;
  hostId: () => number | null;
  info(id: number): SeatInfo | undefined;
  replay(): void;
}

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
/** Delay between letters flipping at the reveal (matches TIMING.revealMs pacing). */
const FLIP_STEP_MS = 110;

function Clock({ model }: { model: ScreenModel }) {
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      model.frame.subscribe(() => {
        const m = model.match;
        const running = m.phase === 'spell';
        const total = m.phaseLength() || 1;
        const left = running ? m.msLeft() : total;
        const s = Math.ceil(left / 1000);
        if (arc.current) arc.current.style.strokeDashoffset = String(RING_C * (1 - left / total));
        const text = running ? String(s) : String(Math.round(total / 1000));
        if (num.current && num.current.textContent !== text) num.current.textContent = text;
        wrap.current?.classList.toggle('is-low', running && s <= 5);
        wrap.current?.classList.toggle('is-idle', !running);
      }),
    [model],
  );
  return (
    <div ref={wrap} class="ej-clock">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={RING_R} class="ej-clock-track" />
        <circle
          ref={arc}
          cx="64"
          cy="64"
          r={RING_R}
          class="ej-clock-arc"
          style={{ strokeDasharray: String(RING_C) }}
        />
      </svg>
      <div ref={num} class="ej-clock-num" />
    </div>
  );
}

function Header({ model }: { model: ScreenModel }) {
  const m = model.match;
  const inWord = m.phase === 'intro' || m.phase === 'spell' || m.phase === 'reveal';
  return (
    <div class="ej-head">
      <div class="ej-logo">{STR.logo}</div>
      {inWord && (
        <>
          <div class="ej-chip">{m.solo ? STR.soloChip(m.index + 1) : STR.wordChip(m.index + 1, m.total)}</div>
          <div class={`ej-chip is-tier t${m.tier}`}>{TIER_NAME[m.tier]}</div>
          {m.multiplier > 1 && <div class="ej-chip is-double">{STR.doubleChip}</div>}
        </>
      )}
      <div class="ej-head-right">
        {m.phase !== 'setup' && (
          <div class="ej-lang" title={LANG_NAME[m.lang]}>
            {LANG_TAG[m.lang]}
          </div>
        )}
        {inWord && <Clock model={model} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ setup */

function Setup({ model }: { model: ScreenModel }) {
  const m = model.match;
  const host = model.hostId();
  const hostName = host !== null ? (model.info(host)?.name ?? 'Host') : 'Host';
  const present = m.roster.filter((s) => s.present).length;
  return (
    <div class="ej-setup">
      <div class="ej-setup-title">{STR.setupTitle}</div>
      <div class="ej-setup-tiles">
        {(['id', 'en'] as const).map((l) => (
          <div key={l} class={`ej-tile ${m.lang === l ? 'is-on' : ''}`}>
            <img src={svgUrl(`thumb:eja:lang-${l}`, THUMBS[`lang-${l}`]!)} alt="" width={320} height={240} />
            <div class="ej-tile-name">{LANG_NAME[l]}</div>
            <div class="ej-tile-sub">{STR.langSub[l]}</div>
          </div>
        ))}
      </div>
      <div class="ej-setup-note">
        {present <= 1 ? STR.setupSolo : STR.setupGroup(m.words)} · {STR.setupHint(hostName)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the word */

// Components that read a signal skip re-rendering on unchanged props (@preact/signals), so each
// one also reads `version` to follow the match.
function Boxes({ model }: { model: ScreenModel }) {
  model.version.value;
  const m = model.match;
  const word = m.word?.word ?? '';
  const open = m.phase === 'reveal';
  const hint = model.hint.value && !open;
  const size = word.length > 11 ? 'is-xs' : word.length > 8 ? 'is-sm' : '';
  return (
    <div class={`ej-boxes ${size} ${open ? 'is-open' : ''}`}>
      {[...word].map((ch, i) => {
        const shown = open || (hint && i === 0);
        return (
          <span
            key={`${m.index}:${i}`}
            class={`ej-box ${shown ? 'is-shown' : ''} ${hint && i === 0 ? 'is-hint' : ''}`}
            style={open ? { animationDelay: `${i * FLIP_STEP_MS}ms` } : undefined}
          >
            {shown ? ch.toUpperCase() : ''}
          </span>
        );
      })}
    </div>
  );
}

function Word({ model }: { model: ScreenModel }) {
  model.version.value;
  const m = model.match;
  const w = m.word;
  if (!w) return null;
  const hint = model.hint.value;
  const open = m.phase === 'reveal';
  return (
    <div class={`ej-word ${m.phase === 'intro' ? 'is-intro' : ''}`} key={m.index}>
      <div class="ej-def">{w.def}</div>
      <div class="ej-tools">
        <button
          type="button"
          class={`ej-replay ${model.speaking.value ? 'is-speaking' : ''}`}
          onClick={() => model.replay()}
        >
          <Icon name="volume" size={26} stroke={2.6} />
          {STR.replay}
        </button>
        <div class="ej-count">
          {open
            ? STR.answerWas
            : hint
              ? `${STR.letters(w.word.length)} · ${STR.firstLetter}`
              : STR.letters(w.word.length)}
        </div>
      </div>
      <Boxes model={model} />
      <div class="ej-under">
        {m.phase === 'intro' ? STR.introHint : m.phase === 'spell' ? STR.typing : ''}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ players */

function PlayerChip({ model, s }: { model: ScreenModel; s: SceneSeat }) {
  const m = model.match;
  const info = model.info(s.id);
  if (!info) return null;
  const reveal = m.phase === 'reveal' && s.inWord;
  let state = 'idle';
  if (!s.inWord && m.phase !== 'setup') state = 'watch';
  else if (m.phase === 'spell' && s.answer !== null) state = 'locked';
  else if (reveal) state = s.verdict;
  const face = reveal ? (s.verdict === 'correct' ? 'happy' : s.verdict === 'near' ? 'wow' : 'sad') : 'happy';
  return (
    <div class={`ej-player is-${state} ${s.present ? '' : 'is-away'}`}>
      <div class="ej-player-av">
        <Avatar look={info.look} ring={info.color} size={58} face={face} />
        {state === 'locked' && <span class="ej-tick">✓</span>}
        {reveal && s.verdict === 'correct' && <span class="ej-tick is-good">✓</span>}
        {reveal && s.verdict !== 'correct' && <span class="ej-tick is-bad">✕</span>}
      </div>
      <div class="ej-player-name">{info.name}</div>
      {reveal && s.gained > 0 && <div class="ej-player-gain">+{s.gained}</div>}
      {reveal && s.verdict === 'near' && s.near && <div class="ej-player-near">{NEAR_TEXT[s.near]}</div>}
      {!reveal && m.phase !== 'setup' && (
        <div class="ej-player-meta">
          {s.lives <= 0 ? (
            <span class="ej-practice">{STR.practiceTag}</span>
          ) : (
            <span class="ej-lives" role="img" aria-label={STR.livesLeft(s.lives)}>
              {Array.from({ length: LIVES }, (_, i) => (
                <i key={i} class={i < s.lives ? 'on' : ''} />
              ))}
            </span>
          )}
          {m.solo ? <b>{STR.streak(s.streak)}</b> : <b>{s.score}</b>}
        </div>
      )}
    </div>
  );
}

function Players({ model }: { model: ScreenModel }) {
  const m = model.match;
  const seats = m.roster.filter((s) => s.present || s.inWord);
  return (
    <div class={`ej-players ${seats.length > 6 ? 'is-dense' : ''}`}>
      {seats.map((s) => (
        <PlayerChip key={s.id} model={model} s={s} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ final */

function Final({ model }: { model: ScreenModel }) {
  model.version.value;
  const m = model.match;
  const rows = m.standings().filter((r) => r.seat.inWord || r.seat.score > 0 || r.seat.stats.correct > 0);
  const rec = model.record.value;
  if (m.solo) {
    const me = rows[0]?.seat ?? m.roster[0];
    return (
      <div class="ej-final">
        <div class="ej-final-eyebrow">{STR.finalSolo}</div>
        <div class="ej-final-big">{STR.finalBestStreak(me?.stats.bestStreak ?? 0)}</div>
        {rec && (
          <div class={`ej-final-rec ${rec.isNew ? 'is-new' : ''}`}>
            {rec.isNew ? STR.finalRecordNew : STR.finalRecord(rec.best)}
          </div>
        )}
        <div class="ej-final-sub">{STR.finalKamus(me?.spelled.length ?? 0)}</div>
      </div>
    );
  }
  const top = rows.filter((r) => r.rank === 1).map((r) => model.info(r.seat.id)?.name ?? '?');
  return (
    <div class="ej-final">
      <div class="ej-final-eyebrow">
        {top.length === 1 ? STR.resultWinner(top[0]!) : top.length > 1 ? STR.resultTie(top) : STR.finalTitle}
      </div>
      <div class="ej-final-list">
        {rows.slice(0, 8).map((r) => {
          const info = model.info(r.seat.id);
          if (!info) return null;
          return (
            <div key={r.seat.id} class={`ej-final-row ${r.rank === 1 ? 'is-top' : ''}`}>
              <span class="ej-final-rank">{r.rank}</span>
              <Avatar look={info.look} ring={info.color} size={48} />
              <span class="ej-final-name">{info.name}</span>
              <span class="ej-final-kamus">{STR.finalKamus(r.seat.spelled.length)}</span>
              <span class="ej-final-score">{r.seat.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ root */

export function EjaScreen({ model }: { model: ScreenModel }) {
  model.version.value;
  const m = model.match;
  const inWord = m.phase === 'intro' || m.phase === 'spell' || m.phase === 'reveal';
  return (
    <div class={`ej-root is-${m.phase}`}>
      <div class="ej-paper" aria-hidden="true" />
      <Header model={model} />
      <div class="ej-body">
        {m.phase === 'setup' && <Setup model={model} />}
        {inWord && <Word model={model} />}
        {(m.phase === 'final' || m.phase === 'ended') && <Final model={model} />}
      </div>
      {m.phase !== 'final' && m.phase !== 'ended' && <Players model={model} />}
    </div>
  );
}
