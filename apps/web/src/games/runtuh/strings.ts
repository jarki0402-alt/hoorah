/**
 * Every player-facing text of Lantai Runtuh (Indonesian, no em dash). Code stays English.
 */
import type { ColorId, Sum, SymbolId } from './arena';
import type { Call, Rule } from './logic';

export function formatSeconds(s: number): string {
  return `0:${String(Math.max(0, Math.ceil(s - 1e-6))).padStart(2, '0')}`;
}

export function formatGap(s: number): string {
  return `${Math.max(0.1, s).toFixed(1).replace('.', ',')} dtk`;
}

export const COLOR_NAMES: Record<ColorId, string> = {
  merah: 'MERAH',
  biru: 'BIRU',
  hijau: 'HIJAU',
  kuning: 'KUNING',
};

export const SYMBOL_NAMES: Record<SymbolId, string> = {
  bintang: 'BINTANG',
  bulan: 'BULAN',
  hati: 'HATI',
  segitiga: 'SEGITIGA',
};

export const sumText = (s: Sum) => `${s.a} ${s.op === '+' ? '+' : '−'} ${s.b}`;

export const STR = {
  gameTitle: 'LANTAI RUNTUH',
  noShell: 'Lantai Runtuh harus dibuka dari aplikasi Kacawbalaw.',
  loadFailed: 'Gagal memuat Lantai Runtuh. Periksa koneksi lalu buka lagi.',

  rules: {
    acak: { name: 'Kotak acak', desc: 'Petak berkedip putih lalu jatuh. Lari ke petak yang tenang.' },
    angka: { name: 'Angka', desc: 'Hitung soal di layar, lalu berdiri di petak jawabannya.' },
    warna: { name: 'Warna', desc: 'Berdiri di petak berwarna yang disebut layar.' },
    simbol: { name: 'Simbol', desc: 'Cari simbol yang disebut. Warnanya mengecoh!' },
    diam: { name: 'Jangan diam', desc: 'Petak yang kamu injak terlalu lama retak. Terus bergerak!' },
    gelombang: { name: 'Gelombang', desc: 'Satu sisi panggung tersapu. Lari ke sisi seberang.' },
    gelap: { name: 'Gelap', desc: 'Lampu padam. Petak aman menyala sebentar: ingat dan lari!' },
  } satisfies Record<Rule, { name: string; desc: string }>,

  roundOf: (no: number, total: number) => `Babak ${no + 1}/${total}`,
  roundTitle: (no: number, rule: Rule) => `Babak ${no + 1}: ${STR.rules[rule].name}`,
  double: 'Poin x2',
  alive: (n: number, total: number) => `Bertahan ${n}/${total}`,

  /** Main screen instruction for the current moment. */
  callHead: 'Berdiri di',
  callSum: 'Jawab',
  callDarkShow: 'Ingat petak yang menyala!',
  callDarkCount: 'Lari ke petak tadi!',
  ruleLive: {
    acak: 'Hindari petak berkedip',
    diam: 'Terus bergerak!',
    gelombang: 'Lari dari sisi merah!',
  } as Partial<Record<Rule, string>>,
  callTarget: (c: Call): string =>
    c.color ? COLOR_NAMES[c.color] : c.symbol ? SYMBOL_NAMES[c.symbol] : c.sum ? `${sumText(c.sum)} = ?` : '',

  /* Call-outs */
  go: 'MULAI!',
  drop: 'RUNTUH!',
  pushFloat: 'DORONG!',
  whiff: 'Meleset!',
  fallToast: (name: string, next: number | null) =>
    next === null ? `${name} jatuh` : `${name} jatuh · ikut lagi babak ${next + 1}`,
  pushedOff: (by: string, name: string) => `${by} mendorong ${name}!`,
  nearMiss: (name: string, gap: string) => `Nyaris! Petak ${name} runtuh ${gap} setelah dia pindah`,
  roundDone: 'Babak selesai',
  survivors: (n: number) =>
    n === 0 ? 'Semua jatuh!' : n === 1 ? '1 pemain bertahan' : `${n} pemain bertahan`,
  pointsPlus: (n: number) => `+${n}`,
  finalTitle: 'Papan skor',
  finalSub: 'Total 7 babak menentukan juara',
  totalCol: 'Total',
  roundCol: (i: number) => `B${i + 1}`,
  help: 'Joystick untuk pindah petak. DORONG menggeser pemain di dekatmu, lalu jeda 3 detik.',
  offline: 'Terputus',

  /* Phone */
  push: 'DORONG',
  statScore: 'Skor',
  statRank: 'Peringkat',
  statTime: 'Waktu',
  phoneRule: {
    acak: 'Hindari petak berkedip',
    angka: 'Berdiri di jawaban',
    warna: 'Berdiri di warna',
    simbol: 'Berdiri di simbol',
    diam: 'Terus bergerak!',
    gelombang: 'Lari dari sisi merah',
    gelap: 'Ingat petak yang menyala',
  } satisfies Record<Rule, string>,
  phoneCall: (c: Call): string =>
    c.color
      ? `Berdiri di ${COLOR_NAMES[c.color].toLowerCase()}`
      : c.symbol
        ? `Berdiri di ${SYMBOL_NAMES[c.symbol].toLowerCase()}`
        : c.sum
          ? `Jawab: ${sumText(c.sum)}`
          : 'Lari ke petak tadi!',
  hint: 'Geser untuk pindah petak',
  introTitle: (no: number, rule: Rule) => STR.roundTitle(no, rule),
  fellTitle: 'Kamu jatuh!',
  fellSub: (next: Rule | null, no: number) =>
    next
      ? `Tidak tersingkir lama. Ikut lagi di babak ${no + 2}: ${STR.rules[next].name}.`
      : 'Tunggu hasil akhir.',
  fellStat: 'Poin babak ini',
  waitTitle: 'Babak sedang berjalan',
  waitSub: 'Kamu ikut di babak berikutnya.',
  endTitle: (pts: number) => `+${pts} poin`,
  endSub: (survived: boolean) => (survived ? 'Kamu bertahan sampai akhir babak!' : 'Poinmu tetap tersimpan.'),
  finalPhone: 'Lihat papan skor di layar',
  spectatorTitle: 'Babak sedang berjalan',
  spectatorSub: 'Kamu ikut di babak berikutnya.',

  /* Final result */
  winner: (name: string) => `${name} juara Lantai Runtuh!`,
  winnerSub: 'Total skor dari 7 babak',
  resultPhoneTitle: (rank: number) => (rank === 1 ? 'Juara panggung!' : `Peringkat ${rank}`),
  resultPhoneSub: (survived: number, rounds: number) => `Bertahan di ${survived} dari ${rounds} babak`,
  statSurvived: 'Bertahan',
  statFalls: 'Jatuh',

  awards: {
    king: { title: 'Raja Bertahan', desc: (n: number) => `Bertahan di ${n} babak` },
    pusher: { title: 'Jago Dorong', desc: (n: number) => `Menjatuhkan ${n} pemain` },
    slick: { title: 'Paling Licin', desc: (n: number) => `Lolos tipis ${n} kali` },
    eagle: { title: 'Mata Elang', desc: () => 'Bertahan di babak Gelap' },
    dancer: { title: 'Penari Panggung', desc: (m: number) => `Bergerak ${m} m` },
    busy: { title: 'Tangan Usil', desc: (n: number) => `Mendorong ${n} kali` },
    brave: { title: 'Pantang Menyerah', desc: (n: number) => `Jatuh ${n} kali, tetap bangkit` },
    calm: { title: 'Si Kalem', desc: () => 'Tenang di tengah keributan' },
  },
};
