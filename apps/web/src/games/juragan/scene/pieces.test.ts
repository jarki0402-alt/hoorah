import { PERSON_IDS } from '@hoorah/protocol';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PawnModel } from './pieces';

function size(g: THREE.BufferGeometry): THREE.Vector3 {
  g.computeBoundingBox();
  return (g.boundingBox ?? new THREE.Box3()).getSize(new THREE.Vector3());
}

describe('PawnModel heads', () => {
  it('builds a coloured head for every cast character at the old head size', () => {
    for (const c of PERSON_IDS) {
      const g = new PawnModel({ c }, '#F2453D').head.geometry;
      expect(g.getAttribute('color')).toBeDefined();
      const s = size(g);
      expect(s.x).toBeGreaterThan(0.5);
      expect(s.x).toBeLessThan(0.9);
      expect(s.y).toBeLessThan(1);
    }
  });

  it('shares one head per look and makes a new one when the look changes', () => {
    const a = new PawnModel({ c: PERSON_IDS[0]! }, '#F2453D').head.geometry;
    const b = new PawnModel({ c: PERSON_IDS[0]! }, '#2F8CFF').head.geometry;
    const skin = new PawnModel({ c: PERSON_IDS[0]!, s: 5 }, '#F2453D').head.geometry;
    const hair = new PawnModel({ c: PERSON_IDS[0]!, h: PERSON_IDS[1]! }, '#F2453D').head.geometry;
    expect(b).toBe(a);
    expect(skin).not.toBe(a);
    expect(hair).not.toBe(a);
  });
});
