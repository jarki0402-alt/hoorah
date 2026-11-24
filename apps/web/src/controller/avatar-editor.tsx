/**
 * The avatar maker on the phone (owner 2026-11-24): pick one of the 24 cast characters, then
 * optionally its skin tone, another hair style, a hair colour and an outfit colour; "Acak" rolls
 * a random one. Used before joining (profile page) and in the lobby ("Ubah").
 */
import {
  HAIR_COLORS,
  type Look,
  OUTFIT_COLORS,
  PERSON_IDS,
  type PersonId,
  SKIN_TONES,
} from '@hoorah/protocol';
import { useState } from 'preact/hooks';
import { HAIR_PALETTE, OUTFIT_PALETTE, resolveLook, SKIN_PALETTE } from '../shared/art/people';
import { PERSON_NAMES } from '../shared/peopleStrings';
import { PersonArt, PersonBadge } from '../shared/person';
import { Icon } from '../shared/ui';
import { finishPicking, look, pickLook, randomLook } from './store';
import { AVATAR } from './strings';

type Tab = 'who' | 'skin' | 'hair' | 'hairColor' | 'outfit';
const TABS: Tab[] = ['who', 'skin', 'hair', 'hairColor', 'outfit'];

/** A look without the keys set to `undefined` (the server and the phone compare them). */
function clean(l: Look): Look {
  const out: Look = { c: l.c };
  if (l.s !== undefined) out.s = l.s;
  if (l.h !== undefined && l.h !== l.c) out.h = l.h;
  if (l.hc !== undefined) out.hc = l.hc;
  if (l.oc !== undefined) out.oc = l.oc;
  return out;
}

function Swatch({
  color,
  on,
  label,
  onPick,
}: {
  color: string | null;
  on: boolean;
  label: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      class={`ae-swatch ${on ? 'on' : ''} ${color ? '' : 'is-original'}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      style={color ? { background: color } : undefined}
      onClick={onPick}
    >
      {color ? null : <span>{AVATAR.original}</span>}
    </button>
  );
}

export function AvatarEditor({ value, onChange }: { value: Look; onChange: (l: Look) => void }) {
  const [tab, setTab] = useState<Tab>('who');
  const set = (patch: Partial<Look>) => onChange(clean({ ...value, ...patch }));
  const skinNow = resolveLook(value).skin;
  const hairNow = value.h ?? value.c;
  return (
    <div class="ae">
      <div class="ae-top">
        <PersonBadge id={value} face="grin" size={92} ring="#FF5A1F" class="ae-preview" label />
        <div class="ae-top-text">
          <b class="ae-name">{PERSON_NAMES[value.c]}</b>
          <button type="button" class="ae-random" onClick={() => onChange(randomLook())}>
            <Icon name="restart" size={18} stroke={2.4} />
            {AVATAR.random}
          </button>
        </div>
      </div>
      <div class="ae-tabs" role="tablist" aria-label={AVATAR.tabsLabel}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            class={`ae-tab ${tab === t ? 'on' : ''}`}
            onClick={() => setTab(t)}
          >
            {AVATAR.tabs[t]}
          </button>
        ))}
      </div>
      <div class={`ae-panel is-${tab}`} role="tabpanel">
        {tab === 'who' &&
          PERSON_IDS.map((id: PersonId) => (
            <button
              type="button"
              key={id}
              class={`ae-cell ${value.c === id ? 'on' : ''}`}
              aria-pressed={value.c === id}
              aria-label={PERSON_NAMES[id]}
              onClick={() => onChange({ c: id })}
            >
              <PersonBadge id={id} size={52} ring={value.c === id ? '#FF5A1F' : undefined} />
            </button>
          ))}
        {tab === 'skin' &&
          Array.from({ length: SKIN_TONES }, (_, i) => (
            <Swatch
              key={i}
              color={SKIN_PALETTE[i]!}
              on={skinNow === i + 1}
              label={AVATAR.skin(i + 1)}
              onPick={() => set({ s: i + 1 })}
            />
          ))}
        {tab === 'hair' &&
          PERSON_IDS.map((id: PersonId) => (
            <button
              type="button"
              key={id}
              class={`ae-cell ae-hair ${hairNow === id ? 'on' : ''}`}
              aria-pressed={hairNow === id}
              aria-label={AVATAR.hairOf(PERSON_NAMES[id])}
              onClick={() => set({ h: id })}
            >
              <PersonArt id={clean({ ...value, h: id })} width={50} />
            </button>
          ))}
        {tab === 'hairColor' && (
          <>
            <Swatch
              color={null}
              on={value.hc === undefined}
              label={AVATAR.original}
              onPick={() => set({ hc: undefined })}
            />
            {Array.from({ length: HAIR_COLORS }, (_, i) => (
              <Swatch
                key={i}
                color={HAIR_PALETTE[i]!}
                on={value.hc === i}
                label={AVATAR.color(i + 1)}
                onPick={() => set({ hc: i })}
              />
            ))}
          </>
        )}
        {tab === 'outfit' && (
          <>
            <Swatch
              color={null}
              on={value.oc === undefined}
              label={AVATAR.original}
              onPick={() => set({ oc: undefined })}
            />
            {Array.from({ length: OUTFIT_COLORS }, (_, i) => (
              <Swatch
                key={i}
                color={OUTFIT_PALETTE[i]!}
                on={value.oc === i}
                label={AVATAR.color(i + 1)}
                onPick={() => set({ oc: i })}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Right after joining: the avatar maker on the whole screen, "Siap" at the bottom. Every pick
 * shows on the main screen at once; the seat there says "memilih tokoh..." until Siap.
 */
export function PickPage() {
  return (
    <div class="ctrl pick-page">
      <div class="pick-head">
        <h1 class="title">{AVATAR.pickTitle}</h1>
        <div class="muted">{AVATAR.pickSub}</div>
      </div>
      <AvatarEditor value={look.value} onChange={pickLook} />
      <button type="button" class="big-btn pick-ready" onClick={finishPicking}>
        {AVATAR.ready}
      </button>
    </div>
  );
}
