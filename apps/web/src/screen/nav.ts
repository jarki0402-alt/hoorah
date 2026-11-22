import type { NavKey } from '@hoorah/protocol';
import { signal } from '@preact/signals';

/**
 * Spatial focus for a 10-foot UI. Each page declares rows of focusable ids; the same keys come
 * from the TV remote/keyboard and from the Host's phone d-pad.
 */
export interface FocusMap {
  rows: string[][];
  onOk: (id: string) => void;
  onBack?: () => void;
  onMenu?: () => void;
  /** Called whenever focus moves (sound, side effects). */
  onMove?: (id: string) => void;
  /**
   * Column to land on when moving up/down into `toRow` (e.g. the card a row was left on). Return
   * undefined for the default: the same relative position as in the row left.
   */
  pickCol?: (toRow: number, fromRow: number, fromCol: number) => number | undefined;
}

export const focused = signal<string>('');
let map: FocusMap | null = null;
let pos = { row: 0, col: 0 };

/**
 * Installs a focus map and returns its disposer. The disposer only clears the map it installed,
 * so a parent cleaning up after a child (or vice versa) can never wipe the newer map.
 */
export function setFocusMap(next: FocusMap, initial?: string): () => void {
  map = next;
  const target = initial ?? focused.value;
  const found = locate(target);
  pos = found ?? { row: 0, col: 0 };
  focused.value = next.rows[pos.row]?.[pos.col] ?? '';
  return () => {
    if (map === next) map = null;
  };
}

function locate(id: string): { row: number; col: number } | null {
  if (!map || !id) return null;
  for (let r = 0; r < map.rows.length; r++) {
    const c = map.rows[r]!.indexOf(id);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

/** Focus a specific item (mouse hover/click). */
export function focus(id: string): void {
  const found = locate(id);
  if (!found) return;
  pos = found;
  if (focused.value !== id) {
    focused.value = id;
    map?.onMove?.(id);
  }
}

export function press(key: NavKey): void {
  if (!map) return;
  const rows = map.rows;
  const move = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const len = rows[r]?.length ?? 0;
    if (!len) return;
    const c = Math.max(0, Math.min(len - 1, col));
    if (r === pos.row && c === pos.col) return;
    // Keep the horizontal position proportional when rows differ in length.
    pos = { row: r, col: c };
    focused.value = rows[r]![c]!;
    map?.onMove?.(focused.value);
  };
  switch (key) {
    case 'left':
      move(pos.row, pos.col - 1);
      return;
    case 'right':
      move(pos.row, pos.col + 1);
      return;
    case 'up':
    case 'down': {
      const target = pos.row + (key === 'up' ? -1 : 1);
      if (target < 0 || target >= rows.length) return;
      const from = rows[pos.row]?.length ?? 1;
      const to = rows[target]?.length ?? 1;
      const col =
        map.pickCol?.(target, pos.row, pos.col) ??
        Math.round((pos.col / Math.max(1, from - 1)) * Math.max(0, to - 1));
      move(target, col);
      return;
    }
    case 'ok':
      if (focused.value) map.onOk(focused.value);
      return;
    case 'back':
      map.onBack?.();
      return;
    case 'menu':
      map.onMenu?.();
      return;
  }
}

const KEYS: Record<string, NavKey> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'ok',
  ' ': 'ok',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
  m: 'menu',
  ContextMenu: 'menu',
};

/** TV remotes and keyboards. Returns a disposer. */
export function bindKeyboard(onFirstInput: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    const key = KEYS[e.key] ?? (e.keyCode === 10009 || e.keyCode === 461 ? 'back' : undefined);
    if (!key) return;
    e.preventDefault();
    onFirstInput();
    press(key);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
