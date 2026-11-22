/**
 * `word` view: word entry with the controller's own A–Z keyboard (no system keyboard, so nothing
 * pops up over the game and every phone looks the same). The locked `prefix` (e.g. the syllable
 * to continue from) is shown in front of the typed letters; submitting sends the whole word.
 * A new `turn` remounts the view (see viewKey), which clears the input.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../shared/ui';
import { Me, Timer, usePress, type V } from './common';
import { action, haptic } from './store';
import { STR } from './strings';
import './word.css';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
/** Holding Hapus this long clears everything typed. */
const CLEAR_MS = 480;
/** If the main screen never answers a submit, unlock the keyboard again after this long. */
const SEND_TIMEOUT_MS = 2500;

export function WordView({ v }: { v: V<'word'> }) {
  const max = Math.max(2, v.maxLength ?? 20);
  const prefix = (v.prefix ?? '').toUpperCase();
  const room = Math.max(0, max - prefix.length);
  const locked = Boolean(v.locked);
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const off = locked || sending;

  useEffect(() => {
    if (!sending) return;
    const t = window.setTimeout(() => setSending(false), SEND_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [sending]);

  // Latest state for the physical-keyboard listener, which is installed once.
  const state = useRef({ typed, off, room, prefix });
  state.current = { typed, off, room, prefix };

  const add = (ch: string) => {
    const s = state.current;
    if (s.off || s.typed.length >= s.room) return;
    setTyped(s.typed + ch);
    haptic(4);
  };
  const del = () => {
    const s = state.current;
    if (s.off || !s.typed) return;
    setTyped(s.typed.slice(0, -1));
    haptic(4);
  };
  const clear = () => {
    if (state.current.off) return;
    setTyped('');
    haptic(12);
  };
  const submit = () => {
    const s = state.current;
    const word = (s.prefix + s.typed).toLowerCase();
    if (s.off || !s.typed || word.length < 2) {
      haptic([10, 30, 10]);
      return;
    }
    action('word', word);
    setSending(true);
    haptic(20);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-z]$/i.test(e.key)) add(e.key.toUpperCase());
      else if (e.key === 'Backspace') del();
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lives = v.lives;
  return (
    <div class={`ctrl word-view ${locked ? 'is-locked' : ''}`}>
      <div class="word-top">
        <Me size={36} />
        <span class="word-eyebrow">{v.eyebrow}</span>
        {lives && (
          <span class="word-lives" role="img" aria-label={STR.wordLives(lives.left, lives.total)}>
            {Array.from({ length: lives.total }, (_, i) => (
              <span key={i} class={i < lives.left ? 'on' : ''}>
                <Icon name="heart" size={18} />
              </span>
            ))}
          </span>
        )}
        <Timer deadline={v.deadline} />
      </div>

      <div class="word-title-row">
        <div class="word-title">{v.title}</div>
        {v.extra && <ExtraKey label={v.extra.label} id={v.extra.id} />}
      </div>

      {v.slots ? (
        <div
          class={`word-slots ${v.error ? 'has-error' : ''} ${max > 10 ? 'is-long' : ''}`}
          role="status"
          aria-label={typed}
          style={{ '--slots': String(max) } as JSX.CSSProperties}
        >
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              class={`word-slot ${i < typed.length ? 'is-filled' : ''} ${i === typed.length && !off ? 'is-next' : ''}`}
            >
              {typed[i] ?? ''}
            </span>
          ))}
        </div>
      ) : (
        <div class={`word-input ${v.error ? 'has-error' : ''}`} aria-live="polite">
          {prefix && <span class="word-prefix">{prefix}</span>}
          {typed ? (
            <span class="word-typed">{typed}</span>
          ) : (
            !locked && !prefix && <span class="word-placeholder">{STR.wordPlaceholder}</span>
          )}
          {!off && <span class="word-caret" aria-hidden="true" />}
        </div>
      )}

      <div class={`word-note ${v.error ? 'is-error' : ''}`}>
        {sending ? STR.wordSending : (v.error ?? v.hint ?? ' ')}
      </div>

      <div class="word-keys">
        {ROWS.map((row, r) => (
          <div class="word-row" key={row}>
            {[...row].map((ch) => (
              <Key key={ch} label={ch} disabled={off} onPress={() => add(ch)} />
            ))}
            {r === 2 && <DeleteKey disabled={off} onDelete={del} onClear={clear} />}
          </div>
        ))}
        <SendKey disabled={off || !typed} onSend={submit} />
      </div>
    </div>
  );
}

/** Small secondary button next to the title (e.g. "Dengar lagi"); works even while sending. */
function ExtraKey({ id, label }: { id: string; label: string }) {
  const [pressed, fire] = usePress();
  return (
    <button
      type="button"
      class={`word-extra ${pressed ? 'pressed' : ''}`}
      onPointerDown={() => {
        fire();
        haptic(10);
        action(id);
      }}
    >
      <Icon name="volume" size={18} stroke={2.6} />
      {label}
    </button>
  );
}

function Key({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const [pressed, fire] = usePress();
  return (
    <button
      type="button"
      class={`word-key ${pressed ? 'pressed' : ''}`}
      aria-label={label}
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return;
        fire();
        onPress();
      }}
    >
      {label}
    </button>
  );
}

function DeleteKey({
  disabled,
  onDelete,
  onClear,
}: {
  disabled: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [pressed, fire] = usePress();
  const timer = useRef(0);
  const stop = () => window.clearTimeout(timer.current);
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      class={`word-key is-wide is-delete ${pressed ? 'pressed' : ''}`}
      aria-label={STR.wordDelete}
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return;
        fire();
        onDelete();
        stop();
        timer.current = window.setTimeout(onClear, CLEAR_MS);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
    >
      <Icon name="undo" size={22} stroke={2.6} />
    </button>
  );
}

function SendKey({ disabled, onSend }: { disabled: boolean; onSend: () => void }) {
  const [pressed, fire] = usePress();
  return (
    <button
      type="button"
      class={`word-send ${pressed ? 'pressed' : ''}`}
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return;
        fire();
        onSend();
      }}
    >
      <Icon name="check" size={24} stroke={3} />
      {STR.wordSend}
    </button>
  );
}
