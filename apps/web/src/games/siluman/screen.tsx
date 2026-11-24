/**
 * Main-screen renderer for Kampung Siluman: the screen is the guide. A woodcut kampung fills the
 * background (deep blue night under the moon, warm gold day) and one card in the middle says
 * what happens now. A row of avatars along the bottom shows who is still in the kampung, who is
 * an arwah, who has locked in, and the "Curigai" markers. Reads the match on every `version`
 * bump; clocks and countdowns write to the DOM from the frame bus. Animations touch transform
 * and opacity only (weak Smart TV browsers).
 */
import type { PlayerInfo } from '@hoorah/protocol';
import type { ReadonlySignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { THUMBS } from '../../controller/thumbs/siluman';
import { svgUrl } from '../../shared/art/svg';
import { Avatar, Icon } from '../../shared/ui';
import { kampungSvg, roosterSvg, wekerSvg } from './art';
import {
  EXTRAS,
  type IntroCue,
  MIN_PLAYERS,
  type Role,
  type SceneSeat,
  type SilumanScene,
  TALKS,
} from './logic';
import {
  CALL_SUB,
  CUE_SUB,
  CUE_TITLE,
  EXTRAS_NAME,
  EXTRAS_SUB,
  ROLE_NAME,
  SIDE_NAME,
  STR,
  TALK_NAME,
  TALK_SUB,
} from './strings';

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

/** What the main screen shows of a player. */
export type SeatInfo = Pick<PlayerInfo, 'id' | 'name' | 'color' | 'look'>;

export interface ScreenModel {
  match: SilumanScene;
  version: ReadonlySignal<number>;
  frame: FrameBus;
  hostId: () => number | null;
  info(id: number): SeatInfo | undefined;
}

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
const NIGHT_PHASES = new Set(['intro', 'dusk', 'night']);

const roleSrc = (role: Role) => svgUrl(`thumb:siluman:role-${role}`, THUMBS[`role-${role}`]!);
const thumbSrc = (key: string) => svgUrl(`thumb:siluman:${key}`, THUMBS[key]!);

function cueSrc(cue: IntroCue): string {
  if (cue === 'weker') return svgUrl('siluman:weker', wekerSvg);
  if (cue === 'rooster') return svgUrl('siluman:rooster', roosterSvg);
  return roleSrc(cue);
}

/* ------------------------------------------------------------------ small parts */

function Clock({ model }: { model: ScreenModel }) {
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      model.frame.subscribe(() => {
        const m = model.match;
        // The dusk countdown already fills the card; one number is enough.
        const total = m.phase === 'dusk' ? 0 : m.clockLength();
        const left = m.msLeft();
        wrap.current?.classList.toggle('is-hidden', total <= 0);
        if (total <= 0) return;
        const s = Math.ceil(left / 1000);
        if (arc.current) arc.current.style.strokeDashoffset = String(RING_C * (1 - left / total));
        const text = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
        if (num.current && num.current.textContent !== text) num.current.textContent = text;
        wrap.current?.classList.toggle('is-low', s <= 5);
      }),
    [model],
  );
  return (
    <div ref={wrap} class="sl-clock">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={RING_R} class="sl-clock-track" />
        <circle
          ref={arc}
          cx="64"
          cy="64"
          r={RING_R}
          class="sl-clock-arc"
          style={{ strokeDasharray: String(RING_C) }}
        />
      </svg>
      <div ref={num} class="sl-clock-num" />
    </div>
  );
}

/** Big seconds number (dusk countdown). */
function Countdown({ model }: { model: ScreenModel }) {
  const num = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      model.frame.subscribe(() => {
        const s = String(Math.max(1, Math.ceil(model.match.msLeft() / 1000)));
        if (num.current && num.current.textContent !== s) {
          num.current.textContent = s;
          num.current.classList.remove('is-beat');
          void num.current.offsetWidth;
          num.current.classList.add('is-beat');
        }
      }),
    [model],
  );
  return <div ref={num} class="sl-count" />;
}

function Header({ model }: { model: ScreenModel }) {
  const m = model.match;
  const night = NIGHT_PHASES.has(m.phase);
  const chip =
    m.night > 0 && m.phase !== 'final' && m.phase !== 'ended'
      ? night
        ? STR.nightChip(m.night)
        : STR.dayChip(m.night)
      : null;
  return (
    <div class="sl-head">
      <div class="sl-logo">{STR.logo}</div>
      {chip && <div class="sl-chip">{chip}</div>}
      <div class="sl-guide">{STR.guide}</div>
      <div class="sl-head-right">
        <Clock model={model} />
      </div>
    </div>
  );
}

function Card({ children, class: cls = '' }: { children: ComponentChildren; class?: string }) {
  return <div class={`sl-card ${cls}`}>{children}</div>;
}

function BigAvatar({
  model,
  id,
  face = 'happy',
}: {
  model: ScreenModel;
  id: number;
  face?: 'happy' | 'sad' | 'wow';
}) {
  const info = model.info(id);
  if (!info) return null;
  return (
    <div class="sl-bigav">
      <Avatar look={info.look} ring={info.color} size={132} face={face} />
      <div class="sl-bigav-name">{info.name}</div>
    </div>
  );
}

const nameOf = (model: ScreenModel, id: number | null) => (id !== null ? (model.info(id)?.name ?? '?') : '?');

/* ------------------------------------------------------------------ phases */

function Setup({ model }: { model: ScreenModel }) {
  const m = model.match;
  const host = model.hostId();
  const n = m.present.length;
  const roles = m.step === 'roles';
  const items = roles
    ? EXTRAS.map((x) => ({ id: x, label: EXTRAS_NAME[x], sub: EXTRAS_SUB[x], src: thumbSrc(`extra-${x}`) }))
    : TALKS.map((t) => ({ id: t, label: TALK_NAME[t], sub: TALK_SUB[t], src: thumbSrc(`talk-${t}`) }));
  const selected = roles ? m.settings.extras : m.settings.talk;
  return (
    <Card class="is-wide">
      <div class="sl-eyebrow">{STR.setupTitle}</div>
      <div class="sl-title">{roles ? STR.menuRolesTitle : STR.menuTalkTitle}</div>
      <div class="sl-tiles">
        {items.map((it) => (
          <div key={it.id} class={`sl-tile ${selected === it.id ? 'is-on' : ''}`}>
            <img src={it.src} alt="" width={200} height={150} />
            <div class="sl-tile-name">{it.label}</div>
            <div class="sl-tile-sub">{it.sub}</div>
          </div>
        ))}
      </div>
      <div class={`sl-note ${n < MIN_PLAYERS ? 'is-warn' : ''}`}>
        {STR.setupCount(n, MIN_PLAYERS)} · {STR.setupHint(host !== null ? nameOf(model, host) : 'Host')}
      </div>
    </Card>
  );
}

function Intro({ model }: { model: ScreenModel }) {
  const cue = model.match.introCue;
  if (!cue) return null;
  return (
    <Card class="is-cue" key={cue}>
      <div class="sl-eyebrow">{STR.introEyebrow}</div>
      <img class="sl-pic" src={cueSrc(cue)} alt="" width={320} height={240} />
      <div class="sl-title">{STR.introTitle(CUE_TITLE[cue])}</div>
      <div class="sl-sub">{CUE_SUB[cue]}</div>
    </Card>
  );
}

function Deal({ model }: { model: ScreenModel }) {
  const m = model.match;
  const ready = m.table.filter((s) => s.ready).length;
  return (
    <Card>
      <div class="sl-title">{STR.dealTitle}</div>
      <div class="sl-sub">{STR.dealSub}</div>
      <div class="sl-note">
        {ready}/{m.table.length}
      </div>
    </Card>
  );
}

function Dusk({ model }: { model: ScreenModel }) {
  return (
    <Card class="is-night">
      <div class="sl-title">{STR.duskTitle}</div>
      <div class="sl-sub">{STR.duskSub}</div>
      <Countdown model={model} />
    </Card>
  );
}

function Night({ model }: { model: ScreenModel }) {
  const role = model.match.calling;
  if (!role) {
    return (
      <Card class="is-night is-closed">
        <div class="sl-title">{STR.closedTitle}</div>
        <div class="sl-sub">{STR.closedSub}</div>
      </Card>
    );
  }
  return (
    <Card class="is-night is-cue" key={role}>
      <img class="sl-pic" src={roleSrc(role)} alt="" width={320} height={240} />
      <div class="sl-title">{STR.callTitle(ROLE_NAME[role])}</div>
      <div class="sl-sub">{CALL_SUB[role]}</div>
    </Card>
  );
}

function Dawn({ model }: { model: ScreenModel }) {
  const m = model.match;
  const v = m.dawnVictim;
  const role = v !== null ? (m.seat(v)?.role ?? 'warga') : null;
  return (
    <Card class="is-news">
      <div class="sl-eyebrow">{STR.dawnTitle(m.night)}</div>
      {v !== null && role ? (
        <>
          <div class="sl-pair">
            <BigAvatar model={model} id={v} face="sad" />
            <img class="sl-pic is-small" src={roleSrc(role)} alt="" width={200} height={150} />
          </div>
          <div class="sl-title">{STR.dawnTaken(nameOf(model, v))}</div>
          <div class="sl-sub">{STR.dawnRole(nameOf(model, v), ROLE_NAME[role])}</div>
        </>
      ) : (
        <>
          <div class="sl-title">{STR.dawnNone}</div>
          <div class="sl-sub">{STR.dawnNoneSub}</div>
        </>
      )}
    </Card>
  );
}

function Hunt({ model }: { model: ScreenModel }) {
  const m = model.match;
  const shot = m.huntShot;
  const role = shot !== null ? (m.seat(shot)?.role ?? 'warga') : null;
  return (
    <Card class="is-news">
      <img class="sl-pic is-small" src={roleSrc('pemburu')} alt="" width={200} height={150} />
      <div class="sl-title">{STR.huntTitle(nameOf(model, m.hunter))}</div>
      {shot !== null && role ? (
        <>
          <BigAvatar model={model} id={shot} face="sad" />
          <div class="sl-sub">{STR.huntShot(nameOf(model, shot), ROLE_NAME[role])}</div>
        </>
      ) : (
        <div class="sl-sub">{STR.huntPhoneHint}</div>
      )}
    </Card>
  );
}

function Discuss({ model }: { model: ScreenModel }) {
  const m = model.match;
  const talkers = m.alive.filter((s) => s.present);
  const ready = talkers.filter((s) => s.ready).length;
  return (
    <Card>
      <div class="sl-title">{STR.discussTitle}</div>
      <div class="sl-sub">{STR.discussSub}</div>
      <div class="sl-note">{STR.discussReady(ready, talkers.length)}</div>
    </Card>
  );
}

function Defense({ model }: { model: ScreenModel }) {
  const d = model.match.defender;
  if (d === null) return null;
  return (
    <Card class="is-spot">
      <BigAvatar model={model} id={d} face="wow" />
      <div class="sl-title">{STR.defenseTitle(nameOf(model, d))}</div>
      <div class="sl-sub">{STR.defenseSub}</div>
    </Card>
  );
}

function Vote({ model }: { model: ScreenModel }) {
  const m = model.match;
  const voters = m.alive.filter((s) => s.present);
  return (
    <Card>
      <div class="sl-title">{STR.voteTitle}</div>
      <div class="sl-sub">{STR.voteSub}</div>
      <div class="sl-note">{STR.voteVoted(voters.filter((s) => s.locked).length, voters.length)}</div>
    </Card>
  );
}

function TallyView({ model }: { model: ScreenModel }) {
  const m = model.match;
  const [shown, setShown] = useState(() => m.tallyShown());
  useEffect(
    () =>
      model.frame.subscribe(() => {
        const n = model.match.tallyShown();
        setShown((prev) => (prev === n ? prev : n));
      }),
    [model],
  );
  const t = m.tally;
  if (!t) return null;
  const counts = new Map<number, number>();
  let skips = 0;
  for (const v of t.order.slice(0, shown)) {
    if (v.to === 0) skips++;
    else counts.set(v.to, (counts.get(v.to) ?? 0) + 1);
  }
  const targets = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...counts.values(), skips);
  const last = shown > 0 ? t.order[shown - 1] : undefined;
  return (
    <Card class="is-wide">
      <div class="sl-title">{STR.tallyTitle}</div>
      <div class="sl-tally-last">
        {last && (
          <div class="sl-vote" key={shown}>
            <MiniAvatar model={model} id={last.from} />
            <Icon name="right" size={28} stroke={3} />
            {last.to === 0 ? (
              <span class="sl-vote-skip">{STR.tallySkip}</span>
            ) : (
              <MiniAvatar model={model} id={last.to} />
            )}
          </div>
        )}
      </div>
      <div class="sl-bars">
        {targets.map(([id, n]) => (
          <div class="sl-bar" key={id}>
            <MiniAvatar model={model} id={id} />
            <div class="sl-bar-track">
              <div class="sl-bar-fill" style={{ transform: `scaleX(${n / max})` }} />
            </div>
            <b>{n}</b>
          </div>
        ))}
        {skips > 0 && (
          <div class="sl-bar is-skip">
            <span class="sl-vote-skip">{STR.tallySkip}</span>
            <div class="sl-bar-track">
              <div class="sl-bar-fill" style={{ transform: `scaleX(${skips / max})` }} />
            </div>
            <b>{skips}</b>
          </div>
        )}
      </div>
      <div class="sl-note">
        {shown}/{t.order.length}
      </div>
    </Card>
  );
}

function MiniAvatar({ model, id }: { model: ScreenModel; id: number }) {
  const info = model.info(id);
  if (!info) return null;
  return (
    <span class="sl-mini">
      <Avatar look={info.look} ring={info.color} size={44} />
      <span>{info.name}</span>
    </span>
  );
}

function Reveal({ model }: { model: ScreenModel }) {
  const m = model.match;
  const out = m.tally?.out ?? null;
  if (out === null) {
    return (
      <Card>
        <div class="sl-title">{m.tally?.tie ? STR.revealTie : STR.revealNone}</div>
      </Card>
    );
  }
  const role = m.seat(out)?.role ?? 'warga';
  return (
    <Card class="is-reveal">
      <div class="sl-title">{STR.revealOut(nameOf(model, out))}</div>
      <div class="sl-flip">
        <div class="sl-flip-inner">
          <div class="sl-flip-back">?</div>
          <div class="sl-flip-face">
            <img src={roleSrc(role)} alt="" width={240} height={180} />
            <div>{ROLE_NAME[role]}</div>
          </div>
        </div>
      </div>
      <div class="sl-sub sl-late">{STR.revealRole(ROLE_NAME[role])}</div>
    </Card>
  );
}

function Final({ model }: { model: ScreenModel }) {
  const m = model.match;
  const side = m.winner ?? 'warga';
  const sub =
    side === 'siluman'
      ? STR.finalSilumanSub
      : m.alive.some((s) => s.role === 'siluman')
        ? STR.finalHeld
        : STR.finalWargaSub;
  const lines: string[] = [];
  for (const n of m.nights) {
    lines.push(STR.chronNight(n.night, n.victim !== null ? nameOf(model, n.victim) : null));
    if (n.attacked !== null && n.victim === null && n.attacked === n.protected)
      lines.push(STR.chronSaved(nameOf(model, n.attacked)));
    const d = m.days.find((x) => x.day === n.night);
    if (d) {
      const role = d.out !== null ? ROLE_NAME[m.seat(d.out)?.role ?? 'warga'] : null;
      lines.push(STR.chronDay(d.day, d.out !== null ? nameOf(model, d.out) : null, role));
    }
  }
  return (
    <div class={`sl-final is-${side}`}>
      <div class="sl-final-head">
        <div class="sl-final-title">{STR.finalWin(SIDE_NAME[side])}</div>
        <div class="sl-sub">{sub}</div>
      </div>
      <div class="sl-final-body">
        <div class="sl-final-cast">
          {m.table.map((s) => (
            <CastCard key={s.id} model={model} s={s} />
          ))}
        </div>
        <div class="sl-chron">
          <div class="sl-eyebrow">{STR.finalChronicle}</div>
          {lines.slice(-9).map((l, i) => (
            <div key={i} class="sl-chron-line">
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CastCard({ model, s }: { model: ScreenModel; s: SceneSeat }) {
  const info = model.info(s.id);
  if (!info) return null;
  return (
    <div class={`sl-cast ${s.alive ? '' : 'is-out'}`}>
      <img src={roleSrc(s.role)} alt="" width={96} height={72} />
      <Avatar look={info.look} ring={info.color} size={40} face={s.alive ? 'happy' : 'sad'} />
      <div class="sl-cast-name">{info.name}</div>
      <div class="sl-cast-role">{ROLE_NAME[s.role]}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ the village row */

function Strip({ model }: { model: ScreenModel }) {
  const m = model.match;
  const seats = m.phase === 'setup' ? m.present : m.table;
  const marks = new Map(
    m.phase === 'discuss' || m.phase === 'defense' ? m.marks().map((x) => [x.id, x.n]) : [],
  );
  const dense = seats.length > 10;
  return (
    <div class={`sl-strip ${dense ? 'is-dense' : ''}`}>
      {seats.map((s) => {
        const info = model.info(s.id);
        if (!info) return null;
        const ghost = m.phase !== 'setup' && !s.alive;
        const tick =
          (m.phase === 'deal' && s.ready) ||
          (m.phase === 'discuss' && s.ready && s.alive) ||
          (m.phase === 'vote' && s.locked);
        const n = marks.get(s.id) ?? 0;
        const spot = m.phase === 'defense' && m.defender === s.id;
        return (
          <div
            key={s.id}
            class={`sl-seat ${ghost ? 'is-ghost' : ''} ${spot ? 'is-spot' : ''} ${s.present ? '' : 'is-away'}`}
          >
            {n > 0 && (
              <div class="sl-marks">
                <Icon name="target" size={16} stroke={3} />
                {n}
              </div>
            )}
            <div class="sl-seat-av">
              <Avatar
                look={info.look}
                ring={info.color}
                size={dense ? 46 : 56}
                face={ghost ? 'sad' : 'happy'}
              />
              {tick && <span class="sl-tick">✓</span>}
            </div>
            <div class="sl-seat-name">{info.name}</div>
            {ghost && <div class="sl-seat-tag">{STR.arwahTag}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ root */

const nightUrl = () => svgUrl('siluman:kampung:night', () => kampungSvg('night'));
const dayUrl = () => svgUrl('siluman:kampung:day', () => kampungSvg('day'));

function Sky() {
  return (
    <>
      <div class="sl-sky is-day-sky" style={{ backgroundImage: `url("${dayUrl()}")` }} aria-hidden="true" />
      <div
        class="sl-sky is-night-sky"
        style={{ backgroundImage: `url("${nightUrl()}")` }}
        aria-hidden="true"
      />
      <div class="sl-shade" aria-hidden="true" />
    </>
  );
}

/** The kampung alone: a far-away screen before the Host's first state arrives. */
export function SilumanBackdrop() {
  return (
    <div class="sl-root is-day is-setup">
      <Sky />
    </div>
  );
}

export function SilumanScreen({ model }: { model: ScreenModel }) {
  model.version.value;
  const m = model.match;
  const night = NIGHT_PHASES.has(m.phase);
  const final = m.phase === 'final' || m.phase === 'ended';
  return (
    <div class={`sl-root ${night ? 'is-night' : 'is-day'} is-${m.phase}`}>
      <Sky />
      <Header model={model} />
      <div class="sl-body">
        {m.phase === 'setup' && <Setup model={model} />}
        {m.phase === 'intro' && <Intro model={model} />}
        {m.phase === 'deal' && <Deal model={model} />}
        {m.phase === 'dusk' && <Dusk model={model} />}
        {m.phase === 'night' && <Night model={model} />}
        {m.phase === 'dawn' && <Dawn model={model} />}
        {m.phase === 'hunt' && <Hunt model={model} />}
        {m.phase === 'discuss' && <Discuss model={model} />}
        {m.phase === 'defense' && <Defense model={model} />}
        {m.phase === 'vote' && <Vote model={model} />}
        {m.phase === 'tally' && <TallyView model={model} />}
        {m.phase === 'reveal' && <Reveal model={model} />}
        {final && <Final model={model} />}
      </div>
      {!final && <Strip model={model} />}
    </div>
  );
}
