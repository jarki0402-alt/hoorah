/** Every player-facing Ular Tangga string (Indonesian) lives here. */
import type { CardId } from './logic';

export interface CardText {
  title: string;
  text: string;
  /** Short effect label on the card's ribbon. */
  effect: string;
  good: boolean;
}

export const CARD_TEXT: Record<CardId, CardText> = {
  ojek: { title: 'Naik ojek', text: 'Dapat tumpangan kilat ke depan.', effect: 'Maju 3', good: true },
  layangan: {
    title: 'Kejar layangan putus',
    text: 'Lari sambil menengadah, eh malah maju.',
    effect: 'Maju 2',
    good: true,
  },
  sepeda: { title: 'Pinjam sepeda tetangga', text: 'Kayuh sekuat tenaga!', effect: 'Maju 4', good: true },
  macet: {
    title: 'Kena macet',
    text: 'Klakson di mana-mana. Putar balik dulu.',
    effect: 'Mundur 2',
    good: false,
  },
  hujan: { title: 'Hujan deras', text: 'Neduh sebentar di pos ronda.', effect: 'Mundur 1', good: false },
  dompet: {
    title: 'Dompet ketinggalan',
    text: 'Balik ke rumah ambil dompet.',
    effect: 'Mundur 3',
    good: false,
  },
  kerupuk: {
    title: 'Juara lomba makan kerupuk',
    text: 'Hadiahnya satu lemparan lagi!',
    effect: 'Lempar lagi',
    good: true,
  },
  tidur: {
    title: 'Ketiduran habis makan siang',
    text: 'Giliran berikutnya terlewat.',
    effect: 'Lewati 1 giliran',
    good: false,
  },
  bot: {
    title: 'Pakai sepatu bot',
    text: 'Gigitan ular berikutnya tidak mempan.',
    effect: 'Kebal ular 1x',
    good: true,
  },
};

export const STR = {
  logo: 'ULAR TANGGA',
  unknownPlayer: 'Pemain',
  offline: 'Terputus',
  /** Row badges: holding the boots card (never just "BOT", which would read like a computer label). */
  badgeShield: 'SEPATU',
  badgeSkip: 'ZZZ',
  boardLabel: (size: number) => `Papan ${size} kotak`,
  round: (r: number, max: number) => `Putaran ${r}/${max}`,
  lastRound: 'Putaran terakhir!',
  square: (n: number) => `Kotak ${n}`,
  finishSquare: 'FINIS',
  startSquare: 'MULAI',

  /* Turn card */
  turnEyebrow: 'GILIRAN',
  turnExtra: 'LEMPAR LAGI',
  turnFirst: 'GILIRAN PERTAMA',
  turnWinner: 'JUARA',
  turnHint: 'Lempar dadu dari HP',
  turnAuto: (s: number) => `Dadu dilempar otomatis dalam ${s} dtk`,
  rolled: (n: number) => `Dapat ${n}!`,
  waitingTitle: 'Menunggu pemain',
  waitingHint: 'Belum ada pemain yang tersambung.',

  /* Shouts on the board */
  shoutLadder: 'NAIK TANGGA!',
  shoutSnake: 'DIGIGIT ULAR!',
  shoutBlocked: 'SEPATU BOT!',
  shoutBlockedSub: 'Ularnya tidak mempan.',
  shoutBounce: 'MEMANTUL!',
  shoutBounceSub: (last: number) => `Harus pas di kotak ${last}.`,
  shoutSkip: 'KETIDURAN!',
  shoutSkipSub: (name: string) => `Giliran ${name} terlewat.`,
  shoutLastRound: 'PUTARAN TERAKHIR!',
  shoutLastRoundSub: 'Setelah ini yang paling depan menang.',
  climbSub: (name: string, from: number, to: number) => `${name}: kotak ${from} ke ${to}`,

  /* Card */
  cardEyebrow: 'KOTAK KEJUTAN',

  /* Duel */
  duelTitle: 'DUEL KILAT!',
  duelSub: 'Ketuk HP secepat mungkin!',
  duelLoserBack: (n: number) => `Yang kalah mundur ${n} kotak`,
  duelGo: 'KETUK!',
  duelWin: (name: string) => `${name} menang duel!`,
  duelTie: 'Seri! Semua tetap di tempat.',
  duelTaps: (n: number) => `${n} ketukan`,

  /* Intro + finale */
  introTitle: 'AYO MAIN!',
  introSub: (size: number, rounds: number) => `Papan ${size} kotak · maksimal ${rounds} putaran`,
  introFirst: (name: string) => `Giliran pertama: ${name}`,
  introRules: 'Kaki tangga membawa naik, kepala ular membawa turun. Harus pas di kotak terakhir!',
  finaleWinner: (name: string) => `${name} juara!`,
  finaleTie: 'Hasilnya seri!',
  finaleFinish: (last: number) => `Sampai duluan di kotak ${last}`,
  finaleCap: 'Putaran habis, yang paling depan menang',

  reactCheer: 'Sorak!',
  reactBoo: 'Huuu~',
  reactRematch: 'Minta revans!',

  /* Phone views */
  phoneRollEyebrow: 'GILIRANMU!',
  phoneRollEyebrowExtra: 'LEMPAR LAGI!',
  phoneRollTitle: (pos: number, last: number) => `Kotak ${pos} · tujuan ${last}`,
  phoneRollLabel: 'LEMPAR',
  phoneRollHint: 'Ketuk untuk melempar dadu. Kalau diam, dadu dilempar otomatis.',
  phoneWaitEyebrow: 'SEKARANG GILIRAN',
  phonePos: 'Posisimu',
  phoneRank: 'Peringkat',
  phoneRankValue: (rank: number, total: number) => `${rank} dari ${total}`,
  phonePosValue: (n: number) => `Kotak ${n}`,
  phoneCheer: 'Sorak!',
  phoneBoo: 'Huuu~',
  phoneIntroEyebrow: (size: number) => `ULAR TANGGA · ${size} KOTAK`,
  phoneIntroTitle: 'Bersiap!',
  phoneNextEyebrow: 'GILIRANMU BERIKUTNYA',
  phoneNoPlayers: 'Menunggu pemain tersambung',
  phoneMovingEyebrow: 'DADUMU',
  phoneMovingTitle: (n: number) => `Dapat ${n}!`,
  phoneMovingSub: 'Lihat bidakmu melangkah di layar utama.',
  phoneLadder: 'Naik tangga!',
  phoneSnake: 'Digigit ular!',
  phoneBlocked: 'Sepatu bot menolongmu!',
  phoneLanded: (n: number) => `Kotak ${n}`,
  phoneLadderSub: (from: number, to: number) => `Dari kotak ${from} naik ke ${to}.`,
  phoneSnakeSub: (from: number, to: number) => `Dari kotak ${from} turun ke ${to}.`,
  phoneBlockedSub: 'Ularnya tidak bisa menggigit.',
  phoneCardEyebrow: 'KOTAK KEJUTAN',
  phoneSkipTitle: 'Ketiduran!',
  phoneSkipSub: 'Giliranmu kali ini terlewat.',
  phoneDuelEyebrow: 'DUEL KILAT',
  phoneDuelCount: 'DUEL KILAT',
  phoneDuelVs: (name: string) => `Lawan: ${name}. Siap mengetuk!`,
  phoneDuelTeam: 'DUEL KILAT',
  phoneDuelRound: (name: string, secs: number) => `vs ${name} · ${secs} dtk`,
  phoneDuelLead: (me: number, them: number) =>
    me > them
      ? `Kamu unggul ${me} lawan ${them}`
      : me < them
        ? `Tertinggal ${me} lawan ${them}`
        : `Imbang ${me} sama`,
  phoneDuelWatch: (a: string, b: string) => `${a} vs ${b}`,
  phoneDuelWatchSub: 'Duel kilat sedang berlangsung!',
  phoneDuelWin: 'Menang duel!',
  phoneDuelWinSub: (name: string, n: number) => `${name} mundur ${n} kotak.`,
  phoneDuelLose: 'Kalah duel',
  phoneDuelLoseSub: (n: number) => `Kamu mundur ${n} kotak.`,
  phoneDuelTie: 'Seri!',
  phoneDuelTieSub: 'Kalian tetap di kotak yang sama.',
  phoneDuelScore: (me: number, them: number) => `${me} : ${them}`,
  phoneFinalWin: 'Juara!',
  phoneFinalRank: (rank: number) => `Peringkat ${rank}`,
  phoneFinalSub: (title: string) => title,
  phoneRematch: 'Minta revans!',
  phoneLadders: 'Tangga',
  phoneSnakes: 'Ular',
  phoneDuels: 'Duel menang',

  /* Results */
  resultSubFinish: (rounds: number) => `Selesai dalam ${rounds} putaran`,
  resultSubCap: (rounds: number) => `Putaran habis setelah ${rounds} putaran`,
  rankFinished: 'Sampai finis',
  rankAt: (n: number) => `Kotak ${n}`,
  awardLadder: 'Raja Tangga',
  awardLadderDesc: (n: number, sq: number) => `${n} tangga, naik ${sq} kotak`,
  awardDuel: 'Jago Duel',
  awardDuelDesc: (n: number) => `Menang ${n} duel kilat`,
  awardLucky: 'Si Hoki',
  awardLuckyDesc: (n: number) => `Dapat angka 6 sebanyak ${n} kali`,
  awardSnake: 'Sahabat Ular',
  awardSnakeDesc: (n: number) => `Digigit ular ${n} kali, tetap semangat`,
  awardBoots: 'Kebal Bisa',
  awardBootsDesc: 'Sepatu bot menahan gigitan ular',
  awardTraveler: 'Penjelajah Kampung',
  awardTravelerDesc: (n: number) => `Sampai di kotak ${n}`,

  noShell: 'Buka Ular Tangga dari aplikasi Hoorah di layar utama.',
} as const;
