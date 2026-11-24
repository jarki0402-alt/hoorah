/**
 * Draws the bodies of a `KotakSim` as blocky player avatars, interpolated between simulation
 * steps, with a DOM name tag above each head (moved by direct style writes every frame, so the
 * HUD framework never re-renders at 60 fps).
 */
import { type Fruit, type Look, sameLook } from '@hoorah/protocol';
import * as THREE from 'three';
import { lerp } from '../math';
import { type Body, type KotakSim, planarSpeed } from '../sim';
import { BlockAvatar } from './avatar';
import type { KotakStage } from './stage';

export interface PlayerLook {
  id: number;
  name: string;
  fruit: Fruit;
  /** The player's avatar; the character matching `fruit` when left out. */
  look?: Look;
  color: string;
}

const sameAvatar = (a: PlayerLook, b: PlayerLook): boolean =>
  a.look && b.look ? sameLook(a.look, b.look) : !a.look && !b.look && a.fruit === b.fruit;

interface Entry {
  look: PlayerLook;
  avatar: BlockAvatar;
  tag: HTMLDivElement | null;
  cheer: boolean;
  hidden: boolean;
}

export class AvatarLayer {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly stage: KotakStage,
    private readonly sim: KotakSim,
    /** Container for name tags (stage px), or null for none. */
    private readonly tagHost: HTMLElement | null,
  ) {}

  set(looks: readonly PlayerLook[]): void {
    const keep = new Set(looks.map((l) => l.id));
    for (const [id, e] of this.entries) {
      if (keep.has(id)) continue;
      for (const o of e.avatar.objects) this.group.remove(o);
      e.avatar.dispose();
      e.tag?.remove();
      this.entries.delete(id);
    }
    for (const look of looks) {
      const e = this.entries.get(look.id);
      if (e) {
        if (sameAvatar(e.look, look)) {
          if (e.look.color !== look.color) e.avatar.setColor(look.color);
          if (e.tag && e.look.name !== look.name) e.tag.textContent = look.name;
          if (e.tag) e.tag.style.setProperty('--tag', look.color);
          e.look = look;
          continue;
        }
        for (const o of e.avatar.objects) this.group.remove(o);
        e.avatar.dispose();
        e.tag?.remove();
        this.entries.delete(look.id);
      }
      const avatar = new BlockAvatar(this.stage, look.look ?? look.fruit, look.color);
      for (const o of avatar.objects) this.group.add(o);
      let tag: HTMLDivElement | null = null;
      if (this.tagHost) {
        tag = document.createElement('div');
        tag.className = 'kt-tag';
        tag.textContent = look.name;
        tag.style.setProperty('--tag', look.color);
        this.tagHost.appendChild(tag);
      }
      this.entries.set(look.id, { look, avatar, tag, cheer: false, hidden: false });
    }
  }

  setCheer(id: number, on: boolean): void {
    const e = this.entries.get(id);
    if (e) e.cheer = on;
  }

  setHidden(id: number, on: boolean): void {
    const e = this.entries.get(id);
    if (e) e.hidden = on;
  }

  setGlow(on: boolean): void {
    for (const e of this.entries.values()) e.avatar.setGlow(on);
  }

  /** Name tags on or off (off during podiums and intros). */
  setTags(on: boolean): void {
    for (const e of this.entries.values()) if (e.tag) e.tag.style.display = on ? '' : 'none';
  }

  update(alpha: number, dt: number): void {
    const sim = this.sim;
    for (const e of this.entries.values()) {
      const b = sim.body(e.look.id);
      const show = !!b && b.active && !e.hidden && b.pos.y > sim.tuning.killY + 2;
      e.avatar.setVisible(show);
      if (e.tag) e.tag.style.visibility = show ? 'visible' : 'hidden';
      if (!b || !show) continue;
      this.placeOne(e, b, alpha, dt);
    }
  }

  private placeOne(e: Entry, b: Body, alpha: number, dt: number): void {
    const sim = this.sim;
    const x = lerp(b.prev.x, b.pos.x, alpha);
    const y = lerp(b.prev.y, b.pos.y, alpha);
    const z = lerp(b.prev.z, b.pos.z, alpha);
    let dy = b.yaw - b.prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    const yaw = b.prevYaw + dy * alpha;
    const groundY = sim.supportAt(x, z, y + 0.05);
    e.avatar.place(x, y, z, yaw, groundY);
    e.avatar.pose(
      {
        run: b.ground >= 0 ? planarSpeed(b) / sim.tuning.speed : 0,
        air: b.ground < 0,
        vy: b.vel.y,
        stunned: b.stunLeft > 0,
        frozen: b.frozenLeft > 0,
        cheer: e.cheer,
        t: sim.t,
      },
      dt,
    );
    if (e.tag) {
      const s = this.stage.toScreen(x, y + sim.tuning.height + 0.55, z, this.tmp);
      if (s)
        e.tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  /** Stage-px position above a player's head (HUD call-outs). */
  screenOf(id: number): { x: number; y: number } | null {
    const b = this.sim.body(id);
    if (!b) return null;
    return this.stage.toScreen(b.pos.x, b.pos.y + this.sim.tuning.height + 1.1, b.pos.z, this.tmp);
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      e.avatar.dispose();
      e.tag?.remove();
    }
    this.entries.clear();
    this.group.clear();
  }
}
