/** Small building blocks shared by the admin screens: icons, dialogs, chips, stepper, empty state. */
import type { ComponentChildren, JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon, type IconName } from '../shared/ui';
import { STR } from './strings';

/* ------------------------------------------------------------------ Icons */

const LOCAL_ICONS = {
  copy: 'M9 9 H19 a1 1 0 0 1 1 1 V19 a1 1 0 0 1 -1 1 H10 a1 1 0 0 1 -1 -1 Z M15 5 V4 a1 1 0 0 0 -1 -1 H5 a1 1 0 0 0 -1 1 V13 a1 1 0 0 0 1 1 H6',
  share:
    'M12 14 V3 M7.5 7.5 L12 3 L16.5 7.5 M8 11 H6 a1 1 0 0 0 -1 1 V20 a1 1 0 0 0 1 1 H18 a1 1 0 0 0 1 -1 V12 a1 1 0 0 0 -1 -1 H16',
  trash: 'M4 7 H20 M9.5 7 V4.5 H14.5 V7 M6.5 7 L7.5 20 H16.5 L17.5 7 M10 11 V16.5 M14 11 V16.5',
  ticket:
    'M3 8 a2 2 0 0 0 0 4 a2 2 0 0 1 0 4 V18 H21 V16 a2 2 0 0 1 0 -4 a2 2 0 0 0 0 -4 V6 H3 Z M14 6 V8 M14 11 V13 M14 16 V18',
  minus: 'M5 12 H19',
} as const;

export type AdminIconName = keyof typeof LOCAL_ICONS | IconName;

export function AdminIcon({ name, size = 18 }: { name: AdminIconName; size?: number }) {
  if (!(name in LOCAL_ICONS)) return <Icon name={name as IconName} size={size} stroke={2.2} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ flex: 'none' }}
    >
      <path d={LOCAL_ICONS[name as keyof typeof LOCAL_ICONS]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ Modal */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, top last: only the top one answers Escape. */
const openStack: symbol[] = [];

function setBackgroundInert(on: boolean): void {
  const app = document.getElementById('app');
  if (app) app.inert = on;
  document.documentElement.classList.toggle('ad-locked', on);
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  /** 'sheet' slides up from the bottom on phones; 'alert' is a small centred box. */
  kind?: 'sheet' | 'alert';
  /** While true the dialog cannot be dismissed (a request is running). */
  busy?: boolean;
  /** Extra line under the title for screen readers and sighted users. */
  description?: string;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  kind = 'sheet',
  busy = false,
  description,
}: ModalProps) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const token = Symbol('modal');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openStack.push(token);
    setBackgroundInert(true);
    const el = box.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token || !el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.getClientRects().length > 0,
      );
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === head || active === el)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (active === tail || !el.contains(active))) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = openStack.indexOf(token);
      if (at >= 0) openStack.splice(at, 1);
      if (openStack.length === 0) setBackgroundInert(false);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const dismiss = () => {
    if (!busyRef.current) closeRef.current();
  };

  return createPortal(
    <div class={`ad-layer ad-layer--${kind}`}>
      <div class="ad-backdrop" aria-hidden="true" onClick={dismiss} />
      <div
        ref={box}
        class={`ad-modal ad-modal--${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <header class="ad-modal-head">
          <h2 id={titleId} class="ad-modal-title">
            {title}
          </h2>
          {kind === 'sheet' && (
            <button
              type="button"
              class="ad-icon-btn"
              aria-label={STR.close}
              onClick={dismiss}
              disabled={busy}
            >
              <AdminIcon name="close" size={20} />
            </button>
          )}
        </header>
        <div class="ad-modal-body">
          {description && (
            <p id={descId} class="ad-modal-desc">
              {description}
            </p>
          )}
          {children}
        </div>
        {footer && <footer class="ad-modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Confirm */

interface ConfirmProps {
  title: string;
  body: string;
  confirm: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirm, busy, error, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      title={title}
      kind="alert"
      busy={busy}
      description={body}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="ad-btn ad-btn--ghost" onClick={onClose} disabled={busy} data-autofocus>
            {STR.cancel}
          </button>
          <button type="button" class="ad-btn ad-btn--danger" onClick={onConfirm} disabled={busy}>
            {busy ? STR.saving : confirm}
          </button>
        </>
      }
    >
      <ErrorText text={error} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ Chips */

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipRadiosProps<T extends string> {
  legend: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  help?: string;
  children?: ComponentChildren;
}

/** A row of native radio buttons drawn as chips (arrow keys move between them). */
export function ChipRadios<T extends string>({
  legend,
  options,
  value,
  onChange,
  help,
  children,
}: ChipRadiosProps<T>) {
  const name = useId();
  const helpId = useId();
  return (
    <fieldset class="ad-field ad-fieldset" aria-describedby={help ? helpId : undefined}>
      <legend class="ad-label">{legend}</legend>
      <div class="ad-chips">
        {options.map((o) => (
          <label key={o.value} class={`ad-chip${o.value === value ? ' is-on' : ''}`}>
            <input
              type="radio"
              class="ad-chip-input"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {children}
      {help && (
        <p id={helpId} class="ad-help">
          {help}
        </p>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ Stepper */

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  help?: string;
}

export function Stepper({ label, value, min, max, onChange, help }: StepperProps) {
  const id = useId();
  const helpId = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const onInput = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    const n = Number(e.currentTarget.value);
    if (e.currentTarget.value !== '' && Number.isFinite(n)) onChange(clamp(n));
  };
  return (
    <div class="ad-field">
      <label class="ad-label" for={id}>
        {label}
      </label>
      <div class="ad-stepper">
        <button
          type="button"
          class="ad-step"
          aria-label={STR.fewerPlayers}
          aria-controls={id}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <AdminIcon name="minus" size={20} />
        </button>
        <input
          id={id}
          class="ad-step-value"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-describedby={help ? helpId : undefined}
          onChange={onInput}
          onBlur={(e) => {
            e.currentTarget.value = String(value);
          }}
        />
        <button
          type="button"
          class="ad-step"
          aria-label={STR.morePlayers}
          aria-controls={id}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          <AdminIcon name="plus" size={20} />
        </button>
      </div>
      {help && (
        <p id={helpId} class="ad-help">
          {help}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Misc */

export function ErrorText({ text, id }: { text: string | null; id?: string }) {
  return (
    <p id={id} class="ad-error" role="alert" hidden={!text}>
      {text}
    </p>
  );
}

export function EmptyState({ icon, title, body }: { icon: AdminIconName; title: string; body: string }) {
  return (
    <div class="ad-empty">
      <span class="ad-empty-icon">
        <AdminIcon name={icon} size={26} />
      </span>
      <p class="ad-empty-title">{title}</p>
      <p class="ad-empty-body">{body}</p>
    </div>
  );
}

export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div class="ad-banner" role="alert">
      <span>{text}</span>
      <button type="button" class="ad-btn ad-btn--small" onClick={onRetry}>
        {STR.retry}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Numbers */

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
  tone?: string;
  children?: ComponentChildren;
}

/** One number in a `<dl class="ad-stats">`: label, value, optional picture and hint. */
export function Stat({ label, value, hint, wide = false, tone, children }: StatProps) {
  return (
    <div class={`ad-card ad-stat${wide ? ' ad-stat--wide' : ''}${tone ? ` is-${tone}` : ''}`}>
      <dt class="ad-stat-label">{label}</dt>
      <dd class="ad-stat-value">{value}</dd>
      {children}
      {hint && <dd class="ad-stat-hint">{hint}</dd>}
    </div>
  );
}

/** A label and its value on one line inside a card (wraps on a narrow phone). */
export function Row({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="ad-row">
      <div class="ad-row-line">
        <span class="ad-row-label">{label}</span>
        <span class="ad-row-value">{value}</span>
      </div>
      {children}
    </div>
  );
}

/** A row of toggle buttons for a time range (one pressed at a time). */
export function RangeButtons<T extends number>({
  label,
  options,
  value,
  names,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  names: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset class="ad-filters">
      <legend class="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          class={`ad-filter${o === value ? ' is-on' : ''}`}
          aria-pressed={o === value}
          onClick={() => onChange(o)}
        >
          {names[o]}
        </button>
      ))}
    </fieldset>
  );
}
