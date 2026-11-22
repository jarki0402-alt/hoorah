/** Small building blocks of the Lab: a labelled slider and a segmented choice. */
import type { Range } from '../shared/controls';

/** Digits shown for a slider step (0.05 → 2). */
function digitsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

export function Slider({
  label,
  hint,
  value,
  range,
  unit,
  scale = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  range: Range;
  unit: string;
  /** Shown value = value × scale (e.g. 100 for a share shown in %). */
  scale?: number;
  onChange: (v: number) => void;
}) {
  const digits = Math.max(0, digitsOf(range.step) - Math.round(Math.log10(scale)));
  return (
    <label class="lab-slider">
      <span class="lab-slider-head">
        <span class="lab-slider-label">{label}</span>
        <output class="lab-slider-value">
          {(value * scale).toFixed(digits)} {unit}
        </output>
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onInput={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value))}
      />
      {hint && <span class="lab-slider-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset class="lab-seg-wrap">
      <legend class="lab-slider-label">{label}</legend>
      <div class="lab-seg">
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            aria-pressed={o.id === value}
            class={o.id === value ? 'on' : ''}
            onClick={() => onChange(o.id)}
          >
            {o.text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Keep the long-press menu and text selection away from a touch zone. */
export function noMenu(e: Event): void {
  e.preventDefault();
}

export function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    // Pointer already released.
  }
}
