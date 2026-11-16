/** Every player-facing Congklak string (Indonesian) lives here. */

export const STR = {
  logo: 'CONGKLAK',
  teamName: ['Tim Merah', 'Tim Biru'] as const,
  unknownPlayer: 'Pemain',
  roundChip: (round: number, rounds: number) => (rounds > 1 ? `BABAK ${round} DARI ${rounds}` : 'SATU BABAK'),
  store: 'LUMBUNG',
  total: (n: number) => `Total ${n}`,
  seeds: (n: number) => `${n} biji`,

  /* Side panels */
  statusPicking: 'sedang memilih lubang',
  statusPickingExtra: 'jalan lagi, pilih lubang',
  statusAuto: 'jalan otomatis',
  statusSowing: 'menyebar biji',
  statusWaiting: 'menunggu giliran',
  statusOffline: 'terputus',
  turnTag: 'GILIRAN',

  /* Board toasts */
  toastExtra: 'JALAN LAGI!',
  toastCapture: (n: number) => `TEMBAK! +${n}`,
  toastTimeout: 'Waktu habis, dipilihkan',
  toastGuard: 'Sebaran berhenti',
  toastSweep: (a: number, b: number) =>
    a + b > 0 ? 'Sisa biji masuk lumbung pemiliknya' : 'Semua biji sudah di lumbung',

  /* Banners */
  introTitle: (round: number, rounds: number) => (rounds > 1 ? `BABAK ${round}` : 'AYO MAIN!'),
  introFirst: (who: string) => `${who} jalan duluan`,
  introHint: 'Sebar biji searah jarum jam, isi lumbung sebanyak mungkin.',
  roundWin: (who: string, round: number) => `${who} menang babak ${round}!`,
  roundTie: (round: number) => `Babak ${round} seri!`,
  roundNext: (round: number) => `Babak ${round} segera dimulai`,
  finalWin: (who: string) => `${who} juara!`,
  finalTie: 'Hasilnya seri!',
  finalScore: (a: number, b: number, rounds: number) =>
    rounds > 1 ? `Total ${rounds} babak: ${a} lawan ${b} biji` : `${a} lawan ${b} biji`,
  finalTotal: (rounds: number) => `Total biji dari ${rounds} babak`,

  reactCheer: 'Sorak!',
  reactBoo: 'Huuu~',
  reactRematch: 'Minta revans!',

  /* Phone views */
  phoneTurnTitle: 'Giliranmu! Pilih lubang',
  phoneExtraTitle: 'Jalan lagi! Pilih lubang',
  phoneTurnPrompt: (team: string | null) =>
    team ? `Kamu main untuk ${team}. Lubang 7 paling dekat lumbungmu.` : 'Lubang 7 paling dekat lumbungmu.',
  phoneHole: (n: number) => `Lubang ${n}`,
  phoneWaitEyebrow: 'SEKARANG GILIRAN',
  phoneTeamEyebrow: 'GILIRAN TEMANMU',
  phoneWaitSub: (side: string) => `Main untuk ${side}`,
  phoneWaitSolo: 'Sedang memilih lubang',
  phoneAutoTitle: 'Jalan otomatis',
  phoneAutoSub: (side: string) => `Tidak ada pemain ${side} yang tersambung`,
  phoneSowingEyebrow: 'MENYEBAR BIJI',
  phoneSowingMine: 'Bijimu sedang disebar',
  phoneSowingSub: 'Lihat ke layar utama',
  phoneStore: (side: string) => `Lumbung ${side}`,
  phoneCheer: 'Sorak!',
  phoneBoo: 'Huuu~',
  phoneIntroEyebrow: (round: number, rounds: number) =>
    rounds > 1 ? `BABAK ${round} DARI ${rounds}` : 'SIAP-SIAP',
  phoneIntroTeam: (team: string) => `Kamu ${team}`,
  phoneIntroSolo: 'Siap-siap!',
  phoneIntroWhere: (top: boolean) =>
    top ? 'Lubangmu baris atas, lumbungmu di kanan layar.' : 'Lubangmu baris bawah, lumbungmu di kiri layar.',
  phoneNoPlayers: 'Menunggu pemain tersambung',
  phoneRoundWin: (round: number) => `Babak ${round} menang!`,
  phoneRoundLose: (round: number) => `Kalah di babak ${round}`,
  phoneRoundTie: (round: number) => `Babak ${round} seri`,
  phoneRoundSub: (opp: number, next: number) => `Lawan ${opp} biji. Babak ${next} segera dimulai.`,
  phoneFinalWin: 'Juara!',
  phoneFinalLose: 'Belum menang',
  phoneFinalTie: 'Seri!',
  phoneFinalSub: (opp: number) => `Lawan mengumpulkan ${opp} biji.`,
  phoneStatCaptures: 'Tembakan',
  phoneStatExtras: 'Jalan lagi',
  phoneStatLongest: 'Sebaran terpanjang',
  phoneRematch: 'Minta revans!',

  /* Results */
  rankLabel: (side: string | null, seeds: number, captures: number, extras: number) => {
    const bits = [side ?? `${seeds} biji`];
    if (captures > 0) bits.push(`${captures}x tembak`);
    if (extras > 0) bits.push(`${extras}x jalan lagi`);
    return bits.join(' · ');
  },
  awardSniper: 'Penembak Jitu',
  awardSniperDesc: (n: number) => `Menembak ${n} biji lawan`,
  awardStreak: 'Jalan Terus',
  awardStreakDesc: (n: number) => `${n}x jalan lagi`,
  awardLong: 'Tangan Panjang',
  awardLongDesc: (n: number) => `Menyebar ${n} biji sekali jalan`,
  awardHelper: 'Pemain Setia',
  awardHelperDesc: (n: number) => `Memilih ${n} lubang`,

  noShell: 'Buka Congklak dari aplikasi Hoorah di layar utama.',
} as const;
