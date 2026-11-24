/**
 * Mode Pesta: five slots turn over one by one when the board comes into view (four games and the
 * Grand Final), then the champions rise onto a small podium.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PersonFace, PersonId } from '../shared/art/people';
import { GAMES, type GameId } from '../shared/games';
import { PERSON_NAMES } from '../shared/peopleStrings';
import { PersonBadge } from '../shared/person';
import { Icon } from '../shared/ui';
import { artUrl } from './artLoader';
import { partyPool, pickGames } from './logic';
import { reducedMotion, useInView, useLiveSection, useReveal } from './motion';
import { STR } from './strings';

const SLOTS = 5;
/** Time between two slots turning over, then before the podium rises. */
const REVEAL_MS = 650;

/** Podium order left to right: second, first, third; the winner cheers, third place cries. */
const PODIUM: { person: PersonId; face: PersonFace; ring: string; place: 1 | 2 | 3; points: number }[] = [
  { person: 'rio', face: 'happy', ring: '#2F8CFF', place: 2, points: 34 },
  { person: 'lala', face: 'win', ring: '#FF5A1F', place: 1, points: 41 },
  { person: 'bayu', face: 'cry', ring: '#FFC928', place: 3, points: 27 },
];

function Slot({ index, game, shown }: { index: number; game: GameId | undefined; shown: boolean }) {
  const final = index === SLOTS - 1;
  const url = artUrl.value;
  return (
    <li class={`lp-slot${final ? ' is-final' : ''}${shown ? ' is-shown' : ''}`}>
      <span class="lp-slot-card">
        <span class="lp-slot-face lp-slot-back" aria-hidden="true">
          {final ? <Icon name="crown" size={30} color="#111214" /> : <span class="display">?</span>}
        </span>
        <span class="lp-slot-face lp-slot-front">
          {game && url ? (
            <img src={url(game)} width={160} height={90} alt="" loading="lazy" decoding="async" />
          ) : null}
          {game && <span class="lp-slot-name">{GAMES[game].title}</span>}
          {final && (
            <span class="lp-slot-crown" aria-hidden="true">
              <Icon name="crown" size={16} color="#111214" />
            </span>
          )}
        </span>
      </span>
      <span class="lp-slot-label">{final ? STR.partyFinal : STR.partySlot(index + 1)}</span>
    </li>
  );
}

export function PartySection() {
  const sec = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const seen = useInView(board, '0px 0px -15% 0px', true);
  const [games] = useState(() => pickGames(partyPool(), SLOTS, Math.random));
  // 0..SLOTS slots turned over; SLOTS + 1 shows the podium too.
  const [shown, setShown] = useState(0);
  useLiveSection(sec);
  useReveal(copy);

  useEffect(() => {
    if (!seen) return;
    if (reducedMotion.value) {
      setShown(SLOTS + 1);
      return;
    }
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n > SLOTS) window.clearInterval(t);
    }, REVEAL_MS);
    return () => window.clearInterval(t);
  }, [seen]);

  return (
    <section ref={sec} class="lp-sec lp-party" aria-labelledby="lp-party-title">
      <div class="lp-wrap lp-party-grid">
        <div ref={copy} class="lp-party-copy rv">
          <span class="lp-chip lp-chip-orange">
            <Icon name="ticket" size={16} />
            {STR.partyChip}
          </span>
          <h2 id="lp-party-title" class="lp-title display">
            {STR.partyTitle}
          </h2>
          <p class="lp-sub">{STR.partySub}</p>
          <ul class="lp-party-points">
            {STR.partyPoints.map((p, i) => (
              <li key={p} class="lp-party-point">
                <span class="lp-party-point-num display">{i + 1}</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div ref={board} class="lp-party-board" aria-hidden="true">
          <span class="lp-party-board-name display outline-text">{STR.partyTitle.toUpperCase()}</span>
          <ol class="lp-slots">
            {Array.from({ length: SLOTS }, (_, i) => (
              <Slot key={i} index={i} game={games[i]} shown={shown > i} />
            ))}
          </ol>
          <div class={`lp-podium-wrap${shown > SLOTS ? ' is-shown' : ''}`}>
            <span class="lp-podium-title">{STR.partyChampion}</span>
            <div class="lp-podium">
              {PODIUM.map((p) => (
                <div key={p.place} class={`lp-podium-col place-${p.place}`}>
                  {p.place === 1 && (
                    <span class="lp-podium-crown">
                      <Icon name="crown" size={22} color="#FFC928" />
                    </span>
                  )}
                  <PersonBadge id={p.person} face={p.face} ring={p.ring} class="lp-podium-avatar" />
                  <span class="lp-podium-name">{PERSON_NAMES[p.person]}</span>
                  <span class="lp-podium-block">
                    <b class="display">{p.place}</b>
                    <span>{STR.partyPts(p.points)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
