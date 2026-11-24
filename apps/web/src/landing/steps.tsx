/**
 * "Main dalam 3 langkah": on wide screens the device illustration stays put (sticky) while the
 * three steps scroll past and the scene follows the step in the middle of the screen. On narrow
 * phones the steps stack, each with its own scene.
 */
import { formatRoomCode, PLAYER_COLORS } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PersonFace, PersonId } from '../shared/art/people';
import { PersonBadge } from '../shared/person';
import { DPad, FakeQr, QR_SIZE, qrPath } from './art';
import { artUrl } from './artLoader';
import { clamp, stepAt } from './logic';
import { onScrollFrame, useLiveSection, useMedia, useReveal } from './motion';
import { STR } from './strings';

const INK = '#111214';
const DEMO_CODE = formatRoomCode('482917');
/** The players of the demo game and the face each one pulls. */
const SCENE_PLAYERS: readonly [PersonId, PersonFace][] = [
  ['mia', 'grin'],
  ['juna', 'laugh'],
  ['sinta', 'wow'],
];

/** The main screen's join page in miniature: code, QR and the empty seats. */
function HomeScreenSvg() {
  // The QR tile is 92 units wide; its modules fill 84 of them, leaving a 4 unit quiet zone.
  const qrScale = 84 / QR_SIZE;
  return (
    <svg class="lp-ls-svg" viewBox="0 0 320 200" aria-hidden="true" focusable="false">
      <rect width="320" height="200" fill="#18191C" />
      <rect x="16" y="14" width="16" height="16" rx="5" fill="#FF5A1F" />
      <text
        x="38"
        y="27"
        font-family="Baloo 2, ui-rounded, sans-serif"
        font-weight="800"
        font-size="15"
        fill="#fff"
      >
        kacawbalaw
      </text>
      <text
        x="18"
        y="74"
        font-family="Plus Jakarta Sans, system-ui, sans-serif"
        font-weight="700"
        font-size="11"
        fill="#A8ABB2"
      >
        {STR.demoCode}
      </text>
      <text
        x="16"
        y="108"
        font-family="Baloo 2, ui-rounded, sans-serif"
        font-weight="800"
        font-size="38"
        fill="#FFC928"
        letter-spacing="1"
      >
        {DEMO_CODE}
      </text>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={30 + i * 34}
          cy="150"
          r="13"
          fill="none"
          stroke="#3C3E44"
          stroke-width="2.5"
          stroke-dasharray="4 4"
        />
      ))}
      <text
        x="16"
        y="184"
        font-family="Plus Jakarta Sans, system-ui, sans-serif"
        font-weight="600"
        font-size="10"
        fill="#A8ABB2"
      >
        {STR.demoWaiting}
      </text>
      <rect
        class="lp-qr-ring"
        x="196"
        y="50"
        width="110"
        height="110"
        rx="12"
        fill="none"
        stroke="#FF5A1F"
        stroke-width="4"
      />
      <g transform="translate(205 59)">
        <rect width="92" height="92" rx="6" fill="#fff" />
        <g transform={`translate(4 4) scale(${qrScale})`}>
          <path d={qrPath()} fill={INK} fill-rule="evenodd" shape-rendering="crispEdges" />
        </g>
      </g>
    </svg>
  );
}

/** The game on the main screen once everyone joined (key art, players along the bottom). */
function GameScreen() {
  const url = artUrl.value;
  return (
    <div class="lp-ls-game-inner">
      {url && <img src={url('tarik')} width={320} height={180} alt="" loading="lazy" decoding="async" />}
      <span class="lp-ls-players">
        {SCENE_PLAYERS.map(([id, face], i) => (
          <span key={id} class="lp-ls-player" style={{ animationDelay: `${i * 0.18}s` }}>
            <PersonBadge id={id} face={face} ring={PLAYER_COLORS[i] ?? '#fff'} size={40} />
          </span>
        ))}
      </span>
    </div>
  );
}

/** The device scene of one step (0, 1 or 2). */
export function StepScene({ step }: { step: number }) {
  return (
    <div class={`lp-scene s${step + 1}`} aria-hidden="true">
      <div class="lp-scene-box">
        <div class="lp-laptop">
          <div class="lp-laptop-lid">
            <div class="lp-laptop-glass">
              <div class="lp-ls lp-ls-home">
                <HomeScreenSvg />
              </div>
              <div class="lp-ls lp-ls-game">
                <GameScreen />
              </div>
            </div>
          </div>
          <div class="lp-laptop-base" />
        </div>
        <div class="lp-scene-phone">
          <div class="lp-phone-body">
            <div class="lp-phone-glass">
              <div class="lp-ps lp-ps-scan">
                <span class="lp-finder" />
                <FakeQr class="lp-ps-qr" />
                <span class="lp-scanline" />
              </div>
              <div class="lp-ps lp-ps-pad">
                <span class="lp-pad-ring" />
                <DPad label={STR.dpadOk} class="lp-dpad" />
                <PersonBadge id="mia" face="grin" ring={PLAYER_COLORS[0]} class="lp-pad-person" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lp-scene-dots">
        {[0, 1, 2].map((i) => (
          <span key={i} class={`lp-scene-dot${i === step ? ' is-on' : ''}`} />
        ))}
      </div>
    </div>
  );
}

function StepText({ i, active }: { i: number; active: boolean }) {
  const s = STR.steps[i];
  if (!s) return null;
  return (
    <>
      <span class={`lp-step-num display${active ? ' is-on' : ''}`} aria-hidden="true">
        {i + 1}
      </span>
      <h3 class="lp-step-title display">
        <span class="sr-only">{STR.stepLabel(i + 1)}: </span>
        {s.t}
      </h3>
      <p class="lp-step-text">{s.d}</p>
    </>
  );
}

/** Wide screens: steps scroll past a sticky scene that follows the step at mid-screen. */
function StickySteps() {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    return onScrollFrame(({ h }) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > h) return undefined;
      const step = stepAt(clamp((h * 0.5 - r.top) / Math.max(1, r.height), 0, 1), STR.steps.length);
      if (step === current.current) return undefined;
      current.current = step;
      return () => setActive(step);
    });
  }, []);
  return (
    <div class="lp-steps-grid">
      <ol ref={list} class="lp-steps-list">
        {STR.steps.map((_, i) => (
          <li key={i} class={`lp-step${i === active ? ' is-active' : ''}`}>
            <StepText i={i} active={i === active} />
          </li>
        ))}
      </ol>
      <div class="lp-steps-visual">
        <div class="lp-steps-sticky">
          <StepScene step={active} />
        </div>
      </div>
    </div>
  );
}

function StackedStep({ i }: { i: number }) {
  const ref = useRef<HTMLLIElement>(null);
  useReveal(ref);
  return (
    <li ref={ref} class="lp-step is-active rv">
      <StepText i={i} active />
      <StepScene step={i} />
    </li>
  );
}

export function Steps() {
  const wide = useMedia('(min-width: 860px)');
  const sec = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  useLiveSection(sec);
  useReveal(head);
  return (
    <section ref={sec} class="lp-sec lp-steps" aria-labelledby="lp-steps-title">
      <div class="lp-wrap">
        <div ref={head} class="lp-head rv">
          <h2 id="lp-steps-title" class="lp-title display">
            {STR.stepsTitle}
          </h2>
          <p class="lp-sub">{STR.stepsSub}</p>
        </div>
        {wide ? (
          <StickySteps />
        ) : (
          <ol class="lp-steps-stack">
            {STR.steps.map((_, i) => (
              <StackedStep key={i} i={i} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
