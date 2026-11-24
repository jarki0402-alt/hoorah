/**
 * The Hoorah cast on the landing page: floating characters with changing faces and speech bubbles,
 * the parade strip under the hero, the characters peeking beside section titles and the cheering
 * crowd of the closing call. All decorative (aria-hidden).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PersonFace, PersonId } from '../shared/art/people';
import { PersonArt, PersonBadge } from '../shared/person';
import { nextIndex } from './logic';
import { liteMotion, reducedMotion, useInView, useLiveSection, useParallax } from './motion';

/** How long one face (and its speech bubble) stays before the next. */
const FACE_MS = 2600;

/** Steps through `count` states every `ms` while `active`; stays on the first one otherwise. */
function useCycle(count: number, ms: number, active: boolean): number {
  const [i, setI] = useState(0);
  const still = reducedMotion.value || liteMotion;
  useEffect(() => {
    if (!active || still || count < 2) return;
    const t = window.setInterval(() => {
      if (!document.hidden) setI((v) => nextIndex(v, count));
    }, ms);
    return () => window.clearInterval(t);
  }, [active, still, count, ms]);
  return i;
}

/** A floating character: follows the scroll (parallax), bobs, changes face and says something. */
export function FloatPerson({
  id,
  faces,
  cls,
  speed,
  says,
  delay = 0,
}: {
  id: PersonId;
  faces: readonly PersonFace[];
  cls: string;
  speed: number;
  /** Speech bubble texts, one per face; no bubble when left out. */
  says?: readonly string[];
  /** Pace offset (0, 1, 2...) so floats next to each other change at different moments. */
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useParallax(ref, speed);
  const inView = useInView(ref);
  // A slightly different pace per float so the bubbles drift apart instead of popping together.
  const i = useCycle(faces.length, FACE_MS + delay * 450, inView);
  const face = faces[i] ?? faces[0];
  const say = says?.[i % says.length];
  return (
    <span ref={ref} class={`lp-float ${cls}`} aria-hidden="true">
      <span class="lp-float-sprite">
        <PersonArt id={id} face={face} class="lp-float-art" />
      </span>
      {say && (
        <span key={`${i}-${say}`} class="lp-bubble">
          {say}
        </span>
      )}
    </span>
  );
}

/** Faces handed out along the parade so neighbours never look the same. */
const PARADE_FACES: readonly PersonFace[] = [
  'grin',
  'laugh',
  'wow',
  'happy',
  'love',
  'cool',
  'tongue',
  'wink',
  'win',
  'shy',
  'smile',
  'nervous',
];
const PARADE: readonly PersonId[] = [
  'leo',
  'putri',
  'bayu',
  'nara',
  'dino',
  'zara',
  'arka',
  'kiki',
  'opa',
  'lala',
  'gilang',
  'mia',
  'juna',
  'oma',
  'rio',
  'sinta',
  'doni',
  'ayu',
  'kai',
  'lili',
  'bima',
  'tara',
  'sasa',
  'bram',
];

/** The whole cast walking past in an endless strip (the list is drawn twice for a seamless loop). */
export function Parade() {
  const ref = useRef<HTMLDivElement>(null);
  useLiveSection(ref);
  const row = (copy: number) =>
    PARADE.map((id, i) => (
      <PersonBadge
        key={`${copy}-${id}`}
        id={id}
        face={PARADE_FACES[i % PARADE_FACES.length]}
        class={`lp-parade-item${i % 2 ? ' is-low' : ''}`}
      />
    ));
  return (
    <div ref={ref} class="lp-parade" aria-hidden="true">
      <div class="lp-parade-track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

/** A character peeking up beside a section title with a short speech bubble. */
export function Peek({ id, face, say }: { id: PersonId; face: PersonFace; say: string }) {
  return (
    <span class="lp-peek" aria-hidden="true">
      <span class="lp-peek-bubble">{say}</span>
      <PersonArt id={id} face={face} class="lp-peek-art" />
    </span>
  );
}

const CROWD: readonly [PersonId, PersonFace][] = [
  ['sinta', 'win'],
  ['juna', 'grin'],
  ['putri', 'love'],
  ['leo', 'win'],
  ['lala', 'laugh'],
  ['doni', 'laugh'],
  ['kiki', 'wow'],
  ['bima', 'happy'],
];

/** The cheering crowd along the bottom of the closing call; they hop in turn once seen. */
export function Crowd() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, '0px 0px -10% 0px', true);
  return (
    <div ref={ref} class={`lp-crowd${seen ? ' is-seen' : ''}`} aria-hidden="true">
      {CROWD.map(([id, face], i) => (
        <span key={id} class="lp-crowd-item" style={{ '--i': i }}>
          <PersonArt id={id} face={face} class="lp-crowd-art" />
        </span>
      ))}
    </div>
  );
}
