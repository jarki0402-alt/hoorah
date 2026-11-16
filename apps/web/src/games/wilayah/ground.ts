/**
 * The floor layer of Rebut Wilayah, drawn in its own canvas under the (transparent) Phaser
 * canvas: the dark tegel courtyard, the raised frame, the cement floor and the painted
 * territories. Everything here changes only when land changes, so it is redrawn on demand,
 * never every frame.
 *
 * Smooth territories from a blocky raster ("blur + threshold" on the GPU):
 * - The owner raster (3 cells per unit, 3–4 world px each) is uploaded as two RGBA textures, one
 *   channel per owner (owners 1–4 and 5–8), plus a fresh-capture mask. With linear filtering one
 *   fetch gives the coverage of four owners at once; four taps `BLUR` cells apart blur it more. The face is where an owner's coverage passes 0.5, with a one-pixel smoothstep:
 *   contours come out as smooth curves at screen resolution, never staircase cells.
 * - The painted-slab look of the grid version stays: a darker lip under each face, a light rim
 *   on top-left edges, a shaded band inside bottom edges, faint brush strokes, a soft shadow on
 *   the floor, and freshly captured land flashing in a light tint.
 * - Only the rows that changed are uploaded (texSubImage2D) and redrawn (scissor), so a capture
 *   wave costs a strip of the screen per frame.
 *
 * Without WebGL a 2D canvas fallback draws the same layout with the raster scaled up smoothly.
 */
import { FIELD_H, FIELD_W, FIELD_X, FIELD_Y, WORLD_H, WORLD_W } from './layout';
import { RENDER_SCALE } from './textures';
import { FLOOR, hexToInt, territoryPalette } from './tiles';

const OWNERS = 8;
/** Palette rows in the palette texture (one column per owner value 0..8). */
const ROW_FACE = 0;
const ROW_FACE_ALT = 1;
const ROW_LIGHT = 2;
const ROW_LIP = 3;
const ROW_SHADE = 4;
const ROW_FRESH = 5;
const ROW_STROKE = 6;
const PAL_ROWS = 8;
const PAL_COLS = OWNERS + 1;
/** Slab details in world px. */
const LIP_PX = 3;
const RIM_PX = 1.8;
const SHADE_PX = 2.4;
/**
 * Smoothing taps, in raster cells: a 3x3 pattern of linear taps `BLUR` apart (about a 4-cell
 * kernel), so one-cell raster steps melt into gentle curves.
 */
const BLUR = 1.2;
/** Redraw margin around changed rows (blur, lip, rim, shadow), world px. */
const MARGIN_PX = 14;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uView;
uniform vec2 uOrigin;
uniform float uScale;
uniform vec4 uField;
uniform vec2 uTexel;
uniform float uTile;
uniform float uAA;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform sampler2D uPal;

const vec3 BACK = vec3(0.0863, 0.0902, 0.1020);
const vec3 BACK_DOT = vec3(0.1020, 0.1059, 0.1216);
const vec3 BACK_DIA = vec3(0.1098, 0.1137, 0.1333);
const vec3 BACK_GROUT = vec3(0.0706, 0.0745, 0.0824);
const vec3 FRAME = vec3(0.2706, 0.2824, 0.3098);
const vec3 FRAME_TOP = vec3(0.3529, 0.3686, 0.4000);
const vec3 INNER = vec3(0.0549, 0.0588, 0.0667);
uniform vec3 uFloorA;
uniform vec3 uFloorB;
uniform vec3 uGrout;
uniform vec3 uSpeck;

float box(vec2 p, vec2 c, vec2 h, float r) {
  vec2 d = abs(p - c) - h + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

vec3 pal(float idx, float row) {
  return texture2D(uPal, vec2((idx + 0.5) / ${PAL_COLS}.0, (row + 0.5) / ${PAL_ROWS}.0)).rgb;
}

void cover(vec2 uv, out vec4 a, out vec4 b) {
  vec2 o = uTexel * ${BLUR.toFixed(2)};
  a = vec4(0.0);
  b = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 p = uv + vec2(float(i), float(j)) * o;
      float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0);
      a += w * texture2D(uA, p);
      b += w * texture2D(uB, p);
    }
  }
  a *= 1.0 / 16.0;
  b *= 1.0 / 16.0;
}

// The same smoothed coverage for one owner only (one texture).
float coverOne(vec2 uv, float idx) {
  vec2 o = uTexel * ${BLUR.toFixed(2)};
  vec4 sum = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 p = uv + vec2(float(i), float(j)) * o;
      float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0);
      sum += w * (idx <= 4.0 ? texture2D(uA, p) : texture2D(uB, p));
    }
  }
  vec4 m = vec4(equal(vec4(idx <= 4.0 ? idx : idx - 4.0), vec4(1.0, 2.0, 3.0, 4.0)));
  return dot(sum, m) / 16.0;
}

vec2 strongest(vec4 a, vec4 b) {
  float idx = 0.0;
  float m = 0.0;
  if (a.r > m) { m = a.r; idx = 1.0; }
  if (a.g > m) { m = a.g; idx = 2.0; }
  if (a.b > m) { m = a.b; idx = 3.0; }
  if (a.a > m) { m = a.a; idx = 4.0; }
  if (b.r > m) { m = b.r; idx = 5.0; }
  if (b.g > m) { m = b.g; idx = 6.0; }
  if (b.b > m) { m = b.b; idx = 7.0; }
  if (b.a > m) { m = b.a; idx = 8.0; }
  return vec2(idx, m);
}

float ownerCover(vec4 a, vec4 b, float idx) {
  vec4 ma = vec4(equal(vec4(idx), vec4(1.0, 2.0, 3.0, 4.0)));
  vec4 mb = vec4(equal(vec4(idx), vec4(5.0, 6.0, 7.0, 8.0)));
  return dot(a, ma) + dot(b, mb);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 w = px / uScale - uOrigin;
  float aaw = 0.75 / uScale;

  // Courtyard: big dark tegel, quarter circles at the corners and a diamond in the middle.
  vec2 q = mod(w, 96.0);
  vec3 col = BACK;
  float dc = min(min(length(q), length(q - vec2(96.0, 0.0))), min(length(q - vec2(0.0, 96.0)), length(q - vec2(96.0))));
  col = mix(col, BACK_DOT, 1.0 - smoothstep(28.8 - aaw, 28.8 + aaw, dc));
  float dd = abs(q.x - 48.0) + abs(q.y - 48.0);
  col = mix(col, BACK_DIA, 1.0 - smoothstep(17.3 - aaw, 17.3 + aaw, dd));
  if (q.x > 94.0 || q.y > 94.0) col = BACK_GROUT;

  // The raised frame around the floor, with its shadow.
  vec2 fc = uField.xy + uField.zw * 0.5;
  vec2 fh = uField.zw * 0.5;
  float sd = box(w, fc + vec2(0.0, 9.0), fh + vec2(12.0, 13.0), 18.0);
  col *= 1.0 - 0.38 * (1.0 - smoothstep(-3.0, 3.0, sd));
  float body = box(w, fc, fh + 10.0, 16.0);
  col = mix(col, FRAME, 1.0 - smoothstep(-aaw, aaw, body));
  float top = box(w, fc - vec2(0.0, 2.0), fh + vec2(10.0, 8.0), 16.0);
  col = mix(col, FRAME_TOP, 1.0 - smoothstep(-aaw, aaw, top));
  if (all(lessThan(abs(w - fc), fh + 2.0))) col = INNER;

  vec2 uv = (w - uField.xy) / uField.zw;
  if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
    // Cement floor tegel.
    vec2 tq = w - uField.xy;
    vec2 cell = floor(tq / uTile);
    float checker = mod(cell.x + cell.y, 2.0);
    vec3 fl = mix(uFloorA, uFloorB, checker);
    vec2 inT = tq - cell * uTile;
    float g = max(1.0, uTile * 0.05);
    if (inT.x > uTile - g || inT.y > uTile - g) fl = uGrout;
    if (all(lessThan(abs(inT - uTile * 0.5), vec2(max(0.75, uTile * 0.05))))) fl = uSpeck;
    // Soft shadow of the raised land (light from the top left).
    vec2 so = vec2(3.0, 4.0) / uField.zw;
    float sh = dot(texture2D(uA, uv - so), vec4(1.0)) + dot(texture2D(uB, uv - so), vec4(1.0));
    fl *= 1.0 - 0.42 * smoothstep(0.2, 0.8, sh);
    col = fl;

    // The slab's side, showing under its face.
    vec4 la; vec4 lb;
    cover(uv - vec2(0.0, ${LIP_PX.toFixed(1)}) / uField.zw, la, lb);
    vec2 ls = strongest(la, lb);
    if (ls.x > 0.0) col = mix(col, pal(ls.x, ${ROW_LIP}.0), smoothstep(0.5 - uAA, 0.5 + uAA, ls.y));

    // The painted face.
    vec4 ca; vec4 cb;
    cover(uv, ca, cb);
    vec2 st = strongest(ca, cb);
    if (st.x > 0.0) {
      float faceA = smoothstep(0.5 - uAA, 0.5 + uAA, st.y);
      vec3 face = mix(pal(st.x, ${ROW_FACE}.0), pal(st.x, ${ROW_FACE_ALT}.0), checker);
      float stroke = abs(fract((tq.x + tq.y) / (uTile * 0.25)) - 0.5);
      face = mix(face, pal(st.x, ${ROW_STROKE}.0), 0.4 * smoothstep(0.3, 0.38, stroke));
      float above = coverOne(uv - vec2(${(RIM_PX * 0.6).toFixed(2)}, ${RIM_PX.toFixed(2)}) / uField.zw, st.x);
      face = mix(face, pal(st.x, ${ROW_LIGHT}.0), 1.0 - smoothstep(0.5 - uAA, 0.5 + uAA, above));
      vec2 du = uv + vec2(0.0, ${SHADE_PX.toFixed(1)}) / uField.zw;
      float below = ownerCover(texture2D(uA, du), texture2D(uB, du), st.x);
      face = mix(face, pal(st.x, ${ROW_SHADE}.0), 1.0 - smoothstep(0.35, 0.65, below));
      float fresh = texture2D(uC, uv).r;
      face = mix(face, pal(st.x, ${ROW_FRESH}.0), smoothstep(0.15, 0.85, fresh));
      col = mix(col, face, faceA);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgb(hex: string): Rgb {
  const n = hexToInt(hex);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** World layout of the view: stage size in px; world (0, 0) sits at `origin`. */
interface View {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

interface Backend {
  resize(view: View): void;
  setPalette(data: Uint8Array): void;
  /** Rows y0..y1 changed (inclusive). */
  write(a: Uint8Array, b: Uint8Array, c: Uint8Array, y0: number, y1: number): void;
  /** Draw rows y0..y1 of the field (or everything with `all`). */
  draw(all: boolean, y0: number, y1: number): void;
}

export class Ground {
  private el: HTMLCanvasElement;
  private readonly cols: number;
  private readonly rows: number;
  private readonly a: Uint8Array;
  private readonly b: Uint8Array;
  private readonly c: Uint8Array;
  private readonly pal = new Uint8Array(PAL_COLS * PAL_ROWS * 4);
  private backend: Backend;
  private dirtyAll = true;
  private dirty0 = Number.POSITIVE_INFINITY;
  private dirty1 = -1;

  constructor(host: HTMLElement, cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.a = new Uint8Array(cols * rows * 4);
    this.b = new Uint8Array(cols * rows * 4);
    this.c = new Uint8Array(cols * rows);
    this.el = makeCanvas(host);
    const gl = GlBackend.create(this.el, cols, rows);
    if (gl) this.backend = gl;
    else {
      // A canvas that once held a WebGL context cannot give a 2D one: start over.
      this.el.remove();
      this.el = makeCanvas(host);
      this.backend = new FlatBackend(this.el, cols, rows);
    }
    this.el.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.el.addEventListener('webglcontextrestored', () => {
      const again = GlBackend.create(this.el, cols, rows);
      if (!again) return;
      this.backend = again;
      this.backend.setPalette(this.pal);
      this.backend.write(this.a, this.b, this.c, 0, rows - 1);
      this.dirtyAll = true;
      this.render();
    });
  }

  get canvas(): HTMLCanvasElement {
    return this.el;
  }

  /** Stage size in px (the canvas keeps a RENDER_SCALE backing store, like Phaser's). */
  resize(stageW: number, stageH: number): void {
    this.el.width = Math.round(stageW * RENDER_SCALE);
    this.el.height = Math.round(stageH * RENDER_SCALE);
    this.el.style.width = `${stageW}px`;
    this.el.style.height = `${stageH}px`;
    this.backend.resize({ w: stageW, h: stageH, ox: (stageW - WORLD_W) / 2, oy: (stageH - WORLD_H) / 2 });
    this.dirtyAll = true;
  }

  /** Paint owner `v` (1..8) in `color`. */
  setOwnerColor(v: number, color: string): void {
    if (v < 1 || v > OWNERS) return;
    const p = territoryPalette(color);
    const put = (row: number, hex: string) => {
      const c = rgb(hex);
      const i = (row * PAL_COLS + v) * 4;
      this.pal[i] = c.r;
      this.pal[i + 1] = c.g;
      this.pal[i + 2] = c.b;
      this.pal[i + 3] = 255;
    };
    put(ROW_FACE, p.face);
    put(ROW_FACE_ALT, p.faceAlt);
    put(ROW_LIGHT, p.light);
    put(ROW_LIP, p.lip);
    put(ROW_SHADE, p.shade);
    put(ROW_FRESH, p.fresh);
    put(ROW_STROKE, p.stroke);
    this.backend.setPalette(this.pal);
    this.dirtyAll = true;
  }

  /** Copy rows y0..y1 of what the screen shows (owner per cell, fresh flag per cell). */
  writeRows(shown: Uint8Array, fresh: Uint8Array, y0: number, y1: number): void {
    const lo = Math.max(0, y0);
    const hi = Math.min(this.rows - 1, y1);
    if (hi < lo) return;
    const { a, b, c } = this;
    for (let i = lo * this.cols, end = (hi + 1) * this.cols; i < end; i++) {
      const o = shown[i]!;
      const k = i * 4;
      a[k] = o === 1 ? 255 : 0;
      a[k + 1] = o === 2 ? 255 : 0;
      a[k + 2] = o === 3 ? 255 : 0;
      a[k + 3] = o === 4 ? 255 : 0;
      b[k] = o === 5 ? 255 : 0;
      b[k + 1] = o === 6 ? 255 : 0;
      b[k + 2] = o === 7 ? 255 : 0;
      b[k + 3] = o === 8 ? 255 : 0;
      c[i] = o !== 0 && fresh[i] === 1 ? 255 : 0;
    }
    this.backend.write(a, b, c, lo, hi);
    if (lo < this.dirty0) this.dirty0 = lo;
    if (hi > this.dirty1) this.dirty1 = hi;
  }

  /** Redraw whatever changed since the last call. */
  render(): void {
    if (!this.dirtyAll && this.dirty1 < 0) return;
    this.backend.draw(this.dirtyAll, this.dirty0, this.dirty1);
    this.dirtyAll = false;
    this.dirty0 = Number.POSITIVE_INFINITY;
    this.dirty1 = -1;
  }
}

function makeCanvas(host: HTMLElement): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.style.cssText = 'position:absolute;left:0;top:0;display:block';
  host.appendChild(el);
  return el;
}

/* ------------------------------------------------------------------ WebGL */

class GlBackend implements Backend {
  private view: View = { w: WORLD_W, h: WORLD_H, ox: 0, oy: 0 };
  private readonly uView: WebGLUniformLocation | null;
  private readonly uOrigin: WebGLUniformLocation | null;
  private readonly uScale: WebGLUniformLocation | null;

  static create(canvas: HTMLCanvasElement, cols: number, rows: number): GlBackend | null {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new GlBackend(gl, cols, rows);
    } catch (err) {
      console.warn('Rebut Wilayah: WebGL floor unavailable, drawing it flat.', err);
      return null;
    }
  }

  private readonly texA: WebGLTexture;
  private readonly texB: WebGLTexture;
  private readonly texC: WebGLTexture;
  private readonly texPal: WebGLTexture;

  private constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly cols: number,
    private readonly rows: number,
  ) {
    const program = gl.createProgram();
    if (!program) throw new Error('program');
    gl.attachShader(program, this.shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, this.shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.texA = this.texture(0, gl.RGBA, cols, rows, gl.LINEAR);
    this.texB = this.texture(1, gl.RGBA, cols, rows, gl.LINEAR);
    this.texC = this.texture(2, gl.LUMINANCE, cols, rows, gl.LINEAR);
    this.texPal = this.texture(3, gl.RGBA, PAL_COLS, PAL_ROWS, gl.NEAREST);
    const uni = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform1i(uni('uA'), 0);
    gl.uniform1i(uni('uB'), 1);
    gl.uniform1i(uni('uC'), 2);
    gl.uniform1i(uni('uPal'), 3);
    gl.uniform4f(uni('uField'), FIELD_X, FIELD_Y, FIELD_W, FIELD_H);
    gl.uniform2f(uni('uTexel'), 1 / cols, 1 / rows);
    const cellPx = FIELD_W / cols;
    // Floor tiles two units wide (one unit is 3 cells).
    gl.uniform1f(uni('uTile'), cellPx * 6);
    // After the blur coverage ramps over about 1 + 2 * BLUR cells; spread the edge over about one
    // screen pixel of that ramp.
    gl.uniform1f(uni('uAA'), Math.min(0.2, 0.6 / ((1 + 2 * BLUR) * cellPx * RENDER_SCALE)));
    const floor = (name: string, hex: string) => {
      const c = rgb(hex);
      gl.uniform3f(uni(name), c.r / 255, c.g / 255, c.b / 255);
    };
    floor('uFloorA', FLOOR.base);
    floor('uFloorB', FLOOR.alt);
    floor('uGrout', FLOOR.grout);
    floor('uSpeck', FLOOR.speck);
    this.uView = uni('uView');
    this.uOrigin = uni('uOrigin');
    this.uScale = uni('uScale');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  private shader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type);
    if (!s) throw new Error('shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
    return s;
  }

  private texture(unit: number, format: number, w: number, h: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('texture');
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const bytes = format === gl.RGBA ? 4 : 1;
    gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, gl.UNSIGNED_BYTE, new Uint8Array(w * h * bytes));
    return t;
  }

  resize(view: View): void {
    this.view = view;
  }

  setPalette(data: Uint8Array): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texPal);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PAL_COLS, PAL_ROWS, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  write(a: Uint8Array, b: Uint8Array, c: Uint8Array, y0: number, y1: number): void {
    const gl = this.gl;
    const n = y1 - y0 + 1;
    const cols = this.cols;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      y0,
      cols,
      n,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      a.subarray(y0 * cols * 4, (y1 + 1) * cols * 4),
    );
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      y0,
      cols,
      n,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      b.subarray(y0 * cols * 4, (y1 + 1) * cols * 4),
    );
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texC);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      y0,
      cols,
      n,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      c.subarray(y0 * cols, (y1 + 1) * cols),
    );
  }

  draw(all: boolean, y0: number, y1: number): void {
    const gl = this.gl;
    const { w, h, ox, oy } = this.view;
    const cw = gl.drawingBufferWidth;
    const ch = gl.drawingBufferHeight;
    gl.viewport(0, 0, cw, ch);
    gl.uniform2f(this.uView, cw, ch);
    gl.uniform2f(this.uOrigin, ox, oy);
    gl.uniform1f(this.uScale, cw / w);
    if (all) gl.disable(gl.SCISSOR_TEST);
    else {
      // Only the band of changed rows (plus room for blur, lip, rim and shadow).
      const s = ch / h;
      const cell = FIELD_H / this.rows;
      const top = (FIELD_Y + y0 * cell - MARGIN_PX + oy) * s;
      const bottom = (FIELD_Y + (y1 + 1) * cell + MARGIN_PX + oy) * s;
      const left = (FIELD_X - MARGIN_PX + ox) * s;
      const right = (FIELD_X + FIELD_W + MARGIN_PX + ox) * s;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        Math.max(0, Math.floor(left)),
        Math.max(0, Math.floor(ch - bottom)),
        Math.ceil(right - left),
        Math.ceil(bottom - top),
      );
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/* ------------------------------------------------------------------ 2D fallback */

class FlatBackend implements Backend {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly raster: HTMLCanvasElement;
  private readonly rctx: CanvasRenderingContext2D | null;
  private readonly image: ImageData | null;
  private view: View = { w: WORLD_W, h: WORLD_H, ox: 0, oy: 0 };
  private colors: Rgb[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cols: number,
    rows: number,
  ) {
    this.ctx = canvas.getContext('2d');
    this.raster = document.createElement('canvas');
    this.raster.width = cols;
    this.raster.height = rows;
    this.rctx = this.raster.getContext('2d');
    this.image = this.rctx?.createImageData(cols, rows) ?? null;
  }

  resize(view: View): void {
    this.view = view;
  }

  setPalette(data: Uint8Array): void {
    this.colors = [];
    for (let v = 0; v < PAL_COLS; v++) {
      const i = (ROW_FACE * PAL_COLS + v) * 4;
      this.colors.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
    }
  }

  write(a: Uint8Array, b: Uint8Array, c: Uint8Array, y0: number, y1: number): void {
    const img = this.image;
    if (!img) return;
    const px = img.data;
    for (let i = y0 * this.cols, end = (y1 + 1) * this.cols; i < end; i++) {
      const k = i * 4;
      let o = 0;
      for (let ch = 0; ch < 4; ch++) {
        if (a[k + ch]) o = ch + 1;
        if (b[k + ch]) o = ch + 5;
      }
      const col = this.colors[o];
      const fresh = c[i] ? 0.5 : 0;
      px[k] = col ? col.r + (255 - col.r) * fresh : 0;
      px[k + 1] = col ? col.g + (255 - col.g) * fresh : 0;
      px[k + 2] = col ? col.b + (255 - col.b) * fresh : 0;
      px[k + 3] = o === 0 ? 0 : 255;
    }
    this.rctx?.putImageData(img, 0, 0);
  }

  draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { w, ox, oy } = this.view;
    const s = this.canvas.width / w;
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    ctx.fillStyle = '#16171A';
    ctx.fillRect(-ox, -oy, this.canvas.width / s, this.canvas.height / s);
    ctx.fillStyle = '#45484F';
    ctx.beginPath();
    ctx.roundRect(FIELD_X - 10, FIELD_Y - 10, FIELD_W + 20, FIELD_H + 20, 16);
    ctx.fill();
    ctx.fillStyle = '#0E0F11';
    ctx.fillRect(FIELD_X - 2, FIELD_Y - 2, FIELD_W + 4, FIELD_H + 4);
    ctx.fillStyle = FLOOR.base;
    ctx.fillRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.raster, FIELD_X, FIELD_Y, FIELD_W, FIELD_H);
  }
}
