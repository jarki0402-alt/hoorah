/** The technical context a device sent with a report or an error, folded away until asked for. */
import type { ClientContext } from '@hoorah/protocol';
import type { ComponentChildren } from 'preact';
import { GAMES, type GameId } from '../shared/games';
import { contextRows } from './feedback';

/** A game's title from its id; undefined for ids this build does not know. */
export function gameTitle(id: string): string | undefined {
  return Object.hasOwn(GAMES, id) ? GAMES[id as GameId].title : undefined;
}

export function ContextList({ ctx }: { ctx: ClientContext }) {
  return (
    <dl class="ad-ctx">
      {contextRows(ctx, gameTitle).map((r) => (
        <div key={r.label} class="ad-ctx-row">
          <dt>{r.label}</dt>
          <dd class={r.mono ? 'is-mono' : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A native disclosure: keyboard and screen readers get it for free. */
export function Disclosure({ summary, children }: { summary: string; children: ComponentChildren }) {
  return (
    <details class="ad-details">
      <summary class="ad-details-summary">{summary}</summary>
      <div class="ad-details-body">{children}</div>
    </details>
  );
}
