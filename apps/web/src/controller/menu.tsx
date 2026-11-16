/**
 * Pre-game menu on the phone (`menu` view): pick a mode, a map or a colour before the game
 * starts. Picking is instant and can be changed; the game echoes the choice in `selected` and
 * mirrors the menu on the main screen.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../shared/ui';
import { Me, type V } from './common';
import { action, haptic } from './store';

export function MenuView({ v }: { v: V<'menu'> }) {
  // Local echo so the tap shows in the same frame; the next view from the game confirms it.
  const [picked, setPicked] = useState(v.selected);
  // The view now stays mounted across updates: adopt the game's choice whenever it changes.
  useEffect(() => setPicked(v.selected), [v.selected]);
  const selected = picked ?? v.selected;
  const swatch = v.layout === 'swatch';
  const locked = Boolean(v.locked);

  return (
    <div class={`ctrl menu ${swatch ? 'is-swatch-menu' : ''} ${locked ? 'is-locked' : ''}`}>
      <div class="panes">
        <div class="pane">
          <div class="row">
            <Me size={40} />
            <div class="menu-head">
              {v.eyebrow && <div class="menu-eyebrow">{v.eyebrow}</div>}
              <div class="menu-title">{v.title}</div>
            </div>
          </div>

          {locked && v.waiting && <div class="menu-waiting">{v.waiting}</div>}

          {(v.back || v.confirm) && !locked && (
            <div class="menu-actions">
              {v.back && (
                <button
                  type="button"
                  class="big-btn secondary"
                  onClick={() => {
                    haptic(10);
                    action(v.back!.id);
                  }}
                >
                  {v.back.label}
                </button>
              )}
              {v.confirm && (
                <button
                  type="button"
                  class={`big-btn ${v.confirm.style === 'yellow' ? 'yellow' : ''}`}
                  onClick={() => {
                    haptic(20);
                    action(v.confirm!.id);
                  }}
                >
                  {v.confirm.label}
                </button>
              )}
            </div>
          )}

          {v.hint && <div class="menu-hint">{v.hint}</div>}
        </div>
        <div class={`pane zone menu-options ${swatch ? 'is-swatch' : ''}`}>
          {v.options.map((o) => {
            const on = selected === o.id;
            return (
              <button
                type="button"
                key={o.id}
                class={`menu-opt ${on ? 'on' : ''}`}
                disabled={locked || o.disabled}
                style={o.color ? ({ '--opt': o.color } as JSX.CSSProperties) : undefined}
                onPointerDown={() => {
                  if (locked || o.disabled) return;
                  setPicked(o.id);
                  haptic(8);
                  action('pick', o.id);
                }}
              >
                {swatch && <span class="menu-swatch" />}
                <span class="menu-text">
                  <span class="menu-label">{o.label}</span>
                  {o.sub && <span class="menu-sub">{o.sub}</span>}
                </span>
                {o.badge && <span class="menu-badge">{o.badge}</span>}
                {on && !swatch && <Icon name="check" size={24} stroke={3} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
