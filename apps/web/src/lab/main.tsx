/**
 * Lab Kontrol (`/lab/`): opened on a phone to tune the joystick, the swipe and Lari Terus moves,
 * and to find out which haptics the phone really plays; opened on the main screen device to tune
 * Lari Terus and the Rusun swing there. Everything runs locally (no network);
 * "Pakai setelan ini" stores the values in this browser (controls.ts) and shows them as text to
 * send to the developer.
 */
import '@fontsource/baloo-2/latin-800.css';
import '../shared/base.css';
import './lab.css';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import {
  applyControlTuning,
  type ControlTuning,
  cloneTuning,
  hasTuningOverride,
  resetControlTuning,
  tuningSummary,
} from '../shared/controls';
import { primeHaptics } from '../shared/haptics';
import { HapticTab } from './haptic';
import { RusunTab } from './rusun';
import { StickTab } from './stick';
import { STR } from './strings';
import { SwipeTab } from './swipe';

type Tab = 'stick' | 'swipe' | 'haptic' | 'rusun';
const TABS: readonly Tab[] = ['stick', 'swipe', 'haptic', 'rusun'];
const TAB_KEY = 'hoorah.lab.tab';

function storedTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return TABS.includes(v as Tab) ? (v as Tab) : 'stick';
  } catch {
    return 'stick';
  }
}

function rememberTab(t: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, t);
  } catch {
    // The first tab opens next time instead.
  }
}

type Notice = { kind: 'saved'; text: string } | { kind: 'reset' } | null;

function Lab() {
  const [tab, setTab] = useState<Tab>(storedTab);
  const [draft, setDraft] = useState<ControlTuning>(() => cloneTuning());
  const [override, setOverride] = useState(hasTuningOverride);
  const [notice, setNotice] = useState<Notice>(null);
  const [copy, setCopy] = useState<'idle' | 'ok' | 'fail'>('idle');

  /** Edit the draft and use it at once on this page (not stored until "Pakai"). */
  const update = (fn: (t: ControlTuning) => void) => {
    const next = cloneTuning(draft);
    fn(next);
    setDraft(applyControlTuning(next));
    setNotice(null);
  };

  const save = () => {
    const clean = applyControlTuning(draft, true);
    setDraft(clean);
    setOverride(hasTuningOverride());
    setNotice({ kind: 'saved', text: tuningSummary(clean) });
    setCopy('idle');
  };

  const reset = () => {
    setDraft(cloneTuning(resetControlTuning()));
    setOverride(false);
    setNotice({ kind: 'reset' });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopy('ok');
    } catch {
      setCopy('fail');
    }
  };

  return (
    <main class="lab">
      <header class="lab-head">
        <h1 class="display">{STR.title}</h1>
        <p class="lab-lead">{STR.lead}</p>
        <p class={`lab-status ${override ? 'on' : ''}`}>{override ? STR.overrideOn : STR.overrideOff}</p>
      </header>
      <div class="lab-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={t === tab}
            class={t === tab ? 'on' : ''}
            onClick={() => {
              setTab(t);
              rememberTab(t);
            }}
          >
            {STR.tabs[t]}
          </button>
        ))}
      </div>
      {tab === 'stick' && <StickTab tuning={draft} update={update} />}
      {tab === 'swipe' && <SwipeTab tuning={draft} update={update} />}
      {tab === 'haptic' && <HapticTab tuning={draft} update={update} />}
      {tab === 'rusun' && <RusunTab tuning={draft} update={update} />}
      <p class="lab-note">{STR.scopeNote}</p>
      {notice?.kind === 'saved' && (
        <div class="lab-saved" role="status">
          <p>{STR.saved}</p>
          <pre class="lab-summary">{notice.text}</pre>
          <button type="button" class="lab-chip" onClick={() => void copyText(notice.text)}>
            {copy === 'ok' ? STR.copied : STR.copy}
          </button>
          {copy === 'fail' && <p class="lab-note">{STR.copyFailed}</p>}
        </div>
      )}
      {notice?.kind === 'reset' && (
        <p class="lab-saved" role="status">
          {STR.resetDone}
        </p>
      )}
      <div class="lab-bar">
        <button type="button" class="lab-btn ghost" onClick={reset}>
          {STR.reset}
        </button>
        <button type="button" class="lab-btn" onClick={save}>
          {STR.save}
        </button>
      </div>
    </main>
  );
}

primeHaptics();
const root = document.getElementById('app');
if (root) render(<Lab />, root);
