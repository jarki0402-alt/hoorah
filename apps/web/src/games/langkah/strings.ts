/**
 * Every player-facing text of Langkah Maut (Indonesian, no em dash). Code stays English.
 */
import type { Choice, Dir, FallWhy, Stage } from './logic';

export const ARROW: Record<Dir, string> = { up: '↑', right: '→', down: '↓', left: '←' };

export const DIR_WORD: Record<Dir, string> = { up: 'ATAS', right: 'KANAN', down: 'BAWAH', left: 'KIRI' };

/** What a cue means in each babak, shown under the big arrow. */
export function cueWord(stage: Stage, d: Dir): string {
  switch (stage) {
    case 'laser':
      return d === 'up' ? 'LOMPAT' : 'MERUNDUK';
    case 'titian':
    case 'lift':
      return `SANDAR ${DIR_WORD[d]}`;
    case 'batu':
      return d === 'up' ? 'LOMPAT MAJU' : `LOMPAT ${DIR_WORD[d]}`;
    case 'tangga':
      return d === 'up' ? 'NAIK' : `BELOK ${DIR_WORD[d]}`;
    default:
      return DIR_WORD[d];
  }
}

export function formatSpeed(x: number): string {
  return `x${x.toFixed(1).replace('.', ',')}`;
}

export const STAGE_INFO: Record<Stage, { name: string; desc: string; short: string }> = {
  eskalator: {
    name: 'Eskalator',
    desc: 'Tangga berjalan turun makin cepat. Ikuti panah supaya tidak terseret ke jurang.',
    short: 'Makin cepat',
  },
  titian: {
    name: 'Titian Tali',
    desc: 'Tali bergoyang di atas jurang. Sandar kiri atau kanan untuk menjaga keseimbangan.',
    short: 'Kiri atau kanan',
  },
  tangga: {
    name: 'Tangga Gedung',
    desc: 'Naik tangga darurat setinggi gedung. Di bordes, belok kiri atau kanan.',
    short: 'Naik dan belok',
  },
  laser: {
    name: 'Lorong Laser',
    desc: 'Laser rendah: lompat. Laser tinggi: merunduk. Tekan saat laser dekat, jangan terlalu cepat!',
    short: 'Lompat atau merunduk',
  },
  batu: {
    name: 'Batu Sungai',
    desc: 'Lompat ke batu yang aman sebelum batu tempatmu tenggelam.',
    short: 'Kiri, maju, kanan',
  },
  gua: {
    name: 'Gua Runtuh',
    desc: 'Gua gelap, panah hanya berkedip sebentar. Ingat cepat, langkah cepat.',
    short: 'Panah berkedip',
  },
  ingat: {
    name: 'Ingat Jalan',
    desc: 'Jalur menyala sebentar lalu gelap. Ulangi urutan arahnya dari ingatan.',
    short: 'Hafalkan urutan',
  },
  lift: {
    name: 'Lift Rusak',
    desc: 'Kabel putus satu per satu. Sandar ke sisi yang benar saat lift menyentak.',
    short: 'Sandar saat menyentak',
  },
};

export const STR = {
  gameTitle: 'LANGKAH MAUT',
  noShell: 'Langkah Maut harus dibuka dari aplikasi Hoorah.',
  loadFailed: 'Gagal memuat Langkah Maut. Periksa koneksi lalu buka lagi.',

  /* Setup (Host picks) */
  setupTitle: 'Pilih babak',
  setupHint: 'Acak memilih babak berbeda, makin lama makin tegang.',
  setupStart: 'Mulai',
  setupWaiting: (host: string) => `${host} sedang memilih babak`,
  setupScreen: 'PILIHAN HOST SEBELUM MULAI',
  setupScreenSub: 'Acak memilih babak berbeda dari 8, makin lama makin tegang',
  acak: 'Acak',
  acakSub: (n: number) => `${n} babak berbeda`,
  chosenSub: 'Babak ini 3 kali, makin cepat',

  /* Main screen */
  babakOf: (i: number, n: number) => `BABAK ${i + 1}/${n}`,
  babakTitle: (i: number, stage: Stage) => `BABAK ${i + 1} · ${STAGE_INFO[stage].name.toUpperCase()}`,
  babakCard: (i: number, n: number) => `Babak ${i + 1} dari ${n}`,
  double: 'POIN GANDA',
  step: 'LANGKAH',
  alive: 'BERTAHAN',
  speed: 'KECEPATAN',
  now: 'SEKARANG',
  next: 'BERIKUTNYA',
  record: (name: string, steps: number) => `REKOR SESI: ${name.toUpperCase()}, ${steps} LANGKAH`,
  remember: (s: number) => `INGAT! ${s} DETIK`,
  recall: 'ULANGI DARI INGATAN',
  pas: 'PAS!',
  ok: 'OKE',
  fell: (name: string) => `${name.toUpperCase()} JATUH`,
  fellToast: (name: string, step: number) => `${name} jatuh di langkah ${step}`,
  speedUp: 'MAKIN CEPAT!',
  timeLeft: (s: number) => `${s}`,
  go: 'MULAI!',
  allDown: 'Semua jatuh!',
  babakDone: 'Babak selesai',
  survivors: (n: number) => (n > 0 ? `${n} pemain bertahan sampai akhir` : 'Tidak ada yang bertahan'),
  pointsPlus: (n: number) => `+${n}`,
  scoreTitle: 'Poin',
  finalTitle: 'Langkah Terjauh',
  finalSub: 'Total poin semua babak',
  babakCol: (i: number) => `B${i + 1}`,
  totalCol: 'Total',
  stepsCol: 'Rekor',
  help: 'Tekan panah yang sama di HP tepat waktu. Salah arah atau terlambat = jatuh!',

  /* Phone */
  phoneEyebrow: (i: number, stage: Stage) => `Babak ${i + 1} · ${STAGE_INFO[stage].name}`,
  phoneEyebrowFinal: (i: number, stage: Stage) => `Babak ${i + 1} · ${STAGE_INFO[stage].name} · Poin ganda`,
  phoneTitle: (step: number) => `Langkah ${step}`,
  statStreak: 'Beruntun',
  statNext: 'Berikutnya',
  statNow: 'Sekarang',
  statPoints: 'Poin',
  phoneHint: 'Waktu tekan diukur di HP, adil walau sinyal lambat',
  phoneMemo: 'Hafalkan urutan di layar!',
  phoneRecall: 'Ulangi urutannya!',
  phoneWait: 'Lihat layar, panah segera muncul',
  introTitle: (i: number, stage: Stage) => `Babak ${i + 1}: ${STAGE_INFO[stage].name}`,
  fellTitle: (step: number) => `Kamu jatuh di langkah ${step}`,
  fellWhy: {
    wrong: 'Salah arah.',
    late: 'Terlambat.',
    early: 'Terlalu cepat, laser belum dekat.',
  } satisfies Record<FallWhy, string>,
  nearRecord: (short: number, best: number) => `Kurang ${short} langkah dari rekormu (${best})`,
  newRecord: (steps: number) => `Rekor baru: ${steps} langkah!`,
  watch: 'Tonton sisanya di layar utama.',
  nextBabak: (no: number, stage: Stage) => `Babak ${no + 1}, ${STAGE_INFO[stage].name}: kamu ikut lagi`,
  lastBabak: 'Tunggu hasil akhir.',
  statSteps: 'langkah',
  statBestStreak: 'beruntun terbaik',
  statRank: 'peringkat',
  waitTitle: 'Babak sedang berjalan',
  waitSub: 'Kamu ikut di babak berikutnya.',
  endTitle: (pts: number) => `+${pts} poin`,
  endSafe: 'Kamu bertahan sampai akhir babak!',
  endSub: 'Poinmu tersimpan.',
  resultPhoneTitle: (rank: number) => (rank === 1 ? 'Kaki paling kuat!' : `Peringkat ${rank}`),
  resultPhoneSub: (best: number) => `Rekor terjauhmu ${best} langkah`,
  statBest: 'Rekor',
  statFalls: 'Jatuh',
  spectatorTitle: 'Babak sedang berjalan',
  spectatorSub: 'Kamu ikut di babak berikutnya.',

  /* Final result */
  winner: (name: string) => `${name} juara Langkah Maut!`,
  winnerSub: (n: number) => `Total poin dari ${n} babak`,

  awards: {
    steel: { title: 'Kaki Baja', desc: (n: number) => `Rekor ${n} langkah` },
    survivor: { title: 'Tak Tergoyahkan', desc: (n: number) => `Bertahan sampai akhir ${n} babak` },
    rhythm: { title: 'Ritme Sempurna', desc: (n: number) => `${n} PAS beruntun` },
    nekat: { title: 'Paling Nekat', desc: (n: number) => `${n} langkah di kecepatan tinggi` },
    pas: { title: 'Si Tepat Waktu', desc: (n: number) => `${n} langkah PAS` },
    oops: { title: 'Jatuh Terindah', desc: (n: number) => `Salah arah ${n} kali` },
    brave: { title: 'Pantang Menyerah', desc: (n: number) => `Jatuh ${n} kali, tetap bangkit` },
    calm: { title: 'Penonton Paling Heboh', desc: () => 'Selalu ikut deg-degan' },
  },
};

export function choiceName(c: Choice): string {
  return c === 'acak' ? STR.acak : STAGE_INFO[c].name;
}
