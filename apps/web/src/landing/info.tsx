/**
 * The quieter sections after the games: who it is for, which devices, the numbers, free versus
 * Hoorah Pass, the FAQ, the closing call and the footer.
 */
import { DEFAULT_CONFIG, LIMITS } from '@hoorah/protocol';
import { type ComponentChildren, h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PersonFace, PersonId } from '../shared/art/people';
import { FREE_GAMES } from '../shared/freeTier';
import { PersonBadge } from '../shared/person';
import { Icon, Logo } from '../shared/ui';
import { DeviceIcon, type DeviceId } from './art';
import { Crowd, FloatPerson, Peek } from './cast';
import { focusCodeInput, PHONE_SCREEN_PATH, START_PATH } from './hero';
import { countUp, playableCatalog } from './logic';
import { reducedMotion, useInView, useLiveSection, useReveal } from './motion';
import { STR } from './strings';

/** A block that fades and rises in the first time it scrolls into view; `delay` staggers siblings. */
function Reveal({
  as: tag = 'div',
  delay = 0,
  class: cls = '',
  children,
}: {
  as?: 'div' | 'li' | 'article';
  delay?: number;
  class?: string;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  return h(tag, { ref, class: `rv ${cls}`, style: { '--d': delay } }, children);
}

interface PeekProps {
  id: PersonId;
  face: PersonFace;
  say: string;
}

function SectionHead({
  id,
  title,
  sub,
  peek,
}: {
  id: string;
  title: string;
  sub?: string;
  peek?: PeekProps;
}) {
  return (
    <Reveal class={`lp-head${peek ? ' has-peek' : ''}`}>
      {peek && <Peek id={peek.id} face={peek.face} say={peek.say} />}
      <h2 id={id} class="lp-title display">
        {title}
      </h2>
      {sub && <p class="lp-sub">{sub}</p>}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ audience */

/** The group of each audience card: family, friends, office, 17 Agustus games, reunions. */
const AUDIENCE_LOOK: { people: [PersonId, PersonFace][]; tone: string }[] = [
  {
    people: [
      ['opa', 'happy'],
      ['oma', 'smile'],
      ['dino', 'grin'],
    ],
    tone: 'orange',
  },
  {
    people: [
      ['bayu', 'tongue'],
      ['arka', 'cool'],
      ['tara', 'laugh'],
    ],
    tone: 'yellow',
  },
  {
    people: [
      ['gilang', 'smile'],
      ['nara', 'happy'],
      ['juna', 'grin'],
    ],
    tone: 'blue',
  },
  {
    people: [
      ['mia', 'win'],
      ['kiki', 'wow'],
      ['doni', 'laugh'],
    ],
    tone: 'green',
  },
  {
    people: [
      ['ayu', 'happy'],
      ['zara', 'laugh'],
      ['putri', 'love'],
    ],
    tone: 'pink',
  },
];

export function Audience() {
  const sec = useRef<HTMLElement>(null);
  useLiveSection(sec);
  return (
    <section ref={sec} class="lp-sec lp-audience" aria-labelledby="lp-aud-title">
      <div class="lp-wrap">
        <SectionHead id="lp-aud-title" title={STR.audienceTitle} sub={STR.audienceSub} />
        <ul class="lp-aud-grid">
          {STR.audience.map((a, i) => {
            const look = AUDIENCE_LOOK[i] ?? AUDIENCE_LOOK[0]!;
            return (
              <Reveal as="li" key={a.t} delay={i} class={`lp-aud tone-${look.tone}`}>
                <span class="lp-aud-fruits" aria-hidden="true">
                  {look.people.map(([id, face], k) => (
                    <PersonBadge key={id} id={id} face={face} ring="#111214" class={`lp-aud-fruit k${k}`} />
                  ))}
                </span>
                <h3 class="lp-aud-title display">{a.t}</h3>
                <p class="lp-aud-text">{a.d}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ devices and numbers */

const DEVICES: DeviceId[] = ['pc', 'laptop', 'tablet', 'smarttv', 'phone'];

/** A number that counts up from zero the first time it is seen (the final number for readers). */
function CountUp({ to, label }: { to: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, '0px 0px -10% 0px', true);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion.value || to === 0) {
      setN(to);
      return;
    }
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (now: number) => {
      setN(countUp(now - start, duration, to));
      if (now - start < duration) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [seen, to]);
  return (
    <div ref={ref} class={`lp-stat${seen ? ' is-seen' : ''}`}>
      <span class="lp-stat-num display" aria-hidden="true">
        {n}
      </span>
      <span class="lp-stat-label" aria-hidden="true">
        {label}
      </span>
      <span class="sr-only">
        {to} {label}
      </span>
    </div>
  );
}

export function Devices() {
  const sec = useRef<HTMLElement>(null);
  useLiveSection(sec);
  return (
    <section ref={sec} class="lp-sec lp-devices" aria-labelledby="lp-dev-title">
      <div class="lp-wrap">
        <SectionHead
          id="lp-dev-title"
          title={STR.devicesTitle}
          sub={STR.devicesSub}
          peek={{ id: 'kai', face: 'happy', say: STR.peekDevices }}
        />
        <ul class="lp-dev-row">
          {DEVICES.map((d, i) => (
            <Reveal as="li" key={d} delay={i} class={`lp-dev${d === 'phone' ? ' is-pad' : ''}`}>
              <span class="lp-dev-icon">
                <DeviceIcon id={d} size={56} />
              </span>
              <span class="lp-dev-name">{STR.devices[d]}</span>
              <span class={`lp-dev-role${d === 'phone' ? ' is-pad' : ''}`}>
                {d === 'phone' ? STR.rolePad : STR.roleScreen}
              </span>
            </Reveal>
          ))}
        </ul>
        <div class="lp-stats">
          <CountUp to={playableCatalog().length} label={STR.statGames} />
          <CountUp to={LIMITS.premiumPlayers} label={STR.statPlayers} />
          <CountUp to={0} label={STR.statInstall} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pricing */

function Feature({ text, kind }: { text: string; kind: 'yes' | 'note' }) {
  return (
    <li class={`lp-feat is-${kind}`}>
      <span class="lp-feat-icon" aria-hidden="true">
        <Icon name={kind === 'yes' ? 'check' : 'clock'} size={16} stroke={3} />
      </span>
      {text}
    </li>
  );
}

export function Pricing({ phone }: { phone: boolean }) {
  // A phone opens as a controller at `/main`; it must ask to be the main screen.
  const start = phone ? PHONE_SCREEN_PATH : START_PATH;
  const games = playableCatalog().length;
  const free = STR.freeItems(LIMITS.freePlayers, FREE_GAMES.length);
  return (
    <section id="harga" class="lp-sec lp-pricing" aria-labelledby="lp-price-title">
      <div class="lp-wrap">
        <SectionHead
          id="lp-price-title"
          title={STR.priceTitle}
          sub={STR.priceSub}
          peek={{ id: 'bayu', face: 'tongue', say: STR.peekPrice }}
        />
        <div class="lp-price-grid">
          <Reveal as="article" class="lp-price">
            <div class="lp-price-top">
              <h3 class="lp-price-name display">{STR.freeName}</h3>
              <span class="lp-chip lp-chip-dark">{STR.freeTag}</span>
            </div>
            <ul class="lp-feats">
              {free.map((t, i) => (
                <Feature key={t} text={t} kind={i === free.length - 1 ? 'note' : 'yes'} />
              ))}
            </ul>
            <a class="lp-btn lp-btn-ghost lp-btn-lg lp-price-cta" href={start}>
              {STR.freeCta}
            </a>
            <p class="lp-note">{STR.freeNote}</p>
          </Reveal>
          <Reveal as="article" delay={1} class="lp-price is-pass">
            <div class="lp-price-top">
              <h3 class="lp-price-name display">{STR.passName}</h3>
              <span class="lp-chip lp-chip-yellow">{STR.passPrice}</span>
            </div>
            <ul class="lp-feats">
              {STR.passItems(LIMITS.premiumPlayers, games).map((t) => (
                <Feature key={t} text={t} kind="yes" />
              ))}
            </ul>
            <a class="lp-btn lp-btn-primary lp-btn-lg lp-price-cta" href={start}>
              <Icon name="play" size={20} />
              {STR.trial(DEFAULT_CONFIG.trialMinutes)}
            </a>
            <p class="lp-note">{STR.trialNote}</p>
            <p class="lp-price-pass-note">
              <Icon name="ticket" size={18} />
              {STR.passCodeNote}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ FAQ */

export function Faq() {
  return (
    <section id="faq" class="lp-sec lp-faq" aria-labelledby="lp-faq-title">
      <div class="lp-wrap lp-faq-wrap">
        <SectionHead
          id="lp-faq-title"
          title={STR.faqTitle}
          peek={{ id: 'tara', face: 'nervous', say: STR.peekFaq }}
        />
        <div class="lp-faq-list">
          {STR.faq.map((f) => (
            <details key={f.q} class="lp-qa">
              <summary class="lp-qa-q">
                <span>{f.q}</span>
                <span class="lp-qa-icon" aria-hidden="true">
                  <Icon name="plus" size={20} stroke={3} />
                </span>
              </summary>
              <p class="lp-qa-a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ closing and footer */

export function Closing({ phone }: { phone: boolean }) {
  const sec = useRef<HTMLElement>(null);
  useLiveSection(sec);
  return (
    <section ref={sec} class="lp-sec lp-closing" aria-labelledby="lp-close-title">
      <FloatPerson id="rio" faces={['wink', 'grin']} cls="c1" speed={0.12} />
      <FloatPerson id="ayu" faces={['happy', 'love']} cls="c2" speed={-0.1} delay={1} />
      <FloatPerson id="dino" faces={['grin', 'wow']} cls="c3" speed={0.08} delay={2} />
      <div class="lp-wrap lp-closing-inner">
        <Reveal>
          <h2 id="lp-close-title" class="lp-closing-title display">
            {STR.closingTitle}
          </h2>
          <p class="lp-sub">{STR.closingSub}</p>
          <div class="lp-cta-row is-center">
            {phone ? (
              <button type="button" class="lp-btn lp-btn-primary lp-btn-xl" onClick={focusCodeInput}>
                <Icon name="tap" size={24} />
                {STR.closingPhone}
              </button>
            ) : (
              <a class="lp-btn lp-btn-primary lp-btn-xl" href={START_PATH}>
                <Icon name="play" size={24} />
                {STR.closingStart}
              </a>
            )}
          </div>
        </Reveal>
      </div>
      <Crowd />
    </section>
  );
}

export function Footer() {
  return (
    <footer class="lp-footer">
      <div class="lp-wrap lp-footer-inner">
        <Logo size={28} />
        <span class="lp-footer-copy">{STR.footerCopy}</span>
        <span class="lp-footer-links">
          <span class="lp-footer-link">
            {STR.footerPrivacy} <span class="lp-soon">{STR.soon}</span>
          </span>
          <span class="lp-footer-link">
            {STR.footerTerms} <span class="lp-soon">{STR.soon}</span>
          </span>
        </span>
      </div>
    </footer>
  );
}
