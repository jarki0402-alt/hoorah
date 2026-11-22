/**
 * `peek` view: a secret card that stays face down until held. The word shows only while a finger
 * rests on the card (pointer down) and hides the moment it lifts, leaves the card or the touch is
 * cancelled, so a neighbour glancing over sees a face-down card. Nothing is sent while peeking;
 * the optional button under the card sends `action(id)`. A new `deal` remounts the view (see
 * viewKey), which turns the card face down again.
 */
import { peekWord } from '@hoorah/protocol';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../shared/ui';
import { Me, Timer, usePress, type V } from './common';
import './peek.css';
import { action, haptic } from './store';
import { STR } from './strings';

export function PeekView({ v }: { v: V<'peek'> }) {
  const [open, setOpen] = useState(false);
  const [pressed, fire] = usePress();
  const word = peekWord(v.word);

  // Hide the card whenever the page loses focus mid-hold (app switch, notification shade).
  useEffect(() => {
    const hide = () => setOpen(false);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  const show = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement | null;
    try {
      el?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety: without it, leaving the card simply hides the word.
    }
    if (!open) haptic(10);
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <div class={`ctrl peek-view ${v.spotlight ? 'is-spot' : ''}`}>
      <div class="panes">
        <div class="pane">
          <div class="peek-top">
            <Me size={40} />
            <div class="peek-head">
              <div class="peek-eyebrow">{v.eyebrow}</div>
              <div class="peek-title">{v.title}</div>
            </div>
            <Timer deadline={v.deadline} />
          </div>
        </div>
        <div class="pane zone peek-zone">
          <button
            type="button"
            class={`peek-card ${open ? 'is-open' : ''}`}
            aria-label={STR.peekHold}
            onPointerDown={show}
            onPointerUp={hide}
            onPointerCancel={hide}
            onPointerLeave={hide}
            onLostPointerCapture={hide}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span class="peek-back" aria-hidden={open}>
              <span class="peek-back-mark">?</span>
              <span class="peek-back-label">
                <Icon name="hand" size={22} stroke={3} />
                {STR.peekHold}
              </span>
            </span>
            <span class="peek-face" aria-hidden={!open}>
              {v.tag && <span class="peek-tag">{v.tag}</span>}
              {open &&
                (word ? (
                  <span class="peek-word">{word}</span>
                ) : (
                  <span class="peek-word is-blank">{v.blank ?? ''}</span>
                ))}
              {open && v.caption && <span class="peek-caption">{v.caption}</span>}
            </span>
          </button>
        </div>
        <div class="pane">
          <div class="peek-release muted">{STR.peekRelease}</div>
          {v.hint && <div class="peek-hint">{v.hint}</div>}
          {v.action && (
            <button
              type="button"
              class={`big-btn ${v.action.style === 'yellow' ? 'yellow' : v.action.style === 'secondary' ? 'secondary' : ''} ${pressed ? 'pressed' : ''}`}
              onPointerDown={() => {
                fire();
                haptic(20);
                action(v.action!.id);
              }}
            >
              {v.action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
