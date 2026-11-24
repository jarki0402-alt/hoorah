/**
 * Every player-facing text of Ular Arena (Indonesian). Code and identifiers stay English.
 */

/** Time left as m:ss. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const STR = {
  gameTitle: 'ULAR ARENA',
  loadError: 'Buka Ular Arena dari layar Kacawbalaw.',

  /* Main screen HUD */
  timeLabel: 'SISA WAKTU',
  boardTitle: 'TERPANJANG',
  out: 'Tumbang',
  back: (s: number) => `Kembali ${s}`,
  disconnected: 'Terputus',
  koShort: (n: number) => `${n} KO`,
  introTitle: 'ULAR ARENA',
  introTips: [
    'Arahkan joystick di HP, ular ikut arahnya',
    'Tahan NGEBUT untuk melesat',
    'Kepala kena badan lawan: tumbang!',
  ],
  ready: 'Siap-siap…',
  go: 'MULAI!',
  warning: '10 DETIK LAGI!',
  timeUp: 'WAKTU HABIS!',
  podiumEyebrow: 'HASIL ARENA',
  podiumLength: (n: number) => `Panjang ${n}`,
  podiumOut: 'Tumbang',
  koFloat: 'TUMBANG!',
  koPlus: '+1 KO',
  leadFloat: 'TERPANJANG!',

  /* Kill feed */
  feedKo: (killer: string, victim: string) => `${killer} menumbangkan ${victim}`,
  feedWall: (name: string) => `${name} menabrak pagar`,
  feedHead: (a: string, b: string) => `${a} dan ${b} adu kepala`,
  feedLead: (name: string) => `${name} memimpin!`,
  feedJoin: (name: string) => `${name} masuk arena`,

  /* Phone */
  phoneEyebrow: 'ULAR ARENA',
  lengthTitle: (n: number) => `Panjang ${n}`,
  leadEyebrow: 'KAMU TERPANJANG!',
  safeEyebrow: 'KEBAL SEBENTAR',
  statRank: 'Peringkat',
  statTime: 'Waktu',
  statKo: 'KO',
  rankValue: (rank: number, total: number) => `${rank}/${total}`,
  actionLabel: 'NGEBUT',
  actionSub: 'tahan',
  hintSteer: 'Arahkan joystick, ular ikut arahnya',
  hintShort: 'Makan biji dulu supaya bisa ngebut',
  hintSafe: 'Kebal sebentar, cari tempat aman!',
  knockedTitle: 'Tumbang!',
  knockedBody: (name: string) => `KENA BADAN ${name.toUpperCase()}`,
  knockedWall: 'MENABRAK PAGAR',
  knockedHead: (name: string) => `ADU KEPALA DENGAN ${name.toUpperCase()}`,
  respawnIn: (s: number) => `Hidup lagi dalam ${s}…`,
  joinIn: 'Masuk arena…',
  countdownTitle: 'Ularmu siap!',
  countdownSub: 'Arahkan joystick untuk menyetir',
  watchTitle: 'Lihat layar',
  watchSubtitle: 'Kamu ikut di ronde berikutnya.',
  timeUpTitle: 'Waktu habis!',
  timeUpSubtitle: 'Lihat hasilnya di layar.',

  /* Results */
  resultWinner: (name: string) => `${name} juara!`,
  resultTie: (names: string[]) => `Seri: ${names.join(' & ')}`,
  resultSubtitle: (len: number, kos: number) => `Ular terpanjang: ${len} · ${kos} KO`,
  resultAllOut: 'Semua ular tumbang di detik terakhir!',
  rankLabel: (len: number, kos: number) => `Panjang ${len} · ${kos} KO`,
  rankLabelOut: (kos: number) => `Tumbang di akhir · ${kos} KO`,
  phoneWin: 'Juara arena!',
  phonePlace: (rank: number) => `Peringkat ${rank}`,
  phoneSubtitle: (len: number) => (len > 0 ? `Panjang akhir ${len}` : 'Tumbang saat waktu habis'),
  statBest: 'Terpanjang',
  statEaten: 'Biji',

  awardLongest: 'Naga Taman',
  awardLongestDesc: (n: number) => `Pernah sepanjang ${n}`,
  awardHunter: 'Pemburu',
  awardHunterDesc: (n: number) => `${n} lawan ditumbangkan`,
  awardGlutton: 'Si Rakus',
  awardGluttonDesc: (n: number) => `${n} biji dimakan`,
  awardSpeed: 'Kilat',
  awardSpeedDesc: (s: number) => `Ngebut ${s} detik`,
  awardSurvivor: 'Pantang Tumbang',
  awardSurvivorDesc: (s: number) => `Bertahan ${s} detik tanpa tumbang`,
};
