import { describe, expect, it } from 'vitest';
import { firstSyllable, lastSyllable, syllabify } from './syllables';

const split = (w: string) => syllabify(w).join('-');

describe('syllabify', () => {
  it.each([
    ['buku', 'bu-ku'],
    ['kuda', 'ku-da'],
    ['makan', 'ma-kan'],
    ['sekolah', 'se-ko-lah'],
    ['matahari', 'ma-ta-ha-ri'],
    ['anak', 'a-nak'],
    ['ibu', 'i-bu'],
    ['es', 'es'],
  ])('splits open and closed syllables: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it.each([
    ['daun', 'da-un'],
    ['buah', 'bu-ah'],
    ['main', 'ma-in'],
    ['laut', 'la-ut'],
    ['haus', 'ha-us'],
    ['baik', 'ba-ik'],
    ['kain', 'ka-in'],
    ['air', 'a-ir'],
    ['koin', 'ko-in'],
    ['kue', 'ku-e'],
    ['piano', 'pi-a-no'],
    ['radio', 'ra-di-o'],
    ['daerah', 'da-e-rah'],
    ['biawak', 'bi-a-wak'],
    ['bauksit', 'ba-uk-sit'],
  ])('splits vowels that are not a diphthong: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it.each([
    ['santai', 'san-tai'],
    ['pantai', 'pan-tai'],
    ['pulau', 'pu-lau'],
    ['kerbau', 'ker-bau'],
    ['harimau', 'ha-ri-mau'],
    ['sungai', 'su-ngai'],
    ['saudara', 'sau-da-ra'],
    ['aula', 'au-la'],
    ['toilet', 'toi-let'],
    ['amboi', 'am-boi'],
    ['survei', 'sur-vei'],
    ['kaisar', 'kai-sar'],
    ['boikot', 'boi-kot'],
  ])('keeps diphthongs together: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it.each([
    ['bangun', 'ba-ngun'],
    ['nyanyi', 'nya-nyi'],
    ['tangan', 'ta-ngan'],
    ['ingin', 'i-ngin'],
    ['ngeri', 'nge-ri'],
    ['penyakit', 'pe-nya-kit'],
    ['banyak', 'ba-nyak'],
    ['akhir', 'a-khir'],
    ['ikhlas', 'ikh-las'],
    ['masyarakat', 'ma-sya-ra-kat'],
    ['syukur', 'syu-kur'],
    ['mangga', 'mang-ga'],
    ['tunggu', 'tung-gu'],
    ['angka', 'ang-ka'],
    ['lingkar', 'ling-kar'],
    ['bianglala', 'bi-ang-la-la'],
  ])('treats ng, ny, kh and sy as one consonant: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it.each([
    ['kantor', 'kan-tor'],
    ['mandi', 'man-di'],
    ['sombong', 'som-bong'],
    ['sanggup', 'sang-gup'],
    ['pasta', 'pas-ta'],
    ['masker', 'mas-ker'],
    ['kerja', 'ker-ja'],
    ['sabtu', 'sab-tu'],
    ['bangkrut', 'bang-krut'],
    ['ekstra', 'eks-tra'],
    ['sastra', 'sas-tra'],
    ['putri', 'pu-tri'],
    ['kompleks', 'kom-pleks'],
    ['transportasi', 'trans-por-ta-si'],
    ['takhta', 'takh-ta'],
  ])('splits consonant runs inside a word: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it.each([
    ['tradisi', 'tra-di-si'],
    ['program', 'pro-gram'],
    ['kredit', 'kre-dit'],
    ['blender', 'blen-der'],
    ['stasiun', 'sta-si-un'],
    ['struktur', 'struk-tur'],
    ['skripsi', 'skrip-si'],
    ['psikolog', 'psi-ko-log'],
    ['swasta', 'swas-ta'],
    ['pria', 'pri-a'],
  ])('keeps consonant clusters at the start: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it.each([
    ['teks', 'teks'],
    ['film', 'film'],
    ['bank', 'bank'],
    ['golf', 'golf'],
  ])('keeps final clusters in the last syllable: %s', (w, want) => {
    expect(split(w)).toBe(want);
  });

  it('handles words with w and y as consonants', () => {
    expect(split('kawan')).toBe('ka-wan');
    expect(split('sayur')).toBe('sa-yur');
    expect(split('bayi')).toBe('ba-yi');
  });

  it('is case insensitive and safe on odd input', () => {
    expect(split('BUKU')).toBe('bu-ku');
    expect(syllabify('')).toEqual([]);
    expect(syllabify('pst')).toEqual(['pst']);
  });

  it('always rebuilds the word from its syllables', () => {
    for (const w of ['matahari', 'transportasi', 'masyarakat', 'bianglala', 'kerbau', 'instrumen']) {
      expect(syllabify(w).join('')).toBe(w);
    }
  });
});

describe('first and last syllable', () => {
  it('gives the start for the next word in the chain', () => {
    expect(lastSyllable('buku')).toBe('ku');
    expect(lastSyllable('kuda')).toBe('da');
    expect(lastSyllable('daun')).toBe('un');
    expect(lastSyllable('santai')).toBe('tai');
    expect(lastSyllable('bangun')).toBe('ngun');
    expect(lastSyllable('teh')).toBe('teh');
    expect(lastSyllable('')).toBe('');
  });

  it('gives the first syllable', () => {
    expect(firstSyllable('kantor')).toBe('kan');
    expect(firstSyllable('struktur')).toBe('struk');
    expect(firstSyllable('aula')).toBe('au');
  });
});
