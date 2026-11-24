/** Player-facing text for Juara Eja (Bahasa Indonesia, no em dashes). */
import type { NearKind } from './logic';
import type { Lang, Tier } from './words';

export const LANG_NAME: Record<Lang, string> = { id: 'Bahasa Indonesia', en: 'English' };
export const LANG_TAG: Record<Lang, string> = { id: 'ID', en: 'EN' };
export const TIER_NAME: Record<Tier, string> = { 1: 'Mudah', 2: 'Sedang', 3: 'Sulit' };

export const NEAR_TEXT: Record<NearKind, string> = {
  missing: 'Kurang 1 huruf!',
  extra: 'Kelebihan 1 huruf!',
  swap: 'Ada huruf tertukar!',
  typo: 'Beda 1 huruf!',
};

export const STR = {
  logo: 'Juara Eja',
  noShell: 'Buka Juara Eja dari layar utama Kacawbalaw.',

  // Setup
  menuEyebrow: 'Juara Eja',
  menuLangTitle: 'Pilih bahasa',
  menuLangHint: 'Kata dan artinya memakai bahasa ini.',
  langSub: {
    id: 'Kata sehari-hari sampai yang sering salah eja',
    en: 'Kata bahasa Inggris, arti dalam bahasa Inggris',
  } as Record<Lang, string>,
  menuStart: 'Mulai',
  menuWaiting: (host: string) => `${host} sedang memilih bahasa...`,
  setupTitle: 'Pilih bahasa',
  setupHint: (host: string) => `${host} memilih di HP`,
  setupSolo: 'Main sendiri: kejar rekor beruntun!',
  setupGroup: (words: number) => `${words} kata, makin lama makin sulit`,

  // Screen
  wordChip: (n: number, total: number) => `Kata ${n}/${total}`,
  soloChip: (n: number) => `Kata ${n}`,
  doubleChip: 'Poin ganda',
  letters: (n: number) => `${n} huruf`,
  replay: 'Dengar lagi',
  replayNoVoice: 'Huruf awal',
  firstLetter: 'Petunjuk: huruf awal',
  introHint: 'Dengarkan dan baca artinya',
  typing: 'Ketik ejaannya di HP',
  streak: (n: number) => `Beruntun ${n}`,
  best: (n: number) => `Rekor ${n}`,
  livesLeft: (n: number) => `${n} nyawa`,
  practiceTag: 'Latihan',
  answerWas: 'Ejaan yang benar',
  fastestTag: 'Tercepat',

  // Phone
  phoneIntroTitle: 'Dengarkan katanya',
  phoneIntroSub: 'Arti kata ada di layar utama.',
  phoneEyebrow: (n: number, total: number, tier: string) => `Kata ${n}/${total} · ${tier}`,
  phoneEyebrowSolo: (streak: number, tier: string) => `Beruntun ${streak} · ${tier}`,
  phoneTitle: 'Ketik ejaannya',
  phoneTitlePractice: 'Latihan: nyawamu habis',
  phoneHint: 'Dengar katanya, baca artinya di layar.',
  phoneHintPractice: 'Tetap ketik! Tidak dapat poin, tapi masuk Kamus Saya.',
  phoneSentTitle: 'Terkirim!',
  phoneSentSub: 'Tunggu yang lain. Huruf dibuka bersama di layar.',
  phoneCorrect: 'Benar!',
  phoneWrong: 'Belum tepat',
  phoneTimeout: 'Waktu habis',
  phoneYours: (typed: string) => `Ejaanmu: ${typed}`,
  phoneLifeLost: (left: number) => (left > 0 ? `Nyawa tinggal ${left}` : 'Nyawa habis, lanjut Latihan'),
  phonePractice: 'Latihan, tanpa poin',
  phoneWatchTitle: 'Ikut kata berikutnya',
  phoneWatchSub: 'Kamu masuk saat kata baru dibacakan.',
  phoneFinal: (rank: number) => (rank === 1 ? 'Juara Eja!' : `Peringkat ${rank}`),
  phoneFinalSolo: (best: number) => `Beruntun terbaik ${best}`,
  points: (n: number) => `${n} poin`,
  plus: (n: number) => `+${n}`,
  kamusLabel: 'Kamus Saya',

  // Final
  finalTitle: 'Juara Eja',
  finalSolo: 'Sesi selesai',
  finalBestStreak: (n: number) => `Beruntun terbaik: ${n}`,
  finalRecordNew: 'Rekor baru!',
  finalRecord: (n: number) => `Rekor layar ini: ${n}`,
  finalKamus: (n: number) => `${n} kata masuk Kamus Saya`,

  // Results
  resultWinner: (name: string) => `${name} Juara Eja!`,
  resultTie: (names: string[]) => `${names.join(' & ')} sama kuat!`,
  resultSub: (words: number) => `${words} kata dieja`,
  resultSolo: (best: number) => `Beruntun terbaik ${best}`,
  resultSoloSub: (correct: number) => `${correct} kata benar`,
  rankLabel: (score: number) => `${score} poin`,
  rankLabelSolo: (best: number) => `Beruntun ${best}`,

  awards: {
    champ: 'Juara Eja',
    champDesc: (n: number) => `${n} kata dieja benar`,
    quick: 'Jari Kilat',
    quickDesc: (s: number) => `Rata-rata ${s} detik per kata benar`,
    streak: 'Tak Terbendung',
    streakDesc: (n: number) => `${n} kata benar beruntun`,
    near: 'Nyaris Sempurna',
    nearDesc: (n: number) => `${n} kali kurang satu huruf saja`,
    clean: 'Rapi Jali',
    cleanDesc: 'Tidak pernah salah eja',
    stubborn: 'Pantang Menyerah',
    stubbornDesc: (n: number) => `Tetap mengetik ${n} kata di Latihan`,
    listener: 'Pendengar Setia',
    listenerDesc: 'Ikut menyimak sampai kata terakhir',
  },
} as const;
