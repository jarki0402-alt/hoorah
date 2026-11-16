/**
 * One URL for every device. Decides whether this device is the big screen or a controller,
 * then loads only that app (separate chunks, so phones never download the TV code).
 *
 * Order of precedence:
 *  1. An invite link (?r=CODE) always joins as a player.
 *  2. An explicit choice made with the "switch role" button (remembered on this device).
 *  3. Device detection: phones are controllers; laptops, desktops, tablets and TVs are screens.
 */
import { looksLikePhone } from './shared/device';

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

function decide(): Role {
  const params = new URLSearchParams(location.search);
  if (params.has('r') || params.has('ctrl')) return 'controller';
  if (params.has('tv')) return 'screen';
  return storedMode() ?? (looksLikePhone() ? 'controller' : 'screen');
}

// Graphics diagnostics (`/?diag=1`), opened by hand on the device to check (e.g. a Smart TV).
if (new URLSearchParams(location.search).has('diag')) void import('./diag/main');
else if (decide() === 'screen') void import('./screen/main');
else void import('./controller/main');
