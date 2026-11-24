/**
 * Promo break before the next game in a free room (owner decisions 2026-11-23): plays for
 * `seconds`, cannot be skipped, shows off the newest Pass games and offers the free trial and the
 * Pass code. The break itself is planned in ../ads.ts; the store mounts this and starts the game
 * on `onDone`. While it plays, the next game's files are prefetched.
 */
import type { PersonId } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GAMES, type GameId } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { Avatar, Icon } from '../../shared/ui';
import { AD_STR } from '../adStrings';
import { showcaseGames } from '../ads';
import { FocusButton } from '../components';
import { useShellCountdown } from '../countdown';
import { setFocusMap } from '../nav';
import { prefetchGame } from '../prefetch';
import './adbreak.css';

export { prefetchGame } from '../prefetch';

export interface AdBreakProps {
  next: GameId;
  seconds: number;
  trialMinutes: number;
  trialUsed: boolean;
  onTrial: () => void;
  onPass: () => void;
  onDone: () => void;
}

const CHARACTERS: PersonId[] = ['bima', 'leo', 'putri'];
/** Ring radius; its circumference (2πr ≈ 327) is in adbreak.css. */
const RING_R = 52;

/** Breaks shown this page load: rotates which games the showcase picks. */
let shows = 0;

function Countdown({ seconds, left }: { seconds: number; left: number }) {
  return (
    <div class="adb-ring" role="timer" aria-label={AD_STR.remaining(left)}>
      <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
        <circle class="adb-ring-track" cx="64" cy="64" r={RING_R} />
        <circle
          class="adb-ring-fill"
          cx="64"
          cy="64"
          r={RING_R}
          style={{ animationDuration: `${seconds}s` }}
        />
      </svg>
      <span class="display adb-ring-num">{left}</span>
    </div>
  );
}

export function AdBreak({ next, seconds, trialMinutes, trialUsed, onTrial, onPass, onDone }: AdBreakProps) {
  const total = Math.max(1, Math.round(seconds));
  const [games] = useState(() => showcaseGames(next, shows++));
  // Latest callbacks without restarting the timer or the focus map on every parent render.
  const cb = useRef({ onTrial, onPass, onDone });
  cb.current = { onTrial, onPass, onDone };

  useEffect(() => {
    void prefetchGame(next);
  }, [next]);

  // In server time, so a far-away main screen shows the Host's seconds exactly (it never ends it).
  const left = useShellCountdown('ad', total, true, () => cb.current.onDone()) ?? total;

  useEffect(() => {
    const ids = trialUsed ? ['pass'] : ['trial', 'pass'];
    return setFocusMap(
      {
        rows: [ids],
        onOk: (id) => (id === 'trial' ? cb.current.onTrial() : cb.current.onPass()),
        // The break cannot be skipped: Back and Menu do nothing.
        onBack: () => {},
        onMenu: () => {},
      },
      ids[0],
    );
  }, [trialUsed]);

  const info = GAMES[next];
  return (
    <div class="overlay adb" role="dialog" aria-modal="true" aria-label={AD_STR.title}>
      <div class="adb-top">
        <div class="adb-head">
          <div class="adb-eyebrow">{AD_STR.eyebrow}</div>
          <h1 class="display adb-title">{AD_STR.title}</h1>
        </div>
        <Countdown seconds={total} left={left} />
      </div>

      <div class="adb-show">
        {games.map((id, i) => (
          <div class="adb-card" key={id}>
            <KeyArt id={id} width={336} radius={18} class="adb-art" />
            <span class="adb-new">{AD_STR.newBadge}</span>
            <span class="adb-fruit">
              <Avatar look={{ c: CHARACTERS[i % CHARACTERS.length]! }} ring="#FFC928" size={84} />
            </span>
          </div>
        ))}
      </div>

      <p class="adb-offer">{AD_STR.offer(trialMinutes, trialUsed)}</p>

      <div class="adb-actions">
        {!trialUsed && (
          <FocusButton id="trial" class="btn primary adb-btn">
            <Icon name="play" size={20} color="#111214" />
            {AD_STR.trial(trialMinutes)}
          </FocusButton>
        )}
        <FocusButton id="pass" class="btn adb-btn">
          <Icon name="ticket" size={20} />
          {AD_STR.pass}
        </FocusButton>
      </div>

      <div class="adb-foot">
        <KeyArt id={next} width={112} radius={8} logo={false} />
        <div>
          <div class="adb-next-label">{AD_STR.next}</div>
          <div class="adb-next-title">{info.title}</div>
        </div>
        <div class="adb-foot-note">{AD_STR.wait}</div>
      </div>
    </div>
  );
}
