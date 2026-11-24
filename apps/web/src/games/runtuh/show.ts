/**
 * The passing flourishes of a moment in Lantai Runtuh (call-outs, toasts, shove dust, fall
 * streaks, the Gelap reveal flash, confetti): what every main screen shows, never sounds, phones
 * or rules. The Host's director fires them as the match runs; a far-away mirror screen replays the
 * same ones from the log the Host publishes, so both screens tell the story with the same words.
 */
import { celebrate } from '../../shared/confetti';
import type { V3 } from '../../shared/kotak/math';
import type { Chip, HudStore } from './hud';
import type { RuntuhScene } from './scene';
import { formatGap, STR } from './strings';

export type ShowEvent =
  /** A round starts playing (MULAI). */
  | { k: 'go' }
  /** A call's wrong tiles drop. */
  | { k: 'drop' }
  /** Gelap: the lights flash up to show the drop. */
  | { k: 'reveal' }
  /** `next`: the round the faller comes back in (null in the last round). */
  | { k: 'fall'; id: number; at: V3; by: number | null; next: number | null }
  | { k: 'push'; id: number; target: number | null }
  | { k: 'near'; id: number; gap: number }
  /** A person (not a computer contestant) won the session. */
  | { k: 'win' };

export interface ShowTarget {
  hud: HudStore;
  scene: RuntuhScene;
  chip: (id: number) => Chip | null;
  /** Where a player stands right now (shove dust). */
  body: (id: number) => V3 | null;
}

function floatAbove(t: ShowTarget, id: number, text: string): void {
  const s = t.scene.players.screenOf(id);
  if (s) t.hud.float(text, s.x, s.y);
}

export function showEvent(e: ShowEvent, t: ShowTarget): void {
  switch (e.k) {
    case 'go':
      t.hud.shout(STR.go);
      return;
    case 'drop':
      t.hud.shout(STR.drop);
      return;
    case 'reveal':
      t.scene.flashReveal();
      return;
    case 'fall': {
      const p = t.chip(e.id);
      if (!p) return;
      t.scene.fx.fall(e.at.x, Math.max(-1, e.at.y), e.at.z, p.color);
      const by = e.by !== null ? t.chip(e.by) : null;
      t.hud.toast(by ? STR.pushedOff(by.name, p.name) : STR.fallToast(p.name, e.next), 'bad', p);
      return;
    }
    case 'push': {
      floatAbove(t, e.id, e.target !== null ? STR.pushFloat : STR.whiff);
      const at = e.target !== null ? t.body(e.target) : null;
      if (at) t.scene.fx.dust(at.x, at.y, at.z, 0.8);
      return;
    }
    case 'near': {
      const p = t.chip(e.id);
      if (p) t.hud.flashBanner(STR.nearMiss(p.name, formatGap(e.gap)));
      return;
    }
    case 'win':
      celebrate();
      return;
  }
}
