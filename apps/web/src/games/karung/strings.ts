/**
 * Every player-facing text of Balap Karung (Indonesian). Code and identifiers stay English.
 */

/** Indonesian decimal comma, one decimal: 1.6 -> "1,6". */
export function formatRate(rate: number): string {
  return (Math.round(rate * 10) / 10).toFixed(1).replace('.', ',');
}

/** Elapsed race time as m:ss. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Finish time with tenths: 31.46 s -> "31,5 dtk". */
export function formatTime(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1).replace('.', ',')} dtk`;
}

export const STR = {
  gameTitle: 'BALAP KARUNG',
  loadError: 'Buka Balap Karung dari layar Kacawbalaw.',

  /* Main screen HUD */
  raceOf: (race: number, total: number) => `BALAPAN ${race} / ${Math.max(race, total)}`,
  lane: (n: number) => `LAJUR ${n}`,
  placeShort: (place: number) => `#${place}`,
  promptLabel: 'LOMPAT PAS IRAMA!',
  promptHint: 'Ketuk saat cincin kuning pas di garis putih',
  finishBanner: 'FINIS',
  startBanner: 'START',
  superFloat: 'SUPER!',
  stumbleFloat: 'GUBRAK!',
  perfectFloat: 'PAS!',
  combo: (n: number) => `IRAMA x${n}`,
  finishedFloat: (place: number) => `#${place}`,
  disconnected: 'Terputus',
  meters: (m: number) => `${Math.max(0, Math.ceil(m))} m`,
  graceLeft: (s: number) => `Finis ditutup ${s} dtk`,

  /* Main screen overlays */
  waitingTitle: 'Butuh minimal 2 pemain',
  waitingSubtitle: 'Ajak teman scan kode QR untuk bergabung. Balapan mulai otomatis.',
  ready: 'Siap…',
  go: 'LOMPAT!',
  goLine: 'Siap, lompat!',
  photoFinish: 'FOTO FINIS!',
  raceWinner: (name: string) => `${name} juara!`,
  raceWinnerSub: (race: number, time: string) => `Balapan ${race} · ${time}`,
  raceNoFinish: (race: number) => `Balapan ${race} · waktu habis`,
  photoGap: (gap: string) => `Selisih ${gap}`,
  boardEyebrow: (race: number, total: number) =>
    race >= total ? 'KLASEMEN AKHIR' : `KLASEMEN SETELAH BALAPAN ${race}`,
  boardNext: (race: number) => `Balapan ${race} sebentar lagi…`,
  boardLast: 'Hasil akhir sebentar lagi…',
  boardPoints: (n: number) => `${n} poin`,
  boardPlus: (n: number) => `+${n}`,
  boardPlace: (place: number) => `#${place}`,
  champion: (name: string) => `${name} juara Balap Karung!`,
  championTie: 'Juara bersama!',
  championSub: (points: number) => `${points} poin`,
  notFinished: 'Belum finis',

  /* Phone views */
  phoneWaitingTitle: 'Butuh minimal 2 pemain',
  phoneWaitingSubtitle: 'Ajak teman bergabung. Balapan mulai otomatis.',
  phoneReadyTitle: 'Masuk karung…',
  phoneReadySubtitle: 'Ketuk mengikuti irama. Asal ketuk cepat bikin jatuh!',
  spectatorTitle: 'Tunggu balapan berikutnya',
  spectatorSubtitle: 'Kamu ikut lomba di balapan selanjutnya.',
  countdownTitle: (lane: number) => `LAJUR ${lane}`,
  countdownFirst: 'Ketuk saat cincin pas di garis. Jangan asal cepat!',
  countdownNext: (race: number) => `Balapan ${race}. Ikuti iramanya!`,
  countdownFinal: 'Balapan terakhir! Semua ditentukan sekarang.',
  phoneRace: (race: number, clock: string) => `B${race} · ${clock}`,
  label: 'LOMPAT!',
  statusStumble: 'Gubrak! Bangun dulu…',
  statusLead: (total: number) => `Posisi 1 dari ${total} · memimpin!`,
  statusPlace: (place: number, total: number, left: string) => `Posisi ${place} dari ${total} · sisa ${left}`,
  finishedEyebrow: (race: number) => `BALAPAN ${race}`,
  finishedTitle: (place: number) => (place === 1 ? 'Finis pertama!' : `Finis ke-${place}!`),
  finishedSubtitle: 'Tunggu yang lain sampai garis finis.',
  raceDoneEyebrow: (race: number) => `BALAPAN ${race} SELESAI`,
  raceDoneTitle: (place: number) => (place === 1 ? 'Juara balapan!' : `Posisi ${place}`),
  raceDoneSubtitle: (plus: number, total: number) => `+${plus} poin · total ${total} poin`,
  statOnBeat: 'Lompat pas',
  statSupers: 'Super',
  statStumbles: 'Jatuh',
  statStreak: 'Irama terbaik',
  statPoints: 'Poin',
  resultWinTitle: 'Juara Balap Karung!',
  resultPlaceTitle: (rank: number) => `Peringkat ${rank}`,
  resultSubtitle: (points: number, wins: number) =>
    wins > 0 ? `${points} poin · menang ${wins} balapan` : `${points} poin`,
  resultLabel: (points: number) => `${points} poin`,
  resultTitle: (name: string) => `${name} juara Balap Karung!`,
  resultTieTitle: 'Juara bersama!',
  resultSubtitleTop: (points: number) => `Total ${points} poin`,

  /* Awards */
  awardChampion: 'Raja Lintasan',
  awardChampionDesc: (wins: number) => (wins > 1 ? `Menang ${wins} balapan` : 'Menang satu balapan'),
  awardRhythm: 'Kaki Berirama',
  awardRhythmDesc: (n: number) => `${n} lompatan pas beruntun`,
  awardSuper: 'Lompatan Kanguru',
  awardSuperDesc: (n: number) => `${n} lompatan super`,
  awardTumble: 'Pantang Menyerah',
  awardTumbleDesc: (n: number) => `Jatuh ${n} kali, tetap bangkit`,

  /* Commentator ticker: `bold` is shown in bold, then `text`. */
  tickStart: (race: number) => ({ bold: `Balapan ${race}`, text: ' dimulai! Ikuti iramanya!' }),
  tickFinal: { bold: 'Balapan terakhir!', text: ' Semua ditentukan sekarang!' },
  tickSuper: (name: string) => ({ bold: name, text: ' lompatan super!' }),
  tickStreak: (name: string, n: number) => ({ bold: name, text: ` ${n} lompatan pas beruntun!` }),
  tickStumble: (name: string) => ({ bold: name, text: ' tersandung! Jangan buru-buru!' }),
  tickLead: (name: string) => ({ bold: name, text: ' memimpin balapan!' }),
  tickLeadChange: (name: string) => ({ bold: name, text: ' menyalip ke depan!' }),
  tickClose: (a: string, b: string) => ({ bold: `${a} dan ${b}`, text: ' saling kejar!' }),
  tickFinish: (name: string) => ({ bold: name, text: ' sampai di garis finis!' }),
  tickLastCall: { bold: '10 detik lagi!', text: ' Ayo kejar finisnya!' },
  tickWarning: { bold: '', text: 'Waktu hampir habis!' },
  tickPhoto: { bold: 'Foto finis!', text: ' Tipis sekali bedanya!' },
  tickRaceEnd: (name: string, race: number) => ({ bold: name, text: ` juara balapan ${race}!` }),
  tickFillers: [
    'Lompat, lompat, ikuti iramanya!',
    'Penonton bersorak dari pinggir lapangan!',
    'Tiga lompatan pas berturut-turut jadi lompatan super!',
    'Jangan asal cepat, nanti tersandung!',
    'Pegang karungnya erat-erat!',
  ],
} as const;
