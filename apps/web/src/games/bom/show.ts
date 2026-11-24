/**
 * The passing flourishes of a moment in Bom Oper (call-outs, toasts, the BUM burst, soot,
 * confetti): what every main screen shows, never sounds, phones or rules. The Host's director
 * fires them as the match runs; a far-away mirror screen replays the same ones from the log the
 * Host publishes, so both screens tell the story with the same words.
 */
import { celebrate } from '../../shared/confetti';
import type { V3 } from '../../shared/kotak/math';
import type { Float, HudStore, RunnerChip } from './hud';
import { RULES } from './logic';
import type { BomScene } from './scene';
import { STR } from './strings';

export type ShowEvent =
  /** The final round with two bombs starts. */
  | { k: 'final' }
  | { k: 'go' }
  | { k: 'pass'; from: number; to: number; near: boolean }
  /** OPER pressed with nobody in reach. */
  | { k: 'refused'; id: number }
  | { k: 'boom'; id: number; out: boolean; at: V3 }
  /** A person (not a computer runner) won the session. */
  | { k: 'win' };

export interface ShowTarget {
  hud: HudStore;
  scene: BomScene;
  chip: (id: number) => RunnerChip | null;
}

function floatAbove(t: ShowTarget, id: number, text: string, tone: Float['tone']): void {
  const s = t.scene.players?.screenOf(id);
  if (s) t.hud.float(text, s.x, s.y, tone);
}

export function showEvent(e: ShowEvent, t: ShowTarget): void {
  switch (e.k) {
    case 'final':
      t.hud.toast(STR.finalToast);
      return;
    case 'go':
      t.hud.shout(STR.passIdle.toUpperCase(), 'go');
      return;
    case 'pass': {
      const a = t.chip(e.from);
      const b = t.chip(e.to);
      floatAbove(t, e.from, e.near ? STR.nearFloat : STR.passFloat, e.near ? 'bad' : 'good');
      if (a && b) t.hud.toast(e.near ? STR.nearToast(a.name) : STR.passToast(a.name, b.name), a);
      return;
    }
    case 'refused':
      floatAbove(t, e.id, STR.noOneFloat, 'info');
      return;
    case 'boom': {
      const r = t.chip(e.id);
      t.scene.burst(e.at.x, e.at.y, e.at.z);
      t.scene.sootify(e.id, RULES.boom);
      t.hud.shout(STR.boomFloat, 'boom');
      if (r) t.hud.toast(e.out ? STR.outToast(r.name) : STR.boomToast(r.name), r);
      return;
    }
    case 'win':
      celebrate();
      return;
  }
}
