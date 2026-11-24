/**
 * Long-distance play, far-away main screen: poses a local `LangkahMatch` from the Host's published
 * states and draws it with the same `LangkahScene` and HUD (board.ts) the Host uses. The match here
 * never ticks, so no rules, computer walkers, phones or sounds run (the shell forwards the Host's
 * sounds).
 *
 * The babak time comes from the server clock through the state's anchor (mirror.ts), every frame:
 * cue arrows, their time bars, the laser beams, the memory row and the speed call-outs show at the
 * same server moment as on the Host's screen, however late the packet came. Verdicts (hops, falls,
 * points) show when they arrive: each walker's step counter and fallen flag are compared with the
 * last state, and every change replays the hop or the fall the Host showed.
 */
import { celebrate } from '../../shared/confetti';
import { isCpu } from '../common/cpu';
import { endBoard, fillHud, finalBoard, introCard, setupBoard } from './board';
import type { HudStore } from './hud';
import { type LangkahMatch, type Phase, speedLevelOf } from './logic';
import { applyMirror, CueBook, FLAG, type LangkahMirror, MirrorClock, poseMatch } from './mirror';
import type { LangkahScene } from './scene';
import { STR } from './strings';

const HUD_MS = 50;
const HELP_MS = 6000;

interface Seen {
  step: number;
  fallen: boolean;
}

export class LangkahReplica {
  private readonly clock = new MirrorClock();
  private readonly book = new CueBook();
  /** Host session, babak and phase on screen; null before the first state. */
  private scene: { ss: number; no: number; ph: Phase } | null = null;
  private readonly seen = new Map<number, Seen>();
  private readonly offline = new Set<number>();
  /** Cues already announced (lift jolt, cave rumble); null after joining mid-babak, until a frame. */
  private announced: number | null = null;
  private speedLvl: number | null = null;
  private lastHud = Number.NEGATIVE_INFINITY;
  private localPaused = false;

  constructor(
    private readonly stage: LangkahScene,
    private readonly hud: HudStore,
    private readonly m: LangkahMatch,
  ) {}

  /** True while the drawn babak runs (graphics ladder). */
  get running(): boolean {
    const s = this.clock.latest;
    return !!s && !s.pz && this.m.phase === 'play';
  }

  /** This screen's own pause menu: the Host's game goes on, the overlay shows. */
  setLocalPause(on: boolean): void {
    this.localPaused = on;
    this.hud.paused.value = on || (this.clock.latest?.pz ?? false);
  }

  /** A state from the Host arrived at local server time `serverMs`. */
  push(raw: unknown, serverMs: number): void {
    const s = applyMirror(raw);
    if (!s || !this.clock.push(s)) return;
    this.book.take(s);
    const m = this.m;
    const before = this.scene;
    const fresh = before === null || before.ss !== s.ss;
    // Play begins here at the anchored server moment, even if the Host's "play" state is late.
    const ph: Phase = this.clock.playing(serverMs) ? 'play' : s.ph;
    const newBabak = fresh || before.no !== s.no || (ph === 'intro' && before.ph !== 'intro');
    if (poseMatch(m, s, ph)) {
      this.stage.setPlayers(
        m.players.map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color })),
      );
    }
    if (newBabak) {
      this.seen.clear();
      // Seen from its intro card: every cue and call-out of the babak plays here.
      const whole = ph === 'intro';
      this.announced = whole ? 0 : null;
      this.speedLvl = whole ? 0 : null;
      if (s.pn.length > 0) this.stage.resetBabak(m.stage);
    }
    this.syncWalkers(s, !newBabak);
    this.scene = { ss: s.ss, no: s.no, ph };
    this.enter(ph, s, fresh ? null : (before?.ph ?? null), newBabak);
    this.hud.paused.value = s.pz || this.localPaused;
    this.lastHud = Number.NEGATIVE_INFINITY;
  }

  /** Draws one frame at local server time `serverMs`; `dt` is the local frame time (s). */
  frame(serverMs: number, dt: number): void {
    const s = this.clock.latest;
    if (!s) return;
    const m = this.m;
    const shown = this.scene;
    if (shown && m.phase === 'intro' && this.clock.playing(serverMs)) {
      // The intro card's countdown reached the anchor: play starts now, as on the Host.
      m.phase = 'play';
      this.scene = { ...shown, ph: 'play' };
      this.enter('play', s, 'intro', false);
    }
    m.t = this.clock.at(serverMs);
    m.cues = this.book.cues;
    if (m.phase === 'play') this.beats();
    this.stage.frame(s.pz ? 0 : dt);
    if (serverMs - this.lastHud >= HUD_MS) {
      this.lastHud = serverMs;
      fillHud(this.hud, m, (id) => this.offline.has(id));
    }
  }

  /* ------------------------------------------------------------------ match */

  /** With `replay`, the hops and falls since the last state play on the stage. */
  private syncWalkers(s: LangkahMirror, replay: boolean): void {
    const m = this.m;
    const few = s.wk.filter(([, , flags]) => flags & FLAG.inRound).length <= 6;
    this.offline.clear();
    for (const [id, step, flags] of s.wk) {
      const p = m.player(id);
      if (!p) continue;
      const fallen = (flags & FLAG.fallen) !== 0;
      const pas = (flags & FLAG.pas) !== 0;
      if (flags & FLAG.offline) this.offline.add(id);
      const was = this.seen.get(id);
      this.seen.set(id, { step, fallen });
      if (!replay || !was) continue;
      if (step > was.step) {
        const cue = this.book.cues[step - 1];
        if (cue) this.stage.step(id, cue.dir);
        if (pas && few) {
          const at = this.stage.screenOf(id);
          if (at) this.hud.float(STR.pas, at.x, at.y);
        }
      }
      if (fallen && !was.fallen) {
        this.stage.fall(id);
        this.hud.toast(STR.fellToast(p.name, step), {
          id,
          name: p.name,
          fruit: p.fruit,
          look: p.look,
          color: p.color,
        });
      }
    }
  }

  /**
   * The cards and flourishes of the phase on screen. `before` is the phase shown until now (null
   * when this screen just joined: the cards show, nothing that already happened replays).
   */
  private enter(ph: Phase, s: LangkahMirror, before: Phase | null, newBabak: boolean): void {
    const h = this.hud;
    const m = this.m;
    if (ph === 'setup') {
      h.setup.value = setupBoard(s.pk, s.rn, s.hn);
      return;
    }
    h.setup.value = null;
    if (ph === before && !newBabak) return;
    const joined = before === null;
    switch (ph) {
      case 'intro':
        h.end.value = null;
        h.final.value = null;
        h.intro.value = introCard(m);
        this.stage.setTags(false);
        return;
      case 'play':
        h.end.value = null;
        h.intro.value = null;
        this.stage.setTags(true);
        if (joined) return;
        h.shout(STR.go);
        if (m.babak === 0) {
          h.help.value = true;
          window.setTimeout(() => {
            h.help.value = false;
          }, HELP_MS);
        }
        return;
      case 'end': {
        h.intro.value = null;
        h.end.value = endBoard(m);
        this.stage.setTags(false);
        if (!joined)
          this.stage.celebrate(
            m
              .contestants()
              .filter((p) => !p.fallen)
              .map((p) => p.id),
          );
        return;
      }
      case 'final':
      case 'done': {
        h.intro.value = null;
        h.end.value = null;
        h.final.value = finalBoard(m);
        this.stage.setTags(false);
        const top = m.standings()[0];
        // Confetti only for a match this screen saw end, not one it joined afterwards.
        if (!joined && before !== 'final' && top && !isCpu(top.id)) celebrate();
        return;
      }
    }
  }

  /** Server-clock beats of the running babak: lift jolts, cave rumbles, speed call-outs. */
  private beats(): void {
    const m = this.m;
    const shown = (i: number): boolean => i < m.cues.length && m.cues[i]!.show <= m.t;
    if (this.announced === null) {
      // First frame of this babak here: what already showed is not replayed.
      let i = 0;
      while (shown(i)) i++;
      this.announced = i;
      this.speedLvl = speedLevelOf(m.speed);
      return;
    }
    while (shown(this.announced)) {
      const c = m.cues[this.announced]!;
      this.announced++;
      if (c.group < 0) continue;
      if (m.stage === 'lift') this.stage.jolt(0.18);
      else if (m.stage === 'gua' && c.i % 3 === 0) this.stage.jolt(0.1);
    }
    const lvl = speedLevelOf(m.speed);
    if (this.speedLvl !== null && lvl > this.speedLvl) this.hud.flashBanner(STR.speedUp);
    this.speedLvl = Math.max(this.speedLvl ?? 0, lvl);
  }
}
