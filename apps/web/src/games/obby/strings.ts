/**
 * Every player-facing text of Obby (Indonesian, no em dash). Code and identifiers stay English.
 */
import type { SegmentKind } from './course';

/** Seconds as m:ss (rounded up: a countdown). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds - 1e-6));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** A finish time like "37,4 dtk" (Indonesian decimal comma). */
export function formatTime(seconds: number): string {
  return `${seconds.toFixed(1).replace('.', ',')} dtk`;
}

/** A small gap like "0,3 dtk". */
export function formatGap(seconds: number): string {
  return `${Math.max(0.1, seconds).toFixed(1).replace('.', ',')} dtk`;
}

const TRACK_NAMES = ['Pulau Mainan', 'Teluk Balok', 'Puncak Pegas', 'Dermaga Kotak', 'Menara Mainan'];

export const STR = {
  gameTitle: 'OBBY',
  noShell: 'Obby harus dibuka dari aplikasi Hoorah.',
  loadFailed: 'Gagal memuat Obby. Periksa koneksi lalu buka lagi.',

  trackName: (no: number) => TRACK_NAMES[no % TRACK_NAMES.length]!,
  trackOf: (no: number, total: number) => `Lintasan ${no + 1}/${total}`,
  trackBrand: (no: number, total: number) => `${STR.trackName(no)} · lintasan ${no + 1}/${total}`,
  levelName: ['Pemanasan', 'Makin seru', 'Paling seru'] as const,

  segments: {
    islands: 'Pulau loncat',
    vanish: 'Lantai hilang',
    sweeper: 'Palang berputar',
    conveyor: 'Ban berjalan',
    springs: 'Pegas lompat',
    movers: 'Papan geser',
    stairs: 'Tangga tinggi',
    disc: 'Piring putar',
    beam: 'Titian goyang',
  } satisfies Record<SegmentKind, string>,

  /* Intro card */
  introGoal: 'Siapa duluan ke bendera finis?',
  introAhead: 'Rintangan di lintasan ini',
  howStick: 'Joystick kiri',
  howStickSub: 'lari dan belok',
  howJump: 'Tombol LOMPAT',
  howJumpSub: 'lompati celah dan palang',
  howSave: 'Lantai kotak-kotak',
  howSaveSub: 'titik simpan, jatuh kembali ke sini',

  /* Countdown and call-outs */
  ready: 'Siap-siap!',
  go: 'LARI!',
  saveToast: (name: string, i: number, total: number) => `${name} sampai titik simpan ${i}/${total}`,
  saveFirst: (i: number) => `Titik simpan ${i}!`,
  sweepFloat: 'Kena palang!',
  fallFloat: 'Byur!',
  springFloat: 'Wuush!',
  pulledToast: (name: string) => `${name} dipindah ke titik simpan`,
  pulledChip: 'Dipindah ke titik simpan',
  pulledHold: 'diam 1 dtk',
  finishFloat: (place: number) => `Finis ke-${place}!`,
  firstFinish: (name: string) => `${name} finis pertama!`,
  hurry: 'Cepat! Waktu hampir habis',
  timeUp: 'WAKTU HABIS!',
  allIn: 'SEMUA FINIS!',

  /* HUD */
  timeLabel: 'WAKTU',
  posLabel: 'POSISI',
  finished: 'FINIS',
  offline: 'Terputus',
  offIn: (s: number) => `${Math.max(0, s).toFixed(1).replace('.', ',')} dtk`,
  help: 'Joystick kiri untuk lari, LOMPAT di kanan. Keluar layar lebih dari 2 detik: dipindah dekat rombongan.',

  /* Podium between tracks and at the end */
  podiumTitle: (no: number, total: number) =>
    no + 1 < total ? `Lintasan ${no + 1} selesai` : 'Lintasan terakhir selesai',
  podiumNext: (s: number) => `Lintasan berikutnya dalam ${Math.max(0, Math.ceil(s))} dtk`,
  podiumLast: 'Menghitung juara',
  closeCall: (gap: string) => `kalah ${gap}!`,
  notFinished: 'belum finis',
  pointsShort: (n: number) => `+${n}`,
  totalShort: (n: number) => `${n} poin`,

  /* Phone */
  padTitle: (save: number, total: number) =>
    save > 0 ? `Titik simpan ${save}/${total}` : 'Lari ke titik simpan 1',
  statPos: 'Posisi',
  statTime: 'Waktu',
  statPoints: 'Poin',
  statTotal: 'Total',
  statFalls: 'Jatuh',
  statJumps: 'Lompat',
  jump: 'LOMPAT',
  ahead: (name: string, meters: number) => `Di depanmu: ${name}, ${Math.max(1, Math.round(meters))} m`,
  leading: 'Kamu paling depan!',
  pulledTitle: 'Dipindah ke titik simpan',
  pulledBody: 'Kamu tertinggal dari rombongan. Siap lari lagi di dekat mereka.',
  fallTitle: 'Jatuh!',
  fallBody: 'Kembali ke titik simpan terakhirmu.',
  countTitle: 'Siap-siap!',
  countSub: (no: number, total: number) => `${STR.trackName(no)} · lintasan ${no + 1}/${total}`,
  introTitle: (no: number) => STR.trackName(no),
  introSub: 'Lihat layar: lintasan dimulai sebentar lagi',
  finishedTitle: (place: number) => `Finis ke-${place}!`,
  finishedSub: 'Sorak teman yang masih berlari',
  podiumPhone: (place: number) => `Posisi ${place} di lintasan ini`,
  spectatorTitle: 'Lintasan sedang berjalan',
  spectatorSub: 'Kamu ikut di lintasan berikutnya.',

  /* Final result */
  winner: (name: string) => `${name} juara Obby!`,
  winnerSub: (tracks: number) => `Total poin dari ${tracks} lintasan`,
  resultPhoneTitle: (rank: number) => (rank === 1 ? 'Juara Obby!' : `Peringkat ${rank}`),
  resultPhoneSub: (points: number) => `${points} poin dari semua lintasan`,

  awards: {
    champ: { title: 'Raja Rintangan', desc: (n: number) => `Finis pertama di ${n} lintasan` },
    fastest: { title: 'Paling Kilat', desc: (t: string) => `Lintasan tercepat: ${t}` },
    flight: { title: 'Terbang Tertinggi', desc: (m: string) => `Melayang sampai ${m} m` },
    comeback: { title: 'Bangkit Terbanyak', desc: (n: number) => `Bangkit lagi ${n} kali` },
    clean: {
      title: 'Kaki Lengket',
      desc: (n: number) => (n === 0 ? 'Tidak pernah jatuh' : `Cuma jatuh ${n} kali`),
    },
    swept: { title: 'Langganan Palang', desc: (n: number) => `Kena palang ${n} kali` },
    pioneer: { title: 'Pembuka Jalan', desc: (n: number) => `Duluan di ${n} titik simpan` },
    hopper: { title: 'Si Kelinci', desc: (n: number) => `Melompat ${n} kali` },
    spring: { title: 'Raja Pegas', desc: (n: number) => `Terlempar pegas ${n} kali` },
    brave: { title: 'Pantang Menyerah', desc: () => 'Terus berlari sampai akhir' },
  },
};
