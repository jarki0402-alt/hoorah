/**
 * Mode Pesta between games (owner 2026-11-23): five lineup slots, the last one the Grand Final.
 * Before every game the next slot rolls through the party games and stops on the one to play,
 * so nobody knows the lineup in advance. After a game the party table comes first (points, what
 * each player just gained, who climbed past whom); after the Grand Final the champion takes the
 * stage. OK plays at once, otherwise the game starts by itself after a short countdown.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { celebrate } from '../../shared/confetti';
import { GAMES, type GameId } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { Avatar, Icon } from '../../shared/ui';
import { FocusButton } from '../components';
import { setFocusMap } from '../nav';
import { lastOvertake, type Party, partyPool, partyStep, type Standing, standings } from '../party';
import {
  connected,
  goHome,
  offer,
  party,
  partyRun,
  players,
  playPartyGame,
  remoteOn,
  sfx,
  startParty,
} from '../store';
import { PARTY } from '../strings';
import { OfferLayer } from './OfferOverlay';
import './party.css';

const SLOT_W = 196;
/** Seconds before the revealed game starts by itself: longer after a game, the table needs reading. */
const START_S = 5;
const NEXT_S = 8;
/** Pause before the roll after a game, so the table is seen first. */
const TABLE_FIRST_MS = 1400;

export function PartyPage() {
  const p = party.value;
  useEffect(() => {
    if (!party.peek()) goHome();
  }, [p]);
  if (!p) return null;
  const step = partyStep(p);
  // A new party, or the next step of this one, starts its own reveal.
  const key = `${partyRun.value}:${step.reveal ?? 'end'}`;
  return (
    <>
      {step.reveal === null ? <Champion key={key} p={p} /> : <Reveal key={key} p={p} slot={step.reveal} />}
      {/* The Hoorah Pass offer: "Pesta lagi" or the next game after the trial ended. */}
      <OfferLayer />
    </>
  );
}

/* ------------------------------------------------------------------ reveal */

type Roll = { phase: 'wait' } | { phase: 'roll'; shown: GameId } | { phase: 'ready' };

function Reveal({ p, slot }: { p: Party; slot: number }) {
  const after = p.scored > 0;
  const total = p.lineup.length;
  const target = p.lineup[slot]!;
  const final = slot === total - 1;
  const [roll, setRoll] = useState<Roll>({ phase: 'wait' });
  const [auto, setAuto] = useState(true);
  // The Hoorah Pass offer owns the remote while open and stops the countdown.
  const offerOpen = offer.value !== null;
  const limit = after ? NEXT_S : START_S;
  const [left, setLeft] = useState(limit);
  const timers = useRef<number[]>([]);

  // The roll: fast flicks through the party games that slow down, then the real one.
  useEffect(() => {
    const pool = partyPool(connected.peek().length, remoteOn.peek()).filter((id) => id !== target);
    const steps = 16;
    let t = after ? TABLE_FIRST_MS : 500;
    const start = Math.floor(Math.random() * Math.max(1, pool.length));
    for (let i = 0; i < steps; i++) {
      t += 60 + i * i * 1.6;
      const last = i === steps - 1;
      const shown = last || pool.length === 0 ? target : pool[(start + i) % pool.length]!;
      timers.current.push(
        window.setTimeout(() => {
          setRoll(last ? { phase: 'ready' } : { phase: 'roll', shown });
          sfx(last ? 'reveal' : 'tick');
        }, t),
      );
    }
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, []);

  const ready = roll.phase === 'ready';
  useEffect(() => {
    if (!ready || !auto) return;
    if (left <= 0) {
      setAuto(false);
      playPartyGame();
      return;
    }
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [ready, auto, left]);

  const readyRef = useRef(ready);
  readyRef.current = ready;
  useEffect(() => {
    if (offerOpen) {
      setAuto(false);
      return;
    }
    return setFocusMap(
      {
        rows: [['party-play', 'party-leave']],
        onOk: (id) => {
          if (id === 'party-leave') return leave();
          // OK during the roll skips straight to the game: the Host may know what they want.
          if (!readyRef.current) for (const t of timers.current) window.clearTimeout(t);
          playPartyGame();
        },
        onBack: leave,
        onMove: () => {
          sfx('tick');
          setAuto(false);
        },
      },
      'party-play',
    );
  }, [offerOpen]);

  const ids = players.value.map((pl) => pl.id);
  const table = standings(p, ids);
  const over = after ? lastOvertake(p, ids) : null;
  const name = (id: number) => players.value.find((pl) => pl.id === id)?.name ?? 'Pemain';

  return (
    <div class="page party-page">
      <header class="party-head">
        <span class="party-eyebrow">{PARTY.label}</span>
        <h1 class="display party-title">{after ? PARTY.afterTitle(p.scored, total) : PARTY.startTitle}</h1>
        {!after && <p class="party-sub">{PARTY.startText(total)}</p>}
        {over && <span class="party-overtake">{PARTY.overtake(name(over.by), name(over.passed))}</span>}
      </header>

      <div class="party-slots">
        {p.lineup.map((id, i) => {
          const done = i < slot;
          const here = i === slot;
          const shown: GameId | null = done
            ? id
            : here
              ? ready
                ? id
                : roll.phase === 'roll'
                  ? roll.shown
                  : null
              : null;
          const isFinal = i === total - 1;
          return (
            <div
              key={`${i}-${id}`}
              class={`party-slot ${done ? 'is-done' : ''} ${here ? 'is-here' : ''} ${here && ready ? 'is-ready' : ''} ${isFinal ? 'is-final' : ''}`}
            >
              <div class="party-slot-art">
                {shown ? (
                  <KeyArt id={shown} width={SLOT_W} radius={14} />
                ) : (
                  <div class="party-slot-blank">
                    {isFinal ? (
                      <Icon name="crown" size={54} color="#111214" />
                    ) : (
                      <span class="display">?</span>
                    )}
                  </div>
                )}
                {done && (
                  <span class="party-slot-check">
                    <Icon name="check" size={16} stroke={3} color="#111214" />
                  </span>
                )}
              </div>
              <span class="party-slot-label">{isFinal ? PARTY.grandFinal : PARTY.slot(i + 1)}</span>
              <span class="party-slot-title">
                {here && !ready
                  ? PARTY.rolling
                  : shown && (done || ready)
                    ? GAMES[shown].title
                    : isFinal
                      ? PARTY.doubleNote
                      : ''}
              </span>
            </div>
          );
        })}
      </div>

      {after ? <Table rows={table} p={p} /> : <Lineup />}

      <footer class="party-foot">
        <div class="party-buttons">
          <FocusButton id="party-play" class="btn primary party-play">
            {ready && auto ? (
              <Countdown left={left} total={limit} />
            ) : (
              <Icon name="play" size={16} color="#111214" />
            )}
            {ready ? `${PARTY.play}: ${GAMES[target].title}` : PARTY.play}
          </FocusButton>
          <FocusButton id="party-leave" class="btn">
            {PARTY.leave}
          </FocusButton>
        </div>
        <span class="party-hint">
          {ready && auto ? PARTY.startsIn(left) : PARTY.hint}
          {final && ready ? ` · ${PARTY.grandFinal}: ${PARTY.doubleNote.toLowerCase()}` : ''}
        </span>
      </footer>
    </div>
  );
}

function leave(): void {
  sfx('back');
  goHome();
}

/** Before the first game: everyone who is in, with zero points. */
function Lineup() {
  const list = connected.value;
  return (
    <div class="party-lineup">
      {list.map((pl) => (
        <span class="party-lineup-chip" key={pl.id}>
          <Avatar look={pl.look} ring={pl.color} size={34} />
          <b>{pl.name}</b>
          <span>{PARTY.points(0)}</span>
        </span>
      ))}
    </div>
  );
}

/** The party table: rank, player, a bar of their points, what the last game gave them. */
function Table({ rows, p }: { rows: Standing[]; p: Party }) {
  const top = Math.max(1, ...rows.map((r) => r.points));
  const shown = rows.slice(0, 8);
  return (
    <div class={`party-board ${shown.length > 4 ? 'two-cols' : ''}`}>
      {shown.map((r, i) => {
        const pl = players.value.find((x) => x.id === r.playerId);
        const gained = p.gained[r.playerId] ?? 0;
        return (
          <div
            class={`party-board-row ${r.rank === 1 && r.points > 0 ? 'is-top' : ''}`}
            key={r.playerId}
            style={{ animationDelay: `${0.1 + i * 0.06}s` }}
          >
            <b class="party-board-rank">{r.rank}</b>
            {pl && <Avatar look={pl.look} ring={pl.color} size={32} />}
            <span class="party-board-name">{pl?.name ?? 'Pemain'}</span>
            <span class="party-board-bar">
              <span
                style={{ width: `${(r.points / top) * 100}%`, background: pl?.color ?? 'var(--yellow)' }}
              />
            </span>
            {gained > 0 && <span class="party-board-gain">{PARTY.gained(gained)}</span>}
            <span class="party-board-points">{r.points}</span>
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ left, total }: { left: number; total: number }) {
  return (
    <span class="party-count">
      <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="12" fill="none" stroke="rgba(17,18,20,0.25)" stroke-width="4" />
        <circle
          cx="15"
          cy="15"
          r="12"
          fill="none"
          stroke="#111214"
          stroke-width="4"
          stroke-linecap="round"
          stroke-dasharray={`${(left / total) * 75.4} 75.4`}
          transform="rotate(-90 15 15)"
          style={{ transition: 'stroke-dasharray 1s linear' }}
        />
      </svg>
      <span>{left}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ champion */

function Champion({ p }: { p: Party }) {
  const offerOpen = offer.value !== null;
  useEffect(() => {
    sfx('win');
    celebrate();
  }, []);
  useEffect(() => {
    if (offerOpen) return;
    return setFocusMap(
      {
        rows: [['party-again', 'party-home']],
        onOk: (id) => (id === 'party-again' ? startParty() : leave()),
        onBack: leave,
        onMove: () => sfx('tick'),
      },
      'party-again',
    );
  }, [offerOpen]);

  const table = standings(
    p,
    players.value.map((pl) => pl.id),
  );
  const winners = table.filter((r) => r.rank === 1 && r.points > 0);
  const top = table.slice(0, 3);
  // Classic podium order: 2nd, 1st, 3rd.
  const order = top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top;
  const byId = new Map(players.value.map((pl) => [pl.id, pl]));
  const names = winners.map((w) => byId.get(w.playerId)?.name ?? 'Pemain').join(' & ');

  return (
    <div class="page party-page">
      <header class="party-head">
        <span class="party-eyebrow">{PARTY.championEyebrow}</span>
        <h1 class="display party-title">{names || PARTY.noScore}</h1>
        {winners.length > 1 && <p class="party-sub">{PARTY.championShared}</p>}
      </header>

      <div class="party-podium">
        {order.map((r) => {
          const pl = byId.get(r.playerId);
          const first = r.rank === 1 && r.points > 0;
          return (
            <div class={`party-podium-col ${first ? 'is-first' : ''}`} key={r.playerId}>
              {first && <Icon name="crown" size={40} color="var(--yellow)" />}
              {pl && (
                <Avatar
                  look={pl.look}
                  ring={pl.color}
                  size={first ? 120 : 88}
                  face={first ? 'happy' : 'wow'}
                />
              )}
              <span class="party-podium-name">{pl?.name ?? 'Pemain'}</span>
              <div class="party-podium-block">
                <b class="display">{r.rank}</b>
                <span>{PARTY.points(r.points)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {table.length > 3 && (
        <div class="party-rest">
          {table.slice(3, 8).map((r) => (
            <span class="chip" key={r.playerId}>
              <b>{r.rank}.</b> {byId.get(r.playerId)?.name ?? 'Pemain'} · {PARTY.points(r.points)}
            </span>
          ))}
        </div>
      )}

      <footer class="party-foot">
        <div class="party-buttons">
          <FocusButton id="party-again" class="btn primary party-play">
            <Icon name="restart" size={16} color="#111214" />
            {PARTY.again}
          </FocusButton>
          <FocusButton id="party-home" class="btn">
            {PARTY.home}
          </FocusButton>
        </div>
      </footer>
    </div>
  );
}
