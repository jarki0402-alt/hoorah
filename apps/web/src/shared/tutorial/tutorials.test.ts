import { describe, expect, it } from 'vitest';
import { CATALOG } from '../games';
import { TUTORIAL_LOADERS } from './index';
import type { PhoneHint, Tutorial } from './types';

/** Tags balance and no tag repeats an attribute (a duplicate makes browsers drop the SVG). */
function svgProblems(svg: string): string[] {
  const out: string[] = [];
  if (!svg.startsWith('<svg')) out.push('does not start with <svg');
  if (/undefined|NaN/.test(svg)) out.push('contains undefined/NaN');
  if (svg.includes('—')) out.push('contains an em dash');
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m: RegExpExecArray | null = tag.exec(svg);
  let consumed = 0;
  while (m) {
    consumed += m[0].length;
    const [, close, name, attrs, self] = m;
    if (close) {
      if (stack.pop() !== name) out.push(`unbalanced </${name}>`);
    } else {
      const names = [...(attrs ?? '').matchAll(/\s([\w:-]+)\s*=/g)].map((a) => a[1]);
      const dup = names.find((a, i) => names.indexOf(a) !== i);
      if (dup) out.push(`<${name}> repeats ${dup}`);
      if (!self) stack.push(name ?? '');
    }
    m = tag.exec(svg);
  }
  if (stack.length > 0) out.push(`unclosed <${stack.at(-1)}>`);
  // Every "<" must belong to a tag we understood (catches broken attributes).
  const opens = (svg.match(/</g) ?? []).length;
  const tags = (svg.match(tag) ?? []).length;
  if (opens !== tags) out.push('a tag could not be parsed');
  if (consumed === 0) out.push('no tags');
  return out;
}

function phoneText(p: PhoneHint): string[] {
  switch (p.kind) {
    case 'buttons':
      return [...p.labels];
    case 'choice':
      return [...p.options];
    case 'tap':
      return [p.label];
    case 'type':
    case 'board':
    case 'look':
      return [p.text];
    case 'stick':
      return p.button ? [p.button] : [];
    default:
      return [];
  }
}

describe('tutorials', () => {
  for (const id of CATALOG) {
    it(`${id}: origin card, 3–4 short steps, valid scenes`, async () => {
      const t: Tutorial = (await TUTORIAL_LOADERS[id]()).TUTORIAL;
      expect(t.origin.length, 'origin').toBeGreaterThan(10);
      expect(t.origin.length, 'origin length').toBeLessThanOrEqual(140);
      expect(t.steps.length).toBeGreaterThanOrEqual(3);
      expect(t.steps.length).toBeLessThanOrEqual(4);
      const texts = [t.origin, ...t.steps.flatMap((s) => [s.text, ...phoneText(s.phone)])];
      for (const s of texts) expect(s, s).not.toMatch(/—/);
      for (const [i, s] of t.steps.entries()) {
        expect(s.text.length, `step ${i + 1} text`).toBeLessThanOrEqual(80);
        expect(svgProblems(s.scene()), `step ${i + 1} scene`).toEqual([]);
        if (s.phone.kind === 'buttons') expect(s.phone.press).toBeLessThan(s.phone.labels.length);
        if (s.phone.kind === 'choice') expect(s.phone.pick).toBeLessThan(s.phone.options.length);
      }
    });
  }
});
