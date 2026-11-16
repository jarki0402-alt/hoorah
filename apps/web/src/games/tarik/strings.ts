/**
 * Every player-facing text of Tarik Tambang (Indonesian). Code and identifiers stay English.
 */
import type { Team } from './logic';

/** Indonesian decimal comma, one decimal: 7.4 -> "7,4". */
export function formatRate(rate: number): string {
  return (Math.round(rate * 10) / 10).toFixed(1).replace('.', ',');
}

/** Remaining time as m:ss, rounded up so "0:00" only shows when time is really over. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const TEAM_UPPER: Record<Team, string> = { red: 'TIM MERAH', blue: 'TIM BIRU' };
const TEAM_LABEL: Record<Team, string> = { red: 'Tim Merah', blue: 'Tim Biru' };
const TEAM_SHORT: Record<Team, string> = { red: 'Merah', blue: 'Biru' };

export const STR = {
  gameTitle: 'TARIK TAMBANG',
  teamUpper: (t: Team) => TEAM_UPPER[t],
  teamLabel: (t: Team) => TEAM_LABEL[t],
  teamShort: (t: Team) => TEAM_SHORT[t],

  /* TV HUD */
  roundOf: (round: number, total: number) => `RONDE ${round} / ${Math.max(round, total)}`,
  suddenDeath: 'BABAK PENENTUAN',
  perSecond: '/dtk',
  superPrompt: 'SUPER TARIK!',
  superHint: 'Ketuk saat cincin kuning pas di garis putih',
  lineRed: 'GARIS MERAH',
  lineBlue: 'GARIS BIRU',
  even: 'Imbang',
  leadPercent: (t: Team, pct: number) => `${TEAM_SHORT[t]} unggul ${pct}%`,
  leadShort: (t: Team) => `${TEAM_SHORT[t]} unggul`,
  ropeAria: (text: string) => `Posisi bendera: ${text}`,
  moreMembers: (n: number) => `+${n}`,
  noMembers: 'Belum ada pemain',
  starAria: (wins: number) => `Menang ${wins} ronde`,
  go: 'TARIK!',
  superFloat: 'SUPER!',
  combo: (n: number) => `KOMBO x${n}`,
  plus: (n: number) => `+${n}`,

  /* TV overlays */
  waitingTitle: 'Butuh minimal 2 pemain',
  waitingSubtitle: 'Ajak teman scan kode QR untuk bergabung. Permainan mulai otomatis.',
  getReady: 'Siap-siap…',
  roundWin: (t: Team) => `${TEAM_SHORT[t].toUpperCase()} MENANG!`,
  roundDraw: 'SERI!',
  reasonLine: (t: Team) => `Bendera melewati garis ${TEAM_SHORT[t].toLowerCase()}`,
  reasonTime: (t: Team) => `Waktu habis, ${TEAM_SHORT[t]} unggul`,
  reasonDraw: 'Seri total, ronde diulang',
  roundEyebrow: (round: number) => `RONDE ${round}`,
  boardEyebrow: (round: number) => `SKOR SETELAH RONDE ${round}`,
  boardNext: (round: number) => `Ronde ${round} sebentar lagi…`,
  boardFinal: 'Ronde penentuan sebentar lagi…',
  boardRound: (round: number) => `R${round}`,
  champion: (t: Team) => `${TEAM_LABEL[t]} juara!`,
  score: (a: number, b: number) => `${a}–${b}`,
  winScore: (a: number, b: number) => `Menang ${a}–${b}`,
  loadError: 'Buka Tarik Tambang dari layar Hoorah.',

  /* Phone views */
  phoneRound: (round: number, clock: string) => `R${round} · ${clock}`,
  phoneWaitingTitle: 'Butuh minimal 2 pemain',
  phoneWaitingSubtitle: 'Ajak teman bergabung. Permainan mulai otomatis.',
  phoneReadyTitle: 'Siap-siap…',
  phoneReadySubtitle: 'Pegang HP mendatar, ibu jari siap di tombol.',
  countdownFirst: 'Ketuk secepatnya saat TARIK! muncul.',
  countdownWon: (round: number) => `Ronde ${round} kamu menang. Pertahankan!`,
  countdownLost: (round: number) => `Ronde ${round} lepas. Saatnya balas!`,
  countdownDraw: 'Ronde tadi seri. Habis-habisan!',
  countdownFinal: 'Ronde penentuan! Semua atau tidak sama sekali.',
  betweenWon: 'Ronde ini milikmu!',
  betweenLost: 'Ronde lepas!',
  betweenDraw: 'Seri!',
  betweenScore: (red: number, blue: number) => `Merah ${red} – ${blue} Biru`,
  statTaps: 'Ketukan',
  statSupers: 'Super',
  statCombo: 'Kombo terbaik',
  resultWinTitle: (t: Team) => `${TEAM_LABEL[t]} juara!`,
  resultLoseTitle: 'Hampir!',
  resultLoseSubtitle: (t: Team, a: number, b: number) => `${TEAM_LABEL[t]} kalah ${a}–${b}. Revans?`,

  /* Awards */
  awardFastest: 'Jari Kilat',
  awardFastestBest: (rate: string) => `Ketukan tercepat: ${rate} per detik`,
  awardFastestOther: (rate: string) => `Ngebut ${rate} ketukan per detik`,
  awardCombo: 'Raja Kombo',
  awardComboStreak: (n: number) => `Super tarik ${n} kali beruntun`,
  awardComboSingle: (n: number) => `Mendaratkan ${n} tarikan super`,
  awardFighter: 'Pantang Menyerah',
  awardFighterDesc: (taps: number, t: Team) => `${taps} ketukan untuk ${TEAM_LABEL[t]}`,
  awardCaptain: 'Kapten Tim',
  awardCaptainDesc: (taps: number, t: Team) => `${taps} ketukan, terbanyak di ${TEAM_LABEL[t]}`,
  awardCaptainOther: (taps: number, t: Team) => `Memimpin ${TEAM_LABEL[t]} dengan ${taps} ketukan`,

  /* Commentator ticker: `bold` is shown in bold, then `text`. */
  tickRoundStart: (round: number) => ({ bold: `Ronde ${round}`, text: ' dimulai! Tarik sekuat tenaga!' }),
  tickFinalRound: { bold: 'Ronde penentuan!', text: ' Semua atau tidak sama sekali!' },
  tickSuperStreak: (name: string, n: number, rival: string | null) => ({
    bold: name,
    text: ` ${n} kali super beruntun!${rival ? ` ${rival}, jangan kendor!` : ''}`,
  }),
  tickSuper: (name: string) => ({ bold: name, text: ' tarikan super!' }),
  tickFirstLead: (t: Team) => ({ bold: TEAM_SHORT[t], text: ' mulai unggul!' }),
  tickLeadChange: (t: Team) => ({ bold: TEAM_SHORT[t], text: ' ambil alih pimpinan!' }),
  tickComeback: (t: Team) => ({ bold: TEAM_SHORT[t], text: ' mulai bangkit!' }),
  tickNearWin: (t: Team) => ({ bold: TEAM_SHORT[t], text: ' tinggal sedikit lagi!' }),
  tickWarning: { bold: '', text: 'Tinggal 10 detik!' },
  tickSuddenDeath: { bold: 'Seri!', text: ' Babak penentuan, yang unggul duluan menang!' },
  tickRoundEnd: (t: Team, round: number) => ({ bold: TEAM_LABEL[t], text: ` menang ronde ${round}!` }),
  tickDraw: { bold: 'Seri total!', text: ' Ronde diulang.' },
  tickFast: (name: string, rate: string) => ({ bold: name, text: ` ngebut ${rate} ketukan per detik!` }),
  tickFillers: [
    'Tali makin tegang!',
    'Penonton bersorak, ayo terus!',
    'Kompakkan ritme untuk tarikan super!',
    'Jangan kasih kendor!',
    'Siapa yang bakal nyemplung ke lumpur?',
  ],
} as const;
