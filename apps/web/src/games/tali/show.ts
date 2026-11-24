/**
 * The passing flourishes of a moment in Satu Tali (call-outs, toasts, floats, dust, sparkles, the
 * fall streak, confetti): what every main screen shows, never sounds, phones or rules. The Host's
 * director fires them as the climb runs; a far-away mirror screen replays the same ones from the
 * log the Host publishes, so both screens tell the story with the same words.
 */
import { celebrate } from '../../shared/confetti';
import type { V3 } from '../../shared/kotak/math';
import type { ClimberChip, Float, HudStore } from './hud';
import { SACK_ID, type TaliMatch } from './logic';
import type { TaliScene } from './scene';
import { STR } from './strings';

/** How long the first-section help line stays up (ms). */
const HELP_MS = 8000;

export type ShowEvent =
  | { k: 'count'; value: number }
  /** NAIK!, with the help line on the first section (team or solo wording). */
  | { k: 'go'; help: 'team' | 'solo' | null }
  | { k: 'sync'; ids: number[] }
  | { k: 'land'; id: number; speed: number }
  | { k: 'sweep'; id: number }
  | { k: 'catch'; id: number; by: number[] }
  | { k: 'rescued'; id: number; by: number[] }
  | { k: 'climbUp'; id: number }
  | { k: 'save'; index: number; id: number }
  /** Someone fell below the course; `live` while climbing (not during the flag). */
  | { k: 'wipe'; id: number; at: V3; live: boolean }
  | { k: 'throw' }
  | { k: 'flag'; done: boolean; no: number; stars: number };

export interface ShowTarget {
  hud: HudStore;
  scene: TaliScene;
  match: TaliMatch;
}

let helpTimer = 0;

function chip(m: TaliMatch, id: number): ClimberChip | null {
  const c = m.climber(id);
  return c ? { id, name: c.name, fruit: c.fruit, look: c.look, color: c.color } : null;
}

function names(m: TaliMatch, ids: readonly number[]): string[] {
  return ids.map((id) => m.climber(id)?.name ?? '').filter((n) => n);
}

function floatAbove(t: ShowTarget, id: number, text: string, tone: Float['tone']): void {
  const s = t.scene.players?.screenOf(id);
  if (s) t.hud.float(text, s.x, s.y, tone);
}

export function showEvent(e: ShowEvent, t: ShowTarget): void {
  const m = t.match;
  const fx = t.scene.fx;
  switch (e.k) {
    case 'count':
      t.hud.shout(String(e.value), 'count');
      return;
    case 'go':
      t.hud.shout(STR.go, 'go');
      if (e.help) {
        t.hud.help.value = e.help === 'solo' ? STR.helpSolo : STR.help;
        window.clearTimeout(helpTimer);
        helpTimer = window.setTimeout(() => {
          t.hud.help.value = null;
        }, HELP_MS);
      }
      return;
    case 'sync':
      for (const id of e.ids) floatAbove(t, id, STR.syncFloat, 'good');
      return;
    case 'land': {
      const b = m.sim.body(e.id);
      if (b) fx.dust(b.pos.x, b.pos.y, b.pos.z, Math.min(1.6, e.speed / 10));
      return;
    }
    case 'sweep':
      floatAbove(t, e.id, STR.sweepFloat, 'bad');
      return;
    case 'catch': {
      const c = chip(m, e.id);
      if (c) t.hud.toast(STR.catchToast(c.name, names(m, e.by)), c);
      floatAbove(t, e.id, STR.catchFloat, 'good');
      return;
    }
    case 'rescued': {
      const c = chip(m, e.id);
      if (c) t.hud.toast(STR.rescueToast(c.name, names(m, e.by)), c);
      const b = m.sim.body(e.id);
      if (c && b) fx.sparkle(b.pos.x, b.pos.y + 0.8, b.pos.z, c.color);
      return;
    }
    case 'climbUp': {
      const c = chip(m, e.id);
      if (c) t.hud.toast(STR.climbToast(c.name), c);
      floatAbove(t, e.id, STR.climbFloat, 'good');
      return;
    }
    case 'save': {
      const sp = m.trail.point(e.index);
      const c = chip(m, e.id);
      if (c) fx.sparkle(sp.pos.x, sp.pos.y + 0.5, sp.pos.z, c.color);
      t.hud.toast(STR.saveToast, c ?? undefined);
      floatAbove(t, e.id, STR.saveFloat, 'info');
      return;
    }
    case 'wipe': {
      const c = chip(m, e.id);
      fx.fall(e.at.x, Math.max(e.at.y, m.section.killY + 3), e.at.z, c?.color ?? '#B98B5A');
      t.scene.rope.reset();
      if (e.live) t.hud.toast(STR.wipeToast, c ?? undefined);
      return;
    }
    case 'throw': {
      const s = m.sim.body(SACK_ID);
      if (s) fx.dust(s.pos.x, s.pos.y, s.pos.z, 0.8, '#E9D2A6');
      t.hud.toast(STR.throwToast);
      return;
    }
    case 'flag': {
      if (!e.done) {
        t.hud.shout(STR.timeoutTitle, 'end');
        return;
      }
      t.hud.shout(STR.flagTitle(e.no), 'end');
      const pad = m.section.solids[m.section.finish];
      if (pad) fx.confetti(pad.pos.x, pad.pos.y + pad.half.y + 2, 0, e.stars === 3 ? 1.3 : 0.8);
      if (e.stars === 3) celebrate();
      return;
    }
  }
}
