/** "Room" tab: rooms open right now (refreshed every 5 s). */
import { type AdminRoom, formatRoomCode } from '@hoorah/protocol';
import { useCallback, useState } from 'preact/hooks';
import { GAMES } from '../shared/games';
import { api, errorCode } from './api';
import { formatDateTime, formatRelative } from './format';
import { usePolling } from './hooks';
import { ERRORS, ROOM_PAGE, ROOM_PAGE_UNKNOWN, roomPlaying, STR } from './strings';
import { AdminIcon, EmptyState, LoadError } from './ui';

const REFRESH_MS = 5_000;

const has = (obj: object, key: string) => Object.hasOwn(obj, key);

/** Catalog title for a game id; unknown ids are shown as they are. */
function gameTitle(id: string | null): string | null {
  if (!id) return null;
  return has(GAMES, id) ? GAMES[id as keyof typeof GAMES].title : id;
}

/** What the main screen is showing, in words. */
function screenText(room: Pick<AdminRoom, 'page' | 'gameId'>): string {
  const page = room.page;
  if (page === 'game') {
    const title = gameTitle(room.gameId);
    if (title) return roomPlaying(title);
  }
  return (page && has(ROOM_PAGE, page) && ROOM_PAGE[page]) || ROOM_PAGE_UNKNOWN;
}

function RoomCard({ room, now }: { room: AdminRoom; now: number }) {
  const code = formatRoomCode(room.code);
  const screen = screenText(room);
  return (
    <article class="ad-card ad-room" aria-label={`${STR.roomCode} ${code}`}>
      <div class="ad-room-head">
        <span class="ad-room-code">{code}</span>
        <span class={`ad-online${room.screenOnline ? ' is-on' : ''}`}>
          <span class="ad-dot" aria-hidden="true" />
          {room.screenOnline ? STR.screenOnline : STR.screenOffline}
        </span>
      </div>
      <p class={`ad-room-shows${screen === ROOM_PAGE_UNKNOWN ? ' is-unknown' : ''}`}>{screen}</p>
      <ul class="ad-facts">
        <li class={`ad-fact${room.connected > 0 ? ' is-live' : ''}`}>
          <AdminIcon name="users" size={16} />
          <span>
            {STR.roomPlayers(room.connected, room.players, room.maxPlayers)}
            <span class="ad-fact-hint"> ({STR.roomPlayersHint})</span>
          </span>
        </li>
        <li class="ad-fact">
          <AdminIcon name="ticket" size={16} />
          <span>
            {room.pass
              ? STR.roomPassUntil(room.pass.code, formatDateTime(room.pass.expiresAt, { now }))
              : STR.roomNoPass}
          </span>
        </li>
        <li class="ad-fact">
          <AdminIcon name="clock" size={16} />
          <span>
            {STR.roomAge(formatRelative(room.createdAt, now), formatRelative(room.lastActivity, now))}
          </span>
        </li>
      </ul>
    </article>
  );
}

export function RoomTab() {
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRooms(await api.rooms());
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  usePolling(load, REFRESH_MS);

  const now = Date.now();
  return (
    <section class="ad-section" aria-labelledby="room-title">
      <div class="ad-section-head">
        <div>
          <h1 id="room-title" class="ad-title">
            {STR.roomTitle}
            {rooms && rooms.length > 0 && <span class="ad-title-count">{rooms.length}</span>}
          </h1>
          <p class="ad-lead">{STR.roomLead}</p>
        </div>
      </div>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {rooms === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : rooms.length === 0 ? (
        <EmptyState icon="tv" title={STR.roomEmpty} body={STR.roomEmptyHelp} />
      ) : (
        <div class="ad-list ad-list--rooms">
          {rooms.map((r) => (
            <RoomCard key={r.code} room={r} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
