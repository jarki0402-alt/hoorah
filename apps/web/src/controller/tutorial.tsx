/** The phone during a game's "Cara main" on the main screen: "Paham!", and "Lewati" for the Host. */
import { Avatar } from '../shared/ui';
import { host, me, players, understood } from './store';
import { TUTORIAL as STR } from './strings';

export function TutorialPhone({ ready, gameTitle }: { ready: readonly number[]; gameTitle?: string }) {
  const p = me.value;
  const done = p ? ready.includes(p.id) : false;
  const total = players.value.filter((x) => x.connected).length;
  return (
    <div class="ctrl tu-phone-view">
      <div class="tu-phone-card">
        {p && <Avatar look={p.look} ring={p.color} size={72} />}
        <div class="tu-phone-eyebrow">{STR.title}</div>
        <h1 class="title">{gameTitle ?? ''}</h1>
        <p class="muted">{done ? STR.done : STR.lead}</p>
        <button
          type="button"
          class={`big-btn yellow tu-ok ${done ? 'pressed' : ''}`}
          disabled={done}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!done) understood();
          }}
        >
          {STR.ok}
        </button>
        <p class="muted tu-count">{STR.count(ready.length, Math.max(total, ready.length))}</p>
        {p?.isHost && (
          <button type="button" class="big-btn secondary" onClick={() => host('tutorial-skip')}>
            {STR.skip}
          </button>
        )}
      </div>
    </div>
  );
}
