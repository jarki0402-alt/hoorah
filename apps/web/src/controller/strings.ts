/** Player-facing text of the Host remote, the game picker and the screen-mode prompts. */
export const STR = {
  back: 'Kembali',
  home: 'Beranda',
  pickGame: 'Pilih game',
  changeGame: 'Ganti game',

  pickerTitle: 'Pilih game',
  pickerSub: (n: number) => `${n} pemain di room. Ketuk game untuk membuka detailnya di layar.`,
  pickerClose: 'Tutup, kembali ke panah',
  pickerArrows: 'Pakai panah',
  tabFit: 'Pas untuk kalian',
  onScreen: 'DI LAYAR',
  lastPlayed: 'terakhir dimainkan',
  players: (min: number, max: number) => `${min}–${max} pemain`,
  needPlayers: (min: number) => `Butuh ${min}+ pemain`,
  pickerEmpty: 'Belum ada game yang pas untuk jumlah pemain ini. Coba tab lain.',
  pickerLoading: 'Memuat daftar game…',

  fullTitle: 'Main layar penuh',
  fullBody: 'Ketuk supaya HP jadi layar penuh: tombol lebih lega dan game mendatar berputar otomatis.',
  fullGo: 'Layar penuh',
  fullLater: 'Nanti saja',

  rotateTitle: 'Putar HP-mu',
  rotateBody: 'Game ini dimainkan mendatar. Pegang HP menyamping.',
  rotateBodyPortrait: 'Game ini dimainkan tegak. Pegang HP berdiri.',
  rotateIos: 'Kalau tidak ikut berputar, matikan Kunci Rotasi di Pusat Kontrol.',
  rotateGo: 'Layar penuh & putar otomatis',
  keepPortrait: 'Tetap tegak',
  keepLandscape: 'Tetap mendatar',

  // Directional pad (`pad` view)
  steerLeft: 'Belok kiri',
  steerRight: 'Belok kanan',
  steerHint: 'Tahan kiri atau kanan untuk belok',
  up: 'Atas',
  down: 'Bawah',
  left: 'Kiri',
  right: 'Kanan',
  swipeLabel: 'Area usap',
  swipeHint: 'Usap ke mana saja di sini',
  stickLabel: 'Joystick: seret ke arah tujuan',
  stickAnywhere: 'Sentuh di mana saja di sini, lalu geser',
  carrying: 'Dibawa',

  // Code page and nearby screens
  codeTitle: 'Masukkan kode',
  codeSub: 'Ketik 6 angka yang ada di layar utama.',
  codeNote: 'Kode berganti setiap kali layar utama dibuka.',
  codeLabel: 'Kode room',
  nearbyTitle: 'Layar Hoorah di Wi-Fi ini',
  nearbyEmpty: 'Belum ada yang main',
  nearbyJoin: 'Gabung',
  nearbyPlayers: (names: string[]) =>
    names.length ? `${names.join(', ')} sudah di sini` : 'Belum ada pemain',
  orTypeCode: 'atau ketik kode',
  codeChip: 'Kode',

  // Reactions on waiting screens
  reactCheer: 'Sorak!',
  reactBoo: 'Huuu~',
  reactNote: 'Reaksimu muncul di layar utama',

  // Word keyboard (`word` view)
  wordDelete: 'Hapus',
  wordSend: 'Kirim',
  wordPlaceholder: 'Ketik kata…',
  wordSending: 'Mengirim…',
  wordLives: (left: number, total: number) => `Nyawa ${left} dari ${total}`,

  // Hoorah Pass (trial stage: a shared code from the Hoorah owner)
  passAsk: 'Punya kode Hoorah Pass?',
  passTitle: 'Kode Hoorah Pass',
  passBody: 'Ketik kode dari pemilik Hoorah. Room ini terbuka untuk lebih banyak pemain selama Pass berlaku.',
  passLabel: 'Kode Pass',
  passPlaceholder: 'Contoh: SABTU16',
  passGo: 'Pakai Pass',
  passJoin: 'Pakai Pass & masuk',
  passSending: 'Memeriksa…',
  passClose: 'Tutup',
  passOk: (seats: number, until: string) =>
    `Pass aktif: room bisa sampai ${seats} pemain, berlaku sampai ${until}.`,
  passErr: {
    invalid: 'Kode Pass tidak dikenal. Periksa lagi hurufnya.',
    expired: 'Pass ini sudah berakhir. Minta kode baru ke pemilik Hoorah.',
    busy: 'Pass ini sedang dipakai di room lain sampai batasnya.',
    rate_limited: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  },
  fullTitleRoom: 'Room penuh',
  fullBodyRoom: 'Paket gratis untuk 2 pemain. Punya kode Hoorah Pass? Ketik di sini supaya bisa ikut main.',
  passInvalidTitle: 'Kode Pass tidak berlaku',
  passExpiredTitle: 'Pass sudah berakhir',
  passBusyTitle: 'Pass sedang penuh',
  seatsFull: (used: number, max: number) =>
    `Room penuh (${used}/${max}). Kursi tambahan terbuka dengan Hoorah Pass.`,
  seatsFree: (used: number, max: number) =>
    `Kursi terisi ${used}/${max}. Pemain baru ikut mulai giliran atau game berikutnya.`,
  seatsPass: (used: number, max: number, until: string) =>
    `Kursi terisi ${used}/${max}. Hoorah Pass aktif sampai ${until}.`,
};
