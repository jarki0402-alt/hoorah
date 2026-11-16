import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARI_PACKS } from './asset-manifest';
import { requiredModels } from './models';

const dir = new URL('../../../public/models/lari/', import.meta.url);

function glbNodeNames(bytes: Buffer): string[] {
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  const len = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + len).toString('utf8')) as { nodes: { name: string }[] };
  return json.nodes.map((n) => n.name);
}

describe('Lari model packs', () => {
  const packs = Object.entries(LARI_PACKS).map(([name, url]) => {
    const bytes = readFileSync(new URL(`${name}.glb`, dir));
    return { name, url, bytes };
  });

  it('match the content hashes in the manifest', () => {
    for (const p of packs) {
      const hash = createHash('sha256').update(p.bytes).digest('hex').slice(0, 10);
      expect(p.url).toBe(`/models/lari/${p.name}.glb?v=${hash}`);
    }
  });

  it('contain every model the game asks for', () => {
    const names = new Set(packs.flatMap((p) => glbNodeNames(p.bytes)));
    const missing = requiredModels().filter((n) => !names.has(n));
    expect(missing).toEqual([]);
  });

  it('have a runner for every fruit at both levels of detail', () => {
    const names = new Set(glbNodeNames(packs.find((p) => p.name === 'runners')!.bytes));
    for (const fruit of ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'])
      for (const lod of [0, 1]) expect(names.has(`runner_${fruit}_${lod}`)).toBe(true);
  });

  it('stay within the 6 MB budget', () => {
    const total = packs.reduce((s, p) => s + p.bytes.byteLength, 0);
    expect(total).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
