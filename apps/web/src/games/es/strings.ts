/**
 * Every player-facing text of Seluncur Es (Indonesian, no em dash). Code stays English.
 */

export function formatGap(m: number): string {
  return `${Math.max(1, Math.round(m * 100))} cm`;
}

export const STR = {
  gameTitle: 'SELUNCUR ES',
  noShell: 'Seluncur Es harus dibuka dari aplikasi Kacawbalaw.',
  loadFailed: 'Gagal memuat Seluncur Es. Periksa koneksi lalu buka lagi.',

  /* Main screen */
  roundOf: (i: number, n: number) => `RONDE ${i + 1}/${n}`,
  roundCard: (i: number, n: number) => `Ronde ${i + 1} dari ${n}`,
  roundName: (final: boolean) => (final ? 'Ronde penentuan' : 'Siap meluncur?'),
  roundDesc: (final: boolean) =>
    final
      ? 'Poin ganda! Juara bisa berganti di luncuran penutup.'
      : 'Tarik ketapel di HP, lepas untuk mengunci. Semua meluncur bersamaan.',
  double: 'POIN GANDA',
  shotLine: (shot: number, shrinks: boolean) =>
    shrinks ? `Luncuran ${shot}, es mengecil` : `Luncuran ${shot}`,
  aimTitle: 'BIDIK!',
  aimSub: 'Tarik di HP',
  slideTitle: 'MELUNCUR!',
  onIce: 'di atas es',
  locked: (n: number) => `${n} terkunci`,
  statusLocked: 'Terkunci',
  statusAiming: 'Bidik...',
  statusOut: 'Tercebur',
  statusWait: 'Menunggu',
  statusSafe: 'Bertahan',
  hit: 'DUK!',
  splash: 'BYUR!',
  crack: 'ES RETAK!',
  nearMiss: (name: string, gap: string) => `NYARIS! ${name} berhenti ${gap} dari tepi`,
  fallToast: (name: string) => `${name} tercebur!`,
  crackToast: (name: string) => `${name} hanyut bersama es yang patah!`,
  pushedOff: (by: string, name: string) => `${by} menyundul ${name} ke laut!`,
  roundDone: 'Ronde selesai',
  winnerRound: (name: string) => `${name} terakhir di atas es!`,
  nobodyRound: 'Semua tercebur bersamaan!',
  pointsPlus: (n: number) => `+${n}`,
  scoreTitle: 'Poin',
  finalTitle: 'Juara Kutub',
  finalSub: 'Total poin semua ronde',
  roundCol: (i: number) => `R${i + 1}`,
  totalCol: 'Total',
  help: 'Tarik ke belakang di HP: arah dan kekuatan. Lepas untuk mengunci. Waktu habis, semua meluncur!',

  /* Phone */
  phoneEyebrow: (round: number, shot: number) => `Ronde ${round + 1} · luncuran ${shot}`,
  phoneAim: 'Bidik dan lepas!',
  phoneSlide: 'Meluncur!',
  phoneHint: 'Bidikan dikunci di HP. Sinyal lambat tidak merugikan.',
  locksOf: (n: number, of: number) => `${n} dari ${of} sudah terkunci`,
  watchSlide: 'Lihat layar!',
  introTitle: (i: number, n: number) => `Ronde ${i + 1} dari ${n}`,
  introSubFinal: 'Poin ganda!',
  introSub: 'Siap-siap membidik',
  outTitle: 'Byur! Kamu tercebur',
  outSub: (more: boolean) =>
    more
      ? 'Sorak dari pinggir. Kamu kembali ke es di ronde berikutnya.'
      : 'Sorak dari pinggir sampai juara ditentukan.',
  outCrackTitle: 'Esmu patah!',
  waitTitle: 'Ronde sedang berjalan',
  waitSub: 'Kamu ikut di ronde berikutnya.',
  statPoints: 'Poin',
  statRound: 'Ronde ini',
  statRank: 'Peringkat',
  endTitle: (pts: number) => `+${pts} poin`,
  endWin: 'Kamu terakhir di atas es!',
  endSub: 'Poinmu tersimpan. Siap ronde berikutnya.',
  resultPhoneTitle: (rank: number) => (rank === 1 ? 'Juara Kutub!' : `Peringkat ${rank}`),
  resultPhoneSub: (wins: number) =>
    wins > 0 ? `Terakhir berdiri di ${wins} ronde` : 'Tetap licin, tetap seru',
  statWins: 'Menang ronde',
  statKnock: 'Menjatuhkan',
  spectatorTitle: 'Ronde sedang berjalan',
  spectatorSub: 'Kamu ikut di ronde berikutnya.',

  /* Final result */
  winner: (name: string) => `${name} juara Seluncur Es!`,
  winnerSub: (rounds: number) => `Total poin dari ${rounds} ronde`,

  awards: {
    king: { title: 'Raja Kutub', desc: (n: number) => `Terakhir berdiri di ${n} ronde` },
    bumper: { title: 'Penyundul Ulung', desc: (n: number) => `Menjatuhkan ${n} pemain` },
    slick: { title: 'Paling Licin', desc: (n: number) => `Berhenti di bibir es ${n} kali` },
    thunder: { title: 'Tabrakan Petir', desc: () => 'Benturan paling keras' },
    bold: { title: 'Paling Nekat', desc: (n: number) => `${n} luncuran tenaga penuh` },
    skater: { title: 'Peluncur Jauh', desc: (m: number) => `Meluncur ${m} m` },
    brave: { title: 'Pantang Kering', desc: (n: number) => `Tercebur ${n} kali, tetap tersenyum` },
    calm: { title: 'Pinguin Santai', desc: () => 'Tenang di atas es' },
  },
};
