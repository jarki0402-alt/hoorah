/** Main-screen text: the Hoorah Pass (trial stage: a shared code from the Hoorah owner), Mode Pesta. */
export const STR = {
  passOn: (seats: number) => `Hoorah Pass aktif! Room bisa sampai ${seats} pemain`,
  passOff: 'Hoorah Pass sudah berakhir. Pemain yang sudah masuk tetap main.',
  passChip: (until: string) => `Pass sampai ${until}`,
  seatsFull: (used: number, max: number) =>
    `Room penuh (${used}/${max}). Punya kode Hoorah Pass? Ketik di HP yang mau ikut.`,
  seatsPass: (used: number, max: number, until: string) =>
    `Kursi terisi ${used}/${max}. Hoorah Pass aktif sampai ${until}.`,
  partyNone: 'Belum ada game yang pas untuk Mode Pesta dengan jumlah pemain ini.',
};

/** Home screen: posters, rows and the full game grid. */
export const HOME = {
  partyEyebrow: 'MODE PESTA',
  partyTitle: (n: number) => `Pesta ${n} game`,
  partyText: 'Main berturut-turut, poin dijumlah, satu Juara Pesta. Game terakhir poin ganda!',
  partyCta: 'Mulai pesta',
  randomEyebrow: 'BINGUNG PILIH?',
  randomTitle: 'Acak!',
  randomText: 'Biar Hoorah yang memilihkan game untuk kalian.',
  randomCta: 'Putar',
  randomSpinning: 'Memilih…',
  randomPicked: 'Terpilih!',
  rowFit: 'Pas untuk kalian',
  rowFitSub: (n: number) =>
    n > 0
      ? `Bisa dimainkan ${n} pemain sekarang, yang terakhir dimainkan di depan`
      : 'Scan QR dulu untuk bergabung',
  rowMoodSub: (count: number) => `${count} game`,
  allTitle: 'Semua game',
  allTab: 'Semua',
  players: (min: number, max: number) => `${min}–${max} pemain`,
  fitsTwo: 'Cocok untuk kalian berdua',
  fits: 'Cocok untuk kalian',
  needs: (min: number) => `Butuh ${min} pemain`,
  soon: 'Segera',
  empty: 'Belum ada game di sini untuk jumlah pemain ini.',
};

/** Results page during Mode Pesta. */
export const PARTY = {
  eyebrow: (game: number, total: number) => `MODE PESTA · GAME ${game} DARI ${total}`,
  finalEyebrow: 'MODE PESTA · KLASEMEN AKHIR',
  champion: (names: string) => `Juara Pesta: ${names}!`,
  points: (n: number) => `${n} poin`,
  next: (title: string) => `Lanjut: ${title}`,
  again: 'Pesta lagi',
  done: 'Selesai',
  autoNext: (s: number) => `Game berikutnya dalam ${s} detik · Host bisa memilih lain dari HP`,
  finalHint: 'Game terakhir poin ganda sudah dihitung',
  doubleNext: 'Game berikutnya yang terakhir: poin ganda!',
};
