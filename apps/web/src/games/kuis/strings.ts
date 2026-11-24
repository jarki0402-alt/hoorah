/** Every player-facing string of Kuis Nusantara lives here (Indonesian). */

/** 6850 -> "6.850" (Indonesian thousands separator). Deterministic, no Intl dependency. */
export function formatNumber(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 3240 -> "3,2" (seconds, one decimal, Indonesian decimal comma). */
export function formatSeconds(ms: number): string {
  return (Math.round(Math.max(0, ms) / 100) / 10).toFixed(1).replace('.', ',');
}

export const LETTERS = ['A', 'B', 'C', 'D'] as const;

export const STR = {
  logo: 'KUIS NUSANTARA',
  questionChip: (n: number, total: number) => `SOAL ${n} / ${total}`,
  questionOf: (n: number, total: number) => `Soal ${n} dari ${total}`,
  progressLabel: 'Kemajuan soal',

  /* TV */
  timerLabel: (s: number) => `Sisa waktu ${s} detik`,
  nextLabel: (s: number) => `Soal berikutnya dalam ${s} detik`,
  nextCaption: 'BERIKUTNYA',
  finalCaption: 'HASIL AKHIR',
  timeUp: 'WAKTU HABIS',
  howToTitle: 'CARA MAIN',
  howToText: 'Jawab di HP. Makin cepat benar, makin besar poinnya.',
  streakTipText: '3 benar beruntun? Poin soal berikutnya dobel!',
  factTitle: 'TAHUKAH KAMU?',
  startEyebrow: (total: number) => `${total} SOAL · JAWAB DARI HP`,
  startTitle: 'Siap-siap!',
  startText: 'Soal muncul di layar. Pilih jawaban di HP secepat mungkin.',
  introEyebrow: (n: number, total: number) => `SOAL ${n} DARI ${total}`,
  correctBadge: 'Jawaban benar',
  statusThinking: 'BERPIKIR…',
  statusAnswered: 'SUDAH JAWAB',
  statusReady: 'SIAP',
  statusOffline: 'TERPUTUS',
  statusNext: 'IKUT SOAL BERIKUT',
  statusCorrect: (sec: string) => `BENAR · ${sec} DTK`,
  statusCorrectShort: (sec: string) => `${sec} DTK`,
  statusWrong: 'HAMPIR!',
  statusMissed: 'WAKTU HABIS',
  doubleTag: 'DOBEL',
  fastestTag: 'TERCEPAT',
  finalTitle: 'Klasemen Akhir',
  finalSubtitle: (total: number) => `${total} soal selesai. Ini dia juaranya!`,
  finalRow: (correct: number, asked: number) => `${correct}/${asked} benar`,
  waitingTitle: 'Menunggu pemain…',
  waitingText: 'Kuis lanjut otomatis begitu ada pemain yang tersambung lagi.',
  noShell: 'Buka Kuis Nusantara dari aplikasi Kacawbalaw di layar utama.',
  winnerCaption: 'JUARA',

  /* Solo: score attack against your own record (PRD 6.4) */
  finalTitleSolo: 'Skor Akhir',
  startRecord: (best: number) => `Rekor: ${formatNumber(best)}`,
  recordFirst: (v: number) => `Rekor pertama tercatat: ${formatNumber(v)}`,
  recordNew: (best: number, prev: number) =>
    `Rekor baru! ${formatNumber(best)} (sebelumnya ${formatNumber(prev)})`,
  recordTie: (best: number) => `Menyamai rekor: ${formatNumber(best)}`,
  recordShort: (best: number, gap: number) =>
    `Rekor: ${formatNumber(best)}, kurang ${formatNumber(gap)} lagi`,
  phoneSoloDone: 'Kuis selesai!',
  resultTitleSolo: (score: number) => `Skor ${formatNumber(score)}!`,

  /* Phone views */
  phoneStartEyebrow: 'KUIS NUSANTARA',
  phoneStartTitle: 'Bersiap!',
  phoneStartText: (total: number) => `${total} soal. Makin cepat benar, makin besar poinnya.`,
  phoneIntroText: 'Lihat soalnya di layar!',
  lockedTitle: 'Terkunci!',
  seconds: (sec: string) => `${sec} detik`,
  fastestSoFar: 'Tercepat sejauh ini',
  spectatorTitle: 'Kamu ikut soal berikutnya',
  spectatorText: 'Sambil menunggu, coba tebak jawabannya di layar!',
  spectatorRevealTitle: 'Bersiap!',
  spectatorRevealText: 'Giliranmu mulai di soal berikutnya.',
  resultCorrect: 'Benar!',
  resultWrong: 'Belum tepat',
  resultMissed: 'Waktu habis!',
  resultAnswer: (key: string, label: string) => `Jawaban: ${key} · ${label}`,
  chipBase: (n: number) => `Benar +${formatNumber(n)}`,
  chipSpeed: (n: number) => `Kecepatan +${formatNumber(n)}`,
  chipStreak: (n: number) => `Beruntun +${formatNumber(n)}`,
  chipDouble: 'Dobel ×2',
  statRank: 'Peringkat',
  statRankValue: (rank: number, of: number) => `${rank} dari ${of}`,
  statStreak: 'Beruntun',
  statStreakValue: (n: number) => `${n} benar`,
  statCorrect: 'Jawaban benar',
  statCorrectValue: (correct: number, asked: number) => `${correct} dari ${asked}`,
  statBestStreak: 'Beruntun terbaik',
  streakNeed: (left: number) =>
    left === 1 ? '1 benar lagi, poin soal berikutnya dobel!' : `${left} benar lagi untuk poin dobel!`,
  streakHot: 'Beruntun! Poin soal berikutnya dobel!',
  streakBroken: 'Beruntun putus. Ayo mulai lagi!',
  finalWin: 'Juara kuis!',
  finalRank: (rank: number) => `Peringkat ${rank}`,
  finalTotal: 'Total skor',

  /* Game result */
  resultTitleOne: (name: string) => `${name} juara kuis!`,
  resultTitleTwo: (a: string, b: string) => `${a} dan ${b} juara bersama!`,
  resultTitleMany: 'Juara bersama!',
  resultTitleNone: 'Kuis selesai!',
  resultSubtitle: (score: number, correct: number, asked: number) =>
    `Skor ${formatNumber(score)} · ${correct} dari ${asked} benar`,
  rankingLabel: (correct: number, asked: number) => `${correct}/${asked} benar`,

  awardBrain: 'Otak Encer',
  awardBrainDesc: (correct: number, asked: number) => `${correct} dari ${asked} soal dijawab benar`,
  awardZap: 'Jari Kilat',
  awardZapDesc: (sec: string) => `Rata-rata ${sec} detik per jawaban benar`,
  awardFire: 'Beruntun Terpanjang',
  awardFireDesc: (n: number) => `${n} jawaban benar berturut-turut`,
  awardHeart: 'Pantang Menyerah',
  awardHeartDesc: (asked: number) => `Selalu menjawab, ${asked} dari ${asked} soal`,
  awardStar: 'Peserta Hebat',
  awardStarDesc: 'Ikut meramaikan kuis sampai akhir',
} as const;
