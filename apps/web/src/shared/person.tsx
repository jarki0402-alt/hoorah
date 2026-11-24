/**
 * Preact wrappers of the cast art: a bare character (head and shoulders, for decorations) and a
 * round badge (tinted tile, optional player ring). `who` is a cast character or a player's look.
 */
import type { Look } from '@hoorah/protocol';
import { useMemo } from 'preact/hooks';
import { PERSON_VIEWBOX, type PersonFace, type PersonId, personMarkup, personTint } from './art/people';
import { PERSON_NAMES } from './peopleStrings';

let badgeSeq = 0;

type Who = PersonId | Look;

const nameOf = (who: Who): string => PERSON_NAMES[typeof who === 'string' ? who : who.c];
/** A stable memo key for a look (objects arrive fresh on every render). */
const keyOf = (who: Who): string => (typeof who === 'string' ? who : JSON.stringify(who));

interface ArtProps {
  id: Who;
  face?: PersonFace;
  class?: string;
  /** Announced to screen readers; decorative (hidden) when left out. */
  label?: boolean;
}

/** A character without a frame, 200x222 units, scaled by CSS or `width`. */
export function PersonArt({ id, face, class: cls, label, width }: ArtProps & { width?: number }) {
  const key = keyOf(id);
  const markup = useMemo(() => personMarkup(id, { face }), [key, face]);
  return (
    <svg
      class={cls}
      viewBox={PERSON_VIEWBOX}
      width={width}
      height={width === undefined ? undefined : Math.round((width * 222) / 200)}
      role={label ? 'img' : undefined}
      aria-label={label ? nameOf(id) : undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      // Trusted markup built from constants (no user input).
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/** A character in a round tinted tile, with an optional coloured ring (the player colour). */
export function PersonBadge({
  id,
  face,
  class: cls,
  label,
  size,
  ring,
  dim,
  style,
}: ArtProps & { size?: number; ring?: string; dim?: boolean; style?: Record<string, string | number> }) {
  const key = keyOf(id);
  const { markup, clip, tint } = useMemo(() => {
    badgeSeq += 1;
    return { markup: personMarkup(id, { face }), clip: `pb${badgeSeq}`, tint: personTint(id) };
  }, [key, face]);
  const stroke = ring ? 10 : 0;
  return (
    <svg
      class={cls}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label ? nameOf(id) : undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      style={{ flex: 'none', ...(dim ? { opacity: 0.45 } : {}), ...style }}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="100" r={100 - stroke} />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r={100 - stroke / 2} fill={tint} stroke={ring} stroke-width={stroke} />
      <g clip-path={`url(#${clip})`}>
        <svg
          x="4"
          y="-13"
          width="192"
          height="213"
          viewBox={PERSON_VIEWBOX}
          // Trusted markup built from constants (no user input).
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </g>
    </svg>
  );
}
