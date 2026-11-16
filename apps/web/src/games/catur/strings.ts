/** Every player-facing Catur string (Indonesian) lives here. */
import type { Color } from './chess';
import type { EndReason, Mode } from './logic';

const COLOR: Record<Color, string> = { w: 'Putih', b: 'Hitam' };

/** 65_400 ms -> "1:05"; under 10 s with tenths: "9,4". */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return (Math.floor(t / 100) / 10).toFixed(1).replace('.', ',');
  const s = Math.ceil(t / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const STR = {
  logo: 'CATUR',
  color: COLOR,
  team: (c: Color) => `Tim ${COLOR[c]}`,
  modeDuel: 'Satu lawan satu',
  modeTeam: 'Catur Rame',
  timeControl: (minutes: number, incSec: number) => `${minutes} menit + ${incSec} detik`,
  unknownPlayer: 'Pemain',
  offline: 'Terputus',
  waitingPlayer: 'Menunggu pemain',

  /* Main screen */
  introTitle: (mode: Mode) => (mode === 'team' ? 'CATUR RAME' : 'SIAP-SIAP'),
  introSub: (mode: Mode) =>
    mode === 'team'
      ? 'Tiap giliran, satu tim voting langkah di HP. Suara terbanyak yang dijalankan.'
      : 'Langkahkan bidak dari HP-mu. Putih jalan duluan.',
  introVs: 'VS',
  turnOf: (label: string) => `Giliran ${label}`,
  moves: 'LANGKAH',
  noMoves: 'Belum ada langkah',
  check: 'SKAK!',
  voteTitle: 'VOTING',
  voteHint: 'Pilih langkah di HP. Suara terbanyak menang.',
  voteCount: (n: number) => `${n} suara`,
  voteRandom: 'Tidak ada suara, langkah acak!',
  voted: (n: number, total: number) => `${n}/${total} sudah memilih`,
  paused: 'JEDA',
  spectators: (n: number) => `${n} penonton`,

  overTitle: (reason: EndReason): string =>
    ({
      checkmate: 'SKAK MAT!',
      timeout: 'WAKTU HABIS!',
      resign: 'MENYERAH',
      stalemate: 'REMIS',
      insufficient: 'REMIS',
      repetition: 'REMIS',
      fifty: 'REMIS',
      'timeout-draw': 'REMIS',
    })[reason],
  overWinner: (label: string) => `${label} menang!`,
  overDraw: 'Hasil imbang',
  reason: (reason: EndReason, loser: string): string =>
    ({
      checkmate: `Raja ${loser} terkunci`,
      timeout: `Jam ${loser} habis`,
      resign: `${loser} menyerah`,
      stalemate: 'Pat: tidak ada langkah sah, tapi raja tidak diskak',
      insufficient: 'Bidak tersisa tidak cukup untuk skak mat',
      repetition: 'Posisi yang sama terulang tiga kali',
      fifty: '50 langkah tanpa makan bidak atau jalan pion',
      'timeout-draw': `Jam ${loser} habis, tapi lawan tidak bisa skak mat`,
    })[reason],

  /* Phone */
  phoneIntro: 'BERSIAP',
  phoneYouAre: (c: Color) => `Kamu main ${COLOR[c]}`,
  phoneTeamYouAre: (c: Color) => `Kamu di Tim ${COLOR[c]}`,
  phoneYourTurn: 'GILIRANMU',
  phoneYourTurnHint: 'Ketuk bidakmu, lalu ketuk petak tujuan.',
  phoneWait: (label: string) => `GILIRAN ${label.toUpperCase()}`,
  phoneWaitHint: 'Pikirkan langkah berikutnya.',
  phoneTeamVote: 'VOTING TIMMU',
  phoneTeamVoteHint: 'Usulkan langkah. Boleh ganti pilihan sebelum waktu habis.',
  phoneTeamVoted: (move: string) => `Pilihanmu: ${move}. Ketuk langkah lain untuk ganti.`,
  phoneTeamWait: (c: Color) => `TIM ${COLOR[c].toUpperCase()} SEDANG VOTING`,
  phoneWatch: 'MENONTON',
  phoneWatchHint: 'Kamu masuk setelah game dimulai. Tonton dulu, ya!',
  phonePaused: 'DIJEDA',
  phoneOver: 'SELESAI',
  resign: 'Menyerah',
  you: 'Kamu',

  resultWin: 'Kamu menang!',
  resultLose: 'Kamu kalah',
  resultDraw: 'Remis!',
  resultTeamWin: 'Timmu menang!',
  resultTeamLose: 'Timmu kalah',
  resultMoves: 'Langkah dimainkan',
  resultMovesTeam: 'Usulanmu dipakai',
  resultCaptured: 'Nilai bidak dimakan',
  resultGame: 'Panjang partai',
  resultGameValue: (n: number) => `${n} langkah`,
  rematch: 'Minta revans!',

  /* Results (shell) */
  finalWinner: (label: string) => `${label} menang!`,
  finalDraw: 'Remis!',
  finalSub: (reason: string, moves: number) => `${reason} · ${moves} langkah`,
  rankWin: (c: Color) => `${COLOR[c]} · Menang`,
  rankLose: (c: Color) => `${COLOR[c]} · Kalah`,
  rankDraw: (c: Color) => `${COLOR[c]} · Remis`,
  awardHunter: 'Pemakan Bidak',
  awardHunterDesc: (n: number) => `Memakan bidak senilai ${n}`,
  awardVoice: 'Suara Emas',
  awardVoiceDesc: (n: number) => `${n} usulan langkah dipakai tim`,
  awardMate: 'Penutup Partai',
  awardMateDesc: 'Memberi skak mat',

  noShell: 'Buka Catur dari aplikasi Hoorah di layar utama.',
} as const;
