/**
 * Diagnosa getar iPhone: finds which way of toggling a `switch` checkbox still makes this iOS
 * version tick. Variant 1 is the ground truth (the owner taps a real, visible switch); the others
 * are the hidden ways a game can trigger it, each from a `click` (a gesture WebKit always trusts).
 */
import { useState } from 'preact/hooks';
import { hapticMethod } from '../shared/haptics';
import { DIAG } from './strings';

type HideMode = 'none' | 'offscreen';

/** Toggles a freshly made switch through its label, hidden the given way, then removes it. */
function tickHidden(mode: HideMode, parent: HTMLElement): void {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  if (mode === 'none') label.style.display = 'none';
  else
    label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  parent.appendChild(label);
  label.click();
  parent.removeChild(label);
}

function environment(): string {
  const hasSwitch = 'switch' in HTMLInputElement.prototype;
  return DIAG.env(hapticMethod(), hasSwitch);
}

export function IosDiag() {
  const [log, setLog] = useState<string[]>([]);
  const note = (s: string) => setLog((l) => [s, ...l].slice(0, 6));

  return (
    <section class="lab-diag" aria-label={DIAG.title}>
      <p class="lab-sub">{DIAG.title}</p>
      <p class="lab-note">{DIAG.intro}</p>
      <p class="lab-note">{environment()}</p>

      <label class="lab-test lab-diag-switch">
        <span class="lab-test-letter" aria-hidden="true">
          1
        </span>
        <span class="lab-test-label">{DIAG.visible}</span>
        <input type="checkbox" {...{ switch: '' }} onChange={() => note(DIAG.done(1))} />
      </label>

      <button
        type="button"
        class="lab-test"
        onClick={() => {
          tickHidden('none', document.head);
          note(DIAG.done(2));
        }}
      >
        <span class="lab-test-letter" aria-hidden="true">
          2
        </span>
        <span class="lab-test-label">{DIAG.hiddenHead}</span>
      </button>

      <button
        type="button"
        class="lab-test"
        onClick={() => {
          tickHidden('offscreen', document.body);
          note(DIAG.done(3));
        }}
      >
        <span class="lab-test-letter" aria-hidden="true">
          3
        </span>
        <span class="lab-test-label">{DIAG.hiddenOff}</span>
      </button>

      <div class="lab-test lab-diag-overlay">
        <span class="lab-test-letter" aria-hidden="true">
          4
        </span>
        <span class="lab-test-label">{DIAG.overlay}</span>
        <label class="lab-diag-cover" aria-label={DIAG.overlay}>
          <input type="checkbox" {...{ switch: '' }} onChange={() => note(DIAG.done(4))} />
        </label>
      </div>

      <ul class="lab-note lab-diag-log" aria-live="polite">
        {log.map((s, i) => (
          <li key={`${i}-${s}`}>{s}</li>
        ))}
      </ul>
    </section>
  );
}
