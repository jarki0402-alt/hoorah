/**
 * Phone input of Ular Arena: the joystick (STICK_OP frames) and the held NGEBUT button (PAD_ACTION
 * in INPUT_OP frames), tracked apart so a stick frame never clears a held boost and back. A channel
 * that goes silent while active is released, because its release frame may have been lost.
 */
import { INPUT_OP, PAD_ACTION, STICK_OP, unpackStick } from '@hoorah/protocol';

/** A held button repeats every 400 ms and a deflected stick every 250 ms; silence this long means the release got lost. */
export const STALE_INPUT_MS = 1300;

/** What a phone asks of its snake: the stick (-1..1, +y down) and whether boost is held. */
export interface PadCommand {
  x: number;
  y: number;
  boost: boolean;
}

interface Held {
  /** Held button bits from INPUT_OP frames. */
  buttons: number;
  buttonsAt: number;
  /** Packed stick position from STICK_OP frames (0 = centred). */
  stick: number;
  stickAt: number;
}

function command(h: Held): PadCommand {
  const { x, y } = unpackStick(h.stick);
  return { x, y, boost: (h.buttons & PAD_ACTION) !== 0 };
}

export class PadInputs {
  private readonly held = new Map<number, Held>();

  /** Records one frame received at time `t`; returns the phone's command, or null for an unknown op. */
  frame(id: number, op: number, buttons: number, t: number): PadCommand | null {
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

  /** Releases every channel silent for too long and reports each phone whose command changed. */
  releaseStale(t: number, apply: (id: number, cmd: PadCommand) => void): void {
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

  /** Forgets a phone (dropped or left); its next frame starts from a clean state. */
  delete(id: number): void {
    this.held.delete(id);
  }
}
