/**
 * The Host's game picker (remote design "A + E"): the same groups as the main screen's home
 * (Semua, "Pas untuk kalian", one per mood) as tabs on top, "Semua" in the same order as the screen; the game list is the only part of the
 * controller that scrolls. A tab makes the main screen jump to that row; tapping a game opens its
 * detail page there and closes the picker. Loaded on demand: the poster art is only needed once
 * the Host opens it.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES, GAMES, type GameId, MOODS, playsRemote } from '../shared/games';
import {
  DEFAULT_SECTION,
  HOME_SECTIONS,
  type HomeSection,
  isHomeSection,
  isNewGame,
  sectionGames,
} from '../shared/homeRows';
import { keyArtUrl } from '../shared/keyart';
import { Icon } from '../shared/ui';
import { StatusRow } from './common';
import { openGame, platform, players, setScreenTab } from './store';
import { STR } from './strings';
import './picker.css';

export function GamePicker({ onClose }: { onClose: () => void }) {
  const pg = platform.value;
  // A category tab focused in the screen's "Semua game" grid still means the "Semua" group here.
  const screenTab: HomeSection = isHomeSection(pg.tab)
    ? pg.tab
    : CATEGORIES.some((c) => c.id === pg.tab)
      ? 'all'
      : DEFAULT_SECTION;
  // The main screen's group is the truth; a tap here shows at once and the screen catches up.
  const [tab, setTab] = useState<HomeSection>(screenTab);
  // After a tap here the screen scrolls through other rows on its way to the new group; ignore
  // those passing reports until it arrives (or a moment has gone by).
  const pending = useRef<{ tab: HomeSection; at: number } | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (p && screenTab !== p.tab && performance.now() - p.at < 1500) return;
    pending.current = null;
    setTab(screenTab);
  }, [screenTab]);
  const n = Math.max(1, players.value.filter((p) => p.connected).length);
  const onScreen = pg.page === 'home' || pg.page === 'detail' ? pg.gameId : undefined;
  const recent = (pg.recent ?? []).filter((id): id is GameId => id in GAMES);
  const fits = (id: GameId) => n >= GAMES[id].minPlayers && n <= GAMES[id].maxPlayers;
  // One list per group; "Semua" is every game in the main screen's order for these players.
  const groups: { key: string; title?: string; games: GameId[] }[] = [
    { key: tab, games: sectionGames(tab, n, recent) },
  ];
  const empty = groups.every((g) => g.games.length === 0);

  const pick = (t: HomeSection) => {
    pending.current = { tab: t, at: performance.now() };
    setTab(t);
    setScreenTab(t);
  };
  const open = (id: GameId) => {
    openGame(id);
    onClose();
  };

  const tabs = HOME_SECTIONS.map((id) => ({
    id,
    label: id === 'fit' ? STR.tabFit : id === 'all' ? STR.tabAll : MOODS[id].label,
  }));

  return (
    <div class="ctrl picker landscape-split">
      <div class="panes">
        <div class="pane picker-side">
          <StatusRow />
          <div class="picker-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 class="title">{STR.pickerTitle}</h1>
              <div class="muted picker-sub">{STR.pickerSub(n)}</div>
            </div>
            <button type="button" class="round-icon" aria-label={STR.pickerClose} onClick={onClose}>
              <Icon name="close" size={20} stroke={2.6} />
            </button>
          </div>
          <div class="picker-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                class={`picker-tab ${tab === t.id ? 'on' : ''}`}
                onClick={() => pick(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" class="big-btn secondary picker-arrows" onClick={onClose}>
            <Icon name="dpad" size={20} stroke={2.2} /> {STR.pickerArrows}
          </button>
        </div>
        <div class="pane zone picker-list-pane">
          <div class="picker-list scroll-y" role="tabpanel">
            {empty && <div class="muted picker-empty">{STR.pickerEmpty}</div>}
            {groups.flatMap((grp) => [
              ...(grp.title
                ? [
                    <div key={`h-${grp.key}`} class="picker-group">
                      {grp.title}
                    </div>,
                  ]
                : []),
              ...grp.games.map((id) => {
                const g = GAMES[id];
                const here = id === onScreen;
                // Long-distance play: the main screen refuses games a far-away screen cannot show.
                const farOff = pg.remote === true && !playsRemote(id);
                const sub = !fits(id)
                  ? STR.needPlayers(g.minPlayers)
                  : recent[0] === id
                    ? `${STR.players(g.minPlayers, g.maxPlayers)} · ${STR.lastPlayed}`
                    : STR.players(g.minPlayers, g.maxPlayers);
                return (
                  <button
                    key={id}
                    type="button"
                    class={`pick-card ${here ? 'here' : ''} ${farOff ? 'far-off' : ''}`}
                    onClick={() => open(id)}
                  >
                    <img class="pick-art" src={keyArtUrl(id)} alt="" decoding="async" draggable={false} />
                    <span class="pick-text">
                      <span class="pick-name">
                        {g.title}
                        {isNewGame(id) && <span class="pick-new">{STR.newTag}</span>}
                      </span>
                      {farOff && <span class="pick-far">{STR.remoteNo}</span>}
                      <span class="pick-meta">
                        <span class={`mood-pill mood-${g.mood}`}>{MOODS[g.mood].label}</span>
                        {here ? (
                          <span class="pick-here">{STR.onScreen}</span>
                        ) : (
                          <span class="pick-sub">{sub}</span>
                        )}
                      </span>
                    </span>
                    {!here && (
                      <span class="pick-chev" aria-hidden="true">
                        <Icon name="right" size={18} stroke={2.6} />
                      </span>
                    )}
                  </button>
                );
              }),
            ])}
          </div>
        </div>
      </div>
    </div>
  );
}
