/** Dashboard-wide state: who is signed in, the open tab, and the short toast message. */
import { signal } from '@preact/signals';

export type Session =
  | { state: 'checking' }
  | { state: 'out'; notice: string | null }
  | { state: 'in'; username: string };

export const session = signal<Session>({ state: 'checking' });

export type TabId =
  | 'pass'
  | 'settings'
  | 'reports'
  | 'errors'
  | 'room'
  | 'server'
  | 'usage'
  | 'security'
  | 'account';
export const TAB_IDS: readonly TabId[] = [
  'pass',
  'reports',
  'settings',
  'room',
  'server',
  'errors',
  'usage',
  'security',
  'account',
];

const TAB_KEY = 'hoorah.admin.tab';
const isTab = (v: unknown): v is TabId => typeof v === 'string' && (TAB_IDS as readonly string[]).includes(v);

/** Storage can be missing or throw (private mode, blocked site data); the dashboard works without it. */
function readTab(): TabId {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return isTab(v) ? v : 'pass';
  } catch {
    return 'pass';
  }
}

export const tab = signal<TabId>(readTab());

export function openTab(id: TabId): void {
  tab.value = id;
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch {
    // Remembering the tab is a convenience only.
  }
}

/** Reports still marked "Baru", for the badge on the "Pengaduan" tab; null until first read. */
export const newReports = signal<number | null>(null);

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

export const toast = signal<Toast | null>(null);
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string, tone: Toast['tone'] = 'ok'): void {
  toastSeq += 1;
  toast.value = { id: toastSeq, text, tone };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 2400);
}
