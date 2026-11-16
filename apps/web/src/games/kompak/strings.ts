/** Every player-facing string of Kompak Gak? lives here (Indonesian). */

/** 1250 -> "1.250" (Indonesian thousands separator). Deterministic, no Intl dependency. */
export function formatNumber(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export const LETTERS = ['A', 'B', 'C', 'D'] as const;

export const STR = {
  logo: 'KOMPAK GAK?',
  questionChip: (n: number, total: number) => `SOAL ${n} / ${total}`,
  questionOf: (n: number, total: number) => `Soal ${n} dari ${total}`,
  progressLabel: 'Kemajuan soal',

  /* Main screen */
  timerLabel: (s: number) => `Sisa waktu ${s} detik`,
  nextLabel: (s: number) => `Soal berikutnya dalam ${s} detik`,
  nextCaption: 'BERIKUTNYA',
  finalCaption: 'HASIL AKHIR',
  timeUp: 'WAKTU HABIS',
  startEyebrow: (total: number) => `${total} SOAL · JAWAB DARI HP`,
  startTitle: 'Kompak Gak?',
  startTextGroup: 'Bukan soal benar atau salah. Pilih jawaban yang menurutmu paling banyak dipilih teman.',
  startTextCoop: 'Berdua? Kalian satu tim. Samakan jawaban untuk dapat poin!',
  howToTitle: 'CARA MAIN',
  howToSteps: (coop: boolean) =>
    coop
      ? [
          { t: 'Baca pertanyaannya', d: 'Muncul di papan, pilihannya juga ada di HP.' },
          { t: 'Tebak isi kepala pasangan', d: 'Pilih jawaban yang menurutmu dia pilih.' },
          { t: 'Sehati = poin', d: 'Jawaban sama, kalian berdua dapat poin.' },
        ]
      : [
          { t: 'Baca pertanyaannya', d: 'Muncul di papan, pilihannya juga ada di HP.' },
          { t: 'Tebak jawaban terbanyak', d: 'Bukan jawaban maumu, tapi pilihan kebanyakan orang.' },
          { t: 'Kompak = poin', d: 'Sendirian beda jawaban? Nol poin. Semua sama? Bonus!' },
        ],
  introEyebrow: (n: number, total: number) => `SOAL ${n} DARI ${total}`,
  answeredTitle: 'SUDAH MENJAWAB',
  answeredCount: (done: number, of: number) => `${done} dari ${of}`,
  answeredNone: 'Belum ada yang menjawab…',
  hintGroup: 'Tebak jawaban kebanyakan orang!',
  hintCoop: 'Tebak jawaban pasanganmu!',
  stampKompak: 'KOMPAK!',
  stampAll: 'SEMUA KOMPAK!',
  stampSehati: 'SEHATI!',
  verdictNone: 'Gak ada yang kompak!',
  verdictNoneText: 'Semua beda pilihan. Ronde ini tanpa poin.',
  verdictApart: 'Belum sehati…',
  verdictApartText: 'Pilihan kalian beda. Coba lagi di soal berikutnya!',
  verdictLateText: 'Satu jawaban tidak masuk tepat waktu.',
  verdictMissed: 'Waktu habis!',
  verdictMissedText: 'Belum ada jawaban yang masuk.',
  verdictKompakText: (n: number) => `${n} orang sepikiran. Mereka dapat poin!`,
  verdictTieText: 'Suara terbanyak seri, semua yang ikut dapat poin!',
  verdictAllText: 'Semua memilih jawaban yang sama. Bonus untuk semua!',
  verdictSehatiText: 'Jawaban kalian sama persis!',
  pickCount: (n: number) => `${n} orang`,
  statusThinking: 'MIKIR…',
  statusAnswered: 'SUDAH',
  statusReady: 'SIAP',
  statusOffline: 'TERPUTUS',
  statusNext: 'IKUT SOAL BERIKUT',
  statusKompak: 'KOMPAK',
  statusAlone: 'SENDIRIAN',
  statusMinority: 'KALAH SUARA',
  statusMissed: 'TELAT',
  statusSehati: 'SEHATI',
  statusApart: 'BEDA',
  meterLabel: 'PERSEN KOMPAK',
  meterValue: (pct: number) => `${pct}%`,
  meterSub: (hits: number, rounds: number) => `${hits} dari ${rounds} soal sama`,
  finalTitle: 'Klasemen Akhir',
  finalSubtitle: (total: number) => `${total} soal selesai. Siapa yang paling nyambung?`,
  finalCoopTitle: (title: string) => title,
  finalCoopSubtitle: (hits: number, rounds: number) => `Kalian kompak di ${hits} dari ${rounds} soal`,
  finalRow: (kompak: number, played: number) => `${kompak}/${played} kompak`,
  waitingTitle: 'Menunggu pemain…',
  waitingText: 'Permainan lanjut otomatis begitu ada pemain yang tersambung lagi.',
  noShell: 'Buka Kompak Gak? dari aplikasi Hoorah di layar utama.',
  winnerCaption: 'JUARA',

  /* Coop titles by percentage (2 players). */
  coopTitles: [
    { from: 100, title: 'Kembar Batin', text: 'Isi kepala kalian sama persis. Luar biasa!' },
    { from: 75, title: 'Sehati Banget', text: 'Kalian benar-benar satu frekuensi.' },
    { from: 50, title: 'Lumayan Nyambung', text: 'Sering sepikiran, tinggal sedikit lagi.' },
    { from: 25, title: 'Masih Pemanasan', text: 'Kadang nyambung, kadang beda jalan.' },
    { from: 0, title: 'Beda Frekuensi', text: 'Pikiran kalian unik semua. Main lagi yuk!' },
  ],

  /* Phone views */
  phoneStartEyebrow: 'KOMPAK GAK?',
  phoneStartTitle: 'Bersiap!',
  phoneStartGroup: (total: number) => `${total} soal. Pilih jawaban yang paling banyak dipilih teman.`,
  phoneStartCoop: (total: number) => `${total} soal. Pilih jawaban yang sama dengan pasanganmu.`,
  phoneIntroText: 'Lihat pertanyaannya di layar!',
  lockedTitle: 'Terkunci!',
  lockedChipGroup: 'Semoga kompak!',
  lockedChipCoop: 'Semoga sehati!',
  spectatorTitle: 'Kamu ikut soal berikutnya',
  spectatorText: 'Sambil menunggu, tebak jawaban terbanyak di layar!',
  spectatorRevealTitle: 'Bersiap!',
  spectatorRevealText: 'Giliranmu mulai di soal berikutnya.',
  resultKompak: 'Kompak!',
  resultAll: 'Semua kompak!',
  resultSehati: 'Sehati!',
  resultAlone: 'Beda sendiri!',
  resultMinority: 'Kalah suara',
  resultApart: 'Belum sehati',
  resultMissed: 'Waktu habis!',
  resultSolo: 'Belum ada lawan',
  resultSoloText: 'Butuh minimal 2 pemain untuk adu kompak.',
  resultYourPick: (label: string, n: number) =>
    n <= 1 ? `Cuma kamu yang pilih "${label}"` : `Kamu dan ${n - 1} orang pilih "${label}"`,
  resultPartnerPick: (label: string) => `Pasanganmu pilih "${label}"`,
  resultBothPick: (label: string) => `Kalian berdua pilih "${label}"`,
  resultTopPick: (label: string) => `Terbanyak: "${label}"`,
  resultNoTop: 'Semua pilihan beda-beda',
  chipKompak: (n: number) => `Kompak +${formatNumber(n)}`,
  chipAll: (n: number) => `Bonus semua +${formatNumber(n)}`,
  chipSehati: (n: number) => `Sehati +${formatNumber(n)}`,
  statRank: 'Peringkat',
  statRankValue: (rank: number, of: number) => `${rank} dari ${of}`,
  statKompak: 'Kompak',
  statKompakValue: (hits: number, played: number) => `${hits} dari ${played}`,
  statMeter: 'Persen kompak',
  finalWin: 'Paling kompak!',
  finalRank: (rank: number) => `Peringkat ${rank}`,
  finalTotal: 'Total skor',

  /* Game result */
  resultTitleOne: (name: string) => `${name} paling kompak!`,
  resultTitleTwo: (a: string, b: string) => `${a} dan ${b} paling kompak!`,
  resultTitleMany: 'Juara bersama!',
  resultTitleNone: 'Permainan selesai!',
  resultTitleCoop: (title: string) => `Kalian ${title}!`,
  resultSubtitle: (score: number, hits: number, played: number) =>
    `Skor ${formatNumber(score)} · kompak ${hits} dari ${played} soal`,
  resultSubtitleCoop: (pct: number, hits: number, rounds: number) =>
    `Persen kompak ${pct}% · sama di ${hits} dari ${rounds} soal`,
  rankingLabel: (hits: number, played: number) => `${hits}/${played} kompak`,
  rankingLabelCoop: (pct: number) => `${pct}% kompak`,

  awardKompak: 'Paling Nyambung',
  awardKompakDesc: (hits: number, played: number) => `Ikut suara terbanyak di ${hits} dari ${played} soal`,
  awardUnik: 'Anti Arus',
  awardUnikDesc: (n: number) => `Beda sendiri di ${n} soal`,
  awardZap: 'Jari Kilat',
  awardZapDesc: (sec: string) => `Rata-rata menjawab dalam ${sec} detik`,
  awardHeart: 'Pasangan Sehati',
  awardHeartDesc: (pct: number) => `Persen kompak ${pct}%`,
  awardStar: 'Teman Nongkrong',
  awardStarDesc: 'Ikut meramaikan sampai soal terakhir',
} as const;

/** 3240 -> "3,2" (seconds, one decimal, Indonesian decimal comma). */
export function formatSeconds(ms: number): string {
  return (Math.round(Math.max(0, ms) / 100) / 10).toFixed(1).replace('.', ',');
}
