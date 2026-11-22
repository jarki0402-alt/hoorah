/**
 * Pre-game menu on the phone (`menu` view): pick a mode, a map or a colour before the game
 * starts. Picking is instant and can be changed; the game echoes the choice in `selected` and
 * mirrors the menu on the main screen.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../shared/ui';
import { Me, PlayerAvatar, type V } from './common';
import { action, haptic, platform } from './store';
import { thumbSrc, useThumbs, wantsThumbs } from './thumbs';
import './thumbs.css';

export function MenuView({ v }: { v: V<'menu'> }) {
  // Local echo so the tap shows in the same frame; the next view from the game confirms it.
  const [picked, setPicked] = useState(v.selected);
  // The view now stays mounted across updates: adopt the game's choice whenever it changes.
  useEffect(() => setPicked(v.selected), [v.selected]);
  const selected = picked ?? v.selected;
  const swatch = v.layout === 'swatch';
  const locked = Boolean(v.locked);
  // Pictures (if the game sent `thumb` keys): every option drawn = tiles, otherwise rows with a
  // picture where one exists. Text-only until the game's thumbnail chunk arrives.
  const gameId = platform.value.gameId;
  const thumbs = useThumbs(gameId, !swatch && wantsThumbs(gameId, v.options));
  const srcs = v.options.map((o) => (thumbs && gameId ? thumbSrc(gameId, thumbs, o.thumb) : null));
  // An explicit `list` layout keeps rows (long second lines), pictures on the left.
  const pics = v.options.map((o, i) => Boolean(srcs[i]) || o.avatarOf !== undefined);
  const tiles = v.layout !== 'list' && pics.length > 0 && pics.every(Boolean);
  const n = v.options.length;
  // Upright: 2 columns (3 from 5 options). Sideways: one row up to 3, 2×2 for 4, then 3 or 4
  // per row, so labels keep room to be read.
  const cols = n <= 4 ? 2 : 3;
  const wide = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;

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
        <div
          class={`pane zone menu-options ${swatch ? 'is-swatch' : ''} ${tiles ? 'is-tiles' : ''}`}
          style={tiles ? ({ '--cols': cols, '--wide': wide } as JSX.CSSProperties) : undefined}
        >
          {v.options.map((o, i) => {
            const on = selected === o.id;
            const src = srcs[i];
            return (
              <button
                type="button"
                key={o.id}
                class={`menu-opt ${on ? 'on' : ''} ${pics[i] ? 'has-thumb' : ''}`}
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
                {src && (
                  <span class="menu-thumb">
                    <img src={src} alt="" decoding="async" draggable={false} />
                  </span>
                )}
                {!src && o.avatarOf !== undefined && (
                  <span class="menu-thumb is-avatar">
                    <PlayerAvatar id={o.avatarOf} size={64} />
                  </span>
                )}
                <span class="menu-text">
                  <span class="menu-label">{o.label}</span>
                  {o.sub && <span class="menu-sub">{o.sub}</span>}
                </span>
                {o.badge && <span class="menu-badge">{o.badge}</span>}
                {on && !swatch && (
                  <span class="menu-check">
                    <Icon name="check" size={tiles ? 18 : 24} stroke={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
