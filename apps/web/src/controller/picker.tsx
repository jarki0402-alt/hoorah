/**
 * The Host's game picker (remote design "A + E"): tabs on top, the game list is the only part of
 * the controller that scrolls. Tapping a game opens its detail page on the main screen and closes
 * the picker. Loaded on demand: the poster art is only needed once the Host opens it.
 */
import { useEffect, useState } from 'preact/hooks';
import { GAMES, type GameId, gamesForTab, HOME_TABS, type HomeTab, isHomeTab, MOODS } from '../shared/games';
import { keyArtUrl } from '../shared/keyart';
import { Icon } from '../shared/ui';
import { StatusRow } from './common';
import { openGame, platform, players, setScreenTab } from './store';
import { STR } from './strings';

export function GamePicker({ onClose }: { onClose: () => void }) {
  const pg = platform.value;
  const screenTab: HomeTab = isHomeTab(pg.tab) ? pg.tab : 'fit';
  // The main screen's tab is the truth; a tap here shows at once and the screen catches up.
  const [tab, setTab] = useState<HomeTab>(screenTab);
  useEffect(() => setTab(screenTab), [screenTab]);
  const n = Math.max(1, players.value.filter((p) => p.connected).length);
  const onScreen = pg.page === 'home' || pg.page === 'detail' ? pg.gameId : undefined;
  const recent = (pg.recent ?? []).filter((id): id is GameId => id in GAMES);
  const fits = (id: GameId) => n >= GAMES[id].minPlayers && n <= GAMES[id].maxPlayers;
  const list = gamesForTab(tab, n, recent);

  const pick = (t: HomeTab) => {
    setTab(t);
    setScreenTab(t);
  };
  const open = (id: GameId) => {
    openGame(id);
    onClose();
  };

  const tabs = HOME_TABS.map((t) => (t.id === 'fit' ? { ...t, label: STR.tabFit } : t));

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
            {list.length === 0 && <div class="muted picker-empty">{STR.pickerEmpty}</div>}
            {list.map((id) => {
              const g = GAMES[id];
              const here = id === onScreen;
              const sub = !fits(id)
                ? STR.needPlayers(g.minPlayers)
                : recent[0] === id
                  ? `${STR.players(g.minPlayers, g.maxPlayers)} · ${STR.lastPlayed}`
                  : STR.players(g.minPlayers, g.maxPlayers);
              return (
                <button
                  key={id}
                  type="button"
                  class={`pick-card ${here ? 'here' : ''}`}
                  onClick={() => open(id)}
                >
                  <img class="pick-art" src={keyArtUrl(id)} alt="" decoding="async" draggable={false} />
                  <span class="pick-text">
                    <span class="pick-name">{g.title}</span>
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
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
