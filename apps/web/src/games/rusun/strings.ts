/** Every player-facing Rusun string (Indonesian) lives here. */
import type { BalanceZone } from './logic';

export const STR = {
  logo: 'RUSUN',
  floorChip: (n: number) => `LANTAI ${n}`,
  turn: 'GILIRAN',
  waitingTitle: 'Menunggu pemain',
  waitingHint: 'Belum ada pemain yang tersambung.',
  turnHintLead: 'Tekan ',
  turnHintButton: 'JATUHKAN',
  turnHintTail: ' di HP saat lantai pas di atas menara.',
  /** `left` = floors still needed after this one to equal the record; `height` = current tower. */
  toRecord: (left: number, height: number) =>
    left < -1
      ? `Rekor baru: ${height} lantai!`
      : left === -1
        ? 'Lantai ini memecahkan rekor!'
        : left === 0
          ? 'Lantai ini menyamai rekor!'
          : left === 1
            ? '1 lantai lagi menyamai rekor!'
            : `${left} lantai lagi menyamai rekor.`,
  unknownPlayer: 'Pemain',
  record: (n: number) => `Rekor kalian: ${n} lantai`,
  /* Solo: score attack against your own record (PRD 6.4) */
  recordSolo: (n: number) => `Rekor: ${n} lantai`,
  recordFirst: (n: number) => `Rekor pertama tercatat: ${n} lantai`,
  recordNew: (best: number, prev: number) => `Rekor baru! ${best} lantai (sebelumnya ${prev})`,
  recordTie: (best: number) => `Menyamai rekor: ${best} lantai`,
  recordShort: (best: number, gap: number) => `Rekor: ${best} lantai, kurang ${gap} lantai lagi`,
  gauge: 'KESEIMBANGAN',
  gaugeAria: (zone: BalanceZone) =>
    zone === 'red'
      ? 'Keseimbangan bahaya, menara hampir roboh'
      : zone === 'yellow'
        ? 'Keseimbangan waspada'
        : 'Keseimbangan aman',
  balance: { green: 'Aman', yellow: 'Waspada', red: 'Bahaya' } satisfies Record<BalanceZone, string>,
  playerStat: (floors: number, pas: number) => `${floors} lantai · ${pas} PAS`,
  playerScore: (score: number) => `${score} poin`,
  statWinner: (floors: number, pas: number) =>
    floors > 0 ? `Menang · ${floors} lantai, ${pas} PAS` : 'Menang',
  statSafe: (floors: number, pas: number) =>
    floors > 0 ? `Selamat · ${floors} lantai, ${pas} PAS` : 'Selamat',
  statCollapsed: (floor: number) => `Merobohkan di lantai ${floor}`,
  offline: 'Terputus',

  popupPas: 'PAS!',
  popupPoints: (p: number) => `+${p}`,
  popupStreak: (n: number) => `Beruntun ${n}x`,
  popupRecord: 'REKOR BARU!',

  introTitle: (round: number, rounds: number) => (rounds > 1 ? `MENARA ${round}` : 'AYO SUSUN!'),
  introSub: (rounds: number) => (rounds > 1 ? `dari ${rounds} menara` : 'Jatuhkan lantai pas di atas menara'),
  introFirst: (name: string) => `Giliran pertama: ${name}`,

  roboh: 'ROBOH!',
  robohWho: (floor: number) => ` merobohkan Rusun di lantai ${floor}.`,
  robohStrikes: (n: number) => ` meleset ${n} kali, Rusun ikut roboh!`,
  robohWinner: (name: string) => `${name} menang!`,
  robohTie: 'Hasilnya seri!',
  robohOthers: 'Pemain lain dapat +3 poin.',
  robohHeight: (h: number) =>
    h > 1 ? ` Rusun kalian sempat setinggi ${h} lantai.` : ' Rusun kalian belum sempat tumbuh.',
  robohNext: (round: number, rounds: number) => ` Menara ${round} dari ${rounds} segera dimulai.`,

  finaleSolo: (h: number) => (h > 1 ? `Rusun setinggi ${h} lantai!` : 'Rusun belum sempat berdiri!'),
  finaleWinner: (name: string) => `${name} menang!`,
  finaleTie: (names: string[]) => (names.length === 2 ? `${names[0]} & ${names[1]} seri!` : 'Hasilnya seri!'),

  shoutMiss: 'MELESET!',
  shoutMissSub: (name: string, strikes: number, max: number) =>
    `${name} kehilangan giliran · ${strikes}/${max}`,
  toppedTitle: 'Rusun pencakar langit!',
  toppedSub: (h: number) => `Setinggi ${h} lantai! Semua pemain dapat +3 poin.`,
  toppedNext: (round: number, rounds: number) => `Menara ${round} dari ${rounds} segera dimulai.`,
  statTopped: (floors: number, pas: number) => `Pencakar langit · ${floors} lantai, ${pas} PAS`,

  reactCheer: 'Sorak!',
  reactBoo: 'Huuu~',
  reactRematch: 'Minta revans!',

  /* Phone views */
  phoneTurnEyebrow: 'GILIRANMU!',
  phoneTurnTitle: (n: number) => `Lantai ${n} · makin sempit`,
  phoneTurnLabel: 'JATUHKAN',
  phoneTurnHint: 'Lihat crane di layar, tekan saat lantai tepat di atas menara.',
  phoneWaitEyebrow: 'SEKARANG GILIRAN',
  phoneHeight: 'Tinggi Rusun',
  phoneHeightValue: (h: number) => `${h} lantai`,
  phoneBalance: 'Keseimbangan',
  phoneCheer: 'Sorak!',
  phoneBoo: 'Huuu~',
  phoneIntroEyebrow: (round: number, rounds: number) =>
    rounds > 1 ? `MENARA ${round} DARI ${rounds}` : 'SIAP-SIAP',
  phoneIntroTitle: 'Bersiap!',
  phoneNextEyebrow: 'GILIRANMU BERIKUTNYA',
  phoneNoPlayers: 'Menunggu pemain tersambung',
  phonePas: 'PAS!',
  phoneLanded: 'Mendarat',
  phonePasSub: (streak: number) =>
    streak > 1 ? `PAS ${streak}x beruntun! Tepat di tengah.` : 'Tepat di tengah menara.',
  phoneLandSub: 'Lantai terpasang. Tunggu giliran berikutnya.',
  phoneLoseTitle: 'Yah, roboh!',
  phoneLoseSubFinal: (winner: string | null) =>
    winner ? `${winner} menang kali ini. Tapi lantai susunanmu kokoh:` : 'Tapi lantai susunanmu kokoh:',
  phoneLoseSubNext: 'Menara berikutnya segera dimulai.',
  phoneSoloLoseSub: (h: number) => `Rusun-mu sempat setinggi ${h} lantai.`,
  phoneMissTitle: 'Meleset!',
  phoneMissSub: (strikes: number, max: number) =>
    strikes >= max - 1
      ? 'Awas! Sekali lagi meleset, Rusun ikut roboh.'
      : 'Lantainya jatuh ke jalan. Tunggu sampai pas di atas menara.',
  phoneMissChip: (strikes: number, max: number) => `Meleset ${strikes}/${max}`,
  phoneToppedTitle: 'Pencakar langit!',
  phoneToppedSub: (h: number) => `Rusun setinggi ${h} lantai. Semua dapat +3!`,
  phoneWinTitle: 'Kamu selamat!',
  phoneWinSub: (name: string) => `${name} merobohkan Rusun.`,
  phoneFloors: 'Lantai kamu',
  phonePasCount: 'Jatuhan PAS',
  phoneBestStreak: 'PAS beruntun',
  phoneRematch: 'Minta revans!',
  phoneAgain: 'Main lagi!',
  phoneFinalWin: 'Juara!',
  phoneFinalRank: (rank: number) => `Peringkat ${rank}`,
  phoneFinalScore: (score: number) => `${score} poin`,
  phoneFinalSolo: (floors: number) => `${floors} lantai`,
  phoneFinalSub: (title: string) => title,

  /* Results */
  resultSubtitle: (best: number, rounds: number) =>
    rounds > 1
      ? `Rusun tertinggi ${best} lantai dari ${rounds} menara`
      : `Rusun kalian sempat setinggi ${best} lantai`,
  resultSoloSubtitle: (pas: number, streak: number) => `${pas} jatuhan PAS · ${streak} PAS beruntun terbaik`,
  rankLabel: (floors: number, pas: number, misses: number) =>
    floors > 0
      ? `${floors} lantai · ${pas} PAS`
      : misses > 0
        ? `Meleset ${misses}x`
        : 'Belum menyusun lantai',
  awardArchitect: 'Arsitek Menara',
  awardArchitectDesc: (n: number) => `Menyusun ${n} lantai`,
  awardCraftsman: 'Tukang Ahli',
  awardCraftsmanDesc: (n: number) => `${n} jatuhan PAS`,
  awardSteady: 'Tangan Dingin',
  awardSteadyDesc: (n: number) => `${n} PAS beruntun`,
  awardBrave: 'Pemberani',
  awardBraveDesc: (n: number) => (n > 1 ? `Merobohkan ${n} menara` : 'Merobohkan Rusun dengan gaya'),
  awardWorker: 'Pekerja Keras',
  awardWorkerDesc: (n: number) => `Menyumbang ${n} lantai`,

  noShell: 'Buka Rusun dari aplikasi Hoorah di layar utama.',
} as const;
