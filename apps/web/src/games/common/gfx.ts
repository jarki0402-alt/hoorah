/**
 * Graphics profile of this device, shared by every 3D game (Bajaj Rush, Jago Masak, Lari Terus,
 * Juragan Nusantara) and shown on the diagnostics page (`/?diag=1`).
 *
 * Smart TV browsers rarely say they run on a TV (a Google TV browser app reports a plain Android
 * WebView or even a desktop), so the starting level does not rely on the user agent alone:
 *  1. a manual choice from the diagnostics page wins;
 *  2. otherwise a short fill-rate test, run once per browser (the main screen runs it quietly at
 *     start), measures how fast the GPU really is;
 *  3. without a test result the GPU name and the user agent decide;
 *  4. a level a game could not hold before is never used again on this browser: games report it
 *     through `noteSlow`, and the next game starts one level lower.
 *
 * Levels (games map them to their own settings):
 *  - high:   laptops and desktops. Antialiasing, full resolution, real shadows, rich materials.
 *  - medium: tablets, phones, small iGPUs. Antialiasing, about stage resolution, light shadows.
 *  - low:    Smart TVs and weak GPUs. No antialiasing, below stage resolution, no shadow maps, light
 *            materials and models, shorter view; may cap at an even 30 fps.
 */
import { loadJson, saveJson } from './store';

export type GfxTier = 'low' | 'medium' | 'high';
export const GFX_TIERS: readonly GfxTier[] = ['low', 'medium', 'high'];

export type GfxReason =
  | 'forced'
  | 'remembered'
  | 'probe'
  | 'tv'
  | 'software'
  | 'weak-gpu'
  | 'mobile'
  | 'desktop';

export interface GfxProfile {
  tier: GfxTier;
  reason: GfxReason;
  /** Unmasked GPU name when the browser tells it (empty before the first test). */
  gpu: string;
  /** Milliseconds to shade one 1280x720 test layer; null before the first test. */
  layerMs: number | null;
  /** A level this browser could not hold in a game (the next game starts below it). */
  slowAt: GfxTier | null;
  /** Manual choice from the diagnostics page. */
  forced: GfxTier | null;
}

export interface GfxProbe {
  gpu: string;
  vendor: string;
  webgl2: boolean;
  maxTexture: number;
  layerMs: number;
}

interface Stored {
  v: 1;
  /** The user agent the record belongs to; a browser update runs the test again. */
  ua: string;
  probe: GfxProbe | null;
  slowAt: GfxTier | null;
}

const KEY = 'gfx';
const FORCE_KEY = 'gfx.force';

/**
 * Test thresholds in ms per 1280x720 layer. Measured: Apple M1 0.32, software rendering (SwiftShader
 * on that M1) 10.5. Scaled by GPU throughput (estimates): Intel Iris Xe about 0.5, Intel UHD 620
 * about 2, mid tablets about 1.5-3, budget Smart TV GPUs (Mali-G31/G52) 8 or more.
 */
export const LAYER_MS_HIGH = 1.2;
export const LAYER_MS_MEDIUM = 4;

const TV_UA =
  /SMART-?TV|Tizen|Web0S|WebOS|NetCast|BRAVIA|HbbTV|CrKey|AFT[A-Z]|Android ?TV|Google ?TV|Roku|VIDAA|MIBOX|\bDTV\b|\bTV Build\b/i;
const SOFTWARE_GPU = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;
/** GPUs that cannot carry the high or medium level (Smart TV, set-top and budget tablet chips). */
const WEAK_GPU =
  /Mali-(?:4\d\d|T\d+|G31|G51|G52|G57|G310)|PowerVR|Adreno \(TM\) [1-5]\d\d|VideoCore|Vivante|\bGC\d{3,4}\b|Lima|Panfrost/i;
const MOBILE_UA = /Android|iPhone|iPad|Mobile/i;

const rank = (t: GfxTier): number => GFX_TIERS.indexOf(t);
const lower = (t: GfxTier): GfxTier => GFX_TIERS[Math.max(0, rank(t) - 1)]!;
const minTier = (a: GfxTier, b: GfxTier): GfxTier => (rank(a) <= rank(b) ? a : b);

export function isGfxTier(v: unknown): v is GfxTier {
  return v === 'low' || v === 'medium' || v === 'high';
}

/** Android without a touch screen is almost always a TV or a TV box. */
export function looksLikeTvBrowser(ua: string, maxTouchPoints: number): boolean {
  return TV_UA.test(ua) || (/Android/i.test(ua) && maxTouchPoints === 0);
}

export interface TierInput {
  ua: string;
  maxTouchPoints: number;
  gpu: string;
  layerMs: number | null;
  slowAt: GfxTier | null;
  forced: GfxTier | null;
}

/** Pure decision, unit tested. */
export function decideTier(i: TierInput): { tier: GfxTier; reason: GfxReason } {
  if (i.forced) return { tier: i.forced, reason: 'forced' };
  const tv = looksLikeTvBrowser(i.ua, i.maxTouchPoints);
  let base: { tier: GfxTier; reason: GfxReason };
  if (SOFTWARE_GPU.test(i.gpu)) base = { tier: 'low', reason: 'software' };
  else if (i.layerMs !== null) {
    const measured: GfxTier =
      i.layerMs <= LAYER_MS_HIGH ? 'high' : i.layerMs <= LAYER_MS_MEDIUM ? 'medium' : 'low';
    // A fast TV box still gets the TV-sized level: big-screen browsers have little memory.
    base = { tier: tv ? minTier(measured, 'medium') : measured, reason: 'probe' };
  } else if (tv) base = { tier: 'low', reason: 'tv' };
  else if (WEAK_GPU.test(i.gpu)) base = { tier: 'low', reason: 'weak-gpu' };
  else if (MOBILE_UA.test(i.ua)) base = { tier: 'medium', reason: 'mobile' };
  else base = { tier: 'high', reason: 'desktop' };
  if (i.slowAt) {
    const below = lower(i.slowAt);
    if (rank(below) < rank(base.tier)) return { tier: below, reason: 'remembered' };
  }
  return base;
}

/* ------------------------------------------------------------------ storage */

function stored(): Stored | null {
  const s = loadJson<Stored | null>(KEY, null);
  if (s?.v !== 1 || typeof navigator === 'undefined' || s.ua !== navigator.userAgent) return null;
  return s;
}

function save(patch: Partial<Omit<Stored, 'v' | 'ua'>>): void {
  const s = stored();
  saveJson(KEY, {
    v: 1,
    ua: navigator.userAgent,
    probe: patch.probe !== undefined ? patch.probe : (s?.probe ?? null),
    slowAt: patch.slowAt !== undefined ? patch.slowAt : (s?.slowAt ?? null),
  } satisfies Stored);
}

export function forcedTier(): GfxTier | null {
  const v = loadJson<unknown>(FORCE_KEY, null);
  return isGfxTier(v) ? v : null;
}

/** Manual level from the diagnostics page; null returns to automatic. */
export function setForcedTier(t: GfxTier | null): void {
  saveJson(FORCE_KEY, t);
}

/** Forget the test result and the remembered slow level (the diagnostics page's reset). */
export function resetGfx(): void {
  saveJson(KEY, null);
  saveJson(FORCE_KEY, null);
}

/**
 * A game could not hold `tier` on this device (it had to step all the way down within it): the
 * next game starts one level lower. Keeps the lowest level reported.
 */
export function noteSlow(tier: GfxTier): void {
  const s = stored();
  const prev = s?.slowAt ?? null;
  save({ slowAt: prev ? minTier(prev, tier) : tier });
}

/** The profile as it stands now (no test is run here). `?gfx=low|medium|high` overrides. */
export function gfxProfile(): GfxProfile {
  const s = stored();
  let forced = forcedTier();
  try {
    const q = new URLSearchParams(window.location.search).get('gfx');
    if (isGfxTier(q)) forced = q;
  } catch {
    // No window (tests): keep the stored choice.
  }
  const probe = s?.probe ?? null;
  const input: TierInput = {
    ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0,
    gpu: probe?.gpu ?? '',
    layerMs: probe?.layerMs ?? null,
    slowAt: s?.slowAt ?? null,
    forced,
  };
  const d = decideTier(input);
  return { ...d, gpu: input.gpu, layerMs: input.layerMs, slowAt: input.slowAt, forced };
}

/** The profile, running the GPU test first if this browser has not had one yet. */
export async function ensureGfxProfile(): Promise<GfxProfile> {
  if (!stored()?.probe) {
    const probe = await runGfxProbe();
    if (probe) save({ probe });
  }
  return gfxProfile();
}

/** Runs the GPU test again and stores the result (diagnostics page). */
export async function retestGfx(): Promise<GfxProbe | null> {
  const probe = await runGfxProbe();
  if (probe) save({ probe });
  return probe;
}

/* ------------------------------------------------------------------ GPU test */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
/** About the per-pixel work of a lit, fogged game material. Blended, so no layer can be culled. */
const FRAG = `precision highp float;
uniform float u;
void main(){
  vec2 q = gl_FragCoord.xy * 0.0031 + u;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    q = vec2(sin(q.x * 1.7 + q.y), cos(q.y * 1.3 - q.x));
    c += vec3(q, q.x * q.y) * 0.02;
  }
  gl_FragColor = vec4(abs(c) * 0.004, 0.004);
}`;

const TEST_W = 1280;
const TEST_H = 720;
/** Keep the whole test short even on very slow GPUs. */
const PROBE_BUDGET_MS = 2500;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

/**
 * Reads the GPU name and measures how long one 1280x720 layer of a game-like shader takes.
 * Returns null when WebGL is missing. Runs at most about 2.5 s (well under 1 s on most devices).
 */
export async function runGfxProbe(): Promise<GfxProbe | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = TEST_W;
  canvas.height = TEST_H;
  const attrs: WebGLContextAttributes = {
    antialias: false,
    depth: false,
    stencil: false,
    alpha: false,
    powerPreference: 'high-performance',
  };
  const gl2 = canvas.getContext('webgl2', attrs);
  const gl = (gl2 ?? canvas.getContext('webgl', attrs)) as WebGLRenderingContext | null;
  if (!gl) return null;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    const vendor = String(gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ?? '');
    const maxTexture = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return { gpu, vendor, webgl2: Boolean(gl2), maxTexture, layerMs: 99 };
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // One triangle that covers the whole viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, TEST_W, TEST_H);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const u = gl.getUniformLocation(prog, 'u');
    const px = new Uint8Array(4);
    const run = (layers: number): number => {
      const t0 = performance.now();
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (let i = 0; i < layers; i++) {
        gl.uniform1f(u, i * 0.37);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // Reading a pixel waits for the GPU to finish.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return performance.now() - t0;
    };
    const started = performance.now();
    run(1); // compile and warm up
    let layers = 2;
    let t = run(layers);
    // Grow the batch until it takes long enough to time reliably.
    while (t < 12 && layers < 1024 && performance.now() - started < PROBE_BUDGET_MS) {
      await new Promise((r) => setTimeout(r, 0));
      layers *= 2;
      t = run(layers);
    }
    let best = t;
    for (let k = 0; k < 2 && performance.now() - started + t < PROBE_BUDGET_MS; k++) {
      await new Promise((r) => setTimeout(r, 0));
      best = Math.min(best, run(layers));
    }
    const layerMs = Math.round((best / layers) * 1000) / 1000;
    return { gpu, vendor, webgl2: Boolean(gl2), maxTexture, layerMs };
  } catch {
    return null;
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/* ------------------------------------------------------------------ frame pacing */

/**
 * Renders every display frame, or every other one when capped at 30 fps: on a 60 Hz TV an even
 * 30 looks smoother than a ragged 40-55. Call `due(now)` at the top of the animation callback and
 * skip the frame (simulation and render) when it returns false; the next frame's delta time then
 * covers both.
 */
export class FramePacer {
  cap30 = false;
  private last = 0;

  due(now: number): boolean {
    if (!this.cap30) {
      this.last = now;
      return true;
    }
    // 4 ms of slack so a 60 Hz display reliably renders every second vsync.
    if (now - this.last < 1000 / 30 - 4) return false;
    this.last = now;
    return true;
  }

  /** Frame interval the governor should expect. */
  get targetMs(): number {
    return this.cap30 ? 1000 / 30 : 1000 / 60;
  }
}

/**
 * Decides when to step quality down: the median frame time of each one-second window is compared
 * with the target, and two slow windows in a row ask for a step. Frames are ignored while held
 * (loading, shader warm-up, intro, and right after a change).
 */
export class FrameGovernor {
  private times: number[] = [];
  private windowMs = 0;
  /** Previous frame time, -1 when there is none to measure from. */
  private last = -1;
  private slow = 0;
  private holdUntil = 0;

  constructor(
    /** Slow when the median frame takes longer than target x this factor (60 Hz: about 46 fps). */
    private readonly factor = 1.3,
    private readonly windows = 2,
  ) {}

  /** Ignore frames until `until` (performance.now() time). */
  hold(until: number): void {
    this.holdUntil = Math.max(this.holdUntil, until);
    this.times = [];
    this.windowMs = 0;
    this.slow = 0;
    this.last = -1;
  }

  /** Feed each rendered frame. Returns true when quality should step down now. */
  frame(now: number, targetMs = 1000 / 60): boolean {
    if (now < this.holdUntil) {
      this.last = -1;
      return false;
    }
    const dt = this.last >= 0 ? now - this.last : 0;
    this.last = now;
    // A gap of seconds is a hidden tab, not a frame. Long frames below that still count (a very
    // slow device draws 1-2 frames a second), capped so one hitch cannot fill a window alone; the
    // median keeps an isolated hitch among normal frames from counting as slow.
    if (dt <= 0 || dt > 2000) return false;
    const d = Math.min(dt, 1000);
    this.times.push(d);
    this.windowMs += d;
    if (this.windowMs < 1000) return false;
    const sorted = this.times.sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1] ?? targetMs;
    this.times = [];
    this.windowMs = 0;
    if (median > targetMs * this.factor) this.slow++;
    else this.slow = 0;
    if (this.slow < this.windows) return false;
    this.slow = 0;
    // Let the new setting settle before judging again.
    this.hold(now + 1500);
    return true;
  }
}
