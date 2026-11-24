/**
 * Art of the two special home cards (Mode Pesta and Acak) and the big wheel the Acak overlay
 * spins. Drawn as SVG/DOM here, no image files: flat fills in the Hoorah palette, no gradients.
 */
import { GAMES, type GameId } from '../shared/games';
import { KeyArt } from '../shared/keyart';
import { Icon } from '../shared/ui';

/** Slice fills, in turn around the wheel (orange, yellow, blue, green, pink, teal: no violet). */
const SLICE = ['#FF5A1F', '#FFC928', '#5AA9FF', '#22B35E', '#FF5C9A', '#2DD4BF'] as const;
const INK = '#111214';

/** Fill of slice `i` of `n`: neighbours never share a colour, the last one included. */
export function sliceColor(i: number, n: number): string {
  const k = SLICE.length;
  // With n = k·m + 1 the last slice would meet the first in the same colour: shift it.
  if (i === n - 1 && n > 1 && (n - 1) % k === 0) return SLICE[(i + 1) % k]!;
  return SLICE[i % k]!;
}

/** Shortened slice label so it fits along the radius. */
function label(id: GameId): string {
  const t = GAMES[id].title;
  return t.length > 13 ? `${t.slice(0, 12)}…` : t;
}

/**
 * A wheel of `games` slices, the first one starting at 12 o'clock, clockwise. Turned as a whole by
 * the caller (a CSS transform on the wrapper); the pointer is drawn separately.
 */
export function Wheel({ games, size }: { games: readonly GameId[]; size: number }) {
  const n = Math.max(1, games.length);
  const r = 100;
  const step = (2 * Math.PI) / n;
  const point = (a: number, rr = r) => `${(Math.sin(a) * rr).toFixed(2)} ${(-Math.cos(a) * rr).toFixed(2)}`;
  return (
    <svg width={size} height={size} viewBox="-108 -108 216 216" aria-hidden="true">
      <circle r="106" fill={INK} />
      {games.map((id, i) => {
        const a0 = i * step;
        const a1 = (i + 1) * step;
        const mid = ((a0 + a1) / 2) * (180 / Math.PI);
        // Names on the left half are turned the other way round, so none reads upside down.
        const left = mid > 180;
        const d =
          n === 1
            ? `M 0 -${r} A ${r} ${r} 0 1 1 -0.01 -${r} Z`
            : `M 0 0 L ${point(a0)} A ${r} ${r} 0 ${step > Math.PI ? 1 : 0} 1 ${point(a1)} Z`;
        return (
          <g key={`${id}-${i}`}>
            <path d={d} fill={sliceColor(i, n)} stroke={INK} stroke-width="2.5" />
            <text
              transform={
                left ? `rotate(${mid + 90}) translate(-92 0)` : `rotate(${mid - 90}) translate(92 0)`
              }
              text-anchor={left ? 'start' : 'end'}
              dominant-baseline="central"
              font-size={n > 8 ? 9.5 : 11}
              font-weight="800"
              fill={INK}
            >
              {label(id)}
            </text>
          </g>
        );
      })}
      <circle r="17" fill="#fff" stroke={INK} stroke-width="5" />
      <circle r="6" fill={INK} />
    </svg>
  );
}

/** The pointer above the wheel, pointing down at the chosen slice. */
export function WheelPointer({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M4 4 H36 L20 40 Z" fill="#fff" stroke={INK} stroke-width="5" stroke-linejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ cards */

/** Mode Pesta card: four hidden games and the Grand Final crown on an orange field. */
export function PartyCardArt({ width }: { width: number }) {
  const h = Math.round((width * 9) / 16);
  return (
    <div class="special-art party-card-art" style={{ width, height: h }}>
      <span class="special-art-name display outline-text">MODE PESTA</span>
      <div class="party-card-slots">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} class="party-card-slot" style={{ animationDelay: `${i * 0.15}s` }}>
            ?
          </span>
        ))}
        <span class="party-card-slot is-final">
          <Icon name="crown" size={20} color={INK} />
        </span>
      </div>
      <span class="special-art-note">5 GAME</span>
    </div>
  );
}

/** Acak card: a wheel peeking in from the right of a yellow field. */
export function RandomCardArt({ width, games }: { width: number; games: readonly GameId[] }) {
  const h = Math.round((width * 9) / 16);
  return (
    <div class="special-art random-card-art" style={{ width, height: h }}>
      <span class="special-art-name display outline-text">ACAK!</span>
      <div class="random-card-wheel">
        <Wheel games={games} size={Math.round(h * 1.35)} />
      </div>
      <span class="random-card-pointer">
        <WheelPointer size={18} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ hero art */

/** Hero art for Mode Pesta: three party games fanned out, the Grand Final crown in front. */
export function PartyHeroArt({ games }: { games: readonly GameId[] }) {
  const tilt = [-9, 4, -2];
  return (
    <div class="special-hero party-hero-art" aria-hidden="true">
      {games.slice(0, 3).map((id, i) => (
        <div key={id} class={`party-hero-card c${i}`} style={{ transform: `rotate(${tilt[i]}deg)` }}>
          <KeyArt id={id} width={360} radius={18} />
          <span class="party-hero-q display">?</span>
        </div>
      ))}
      <span class="party-hero-crown">
        <Icon name="crown" size={56} color={INK} />
      </span>
    </div>
  );
}

/** Hero art for Acak: the big wheel turning slowly. */
export function RandomHeroArt({ games }: { games: readonly GameId[] }) {
  return (
    <div class="special-hero random-hero-art" aria-hidden="true">
      <span class="random-hero-pointer">
        <WheelPointer size={44} />
      </span>
      <div class="random-hero-wheel">
        <Wheel games={games} size={340} />
      </div>
    </div>
  );
}
