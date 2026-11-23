/** Main-screen text: the Hoorah Pass (trial stage: a shared code from the Hoorah owner), Mode Pesta. */
export const STR = {
  passOn: (seats: number) => `Hoorah Pass aktif! Room bisa sampai ${seats} pemain`,
  hostNow: (name: string) => `${name} sekarang Host`,
  passOff: 'Hoorah Pass sudah berakhir. Pemain yang sudah masuk tetap main.',
  passChip: (until: string) => `Pass sampai ${until}`,
  seatsFull: (used: number, max: number) =>
    `Room penuh (${used}/${max}). Punya kode Hoorah Pass? Ketik di HP yang mau ikut.`,
  seatsPass: (used: number, max: number, until: string) =>
    `Kursi terisi ${used}/${max}. Hoorah Pass aktif sampai ${until}.`,
  partyNone: 'Belum ada game yang pas untuk Mode Pesta dengan jumlah pemain ini.',
};

/** Home screen: the focused game up top, quick starts, shelf tabs and one grid of cards. */
export const HOME = {
  partyEyebrow: 'MODE PESTA',
  partyTitle: (n: number) => `Pesta ${n} game`,
  partyText: 'Main berturut-turut, poin dijumlah, satu Juara Pesta. Game terakhir poin ganda!',
  partyButton: 'Mode Pesta',
  randomEyebrow: 'BINGUNG PILIH?',
  randomTitle: 'Acak!',
  randomText: 'Biar Hoorah yang memilihkan game untuk kalian.',
  randomButton: 'Acak game',
  randomSpinning: 'Memilih…',
  randomPicked: 'Terpilih!',
  shelfFit: 'Pas untuk kalian',
  shelvesLabel: 'Kelompok game',
  allTab: 'Semua',
  hintFit: (n: number) => (n > 0 ? `Bisa dimainkan ${n} pemain sekarang` : 'Scan QR dulu untuk bergabung'),
  hintCount: (count: number) => `${count} game`,
  hintRows: (from: number, to: number, total: number) => `Baris ${from}–${to} dari ${total}`,
  players: (min: number, max: number) => (min === max ? `${min} pemain` : `${min}–${max} pemain`),
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

/** "Cara main" tutorial on the main screen. */
export const TUTORIAL = {
  eyebrow: 'Cara main',
  originTitle: 'Asal-usul',
  phone: 'Di HP',
  waitPhones: 'Tekan "Paham!" di HP kalau sudah mengerti',
  hostSkip: (name: string) => `${name} bisa melewati dari HP`,
  remoteSkip: 'OK: lewati',
  remoteClose: 'OK: tutup',
  loading: 'Menyiapkan cara main…',
  step: (i: number, n: number) => `${i} dari ${n}`,
} as const;
