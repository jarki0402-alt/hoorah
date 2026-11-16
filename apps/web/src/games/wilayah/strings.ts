/** Every player-facing text of Rebut Wilayah (Bahasa Indonesia). */

/** "18,4" style percent: one decimal with a comma, ",0" dropped. */
export function formatPct(value: number, digits = 1): string {
  const f = 10 ** digits;
  const v = Math.round(Math.max(0, value) * f) / f;
  return (Number.isInteger(v) ? String(v) : v.toFixed(digits)).replace('.', ',');
}

/** m:ss for the round clock, rounding up so "0:01" shows until the very end. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const STR = {
  gameTitle: 'Rebut Wilayah',
  loadError: 'Game tidak bisa dimuat. Coba lagi.',

  /* main screen */
  clockLabel: 'Sisa waktu',
  boardTitle: 'Wilayah',
  countdownLabel: 'Cari buahmu!',
  go: 'Mulai!',
  warning: '10 detik lagi!',
  timeUp: 'Waktu habis!',
  hintStart: 'Keluar dari wilayahmu, buat lingkaran, lalu pulang untuk merebut lahan',
  respawnShort: (s: number) => `Bangkit ${s}`,
  outFloat: 'Tumbang!',
  gainFloat: (pct: string) => `+${pct}%`,
  feedCut: (by: string, victim: string) => `${by} memotong jejak ${victim}`,
  feedSelf: (name: string) => `${name} menabrak jejaknya sendiri`,
  feedCrash: (name: string) => `${name} tumbang bertabrakan`,
  feedWiped: (by: string, victim: string) => `${by} merebut semua lahan ${victim}`,
  feedBig: (name: string, pct: string) => `${name} merebut ${pct}% sekaligus`,
  winnerSub: (pct: string) => `${pct}% lantai dikuasai`,

  /* phone */
  padTitle: (pct: string) => `Wilayah ${pct}%`,
  eyebrowHome: 'Aman',
  eyebrowOut: 'Di luar!',
  eyebrowShield: 'Terlindungi',
  eyebrowDown: 'Tumbang',
  statRank: 'Peringkat',
  statTime: 'Waktu',
  rankOf: (rank: number, total: number) => `${rank}/${total}`,
  padHint: 'Geser joystick ke mana pun, buahmu berbelok mengikutinya. Lepas untuk lurus.',
  respawnIn: (s: number) => `Hidup lagi dalam ${s}…`,
  countdownTitle: 'Siap-siap!',
  countdownSub: (color: string) => `Wilayahmu berwarna ${color}`,
  countdownSubPlain: 'Cari buahmu di layar',
  spectatorTitle: 'Lantai penuh',
  spectatorSubtitle: 'Delapan pemain sudah bermain. Tonton dulu di layar, ikut di ronde berikutnya.',
  resultWin: 'Kamu juara!',
  resultPlace: (rank: number) => `Peringkat ${rank}`,
  resultTie: 'Juara bersama!',
  resultStatKills: 'Tumbangkan',
  resultStatBest: 'Rebutan terbesar',
  resultStatPeak: 'Puncak',

  /* results */
  finaleWinner: (name: string) => `${name} menguasai lantai!`,
  finaleTie: (names: readonly string[]) =>
    names.length === 2 ? `${names[0]} dan ${names[1]} sama luas!` : 'Juara bersama!',
  finaleNobody: 'Lantai masih kosong',
  resultSubtitle: (pct: string, minutes: number) => `Wilayah terluas ${pct}% dalam ${minutes} menit`,
  rankLabel: (pct: string) => `${pct}%`,
  awardSweep: 'Sapu Bersih',
  awardSweepDesc: (pct: string) => `Sekali pulang merebut ${pct}% lantai`,
  awardHunter: 'Pemburu Jejak',
  awardHunterDesc: (n: number) => `Menumbangkan ${n} lawan`,
  awardRoamer: 'Penjelajah',
  awardRoamerDesc: (n: number) => `Pulang membawa jejak ${n} langkah`,
  awardPeak: 'Puncak Kejayaan',
  awardPeakDesc: (pct: string) => `Pernah menguasai ${pct}% lantai`,
  awardUntouched: 'Tak Tersentuh',
  awardUntouchedDesc: 'Tidak pernah tumbang',
  awardTough: 'Pantang Menyerah',
  awardToughDesc: (n: number) => `Bangkit lagi ${n} kali`,
} as const;
