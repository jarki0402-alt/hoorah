/** What the main screen knows for error logs ("Laporkan masalah" itself is sent from a phone). */
import type { ContextExtra } from '../shared/report';
import { activeGame, code, page, rtt } from './store';

export function screenExtra(): ContextExtra {
  const extra: ContextExtra = { page: page.peek() };
  const g = activeGame.peek();
  if (g) extra.gameId = g.id;
  if (code.peek()) extra.room = code.peek();
  if (rtt.peek() > 0) extra.rtt = rtt.peek();
  // The main screen marks how many phones are linked directly (screen/rtc.ts).
  const direct = typeof document !== 'undefined' ? document.documentElement.dataset.direct : undefined;
  if (direct) extra.link = `direct:${direct}`;
  return extra;
}
