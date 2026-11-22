/**
 * Main-screen renderer for Penyusup: a typographic poster on a black stage under a yellow
 * spotlight. Reads the match on every `version` bump; the clock ring writes to the DOM through
 * refs from the frame bus, so the tree never re-renders 60 times a second. Animations touch
 * transform and opacity only (weak Smart TV browsers).
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { THUMBS } from '../../controller/thumbs/penyusup';
import type { Face } from '../../shared/art/fruits';
import { svgUrl } from '../../shared/art/svg';
import { Avatar } from '../../shared/ui';
import { MAX_VOTES, type PenyusupMatch, type Seat } from './logic';
import { LANG_NAME, MODE_NAME, ROLE_NAME, STR } from './strings';

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

export interface ScreenModel {
  match: PenyusupMatch;
  version: ReadonlySignal<number>;
  frame: FrameBus;
  hostId: () => number | null;
  info(id: number): PlayerInfo | undefined;
}

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

/* ------------------------------------------------------------------ small parts */

function Clock({ model, big = false }: { model: ScreenModel; big?: boolean }) {
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      model.frame.subscribe(() => {
        const m = model.match;
        const total = m.phaseLength() || 1;
        const left = m.msLeft();
        const s = Math.ceil(left / 1000);
        if (arc.current) arc.current.style.strokeDashoffset = String(RING_C * (1 - left / total));
        if (num.current && num.current.textContent !== String(s)) num.current.textContent = String(s);
        wrap.current?.classList.toggle('is-low', s <= 5);
      }),
    [model],
  );
  const total = Math.round(model.match.phaseLength() / 1000);
  return (
    <div ref={wrap} class={`ps-clock ${big ? 'is-big' : ''}`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={RING_R} class="ps-clock-track" />
        <circle
          ref={arc}
          cx="64"
          cy="64"
          r={RING_R}
          class="ps-clock-arc"
          style={{ strokeDasharray: String(RING_C) }}
        />
      </svg>
      <div class="ps-clock-in">
        <div ref={num} class="ps-clock-num" />
        <div class="ps-clock-of">{STR.secondsOf(total)}</div>
      </div>
    </div>
  );
}

type TokenState = 'idle' | 'now' | 'done' | 'out' | 'ok' | 'watch';

function Token({ info, n, state, face }: { info: PlayerInfo; n: number; state: TokenState; face?: Face }) {
  return (
    <div class={`ps-token is-${state}`}>
      <span class="ps-token-n">{n}</span>
      <Avatar
        fruit={info.fruit}
        ring={info.color}
        size={46}
        face={face ?? (state === 'out' ? 'sad' : 'happy')}
      />
      <span class="ps-token-name">{info.name}</span>
      {state === 'ok' && <span class="ps-token-tick">✓</span>}
    </div>
  );
}

function Strip({ model }: { model: ScreenModel }) {
  const m = model.match;
  const seats =
    m.phase === 'setup' ? m.roster.filter((s) => s.present) : m.roster.filter((s) => s.inRound || s.present);
  const speaker = m.speaker;
  const spoken = new Set(m.spoken);
  return (
    <div class={`ps-strip ${seats.length > 9 ? 'is-dense' : ''}`}>
      {seats.map((s, i) => {
        const info = model.info(s.id);
        if (!info) return null;
        let state: TokenState = 'idle';
        if (m.phase !== 'setup' && !s.inRound) state = 'watch';
        else if (m.phase !== 'setup' && !s.alive) state = 'out';
        else if (m.phase === 'deal' && s.ready) state = 'ok';
        else if (m.phase === 'vote' && s.locked) state = 'ok';
        else if (speaker === s.id) state = 'now';
        else if (spoken.has(s.id)) state = 'done';
        return <Token key={s.id} info={info} n={i + 1} state={state} />;
      })}
    </div>
  );
}

function Header({ model }: { model: ScreenModel }) {
  const m = model.match;
  const n = m.phase === 'setup' ? m.roster.filter((s) => s.present).length : m.table.length;
  return (
    <div class="ps-head">
      <div class="ps-logo">{STR.logo}</div>
      {m.round >= 0 && m.phase !== 'final' && m.phase !== 'ended' && (
        <div class={`ps-chip ${m.isFinal ? 'is-final' : ''}`}>
          {m.isFinal ? (
            STR.finalChip
          ) : (
            <>
              {STR.roundChip} <b>{m.round + 1}</b> <span>/ {m.rounds}</span>
            </>
          )}
        </div>
      )}
      {m.phase !== 'setup' && (
        <div class="ps-chip is-ghost">
          {STR.modeChip} <b>{MODE_NAME[m.settings.mode].toUpperCase()}</b>
        </div>
      )}
      {(m.phase === 'clue' || m.phase === 'vote' || m.phase === 'tally') && m.votes > 0 && (
        <div class="ps-chip is-ghost">{STR.voteNo(m.votes + (m.phase === 'tally' ? 0 : 1), MAX_VOTES)}</div>
      )}
      <div class="ps-foot">{STR.footer(n, LANG_NAME[m.settings.lang].replace('Bahasa ', ''))}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ phases */

function SetupPoster({ model }: { model: ScreenModel }) {
  const m = model.match;
  const host = model.hostId();
  const hostName = host !== null ? (model.info(host)?.name ?? 'Host') : 'Host';
  // Each tile shows the picture of the current pick, the same one the phones show.
  const tiles: { k: string; v: string; on: boolean; art: string }[] = [
    {
      k: STR.setupLang,
      v: LANG_NAME[m.settings.lang],
      on: m.step === 'lang',
      art: `lang-${m.settings.lang}`,
    },
    {
      k: STR.setupMode,
      v: MODE_NAME[m.settings.mode],
      on: m.step === 'mode',
      art: `mode-${m.settings.mode}`,
    },
    {
      k: STR.setupKosong,
      v: m.settings.kosong ? STR.yes : STR.no,
      on: m.step === 'kosong',
      art: m.settings.kosong ? 'kosong-on' : 'kosong-off',
    },
  ];
  return (
    <div class="ps-center ps-setup">
      <div class="ps-eyebrow">{STR.setupEyebrow}</div>
      <div class="ps-poster-title">{STR.logo}</div>
      <div class="ps-lead">{STR.setupLead}</div>
      <div class="ps-tiles">
        {tiles.map((t) => (
          <div key={t.k} class={`ps-tile ${t.on ? 'is-on' : ''}`}>
            {THUMBS[t.art] && (
              <img
                class="ps-tile-img"
                src={svgUrl(`ps-thumb:${t.art}`, THUMBS[t.art]!)}
                alt=""
                draggable={false}
              />
            )}
            <div class="ps-tile-k">{t.k}</div>
            <div class="ps-tile-v">{t.v}</div>
          </div>
        ))}
      </div>
      <div class="ps-note">{STR.setupHostPicks(hostName)}</div>
    </div>
  );
}

function Deal({ model }: { model: ScreenModel }) {
  const m = model.match;
  const seen = m.table.filter((s) => s.ready).length;
  return (
    <div class="ps-center ps-deal">
      <div class="ps-fancard" aria-hidden="true">
        <span>?</span>
      </div>
      <div class="ps-deal-text">
        <div class="ps-eyebrow">{STR.dealEyebrow}</div>
        <div class="ps-big">{STR.dealTitle}</div>
        <div class="ps-lead">{STR.dealBody}</div>
        <div class="ps-count">{STR.dealReady(seen, m.table.length)}</div>
      </div>
    </div>
  );
}

function names(model: ScreenModel, ids: number[]): string {
  return ids.map((id) => model.info(id)?.name ?? '?').join(', ');
}

function ClueTurn({ model }: { model: ScreenModel }) {
  const m = model.match;
  const id = m.speaker;
  const info = id !== null ? model.info(id) : undefined;
  const typed = m.settings.mode === 'ketik';
  const shown = m.lastClue;
  const up = m.upcoming;
  return (
    <div class="ps-center ps-turn">
      <div class="ps-turn-main">
        <div class="ps-eyebrow">{STR.turnEyebrow}</div>
        <div key={id ?? 0} class="ps-name" style={{ color: info?.color ?? '#FFC928' }}>
          {(info?.name ?? '').toUpperCase()}
        </div>
        {shown ? (
          <div class="ps-shown">
            <div class="ps-shown-k">{STR.turnShown}</div>
            <div class={`ps-shown-v ${shown.text ? '' : 'is-silent'}`}>{shown.text || STR.turnSilent}</div>
          </div>
        ) : (
          <>
            <div class="ps-giving">{STR.turnGiving}</div>
            <div class="ps-lead">{typed ? STR.turnTyped : STR.turnSpoken}</div>
          </>
        )}
        <div class="ps-order">
          {m.spoken.length > 0 && (
            <span>
              <b class="ps-order-k">{STR.doneList}</b> {names(model, m.spoken)}
            </span>
          )}
          {up.length > 0 && (
            <span>
              <b class="ps-order-k">{STR.nextUp}</b> {model.info(up[0]!)?.name ?? ''}
            </span>
          )}
          {m.circuits > 1 && <span>{STR.circuitNote(m.circuit + 1, m.circuits)}</span>}
        </div>
      </div>
      <div class="ps-turn-side">
        {!shown && <Clock model={model} big />}
        {typed && m.clueWall.length > 0 && <ClueWall model={model} />}
      </div>
    </div>
  );
}

function ClueWall({ model }: { model: ScreenModel }) {
  const m = model.match;
  const cards = m.clueWall.slice(-8);
  return (
    <div class="ps-wall">
      <div class="ps-wall-title">{STR.wallTitle}</div>
      {cards.map((c, i) => {
        const info = model.info(c.id);
        return (
          <div key={`${c.id}-${i}`} class="ps-wall-card" style={{ borderColor: info?.color }}>
            <span class="ps-wall-name">{info?.name}</span>
            <span class={`ps-wall-clue ${c.text ? '' : 'is-silent'}`}>{c.text || STR.turnSilent}</span>
          </div>
        );
      })}
    </div>
  );
}

function Vote({ model }: { model: ScreenModel }) {
  const m = model.match;
  const done = m.voters.length - m.votersLeft.length;
  return (
    <div class="ps-center ps-vote">
      <div class="ps-vote-text">
        <div class="ps-eyebrow">{STR.voteEyebrow}</div>
        <div class="ps-big">{STR.voteTitleA}</div>
        <div class="ps-big is-yellow">{STR.voteTitleB}</div>
        <div class="ps-lead">{STR.voteBody}</div>
        <div class="ps-count">{STR.voteLocked(done, m.voters.length)}</div>
      </div>
      <Clock model={model} big />
    </div>
  );
}

function TallyView({ model }: { model: ScreenModel }) {
  const m = model.match;
  const t = m.tally;
  if (!t) return null;
  const head =
    t.counts.length === 0
      ? STR.tallyNone
      : t.tie
        ? STR.tallyTie
        : STR.tallyOut(model.info(t.out ?? 0)?.name ?? '');
  return (
    <div class="ps-center ps-tally">
      <div class="ps-eyebrow">{STR.tallyTitle}</div>
      <div class="ps-tally-row">
        {t.counts.map((c, i) => {
          const info = model.info(c.id);
          if (!info) return null;
          return (
            <div
              key={c.id}
              class={`ps-tally-col ${c.id === t.out ? 'is-out' : ''}`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div class="ps-tally-votes">
                {c.from.map((f) => {
                  const fi = model.info(f);
                  return fi ? <Avatar key={f} fruit={fi.fruit} ring={fi.color} size={30} /> : null;
                })}
              </div>
              <div class="ps-tally-n">{c.votes}</div>
              <Avatar
                fruit={info.fruit}
                ring={info.color}
                size={72}
                face={c.id === t.out ? 'wow' : 'happy'}
              />
              <div class="ps-tally-name">{info.name}</div>
            </div>
          );
        })}
      </div>
      <div class={`ps-verdict ${t.out !== null ? 'is-out' : ''}`}>{head}</div>
    </div>
  );
}

function Reveal({ model }: { model: ScreenModel }) {
  const m = model.match;
  const id = m.tally?.out ?? null;
  const s = id !== null ? m.seat(id) : undefined;
  const info = id !== null ? model.info(id) : undefined;
  if (!s || !info) return null;
  return (
    <div class="ps-center ps-reveal">
      <div class="ps-eyebrow">{STR.revealEyebrow}</div>
      <div class="ps-flip">
        <div class="ps-flip-in">
          <div class="ps-flip-back">?</div>
          <div class={`ps-flip-face is-${s.role}`}>
            <Avatar
              fruit={info.fruit}
              ring={info.color}
              size={84}
              face={s.role === 'warga' ? 'sad' : 'wow'}
            />
            <div class="ps-flip-name">{info.name}</div>
            <div class="ps-flip-was">{STR.revealWas}</div>
            <div class="ps-flip-role">{ROLE_NAME[s.role].toUpperCase()}</div>
            <div class="ps-flip-word">
              <span>{STR.revealWordLabel}</span>
              {s.word ? s.word.toUpperCase() : STR.revealNoWord}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Guess({ model }: { model: ScreenModel }) {
  const m = model.match;
  const id = m.tally?.out ?? 0;
  const info = model.info(id);
  const g = m.guessed;
  return (
    <div class="ps-center ps-guess">
      <div class="ps-eyebrow">{STR.guessEyebrow}</div>
      <div class="ps-big">{STR.guessTitle(info?.name ?? '')}</div>
      {g ? (
        <div class={`ps-guess-result ${g.correct ? 'is-right' : 'is-wrong'}`}>
          {g.text && <div class="ps-guess-word">{g.text}</div>}
          <div>{g.correct ? STR.guessRight : g.text ? STR.guessWrong : STR.guessNone}</div>
        </div>
      ) : (
        <>
          <div class="ps-lead">{STR.guessBody}</div>
          <Clock model={model} big />
        </>
      )}
    </div>
  );
}

function RoundEnd({ model }: { model: ScreenModel }) {
  const m = model.match;
  const o = m.outcome;
  const clock = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      model.frame.subscribe(() => {
        const s = Math.ceil(model.match.msLeft() / 1000);
        const text = model.match.round + 1 >= model.match.rounds ? STR.finalSoon(s) : STR.nextRound(s);
        if (clock.current && clock.current.textContent !== text) clock.current.textContent = text;
      }),
    [model],
  );
  if (!o) return null;
  const rows = m.table.slice().sort((a, b) => b.gained - a.gained || a.joinIndex - b.joinIndex);
  return (
    <div class="ps-center ps-end">
      <div class={`ps-side is-${o.side}`}>{STR.sideTitle[o.side]}</div>
      <div class="ps-lead">{STR.reasonText[o.reason]}</div>
      <div class="ps-words">
        <div class="ps-word-card">
          <span>{STR.wordWarga}</span>
          {o.wargaWord.toUpperCase()}
        </div>
        <div class="ps-word-card is-beda">
          <span>{STR.wordBeda}</span>
          {o.bedaWord.toUpperCase()}
        </div>
      </div>
      <div class={`ps-gains ${rows.length > 8 ? 'is-dense' : ''}`}>
        {rows.map((s) => (
          <GainRow key={s.id} seat={s} info={model.info(s.id)} />
        ))}
      </div>
      <span ref={clock} class="ps-note" />
    </div>
  );
}

function GainRow({ seat, info }: { seat: Seat; info: PlayerInfo | undefined }) {
  if (!info) return null;
  return (
    <div class={`ps-gain is-${seat.role}`}>
      <Avatar fruit={info.fruit} ring={info.color} size={34} />
      <span class="ps-gain-name">{info.name}</span>
      <span class="ps-gain-role">{ROLE_NAME[seat.role]}</span>
      <span class="ps-gain-pts">{STR.gained(seat.gained)}</span>
    </div>
  );
}

function Final({ model }: { model: ScreenModel }) {
  const rows = model.match.standings().slice(0, 8);
  return (
    <div class="ps-center ps-final">
      <div class="ps-big is-yellow">{STR.finalTitle}</div>
      <div class="ps-podium">
        {rows.map(({ seat, rank }) => {
          const info = model.info(seat.id);
          if (!info) return null;
          return (
            <div key={seat.id} class={`ps-pod ${rank === 1 ? 'is-top' : ''}`}>
              <span class="ps-pod-rank">{rank}</span>
              <Avatar
                fruit={info.fruit}
                ring={info.color}
                size={rank === 1 ? 56 : 40}
                face={rank === 1 ? 'wow' : 'happy'}
              />
              <span class="ps-pod-name">{info.name}</span>
              <span class="ps-pod-pts">{seat.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ root */

export function PenyusupScreen({ model }: { model: ScreenModel }) {
  void model.version.value;
  const m = model.match;
  let body = null;
  switch (m.phase) {
    case 'setup':
      body = <SetupPoster model={model} />;
      break;
    case 'deal':
      body = <Deal model={model} />;
      break;
    case 'clue':
      body = <ClueTurn model={model} />;
      break;
    case 'vote':
      body = <Vote model={model} />;
      break;
    case 'tally':
      body = <TallyView model={model} />;
      break;
    case 'reveal':
      body = <Reveal model={model} />;
      break;
    case 'guess':
      body = <Guess model={model} />;
      break;
    case 'roundEnd':
      body = <RoundEnd model={model} />;
      break;
    case 'final':
    case 'ended':
      body = <Final model={model} />;
      break;
  }
  const spot = m.phase === 'clue' || m.phase === 'reveal' || m.phase === 'guess';
  const showStrip =
    m.phase !== 'roundEnd' && m.phase !== 'final' && m.phase !== 'ended' && m.phase !== 'tally';
  return (
    <div class={`ps-root phase-${m.phase}`}>
      <div class={`ps-spot ${spot ? 'is-on' : ''}`} aria-hidden="true" />
      <Header model={model} />
      <div class="ps-body" key={`${m.phase}-${m.round}`}>
        {body}
      </div>
      {showStrip && <Strip model={model} />}
    </div>
  );
}
