/**
 * Three.js stage of the box world: renderer, scene, sky colour, hemisphere + sun light with a
 * shadow map sized by the graphics level, and the camera driven by a `GroupCamera`.
 *
 * Graphics levels (`common/gfx.ts`): high = MSAA, 2048 shadows, standard materials; medium = MSAA,
 * 1024 shadows; low = no MSAA, no shadow maps (blob shadows under players instead), Lambert
 * materials and fewer particles. The stage also implements the shadow rung of the shared quality
 * ladder (`bajaj/quality.ts` `ShadowControl`).
 */
import * as THREE from 'three';
import type { GfxTier } from '../../../games/common/gfx';
import { type CameraRig, type CamView, eyeOf } from '../camera';
import './kotak.css';

export type ShadowTier = 0 | 1 | 2 | 3;

const SHADOW_SIZE: Record<ShadowTier, number> = { 0: 0, 1: 512, 2: 1024, 3: 2048 };

export interface StageLook {
  sky: string;
  /** Fog colour (defaults to the sky) and distances. */
  fog?: { color?: string; near: number; far: number };
  sun: { color: string; intensity: number; dir: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
}

export class KotakStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Light materials and blob shadows (low level). */
  readonly light: boolean;
  private shadow: ShadowTier;
  private readonly startShadow: ShadowTier;
  private readonly sunDir = new THREE.Vector3();
  private width = 1280;
  private height = 720;

  constructor(
    host: HTMLElement,
    readonly level: GfxTier,
    msaa: boolean,
    shadow: ShadowTier,
    look: StageLook,
  ) {
    this.light = level === 'low';
    this.renderer = new THREE.WebGLRenderer({
      antialias: msaa,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'kt-canvas';
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 400);
    this.hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity);
    this.sunDir.set(...look.sun.dir).normalize();
    this.scene.add(this.sun, this.sun.target);
    this.startShadow = this.light ? 0 : shadow;
    this.shadow = this.startShadow;
    this.applyShadow();
    this.setLook(look);
  }

  setLook(look: StageLook): void {
    this.scene.background = new THREE.Color(look.sky);
    this.scene.fog = look.fog ? new THREE.Fog(look.fog.color ?? look.sky, look.fog.near, look.fog.far) : null;
    this.sun.color.set(look.sun.color);
    this.sun.intensity = look.sun.intensity;
    this.sunDir.set(...look.sun.dir).normalize();
    this.hemi.color.set(look.hemi.sky);
    this.hemi.groundColor.set(look.hemi.ground);
    this.hemi.intensity = look.hemi.intensity;
  }

  /** Material for solid colours: standard on medium/high, Lambert on low. */
  material(
    color: string | THREE.Color,
    opts: { map?: THREE.Texture | null; rough?: number; emissive?: string } = {},
  ): THREE.Material {
    if (this.light) {
      const m = new THREE.MeshLambertMaterial({ color });
      if (opts.map) m.map = opts.map;
      if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
      return m;
    }
    const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.72, metalness: 0 });
    if (opts.map) m.map = opts.map;
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    return m;
  }

  get shadowsOn(): boolean {
    return this.shadow > 0;
  }

  /* ------------------------------------------------------------------ ShadowControl */

  get tier(): ShadowTier {
    return this.shadow;
  }

  stepDown(): boolean {
    if (this.shadow <= 0) return false;
    this.shadow = (this.shadow - 1) as ShadowTier;
    this.applyShadow();
    return true;
  }

  stepUp(): boolean {
    if (this.shadow <= 0 || this.shadow >= this.startShadow) return false;
    this.shadow = (this.shadow + 1) as ShadowTier;
    this.applyShadow();
    return true;
  }

  private applyShadow(): void {
    const on = this.shadow > 0;
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = on;
    if (on) {
      const size = SHADOW_SIZE[this.shadow];
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    // Materials compile differently with and without shadow maps.
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.needsUpdate = true;
    });
  }

  /* ------------------------------------------------------------------ size and camera */

  setSize(w: number, h: number, ratio: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  get size(): { w: number; h: number } {
    return { w: this.width, h: this.height };
  }

  /** Place the camera for a group view and keep the shadow box around what is seen. */
  applyView(rig: CameraRig, view: CamView): void {
    const eye = eyeOf(rig, view);
    this.camera.fov = rig.fov;
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.lookAt(view.focus.x, view.focus.y, view.focus.z);
    this.camera.updateProjectionMatrix();
    const span = view.dist * 0.9 + 6;
    const cam = this.sun.shadow.camera;
    if (cam.right !== span) {
      cam.left = -span;
      cam.right = span;
      cam.top = span;
      cam.bottom = -span;
      cam.near = 1;
      cam.far = span * 4 + 40;
      cam.updateProjectionMatrix();
    }
    const reach = span * 1.6 + 20;
    this.sun.position.set(
      view.focus.x + this.sunDir.x * reach,
      view.focus.y + this.sunDir.y * reach,
      view.focus.z + this.sunDir.z * reach,
    );
    this.sun.target.position.set(view.focus.x, view.focus.y, view.focus.z);
  }

  /** Stage-px position of a world point (for DOM name tags), or null when behind the camera. */
  toScreen(x: number, y: number, z: number, out = new THREE.Vector3()): { x: number; y: number } | null {
    out.set(x, y, z).project(this.camera);
    if (out.z > 1) return null;
    return { x: ((out.x + 1) / 2) * this.width, y: ((1 - out.y) / 2) * this.height };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Compile every material once before play so the first frames do not stutter. */
  warmUp(): void {
    this.renderer.compile(this.scene, this.camera);
    this.render();
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
