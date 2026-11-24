/** Every player-facing string of Sambung Kata (Indonesian). */
import type { Reason, StartKind } from './logic';

/** 1234 ms -> "1,2" (Indonesian decimal comma). */
export function formatSeconds(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  return `${Math.floor(tenths / 10)},${tenths % 10}`;
}

const up = (s: string) => s.toUpperCase();

export const STR = {
  logo: 'SAMBUNG KATA',
  noShell: 'Buka Sambung Kata dari layar utama Kacawbalaw.',

  /* Header chips */
  roundChip: (n: number) => `PUTARAN ${n}`,
  livesChip: (n: number) => `${n} NYAWA`,
  chainChip: (n: number) => `${n} KATA`,
  timeChip: (s: number) => `${s} DETIK / GILIRAN`,

  /* Intro */
  introEyebrow: 'CARA MAIN',
  introTitle: 'Sambung suku kata terakhir!',
  introSteps: [
    { t: 'Lihat suku katanya', d: 'Kata berikutnya diawali suku kata terakhir kata sebelumnya.' },
    { t: 'Ketik di HP', d: 'Kirim sebelum waktu habis. Waktu makin singkat tiap putaran.' },
    { t: 'Jaga nyawamu', d: 'Kata salah, sudah dipakai, atau waktu habis: nyawa berkurang.' },
  ],
  introExample: ['buku', 'kuda', 'daun', 'untung'],
  introLives: (n: number) => `Setiap pemain punya ${n} nyawa`,

  /* Turn panel */
  turnEyebrow: 'GILIRAN',
  startWith: 'KATA DIAWALI',
  thinking: 'Sedang berpikir…',
  startFirst: 'Suku kata pertama',
  startFresh: 'Suku kata baru',
  startStuck: (s: string) => `Tidak ada kata lagi dari ${up(s)}, suku kata baru!`,
  newRound: (n: number, s: number) => `Putaran ${n}: ${s} detik per giliran`,
  timerLabel: (s: number) => `Sisa waktu ${s} detik`,

  /* Verdict */
  accepted: 'MANTAP!',
  acceptedNote: 'KATA DITERIMA',
  acceptedIn: (ms: string) => `${ms} detik`,
  reason: (r: Reason, prefix: string): string => {
    switch (r) {
      case 'timeout':
        return 'Waktu habis!';
      case 'start':
        return `Harus diawali ${up(prefix)}`;
      case 'short':
        return 'Terlalu pendek';
      case 'used':
        return 'Sudah dipakai';
      case 'unknown':
        return 'Tidak ada di kamus';
    }
  },
  lifeLost: '-1 NYAWA',
  outLabel: 'TERSINGKIR',
  nextUp: (name: string) => `Berikutnya: ${name}`,
  stuckShort: (s: string) => `${up(s)} buntu.`,

  /* Chain */
  chainTitle: 'RANTAI KATA',
  chainEmpty: 'Kata pertama muncul di sini.',
  startDivider: (kind: StartKind, prefix: string, stuckFrom: string | null): string => {
    if (kind === 'first') return `MULAI DARI ${up(prefix)}`;
    if (kind === 'stuck' && stuckFrom) return `${up(stuckFrom)} BUNTU · MULAI BARU DARI ${up(prefix)}`;
    return `MULAI BARU DARI ${up(prefix)}`;
  },
  timeoutWord: '. . .',
  thenFresh: (p: string) => `GANTI ${up(p)}`,
  thenStuck: (p: string) => `BUNTU · GANTI ${up(p)}`,
  msShort: (ms: number) => `${formatSeconds(ms)} dtk`,

  /* Players strip */
  livesLabel: (left: number, total: number) => `${left} dari ${total} nyawa`,

  /* Final */
  finalEyebrow: 'PEMENANG',
  finalTitle: (name: string) => `${name} juara!`,
  finalNone: 'Permainan selesai',
  finalStats: (words: number, lives: number) => `${words} kata · sisa ${lives} nyawa`,
  waiting: 'Menunggu pemain tersambung lagi…',

  /* Phone */
  phoneEyebrow: 'SAMBUNG KATA',
  phoneRound: (n: number) => `PUTARAN ${n}`,
  phoneReady: 'Siap-siap!',
  phoneReadyHint: 'Lanjutkan suku kata terakhir: BUKU, KUDA, DAUN…',
  phoneYourTurn: 'Giliranmu!',
  phoneTurnOf: (name: string) => `Giliran ${name}`,
  phoneStartHint: (p: string) => `Ketik kata yang diawali ${up(p)}`,
  phoneWaitHint: 'Siapkan katamu, giliranmu segera tiba.',
  phoneNextYou: 'Giliranmu berikutnya!',
  phoneAccepted: (w: string) => `${up(w)} diterima`,
  phoneOutTitle: 'Nyawamu habis',
  phoneOutText: 'Tonton terus, siapa yang bertahan?',
  phoneSpectatorTitle: 'Permainan sedang berjalan',
  phoneSpectatorText: 'Kamu ikut di permainan berikutnya.',
  phoneWinTitle: 'Kamu juara!',
  phoneWinnerIs: (name: string) => `Juara: ${name}`,
  phoneEndText: 'Lihat hasilnya di layar utama.',
  statWords: 'Kata',
  statLongest: 'Terpanjang',

  /* Results (shell) */
  resultTitle: (name: string) => `${name} juara!`,
  resultSubtitle: (words: number, rounds: number) => `Rantai ${words} kata · ${rounds} putaran`,
  rankLabel: (words: number, lives: number, alive: boolean) =>
    alive ? `${words} kata · ${lives} nyawa` : `${words} kata`,
  awardLongest: 'Kata Terpanjang',
  awardLongestDesc: (w: string) => `${up(w)}, ${w.length} huruf`,
  awardFastest: 'Paling Kilat',
  awardFastestDesc: (w: string, ms: number) => `${up(w)} dalam ${formatSeconds(ms)} detik`,
  awardMost: 'Paling Banyak Kata',
  awardMostDesc: (n: number) => `${n} kata diterima`,
  unknownPlayer: 'Pemain',
} as const;
