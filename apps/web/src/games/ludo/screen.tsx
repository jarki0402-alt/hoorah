/**
 * Main-screen view: the board with its pawn layer in the middle, the turn card with the dice on
 * the left, the colours on the right. Stage px; the stage is 1280x720 on 16:9 and grows wider
 * or taller on other screens, the board stays centred and the panels follow it.
 */
import type { Signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Avatar } from '../../shared/ui';
import { boardSvg, pawnSvg, VIEW, VIEW_PAD } from './board-art';
import { SWATCH } from './colors';
import { layoutPawns } from './geometry';
import { BASE, type ColorId, HOME } from './logic';
import { type Banner, type HudModel, type LudoStore, RING_LEN, RING_R, type TeamCard } from './store';
import { STR } from './strings';

export interface StageSize {
  w: number;
  h: number;
}

const PANEL_W = 264;
const EDGE = 24;

export interface Layout {
  s: number;
  left: number;
  top: number;
  /** Tall screens (4:3 tablets): one panel column on the right, the board grows. */
  tall: boolean;
}

export function boardLayout(size: StageSize): Layout {
  const wide = Math.floor(Math.min(size.h - 40, size.w - 2 * (PANEL_W + EDGE * 2)));
  const tallS = Math.floor(Math.min(size.h - 48, size.w - PANEL_W - EDGE * 4));
  if (tallS > wide + 100) {
    const left = Math.round(EDGE * 1.5 + (size.w - PANEL_W - EDGE * 4 - tallS) / 2);
    return { s: tallS, left, top: Math.round((size.h - tallS) / 2), tall: true };
  }
  return {
    s: wide,
    left: Math.round((size.w - wide) / 2),
    top: Math.round((size.h - wide) / 2),
    tall: false,
  };
}

/* ------------------------------------------------------------------ dice */

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({ value }: { value: number }) {
  const on = PIPS[value] ?? [];
  return (
    <div class="ld-die-face">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} class={on.includes(i) ? `ld-pip${value === 1 ? ' is-one' : ''}` : 'ld-pip is-off'} />
      ))}
    </div>
  );
}

function Dice({ value, rolling, rollId }: { value: number | null; rolling: boolean; rollId: number }) {
  const [face, setFace] = useState(value ?? 6);
  useEffect(() => {
    if (!rolling) {
      if (value !== null) setFace(value);
      return;
    }
    let last = face;
    const t = window.setInterval(() => {
      let f = 1 + Math.floor(Math.random() * 6);
      if (f === last) f = (f % 6) + 1;
      last = f;
      setFace(f);
    }, 85);
    return () => window.clearInterval(t);
  }, [rolling, value, rollId]);
  return (
    <div
      class={`ld-die${rolling ? ' is-rolling' : ''}${value === null && !rolling ? ' is-idle' : ''}`}
      key={rollId}
    >
      <DieFace value={rolling ? face : (value ?? face)} />
    </div>
  );
}

/* ------------------------------------------------------------------ board */

function Board({ store, m, s }: { store: LudoStore; m: HudModel; s: number }) {
  const art = useMemo(() => boardSvg(m.colors, m.pawnsPer), [m.colors.join(','), m.pawnsPer]);
  const cell = s / VIEW;
  store.cell = cell;
  store.origin = VIEW_PAD * cell;
  const refs = store.pawns.value;
  const placed = layoutPawns(refs, m.pawnsPer);
  const legal = new Set(m.legal);
  const turnTeam = m.turn?.team ?? -1;
  const w = cell * 0.84;
  return (
    <>
      <div class="ld-board-art" dangerouslySetInnerHTML={{ __html: art }} />
      {m.turn && (
        <div
          class="ld-base-glow"
          key={`${m.turn.team}`}
          style={{
            left: store.px(m.turn.color === 1 || m.turn.color === 2 ? 9 : 0),
            top: store.px(m.turn.color === 2 || m.turn.color === 3 ? 9 : 0),
            width: cell * 6,
            height: cell * 6,
            ['--glow' as string]: SWATCH[m.turn.color].main,
          }}
        />
      )}
      <div class="ld-pawns">
        {placed.map((p) => {
          const key = `${p.team}-${p.pawn}`;
          const isLegal = legal.has(key);
          return (
            <div
              key={key}
              class={`ld-pawn${isLegal ? ' is-legal' : ''}${p.team === turnTeam ? ' is-turn' : ''}${
                p.progress >= HOME ? ' is-home' : ''
              }`}
              style={{
                width: w,
                height: w * 1.2,
                transform: store.pawnTransform(p.x, p.y, p.scale),
                zIndex: Math.round(p.z * 10) + (isLegal ? 400 : 0),
              }}
              ref={(el) => {
                if (el) store.pawnEls.set(key, el);
                else store.pawnEls.delete(key);
              }}
            >
              {isLegal && <div class="ld-pawn-ring" style={{ borderColor: SWATCH[p.color].main }} />}
              <div class="ld-pawn-body" dangerouslySetInnerHTML={{ __html: pawnArt(p.color, p.pawn) }} />
            </div>
          );
        })}
      </div>
      {store.bursts.value.map((b) => (
        <div
          key={b.id}
          class="ld-burst"
          style={{
            left: store.px(b.x),
            top: store.px(b.y),
            ['--c' as string]: b.color,
            width: cell * 2.4,
            height: cell * 2.4,
          }}
        />
      ))}
    </>
  );
}

const pawnCache = new Map<string, string>();
function pawnArt(color: ColorId, pawn: number): string {
  const k = `${color}-${pawn}`;
  let v = pawnCache.get(k);
  if (!v) {
    v = pawnSvg(color, String(pawn + 1));
    pawnCache.set(k, v);
  }
  return v;
}

/* ------------------------------------------------------------------ panels */

function TurnCard({ store, m }: { store: LudoStore; m: HudModel }) {
  const t = m.turn;
  return (
    <div class="ld-card ld-turn">
      <div class="ld-head">
        <div class="display outline-text ld-logo">{STR.logo}</div>
        <div class="ld-chip">{STR.modeChip(m.pawnsPer)}</div>
      </div>
      {t ? (
        <div
          class="ld-who"
          key={`${t.team}-${t.player.id}-${t.bonus}`}
          style={{ ['--tc' as string]: SWATCH[t.color].main }}
        >
          <Avatar fruit={t.player.fruit} ring={t.player.color} size={58} face={t.bonus ? 'wow' : 'effort'} />
          <div class="ld-who-text">
            <div class={`ld-eyebrow${t.bonus ? ' is-bonus' : ''}`}>{t.bonus ? STR.bonusTurn : STR.turn}</div>
            <div class="ld-name">{t.player.name}</div>
            <div class="ld-color-tag">
              <span class="ld-dot" />
              {STR.color(t.color)}
            </div>
          </div>
          <div
            class="ld-ring"
            ref={(el) => {
              store.ringBox = el;
              store.invalidate();
            }}
          >
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r={RING_R} fill="none" stroke="#2A2B30" stroke-width="5" />
              <circle
                ref={(el) => {
                  store.ringArc = el;
                }}
                class="ld-ring-arc"
                cx="24"
                cy="24"
                r={RING_R}
                fill="none"
                stroke-width="5"
                stroke-linecap="round"
                stroke-dasharray={RING_LEN.toFixed(2)}
                stroke-dashoffset="0"
                transform="rotate(-90 24 24)"
              />
            </svg>
            <div
              class="ld-ring-num"
              ref={(el) => {
                store.ringText = el;
              }}
            />
          </div>
        </div>
      ) : (
        <div class="ld-who">
          <div class="ld-who-text">
            <div class="ld-eyebrow">{m.over ? STR.overEyebrow : STR.turn}</div>
            <div class="ld-name is-wait">{m.over ? STR.overTitle : STR.rulesTitle}</div>
          </div>
        </div>
      )}
      <div class="ld-tray" style={t ? { ['--tc' as string]: SWATCH[t.color].main } : undefined}>
        <Dice value={m.dice} rolling={m.rolling} rollId={m.rollId} />
        {m.six && (
          <div class="ld-six" key={m.rollId}>
            {STR.toastSix}
          </div>
        )}
      </div>
      <div class="ld-hint">{m.hint}</div>
    </div>
  );
}

function Legend() {
  return (
    <div class="ld-card ld-legend">
      <div class="ld-legend-row">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path
            d="M11 1.5 L13.6 8 L20.5 8.4 L15.2 12.8 L17 19.6 L11 15.8 L5 19.6 L6.8 12.8 L1.5 8.4 L8.4 8Z"
            fill="#C9B086"
          />
        </svg>
        <span>{STR.rulesLines[2]}</span>
      </div>
      <div class="ld-legend-row">
        <span class="ld-mini-die">6</span>
        <span>{STR.rulesLines[0]}</span>
      </div>
    </div>
  );
}

function Pips({ t, per }: { t: TeamCard; per: number }) {
  const sorted = [...t.pawns].sort((a, b) => b - a);
  return (
    <div class="ld-pips" aria-hidden="true">
      {Array.from({ length: per }, (_, i) => {
        const p = sorted[i] ?? BASE;
        const cls = p >= HOME ? 'is-home' : p === BASE ? 'is-base' : 'is-out';
        return <span key={i} class={`ld-pip-dot ${cls}`} />;
      })}
    </div>
  );
}

function TeamsPanel({ m }: { m: HudModel }) {
  const many = m.teams.length > 3;
  return (
    <div class={`ld-card ld-teams${many ? ' is-many' : ''}`}>
      {m.teams.map((t) => {
        const sw = SWATCH[t.color];
        const pair = t.members.length > 1;
        return (
          <div
            key={t.index}
            class={`ld-team${t.active ? ' is-active' : ''}${t.winner ? ' is-winner' : ''}`}
            style={{ ['--tc' as string]: sw.main, ['--td' as string]: sw.dark }}
          >
            <div class="ld-team-top">
              <div class="ld-team-avatars">
                {t.members.map((p) => (
                  <Avatar
                    key={p.id}
                    fruit={p.fruit}
                    ring={sw.main}
                    size={pair ? 34 : 42}
                    dim={!p.connected}
                    face={t.winner ? 'wow' : 'happy'}
                  />
                ))}
              </div>
              <div class="ld-team-text">
                <div class="ld-team-name">
                  {pair ? STR.team(t.color) : (t.members[0]?.name ?? STR.unknownPlayer)}
                </div>
                <div class="ld-team-sub">
                  {pair
                    ? t.members.map((p) => p.name).join(' & ')
                    : t.members[0]?.connected === false
                      ? STR.offline
                      : STR.color(t.color)}
                </div>
              </div>
            </div>
            <div class="ld-team-bottom">
              <Pips t={t} per={m.pawnsPer} />
              <div class="ld-team-home">{STR.homeStat(t.home, m.pawnsPer)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ banners */

function BannerView({ b }: { b: Banner }) {
  if (b.kind === 'intro') {
    return (
      <div class="ld-banner ld-intro" key={b.key}>
        <div class="display outline-text ld-banner-title">{STR.rulesTitle}</div>
        <ul class="ld-rules">
          {STR.rulesLines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {b.teams && <div class="ld-banner-note">{STR.teamsNote}</div>}
        {b.first && <div class="ld-banner-first">{b.first}</div>}
      </div>
    );
  }
  return (
    <div class="ld-banner ld-finale" key={b.key} style={{ ['--tc' as string]: SWATCH[b.color].main }}>
      <div class="ld-finale-avatars">
        {b.winners.map((p) => (
          <Avatar key={p.id} fruit={p.fruit} ring={SWATCH[b.color].main} size={104} face="wow" />
        ))}
      </div>
      <div class="display outline-text ld-banner-title">{b.title}</div>
      <div class="ld-banner-sub">{b.sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ root */

export function LudoScreen({ store, size }: { store: LudoStore; size: Signal<StageSize> }) {
  const m = store.model.value;
  const sz = size.value;
  const r = boardLayout(sz);
  const toast = store.toast.value;
  const board = (
    <div class="ld-board" style={{ left: r.left, top: r.top, width: r.s, height: r.s }}>
      <Board store={store} m={m} s={r.s} />
      {toast && (
        <div class={`ld-toast is-${toast.tone}`} key={toast.id}>
          <div class="display outline-text ld-toast-text">{toast.text}</div>
          {toast.sub && <div class="ld-toast-sub">{toast.sub}</div>}
        </div>
      )}
    </div>
  );
  const banner = m.banner && (
    <div class="ld-banner-host" style={{ left: r.left, top: r.top, width: r.s, height: r.s }}>
      <BannerView b={m.banner} />
    </div>
  );
  if (r.tall) {
    return (
      <div class={`ld-root${store.paused.value ? ' is-paused' : ''}`}>
        {board}
        <div class="ld-side" style={{ top: r.top, left: sz.w - PANEL_W - EDGE * 1.5 }}>
          <TurnCard store={store} m={m} />
          <TeamsPanel m={m} />
          <Legend />
        </div>
        {banner}
      </div>
    );
  }
  const side = { top: r.top, height: r.s };
  return (
    <div class={`ld-root${store.paused.value ? ' is-paused' : ''}`}>
      <div class="ld-side ld-left" style={{ ...side, left: Math.max(EDGE, r.left - PANEL_W - EDGE * 1.5) }}>
        <TurnCard store={store} m={m} />
        <Legend />
      </div>
      {board}
      <div
        class="ld-side ld-right"
        style={{ ...side, left: Math.min(sz.w - PANEL_W - EDGE, r.left + r.s + EDGE * 1.5) }}
      >
        <TeamsPanel m={m} />
      </div>
      {banner}
    </div>
  );
}
