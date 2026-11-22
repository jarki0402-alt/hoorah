/**
 * Phone input of Petualangan Warna: the joystick (STICK_OP frames, only its x matters) and the
 * held LOMPAT button (PAD_ACTION in INPUT_OP frames), tracked apart so a stick frame never
 * drops a held jump. A channel that goes silent while active is released, because its release
 * frame may have been lost.
 */
import { INPUT_OP, PAD_ACTION, STICK_OP, unpackStick } from '@hoorah/protocol';

/** A held button repeats every 400 ms and a deflected stick every 250 ms; silence this long means the release got lost. */
export const STALE_INPUT_MS = 1300;

export interface StickCommand {
  x: number;
  jump: boolean;
}

interface Held {
  buttons: number;
  buttonsAt: number;
  stick: number;
  stickAt: number;
}

function command(h: Held): StickCommand {
  return { x: unpackStick(h.stick).x, jump: (h.buttons & PAD_ACTION) !== 0 };
}

export class StickInputs {
  private readonly held = new Map<number, Held>();

  /** Records one frame received at time `t`; returns the phone's command, or null for an unknown op. */
  frame(id: number, op: number, buttons: number, t: number): StickCommand | null {
    if (op !== STICK_OP && op !== INPUT_OP) return null;
    let h = this.held.get(id);
    if (!h) {
      h = { buttons: 0, buttonsAt: t, stick: 0, stickAt: t };
      this.held.set(id, h);
    }
    if (op === STICK_OP) {
      h.stick = buttons & 0xffff;
      h.stickAt = t;
    } else {
      h.buttons = buttons & 0xffff;
      h.buttonsAt = t;
    }
    return command(h);
  }

  releaseStale(t: number, apply: (id: number, cmd: StickCommand) => void): void {
    for (const [id, h] of this.held) {
      let lost = false;
      if (h.stick !== 0 && t - h.stickAt > STALE_INPUT_MS) {
        h.stick = 0;
        lost = true;
      }
      if (h.buttons !== 0 && t - h.buttonsAt > STALE_INPUT_MS) {
        h.buttons = 0;
        lost = true;
      }
      if (lost) apply(id, command(h));
    }
  }

  delete(id: number): void {
    this.held.delete(id);
  }
}
