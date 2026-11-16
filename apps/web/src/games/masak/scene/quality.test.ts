import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Particles } from './fx';
import { bakeToonLight, type DirSpec, HEMI, toonBand } from './light';
import { describeRung, ladder, PLANS, QualityLadder, shadowMapSize, stepDown } from './quality';

const short = (p: keyof typeof PLANS) => ladder(PLANS[p]).map(describeRung);

describe('graphics levels', () => {
  it('high starts at the laptop look and walks shadows, resolution, then 30 fps', () => {
    expect(short('high')).toEqual([
      'shadows full, 1.5x',
      'shadows light, 1.5x',
      'shadows off, 1.5x',
      'shadows off, 1.35x',
      'shadows off, 1.2x',
      'shadows off, 1.05x',
      'shadows off, 0.9x',
      'shadows off, 0.75x',
      'shadows off, 0.75x, 30 fps',
    ]);
  });

  it('medium and low stop at their own resolution floor', () => {
    expect(short('medium')).toEqual([
      'shadows light, 1.15x',
      'shadows off, 1.15x',
      'shadows off, 1x',
      'shadows off, 0.85x',
      'shadows off, 0.7x',
      'shadows off, 0.65x',
      'shadows off, 0.65x, 30 fps',
    ]);
    expect(short('low')).toEqual([
      'shadows off, 0.75x',
      'shadows off, 0.6x',
      'shadows off, 0.5x',
      'shadows off, 0.5x, 30 fps',
    ]);
  });

  it('maps tiers to context flags and models', () => {
    expect(PLANS.high.msaa && PLANS.medium.msaa).toBe(true);
    expect(PLANS.low.msaa).toBe(false);
    expect(PLANS.low.bakedSet && PLANS.low.lowDetail).toBe(true);
    expect(PLANS.high.bakedSet || PLANS.high.lowDetail).toBe(false);
    expect([shadowMapSize('full'), shadowMapSize('light'), shadowMapSize('off')]).toEqual([2048, 1024, 0]);
    expect(stepDown({ shadows: 'off', ratio: 0.5, cap30: true }, 0.5)).toBeNull();
  });
});

/** Feed `secs` of frames `ms` apart starting at `t`; returns the end time. */
function feed(q: QualityLadder, t: number, ms: number, secs: number): number {
  let now = t;
  const end = t + secs * 1000;
  while (now < end) {
    now += ms;
    if (q.due(now)) q.frame(now);
  }
  return now;
}

describe('quality ladder', () => {
  it('keeps the rung while frames are on time', () => {
    const q = new QualityLadder(PLANS.high, true, vi.fn());
    feed(q, 0, 1000 / 60, 30);
    expect(q.rung).toEqual(PLANS.high.start);
    expect(q.log).toEqual([]);
  });

  it('steps down to the bottom on a slow device and reports the level once', () => {
    const onBottom = vi.fn();
    const q = new QualityLadder(PLANS.low, true, onBottom);
    feed(q, 0, 80, 60);
    expect(q.rung).toEqual({ shadows: 'off', ratio: 0.5, cap30: true });
    expect(q.atBottom).toBe(true);
    expect(q.pacer.cap30).toBe(true);
    expect(q.log).toHaveLength(3);
    expect(onBottom).toHaveBeenCalledTimes(1);
    expect(onBottom).toHaveBeenCalledWith('low');
  });

  it('ignores slow frames while held and when not adaptive', () => {
    const held = new QualityLadder(PLANS.high, true, vi.fn());
    held.hold(20_000);
    feed(held, 0, 80, 19);
    expect(held.rung).toEqual(PLANS.high.start);
    const fixed = new QualityLadder(PLANS.high, false, vi.fn());
    feed(fixed, 0, 80, 30);
    expect(fixed.rung).toEqual(PLANS.high.start);
  });
});

describe('baked toon light', () => {
  it('reads the four-band ramp like the shader', () => {
    expect(toonBand(-1)).toBeCloseTo(118 / 255);
    expect(toonBand(-0.4)).toBeCloseTo(176 / 255);
    expect(toonBand(0)).toBeCloseTo(226 / 255);
    expect(toonBand(1)).toBeCloseTo(1);
  });

  it('lights a vertex as sky + ramped key light over pi, scaled by its colour', () => {
    const key: DirSpec = { color: 0xffffff, intensity: 2, position: [0, 1, 0], target: [0, 0, 0] };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, -1, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0.5, 0.5, 0.5], 3));
    bakeToonLight(g, [key]);
    const col = g.getAttribute('color');
    const sky = new THREE.Color(HEMI.sky).multiplyScalar(HEMI.intensity);
    const ground = new THREE.Color(HEMI.ground).multiplyScalar(HEMI.intensity);
    // Facing the light: full sky and the brightest band.
    expect(col.getX(0)).toBeCloseTo((sky.r + 2) / Math.PI, 5);
    expect(col.getZ(0)).toBeCloseTo((sky.b + 2) / Math.PI, 5);
    // Facing away: ground colour and the darkest band, at half the base colour.
    expect(col.getY(1)).toBeCloseTo((0.5 * (ground.g + 2 * (118 / 255))) / Math.PI, 5);
  });
});

describe('particles', () => {
  it('spawns only its share of particles at a lower density', () => {
    const p = new Particles(64);
    p.density = 0.5;
    for (let i = 0; i < 10; i++) p.steam(0, 0, 0);
    p.sparkle(0, 0, 0, 0.1, 8);
    p.update(0.001);
    expect(p.points.geometry.drawRange.count).toBe(9);
  });
});
