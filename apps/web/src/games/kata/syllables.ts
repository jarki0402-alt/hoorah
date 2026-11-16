/**
 * Rule-based Indonesian syllable splitter (pemenggalan suku kata), pure and dependency free.
 *
 * Units: the vowels a i u e o; consonants, with the digraphs ng, ny, kh and sy counted as one
 * consonant. The diphthongs ai, au, oi and ei stay in one syllable when they end the word
 * (pan-tai, pu-lau) or are followed by a single consonant and a vowel (sau-da-ra, toi-let);
 * otherwise the two vowels split (da-un, ma-in, ha-us).
 *
 * Between two vowels:
 *  - no consonant: split between the vowels (bu-ah, da-un);
 *  - one consonant: it opens the next syllable (bu-ku, ba-ngun, nya-nyi);
 *  - two or more: the last one opens the next syllable (man-di, kan-tor, bang-krut), except a
 *    stop or f followed by r or l, which stays together (pu-tri, sas-tra, kom-pleks).
 * Consonants before the first vowel open the first syllable (tra-di-si, struk-tur, sta-si-un) and
 * consonants after the last vowel close the last one (teks, film).
 */

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const DIGRAPHS = new Set(['ng', 'ny', 'kh', 'sy']);
const DIPHTHONGS = new Set(['ai', 'au', 'oi', 'ei']);
/** Two-consonant onsets kept together inside a word: a stop or f followed by a liquid. */
const INNER_ONSETS = new Set(['pr', 'br', 'tr', 'dr', 'kr', 'gr', 'fr', 'pl', 'bl', 'kl', 'gl', 'fl']);

interface Unit {
  text: string;
  vowel: boolean;
}

function isVowel(ch: string | undefined): boolean {
  return ch !== undefined && VOWELS.has(ch);
}

/** Letters grouped into vowels and consonants (digraphs as one consonant). */
function toUnits(word: string): Unit[] {
  const raw: Unit[] = [];
  let i = 0;
  while (i < word.length) {
    const pair = word.slice(i, i + 2);
    if (DIGRAPHS.has(pair)) {
      raw.push({ text: pair, vowel: false });
      i += 2;
      continue;
    }
    const ch = word[i]!;
    raw.push({ text: ch, vowel: isVowel(ch) });
    i++;
  }
  // Merge diphthongs into a single vowel unit.
  const out: Unit[] = [];
  for (let k = 0; k < raw.length; k++) {
    const a = raw[k]!;
    const b = raw[k + 1];
    if (a.vowel && b?.vowel && DIPHTHONGS.has(a.text + b.text)) {
      const after = raw[k + 2];
      const afterNext = raw[k + 3];
      const final = after === undefined;
      const openNext = after !== undefined && !after.vowel && afterNext?.vowel === true;
      if (final || openNext) {
        out.push({ text: a.text + b.text, vowel: true });
        k++;
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

/** How many consonant units of a run between two vowels open the next syllable. */
function onsetLength(run: readonly Unit[]): number {
  if (run.length <= 1) return run.length;
  const lastTwo = run[run.length - 2]!.text + run[run.length - 1]!.text;
  return INNER_ONSETS.has(lastTwo) ? 2 : 1;
}

/** Splits a lowercase word into syllables. Non-letters are kept as consonants. */
export function syllabify(input: string): string[] {
  const word = input.toLowerCase();
  if (!word) return [];
  const units = toUnits(word);
  const nuclei: number[] = [];
  units.forEach((u, i) => {
    if (u.vowel) nuclei.push(i);
  });
  if (nuclei.length === 0) return [word];

  const syllables: string[] = [];
  let start = 0;
  for (let n = 0; n < nuclei.length; n++) {
    const v = nuclei[n]!;
    const nextV = nuclei[n + 1];
    if (nextV === undefined) {
      syllables.push(join(units, start, units.length));
      break;
    }
    const run = units.slice(v + 1, nextV);
    const end = nextV - onsetLength(run);
    syllables.push(join(units, start, end));
    start = end;
  }
  return syllables;
}

function join(units: readonly Unit[], from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += units[i]!.text;
  return s;
}

/** The last syllable of a word: the start the next word in the chain must use. */
export function lastSyllable(word: string): string {
  const s = syllabify(word);
  return s[s.length - 1] ?? '';
}

/** The first syllable of a word. */
export function firstSyllable(word: string): string {
  return syllabify(word)[0] ?? '';
}
