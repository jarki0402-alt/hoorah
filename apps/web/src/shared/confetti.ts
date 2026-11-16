/**
 * Lightweight canvas confetti. One shared full-screen canvas, created on demand and removed
 * when the last particle settles, so it costs nothing while idle.
 */

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
  shape: 0 | 1 | 2;
}

const COLORS = ['#FF5A1F', '#FFC928', '#2F8CFF', '#22B35E', '#FF5C9A', '#F2453D', '#FFFFFF'];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let pieces: Piece[] = [];
let raf = 0;
let last = 0;

function ensureCanvas(): void {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize(): void {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function teardown(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  const c = ctx;
  if (!c) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  c.clearRect(0, 0, w, h);
  pieces = pieces.filter((p) => p.life > 0 && p.y < h + 40);
  for (const p of pieces) {
    p.vy += 900 * dt;
    p.vx *= 0.99;
    p.vy *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= dt;
    c.save();
    c.globalAlpha = Math.min(1, p.life * 2);
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.fillStyle = p.color;
    if (p.shape === 0) c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)));
    else if (p.shape === 1) {
      c.beginPath();
      c.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(0, -p.h / 2);
      c.lineTo(p.w / 2, p.h / 2);
      c.lineTo(-p.w / 2, p.h / 2);
      c.fill();
    }
    c.restore();
  }
  if (pieces.length) raf = requestAnimationFrame(frame);
  else teardown();
}

export interface BurstOptions {
  /** 0..1 of viewport width/height. */
  x?: number;
  y?: number;
  count?: number;
  spread?: number;
  power?: number;
  colors?: string[];
}

export function confetti(opts: BurstOptions = {}): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  ensureCanvas();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const count = Math.min(opts.count ?? 120, 260);
  const ox = (opts.x ?? 0.5) * w;
  const oy = (opts.y ?? 0.6) * h;
  const spread = opts.spread ?? 1;
  const power = (opts.power ?? 1) * Math.max(520, h * 0.9);
  const colors = opts.colors ?? COLORS;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread;
    const speed = power * (0.45 + Math.random() * 0.6);
    pieces.push({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 14,
      w: 7 + Math.random() * 7,
      h: 10 + Math.random() * 8,
      color: colors[i % colors.length]!,
      life: 2.4 + Math.random() * 1.6,
      shape: (i % 7 === 0 ? 1 : i % 5 === 0 ? 2 : 0) as 0 | 1 | 2,
    });
  }
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

/** Two side cannons + a center pop: the big celebration. */
export function celebrate(): void {
  confetti({ x: 0.1, y: 0.95, count: 90, spread: 0.6, power: 1.15 });
  confetti({ x: 0.9, y: 0.95, count: 90, spread: 0.6, power: 1.15 });
  window.setTimeout(() => confetti({ x: 0.5, y: 0.55, count: 110, spread: 1.6, power: 0.8 }), 280);
}
