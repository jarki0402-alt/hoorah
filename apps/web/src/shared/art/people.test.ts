import { describe, expect, it } from 'vitest';
import { PERSON_NAMES } from '../peopleStrings';
import { PEOPLE, PERSON_IDS, type PersonFace, personMarkup, personTint, shade } from './people';

const FACES: PersonFace[] = [
  'happy',
  'grin',
  'smile',
  'wink',
  'laugh',
  'wow',
  'love',
  'cool',
  'tongue',
  'shy',
  'nervous',
  'sad',
  'cry',
  'angry',
  'sleepy',
  'win',
];

const count = (s: string, sub: string): number => s.split(sub).length - 1;

describe('shade', () => {
  it('darkens below 1 and lightens toward white above 1', () => {
    expect(shade('#808080', 0.5)).toBe('#404040');
    expect(shade('#000000', 1.5)).toBe('#7F7F7F');
    expect(shade('#FF5A1F', 1)).toBe('#FF5A1F');
  });

  it('never goes past white', () => {
    expect(shade('#FFFFFF', 2.2)).toBe('#FFFFFF');
  });
});

describe('the cast', () => {
  it('has 24 characters, each with a display name', () => {
    expect(PERSON_IDS).toHaveLength(24);
    for (const id of PERSON_IDS) expect(PERSON_NAMES[id].length).toBeGreaterThan(1);
  });

  it('gives every character a light tile colour', () => {
    for (const id of PERSON_IDS) expect(personTint(id)).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('draws every character with every face as well-formed markup', () => {
    for (const id of PERSON_IDS) {
      for (const face of FACES) {
        const m = personMarkup(id, { face, uid: 't' });
        expect(m, `${id}/${face}`).not.toMatch(/NaN|undefined|\$/);
        expect(count(m, '<g'), `${id}/${face} groups`).toBe(count(m, '</g>'));
        expect(count(m, '<path'), `${id}/${face} paths`).toBe(count(m, '</path>'));
        // Every clip-path in use is defined, exactly once.
        const ids = [...m.matchAll(/<clipPath id="([^"]+)"/g)].map((x) => x[1]);
        expect(new Set(ids).size).toBe(ids.length);
        for (const ref of m.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref[1]);
      }
    }
  });

  it('uses the signature face when none is asked for', () => {
    const own = personMarkup('arka', { uid: 'a' });
    expect(own).toBe(personMarkup('arka', { face: PEOPLE.arka.face, uid: 'a' }));
    expect(own).not.toBe(personMarkup('arka', { face: 'sad', uid: 'a' }));
  });

  it('makes fresh clip ids for each drawing so two copies on one page do not clash', () => {
    const first = personMarkup('leo').match(/<clipPath id="([^"-]+)-/)?.[1];
    const second = personMarkup('leo').match(/<clipPath id="([^"-]+)-/)?.[1];
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });
});
