/**
 * The passing flourishes of a moment in Seluncur Es (MELUNCUR!, DUK!, BYUR!, NYARIS!, toasts,
 * confetti): what every main screen shows, never sounds, phones or rules. The Host's director
 * fires them as the match runs; a far-away mirror screen replays the same ones from the log the
 * Host publishes, so both screens tell the story with the same words.
 */
import { celebrate } from '../../shared/confetti';
import type { Chip, HudStore } from './hud';
import type { Vec } from './logic';
import type { EsScene } from './scene';
import { formatGap, STR } from './strings';

/** How long after leaving the ice a skater hits the water (ms). */
const SPLASH_MS = 450;

export type ShowEvent =
  | { k: 'launch' }
  | { k: 'hit'; at: Vec; speed: number }
  /** `by` bumped the skater off; `crack` = drifted off with the broken rim. */
  | { k: 'fall'; id: number; by: number | null; crack: boolean; at: Vec }
  | { k: 'nearMiss'; id: number; gap: number }
  /** The last one standing of a round. */
  | { k: 'win'; id: number }
  /** A person (not a computer skater) won the session. */
  | { k: 'party' };

export interface ShowTarget {
  hud: HudStore;
  scene: EsScene;
  chip: (id: number) => Chip | null;
  /** Where a skater is on the ice right now (null when gone). */
  posOf: (id: number) => Vec | null;
}

/** "ES RETAK!": the rim breaks (driven by the floe size, not the event log). */
export function showCrack(t: Pick<ShowTarget, 'hud'>): void {
  t.hud.shout(STR.crack);
}

export function showEvent(e: ShowEvent, t: ShowTarget): void {
  switch (e.k) {
    case 'launch':
      t.hud.shout(STR.slideTitle);
      return;
    case 'hit': {
      const s = t.scene.screenAt(e.at);
      if (s) t.hud.float(STR.hit, s.x, s.y, 'hit');
      t.scene.hit(e.at, e.speed);
      return;
    }
    case 'fall': {
      const who = t.chip(e.id);
      if (!who) return;
      window.setTimeout(() => {
        const s = t.scene.screenAt(e.at, 0.6);
        if (s) t.hud.float(STR.splash, s.x, s.y, 'splash');
        t.scene.splash(t.posOf(e.id) ?? e.at);
      }, SPLASH_MS);
      const by = e.by !== null ? t.chip(e.by) : null;
      if (by) t.hud.toast(STR.pushedOff(by.name, who.name), who);
      else if (e.crack) t.hud.toast(STR.crackToast(who.name), who);
      else t.hud.toast(STR.fallToast(who.name), who);
      return;
    }
    case 'nearMiss': {
      const who = t.chip(e.id);
      if (who) t.hud.flashBanner(STR.nearMiss(who.name, formatGap(e.gap)));
      return;
    }
    case 'win':
      t.scene.celebrate(e.id);
      return;
    case 'party':
      celebrate();
      return;
  }
}
