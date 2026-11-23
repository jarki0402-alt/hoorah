/**
 * Short "Cara main" tutorials (owner 2026-11-22): every game explains itself on the main screen in
 * an origin card plus 3–4 animated steps before its first round. Each game ships its own data in
 * `games/<id>/tutorial.ts`; the screen renders it (screen/tutorial) and the phones only offer
 * "Paham!" (plus "Lewati" for the Host).
 */

/** What the little phone next to a step shows (the control to use, highlighted and moving). */
export type PhoneHint =
  /** Joystick pushed one way (`any`: circling). */
  | { kind: 'stick'; dir: 'left' | 'right' | 'up' | 'down' | 'any'; button?: string }
  /** Round buttons; the one at `press` is being pressed. */
  | { kind: 'buttons'; labels: readonly string[]; press: number }
  /** One big button tapped fast (`hold`: kept pressed). */
  | { kind: 'tap'; label: string; hold?: boolean }
  /** A finger swiping across the screen. */
  | { kind: 'swipe'; dir: 'left' | 'right' | 'up' | 'down' }
  /** A list of choices; the one at `pick` gets tapped. */
  | { kind: 'choice'; options: readonly string[]; pick: number }
  /** Arrow pad with one arrow pressed. */
  | { kind: 'dpad'; dir: 'left' | 'right' | 'up' | 'down' }
  /** Typing on the keyboard (word games, clues). */
  | { kind: 'type'; text: string }
  /** Tapping a square on a board drawn on the phone (chess). */
  | { kind: 'board'; text: string }
  /** No control: just look at the main screen (or talk). */
  | { kind: 'look'; text: string };

export interface TutorialStep {
  /** One short sentence (Bahasa Indonesia, at most 80 characters, no em dash). */
  text: string;
  /** The animated scene: a full SVG document, 640x360 (see shared/tutorial/draw.ts). */
  scene: () => string;
  phone: PhoneHint;
}

export interface Tutorial {
  /** Where the game comes from and what is different ("Terinspirasi dari ...", at most 140 characters). */
  origin: string;
  /** 3 or 4 steps. */
  steps: readonly TutorialStep[];
}
