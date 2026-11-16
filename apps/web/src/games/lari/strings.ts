/**
 * Every player-facing text of Lari Terus (Indonesian). Code and identifiers stay English.
 */
import type { Mode } from './logic';

/** Indonesian thousands separator: 1240 -> "1.240". */
export function formatInt(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Seconds as m:ss. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds - 1e-6));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Elapsed seconds as m:ss, rounded down (a survival time). */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const STR = {
  gameTitle: 'LARI TERUS',
  noShell: 'Lari Terus harus dibuka dari aplikasi Hoorah.',
  loadFailed: 'Gagal memuat Lari Terus. Periksa koneksi lalu buka lagi.',

  modes: {
    sprint: { name: 'Sprint', sub: '90 detik, kumpulkan jarak dan koin' },
    survive: { name: 'Bertahan', sub: 'Jangan tertinggal, pelari terakhir juara' },
  } satisfies Record<Mode, { name: string; sub: string }>,

  /* Intro card on the main screen */
  introEyebrow: (mode: Mode) => `MODE ${STR.modes[mode].name.toUpperCase()}`,
  introGoal: (mode: Mode) =>
    mode === 'sprint'
      ? 'Lari 90 detik. Jarak plus koin jadi skormu. Tersandung memotong jarak.'
      : 'Lari terus tanpa tertinggal. Yang keluar dari bawah layar gugur.',
  howLane: 'Usap kiri atau kanan',
  howLaneSub: 'pindah jalur',
  howJump: 'Usap ke atas',
  howJumpSub: 'lompati palang rendah dan celah',
  howSlide: 'Usap ke bawah',
  howSlideSub: 'merunduk di bawah jemuran',

  /* Countdown and call-outs */
  ready: 'Siap-siap!',
  go: 'LARI!',
  faster: 'Makin cepat!',
  lastSeconds: '10 detik lagi!',
  outToast: (name: string) => `${name} tertinggal`,
  stumbleFloat: 'Gubrak!',
  coinFloat: '+1',
  finishTitle: 'SELESAI!',
  winner: (name: string) => `${name} juara!`,
  survivorWins: (name: string) => `${name} bertahan paling lama!`,

  /* HUD */
  timeLeft: 'SISA WAKTU',
  timeRun: 'WAKTU LARI',
  aliveLabel: 'MASIH LARI',
  aliveOf: (alive: number, total: number) => `${alive}/${total}`,
  speedLabel: 'KECEPATAN',
  speedUnit: 'km/j',
  distance: (m: number) => `${formatInt(m)} m`,
  points: (n: number) => `${formatInt(n)} poin`,
  outTag: 'GUGUR',
  offline: 'Terputus',
  swipeHelp: 'Usap HP: kiri atau kanan pindah jalur, atas lompat, bawah merunduk',

  /* Phone */
  phoneTitle: (m: number) => `Jarak ${formatInt(m)} m`,
  phoneEyebrowSprint: (clock: string) => `SPRINT · ${clock}`,
  phoneEyebrowSurvive: (alive: number) => `BERTAHAN · ${alive} MASIH LARI`,
  statCoins: 'Koin',
  statDistance: 'Jarak',
  statRank: 'Peringkat',
  statScore: 'Poin',
  rankOf: (rank: number, total: number) => `${rank}/${total}`,
  actionJump: 'LOMPAT',
  phoneHint: '↑ lompat · ↓ merunduk · ← → pindah jalur',
  phoneIntro: 'Lihat layar utama, sebentar lagi mulai',
  phoneOut: 'Kamu tertinggal! Tonton sampai selesai',
  phoneCountTitle: 'Siap-siap lari!',
  phoneCountSub: 'Usap untuk menghindar',
  phoneDoneTitle: 'Selesai!',
  phoneDoneSub: (place: number, total: number) => `Kamu peringkat ${place} dari ${total}`,
  phoneWaitTitle: 'Larinya sudah mulai',
  phoneWaitSub: 'Tunggu ronde berikutnya, ya',

  /* Results */
  resultSub: (mode: Mode, seconds: number) =>
    mode === 'sprint' ? 'Sprint 90 detik' : `Bertahan · ${formatElapsed(seconds)}`,
  labelSprint: (dist: number, coins: number) => `${formatInt(dist)} m · ${coins} koin`,
  labelSurvive: (seconds: number, dist: number) => `${formatElapsed(seconds)} · ${formatInt(dist)} m`,
  labelSurvivor: (dist: number) => `Tetap lari · ${formatInt(dist)} m`,
  awardFar: 'Pelari Terjauh',
  awardFarDesc: (m: number) => `${formatInt(m)} m ditempuh`,
  awardCoins: 'Pemburu Koin',
  awardCoinsDesc: (n: number) => `${n} koin dikumpulkan`,
  awardClean: 'Kaki Lincah',
  awardCleanDesc: (n: number) => (n === 0 ? 'Tidak tersandung sekali pun' : `Cuma ${n} kali tersandung`),

  /* Rooftop signs (scenery) */
  signs: ['KOPI', 'BAKSO', 'SERVIS AC', 'LAUNDRY', 'PULSA', 'ES TEH', 'KOS', 'FOTOKOPI'],
} as const;
