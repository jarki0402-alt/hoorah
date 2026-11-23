/** Every player-facing Ludo string (Indonesian) lives here. */
import type { ColorId } from './logic';

const COLOR_NAMES = ['Merah', 'Hijau', 'Kuning', 'Biru', 'Merah Muda', 'Tosca', 'Oranye', 'Cokelat'] as const;

export const STR = {
  noShell: 'Buka Ludo dari layar utama Hoorah.',
  logo: 'LUDO',
  unknownPlayer: 'Pemain',
  color: (c: ColorId) => COLOR_NAMES[c],
  modeChip: (pawns: number) => (pawns >= 4 ? 'NORMAL · 4 BIDAK' : 'KILAT · 2 BIDAK'),

  /* main screen */
  turn: 'GILIRAN',
  bonusTurn: 'LEMPAR LAGI',
  hintRoll: 'Lempar dadu dari HP.',
  hintRollAuto: 'Pemain terputus, dadu dilempar otomatis.',
  hintPick: 'Pilih bidak di HP.',
  hintMoving: 'Bidak berjalan...',
  hintRolling: 'Dadu bergulir...',
  hintNeedSix: 'Butuh angka 6 untuk keluar kandang.',
  rulesTitle: 'AYO MAIN LUDO!',
  overTitle: 'Permainan selesai',
  overEyebrow: 'SELESAI',
  rulesLines: ['Dapat 6 untuk keluar kandang', 'Angka 6 dapat lempar lagi', 'Bintang dan petak start aman'],
  firstTurn: (name: string) => `Giliran pertama: ${name}`,
  boardNote: (sides: number) => `${sides} pemain, papan segi ${sides}: setiap orang warna sendiri.`,
  homeStat: (home: number, total: number) => `${home}/${total} pulang`,
  offline: 'Terputus',
  autoTag: 'otomatis',

  toastSix: 'ENAM! Lempar lagi',
  toastCapture: (who: string, victims: string) => `${who} makan bidak ${victims}!`,
  toastHome: (name: string) => `Bidak ${name} sampai rumah!`,
  toastNone: 'Tidak ada langkah',
  toastNoneSub: (needSix: boolean) => (needSix ? 'Butuh 6 untuk keluar kandang' : 'Angkanya kebesaran'),
  toastTriple: 'Tiga kali 6!',
  toastTripleSub: 'Giliran hangus',

  finaleTitle: (name: string) => `${name} JUARA!`,
  finaleSub: (home: number) => `Semua ${home} bidak sudah sampai rumah.`,

  /* phone */
  phoneTurnEyebrow: (color: string) => `GILIRANMU · ${color.toUpperCase()}`,
  phoneBonusEyebrow: (color: string) => `ENAM! · ${color.toUpperCase()}`,
  phoneRollTitle: 'Lempar dadu!',
  phoneBonusTitle: 'Lempar lagi!',
  phoneRollLabel: 'LEMPAR',
  phoneRollHint: (needSix: boolean) =>
    needSix ? 'Butuh 6 untuk mengeluarkan bidak.' : 'Angka 6 dapat lempar lagi.',
  phonePickTitle: (value: number) => `Dadu ${value} · pilih bidak`,
  pickExit: 'Keluar kandang',
  pickHome: 'Masuk rumah!',
  pickCapture: (names: string) => `Makan ${names}!`,
  pickStep: (n: number) => `Maju ${n} langkah`,
  pickSafe: (n: number) => `Maju ${n} ke petak aman`,
  pickToHome: (left: number) => `Maju, ${left} lagi ke rumah`,
  phoneRolledEyebrow: 'DADUMU',
  phoneRolled: (n: number) => `Dapat ${n}!`,
  phoneMovingSub: 'Lihat bidakmu di layar utama.',
  phoneRollingSub: 'Dadu bergulir...',
  phoneNoneTitle: 'Tidak ada langkah',
  phoneTripleTitle: 'Tiga kali 6!',
  phoneTripleSub: 'Giliranmu hangus.',
  phoneWatchEyebrow: (color: string) => `GILIRAN ${color.toUpperCase()}`,
  phoneWatchRoll: 'sedang melempar dadu',
  phoneWatchPick: (n: number) => `dapat ${n}, memilih bidak`,
  phoneWatchMove: (n: number) => `dapat ${n}`,
  phoneYourColor: 'Warnamu',
  phoneHome: 'Bidak pulang',
  phoneIntroEyebrow: 'LUDO',
  phoneIntroTitle: 'Siap-siap!',
  phoneIntroSub: (color: string) => `Kamu main ${color}.`,
  phoneSpectator: 'Kamu menonton',
  phoneSpectatorSub: 'Ikut main di ronde berikutnya.',
  phoneCaptured: 'Bidakmu dimakan!',
  phoneWinTitle: 'Kamu juara!',
  phoneRank: (rank: number) => `Peringkat ${rank}`,
  phoneFinalSub: (headline: string) => headline,
  phoneCaptures: 'Makan lawan',
  phoneSixes: 'Dapat 6',
  phoneRematch: 'Main lagi',

  /* results */
  resultTitle: (name: string) => `${name} juara!`,
  resultSubtitle: (pawns: number) => `Ludo ${pawns >= 4 ? 'Normal' : 'Kilat'} · ${pawns} bidak per warna`,
  rankLabel: (home: number, total: number, captures: number) => `${home}/${total} pulang · makan ${captures}`,
  awardHunter: 'Raja Makan',
  awardHunterDesc: (n: number) => `Makan ${n} bidak lawan`,
  awardSix: 'Tangan Enam',
  awardSixDesc: (n: number) => `Dapat angka 6 sebanyak ${n} kali`,
  awardRunner: 'Pengantar Pulang',
  awardRunnerDesc: (n: number) => `Membawa ${n} bidak sampai rumah`,
  awardWalker: 'Pantang Menyerah',
  awardWalkerDesc: (n: number) => `Berjalan ${n} langkah`,
};

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
