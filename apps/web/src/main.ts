/**
 * One site for every device. Decides whether this visit is the landing page, the big screen or a
 * controller, then loads only that app (separate chunks, so phones never download the TV code).
 *
 * Order of precedence:
 *  0. A far-away main screen link (`/J/482917-K7M2Q9XA`, long-distance play) is always a main
 *     screen that follows the Host's one, even on a phone-sized browser.
 *  1. An invite link (?r=CODE) always joins as a player.
 *  2. `/` is always the landing page (a device that already ran the main screen gets a
 *     "continue as the main screen" button there).
 *  3. An explicit choice made with the "switch role" button (remembered on this device).
 *  4. Device detection: phones are controllers; laptops, desktops, tablets and TVs are screens.
 */
import { looksLikePhone } from './shared/device';
import { markScreenUsed } from './shared/visit';

export type Role = 'screen' | 'controller';

const MODE_KEY = 'hoorah.mode';

function storedMode(): Role | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'screen' || v === 'controller' ? v : null;
  } catch {
    return null;
  }
}

// The QR's short invite link (`/R/482917`, in capitals to keep the QR small, see inviteUrl) is the
// same as `/?r=482917`.
const short = /^\/r\/(\d{6})\/?$/i.exec(location.pathname);
if (short) history.replaceState(null, '', `/?r=${short[1]}${location.hash}`);

// The far-away main screen link (`/J/482917-K7M2Q9XA`, capitals for a compact QR like the invite)
// is the main screen app at `/main?mirror=...` (screen/mode.ts reads and checks it).
const far = /^\/j\/(\d{6}-[0-9a-z]{8})\/?$/i.exec(location.pathname);
if (far) history.replaceState(null, '', `/main?mirror=${far[1]}${location.hash}`);

type Entry = Role | 'landing';

/**
 * `/` is the landing page (owner 2026-11-23), also on a device that already ran the main screen
 * (owner 2026-11-24): the landing page then offers to continue as the main screen. The main
 * screen lives at `/main`. Invite links, `?tv`, `?ctrl` and every other path keep the old rules.
 */
function decide(): Entry {
  const params = new URLSearchParams(location.search);
  if (params.has('mirror')) return 'screen';
  if (params.has('r') || params.has('ctrl')) return 'controller';
  if (params.has('tv')) return 'screen';
  if (location.pathname === '/' || location.pathname === '/index.html') return 'landing';
  return storedMode() ?? (looksLikePhone() ? 'controller' : 'screen');
}

// Graphics diagnostics (`/?diag=1`), opened by hand on the device to check (e.g. a Smart TV).
// `/?tv=1&diag=1` is the main screen with the in-game network panels (Lari Terus) instead.
const query = new URLSearchParams(location.search);
const entry = query.has('diag') && !query.has('tv') ? null : decide();
if (entry === null) void import('./diag/main');
else if (entry === 'landing') void import('./landing/main');
else if (entry === 'screen') {
  // A far-away main screen belongs to someone else's room: this device did not become one.
  if (!query.has('mirror')) markScreenUsed();
  void import('./screen/main');
} else void import('./controller/main');
