/** Every player-facing Makan Kerupuk string (Indonesian) lives here. */

const secs = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
/** 1650 -> "1.650" (Indonesian thousands separator). */
export const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const STR = {
  logo: 'MAKAN KERUPUK',
  roundChip: (round: number, rounds: number) => (rounds > 1 ? `RONDE ${round}/${rounds}` : 'RONDE KILAT'),
  unknownPlayer: 'Pemain',
  offline: 'Terputus',
  announcer: 'Pak RT',
  timerAria: (s: number) => `Sisa waktu ${s} detik`,
  biteAria: (bites: number, total: number) => `${bites} dari ${total} gigitan`,
  points: (p: number) => `${p} poin`,

  /* Overlays */
  introTitle: (round: number, rounds: number) => (rounds > 1 ? `RONDE ${round}` : 'AYO MAKAN!'),
  introSub: (round: number, rounds: number, solo = false) =>
    rounds > 1
      ? round === rounds
        ? `Ronde terakhir dari ${rounds}`
        : `dari ${rounds} ronde`
      : solo
        ? 'Habiskan kerupuk secepat mungkin!'
        : 'Siapa paling cepat menghabiskan kerupuk?',
  introHint: 'Tangan di belakang! Gigit saat kerupuk tepat di depan mulut.',
  countGo: 'GIGIT!',
  waitingTitle: 'Menunggu pemain',
  waitingHint: 'Scan QR di layar utama untuk ikut lomba.',
  roundWinTitle: (name: string) => `${name} menghabiskan kerupuk!`,
  roundTimeTitle: 'Waktu habis!',
  roundTimeSub: (name: string | null) =>
    name ? `${name} makan paling banyak.` : 'Belum ada yang menggigit.',
  roundWinSub: (ms: number) => `Ludes dalam ${secs(ms)} detik.`,
  roundNext: (round: number, rounds: number) => `Ronde ${round} dari ${rounds} segera dimulai.`,
  placeBites: (bites: number, total: number) => `${bites}/${total}`,
  placePoints: (p: number) => (p > 0 ? `+${num(p)}` : '0'),
  finaleWinner: (name: string) => `${name} juara makan kerupuk!`,
  finaleTie: (names: string[]) => (names.length === 2 ? `${names[0]} & ${names[1]} seri!` : 'Hasilnya seri!'),
  finaleSub: 'Juara lomba 17-an kampung kita!',

  /* Floating words over the lanes */
  popBite: 'KRES!',
  popPerfect: 'PAS!',
  popChoke: 'UHUK!',
  popFinish: 'HABIS!',

  /* Commentary (bold part + rest) */
  cGo: ['Kerupuk sudah bergoyang.', ' Ayo gigit!'] as const,
  cFirst: (name: string) => [name, ' gigitan pertama!'] as const,
  cPerfect: (name: string) => [name, ' menggigit pas di tengah!'] as const,
  cChoke: (name: string) => [name, ' tersedak! Minum dulu, minum!'] as const,
  cLast: (name: string) => [name, ' tinggal satu gigitan lagi!'] as const,
  cHalf: (name: string) => [name, ' sudah makan separuh kerupuk.'] as const,
  cWarn: ['Sepuluh detik lagi!', ' Habiskan kerupuknya!'] as const,
  cFinish: (name: string) => [name, ' menghabiskan kerupuk duluan!'] as const,
  cFinishSolo: (name: string) => [name, ' menghabiskan kerupuknya!'] as const,
  cTime: ['Priiit!', ' Waktu habis.'] as const,
  cRematch: (name: string) => [name, ' minta revans!'] as const,
  cAgain: (name: string) => [name, ' mau main lagi!'] as const,
  cFillers: [
    ['Tangan tetap di belakang ya!', ''],
    ['Jangan pakai tangan,', ' itu curang!'],
    ['Kerupuknya renyah sekali,', ' Bapak Ibu!'],
    ['Penonton makin ramai!', ' Ayo semangat!'],
    ['Pelan-pelan,', ' jangan sampai tersedak.'],
    ['Merdeka!', ' Ayo terus gigit!'],
  ] as const,

  reactCheer: 'Sorak!',
  reactRematch: 'Minta revans!',

  /* Phone views */
  phoneEyebrow: (round: number, rounds: number) =>
    rounds > 1 ? `RONDE ${round} DARI ${rounds}` : 'RONDE KILAT',
  phoneBiteTitle: (bites: number, total: number, last: 'perfect' | 'bite' | null) =>
    bites === 0
      ? `Kerupuk utuh, ${total} gigitan lagi`
      : last === 'perfect'
        ? `PAS! Tinggal ${total - bites} gigitan`
        : `Kres! Tinggal ${total - bites} gigitan`,
  phoneBiteLabel: 'GIGIT',
  phoneBiteHint: 'Ketuk saat kerupuk di tengah, tepat di depan mulut.',
  phoneIntroTitle: 'Siap-siap!',
  phoneIntroSub: 'Tangan di belakang. Gigit saat kerupuk tepat di depan mulut.',
  phoneChokeTitle: 'Tersedak!',
  phoneChokeBig: 'Uhuk!',
  phoneChokeSub: 'Meleset. Minum dulu, sebentar lagi bisa gigit.',
  phoneProgressChip: (bites: number, total: number) => `Gigitan ${bites}/${total}`,
  phoneWatchTitle: 'Ikut ronde berikutnya',
  phoneWatchSub: 'Lomba sedang berjalan. Tonton di layar utama dulu ya.',
  phoneNoPlayers: 'Menunggu pemain tersambung',
  phoneRoundWin: 'Habis duluan!',
  phoneRoundRank: (rank: number) => `Peringkat ${rank}`,
  phoneRoundWinSub: (ms: number) => `Kerupukmu ludes dalam ${secs(ms)} detik.`,
  phoneRoundLoseSub: (name: string) => `${name} menghabiskan kerupuk duluan.`,
  phoneRoundTimeSub: 'Waktu habis! Yang makan paling banyak menang.',
  phoneBitesStat: 'Gigitan',
  phoneScoreStat: 'Total poin',
  phonePerfectStat: 'Gigitan PAS',
  phoneChokeStat: 'Tersedak',
  phoneFinalWin: 'Juara!',
  phoneFinalRank: (rank: number) => `Peringkat ${rank}`,
  phoneFinalScore: (score: number) => `${score} poin`,
  phoneRematch: 'Minta revans!',
  phoneAgain: 'Main lagi!',
  phoneRoundSoloWin: 'Habis!',
  phoneRoundSoloTime: 'Waktu habis!',
  phoneRoundSoloTimeSub: (bites: number, total: number) => `Sempat ${bites} dari ${total} gigitan.`,
  phoneSoloScoreStat: 'Skor',
  phoneSoloDone: 'Selesai!',

  /* Results */
  resultSubtitle: (rounds: number, bites: number) =>
    rounds > 1 ? `${rounds} ronde, ${bites} gigitan kerupuk` : `${bites} gigitan kerupuk`,
  rankLabel: (bites: number, wins: number) =>
    wins > 0 ? `${bites} gigitan · ${wins}x juara` : bites > 0 ? `${bites} gigitan` : 'Belum menggigit',
  awardFast: 'Gigi Kilat',
  awardFastDesc: (ms: number) => `Habis dalam ${secs(ms)} detik`,
  awardJaw: 'Rahang Baja',
  awardJawDesc: (n: number) => `${n} gigitan kerupuk`,
  awardSharp: 'Gigitan Jitu',
  awardSharpDesc: (n: number) => `${n} gigitan PAS`,
  awardCough: 'Raja Batuk',
  awardCoughDesc: (n: number) => `Tersedak ${n} kali`,

  /* Solo: score attack against your own record (PRD 6.4) */
  roundTimeSoloSub: (name: string, bites: number) =>
    bites > 0 ? `${name} sempat menggigit ${bites} kali.` : 'Belum sempat menggigit.',
  soloRoundDetail: (bites: number, total: number, perfect: number) =>
    perfect > 0 ? `${bites}/${total} · ${perfect} PAS` : `${bites}/${total}`,
  soloGain: (n: number) => `+${num(n)}`,
  soloScore: (n: number) => num(n),
  soloLabel: (n: number) => `${num(n)} poin`,
  soloDetail: (bites: number, perfect: number) => `${bites} gigitan · ${perfect} PAS`,
  finaleSolo: (score: number) => `Skor ${num(score)}!`,
  recordBefore: (best: number) => `Rekor: ${num(best)} poin`,
  recordFirst: (v: number) => `Rekor pertama tercatat: ${num(v)} poin`,
  recordNew: (best: number, prev: number) => `Rekor baru! ${num(best)} poin (sebelumnya ${num(prev)})`,
  recordTie: (best: number) => `Menyamai rekor: ${num(best)} poin`,
  recordShort: (best: number, gap: number) => `Rekor: ${num(best)} poin, kurang ${num(gap)} lagi`,

  noShell: 'Buka Makan Kerupuk dari aplikasi Hoorah di layar utama.',
  loadError: 'Gagal memuat game. Coba buka ulang.',
} as const;
