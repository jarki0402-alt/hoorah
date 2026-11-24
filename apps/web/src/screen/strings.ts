/** Main-screen text: the Kacaw Pass (trial stage: a shared code from the Kacawbalaw owner), Mode Pesta. */
export const STR = {
  passOn: (seats: number) => `Kacaw Pass aktif! Room bisa sampai ${seats} pemain`,
  hostNow: (name: string) => `${name} sekarang Host`,
  passOff: 'Kacaw Pass sudah berakhir. Pemain yang sudah masuk tetap main.',
  passHint: 'Ketik kode Pass di HP Host: menu, lalu "Punya kode Kacaw Pass?"',
  passChip: (until: string) => `Pass sampai ${until}`,
  seatsFull: (used: number, max: number) =>
    `Room penuh (${used}/${max}). Punya kode Kacaw Pass? Ketik di HP yang mau ikut.`,
  seatsPass: (used: number, max: number, until: string) =>
    `Kursi terisi ${used}/${max}. Kacaw Pass aktif sampai ${until}.`,
  partyNone: 'Belum ada game yang pas untuk Mode Pesta dengan jumlah pemain ini.',
  about: 'Tentang Kacawbalaw',
};

/** Home screen: the focused game up top, quick starts, shelf tabs and one grid of cards. */
export const HOME = {
  partyEyebrow: (n: number) => `MODE PESTA · ${n} GAME`,
  partyTitle: 'Mode Pesta',
  partyText: (n: number) => `${n} game acak, poin dikumpulkan, juara diumumkan di Grand Final.`,
  partySub: 'Isinya diacak ulang setiap kali mulai. Game terakhir poin ganda!',
  partyCard: 'Mode Pesta',
  partyGo: 'Mulai pesta',
  randomEyebrow: 'BINGUNG PILIH?',
  randomTitle: 'Acak!',
  randomText: 'Putar roda, biar Kacawbalaw yang memilihkan game untuk kalian.',
  randomCard: 'Acak game',
  randomGo: 'Putar roda',
  openGo: 'Lihat game',
  wheelEyebrow: 'ACAK!',
  wheelSpinning: 'Rodanya berputar…',
  wheelPicked: 'Terpilih',
  wheelPlay: 'Main sekarang',
  wheelAgain: 'Putar lagi',
  wheelHint: 'Kembali: tutup',
  shelfFit: 'Pas untuk kalian',
  shelvesLabel: 'Kelompok game',
  allTab: 'Semua',
  hintFit: (n: number) => (n > 0 ? `Bisa dimainkan ${n} pemain sekarang` : 'Scan QR dulu untuk bergabung'),
  hintCount: (count: number) => `${count} game`,
  hintRows: (from: number, to: number, total: number) => `Baris ${from}–${to} dari ${total}`,
  players: (min: number, max: number) => (min === max ? `${min} pemain` : `${min}–${max} pemain`),
  needs: (min: number) => `Butuh ${min} pemain`,
  phoneHold: (o: 'Tegak' | 'Mendatar') => `HP ${o.toLowerCase()}`,
  soon: 'Segera',
  empty: 'Belum ada game di sini untuk jumlah pemain ini.',
};

/** Mode Pesta: the results page during a party and the party screen between games. */
export const PARTY = {
  eyebrow: (game: number, total: number, title: string) =>
    `MODE PESTA · GAME ${game} DARI ${total} · ${title}`,
  toTable: 'Lihat klasemen',
  toChampion: 'Lihat juara',
  done: 'Selesai',
  autoNext: (s: number, final: boolean) =>
    final ? `Juara diumumkan dalam ${s} detik` : `Klasemen dalam ${s} detik · Host bisa memilih lain dari HP`,
  pickNext: 'Pilih langkah berikutnya',
  // Party screen
  label: 'MODE PESTA',
  startTitle: 'Pesta dimulai!',
  startText: (n: number) => `${n} game acak, poin dikumpulkan, juara diumumkan di Grand Final.`,
  afterTitle: (game: number, total: number) => `Setelah game ${game} dari ${total}`,
  slot: (i: number) => `GAME ${i}`,
  grandFinal: 'GRAND FINAL',
  doubleNote: 'Poin ganda',
  rolling: 'Mengacak…',
  points: (n: number) => `${n} poin`,
  gained: (n: number) => `+${n}`,
  overtake: (by: string, passed: string) => `${by} menyalip ${passed}!`,
  startsIn: (s: number) => `Mulai dalam ${s} detik`,
  play: 'Main sekarang',
  leave: 'Keluar pesta',
  hint: 'OK: main sekarang · Kembali: keluar pesta',
  championEyebrow: 'JUARA PESTA',
  championTitle: (names: string) => names,
  championShared: 'Juara bersama!',
  noScore: 'Belum ada poin',
  again: 'Pesta lagi',
  home: 'Ke beranda',
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

/** The Kacaw Pass offer, the free trial and the PASS chips (owner 2026-11-23). */
export const OFFER = {
  eyebrow: 'HOORAH PASS',
  title: 'Buka semua game dengan Kacaw Pass',
  reasonGame: (title: string) => `${title} butuh Kacaw Pass`,
  reasonParty: 'Mode Pesta butuh Kacaw Pass',
  reasonFull: 'Room gratis cukup untuk 2 pemain',
  reasonEnded: 'Coba gratis sudah selesai',
  benefits: (games: number) => [`Semua ${games} game dan Mode Pesta`, 'Main sampai 16 orang', 'Tanpa iklan'],
  trial: (minutes: number) => `Coba gratis ${minutes} menit`,
  code: 'Punya kode Pass? Ketik di HP',
  later: 'Nanti saja',
  starting: 'Menyalakan coba gratis…',
  hint: 'Kembali: tutup',
  trialOn: (seats: number) => `Coba gratis aktif! Semua game terbuka, sampai ${seats} pemain`,
  trialOff: 'Coba gratis sudah selesai. Game gratis tetap bisa dimainkan.',
  trialUsed: 'Coba gratis sudah dipakai di layar ini',
  trialRateLimited: 'Terlalu sering mencoba. Coba lagi sebentar lagi.',
  trialFailed: 'Belum tersambung ke server. Coba lagi sebentar lagi.',
  /** Top bar during the trial. */
  trialChip: (left: string) => `Coba gratis · ${left}`,
  /** Top bar: what the room has (owner 2026-11-23: see at a glance whether the Pass is on). */
  chipFree: (seats: number) => `Gratis · ${seats} pemain`,
  chipPassLeft: (clock: string) => `PASS · sisa ${clock}`,
  chipPassUntil: (until: string) => `PASS · sampai ${until}`,
  chipOpen: 'Uji coba · semua terbuka',
  /** Reminders before a trial or Pass ends. */
  endsSoon: (what: 'trial' | 'pass', minutes: number) =>
    `${what === 'pass' ? 'Kacaw Pass' : 'Coba gratis'} habis dalam ${minutes} menit`,
  passEnded: 'Kacaw Pass sudah berakhir. Game yang sedang jalan tetap selesai.',
  reasonPassEnded: 'Kacaw Pass sudah berakhir',
  minutes: (n: number) => `${n} menit`,
  seconds: (n: number) => `${n} detik`,
  /** Play button on the detail page of a locked game. */
  playLocked: 'Buka dengan Pass',
  /** Card chips. */
  chipPass: 'PASS',
  chipWeekly: 'GRATIS MINGGU INI',
} as const;

/** The seats on the join page. */
export const JOIN = {
  picking: 'Memilih tokoh…',
  hostPicking: 'Memilih game dari HP',
  ready: 'Siap main',
  away: 'Terputus, menunggu…',
};

/**
 * "Main bareng teman jauh" (long-distance play, owner 2026-11-24): a second main screen far away
 * follows this one, its phones join the same room, people talk over their own call.
 */
export const REMOTE = {
  button: 'Main bareng teman jauh',
  buttonSub: 'LDR? Tetap main bareng!',
  eyebrow: 'Main bareng teman jauh',
  title: 'Layar temanmu ikut main',
  linkLabel: 'Link untuk temanmu',
  steps: [
    'Kirim link ini ke temanmu',
    'Buka di laptop atau Smart TV di sana',
    'HP di sana scan QR di layar itu',
    'Ngobrol lewat telepon atau video call',
  ],
  waiting: 'Menunggu layar teman…',
  connected: (n: number) => (n > 1 ? `${n} layar teman tersambung` : 'Layar teman tersambung'),
  /* How the screens reach each other: straight between the two places, or through the server. */
  pathDirect: 'Jalur langsung',
  pathSome: (direct: number, total: number) => `Jalur langsung ${direct} dari ${total}`,
  pathServer: 'Lewat server',
  pathRtt: (ms: number) => `${ms} ms`,
  gamesNote: 'Sementara ini baru sebagian game yang bisa dimainkan jarak jauh.',
  copy: 'Salin link',
  copied: 'Link disalin',
  copyFailed: 'Gagal menyalin. Ketik link-nya saja.',
  stop: 'Putuskan layar teman',
  stopped: 'Layar teman diputus. Link lama tidak berlaku lagi.',
  offline: 'Belum tersambung ke server. Coba lagi sebentar.',
  close: 'Selesai',
  qrLabel: 'QR Code link layar teman',
  chipOn: 'Teman jauh tersambung',
  tag: 'Belum bisa jarak jauh',
  notYet: (title: string) => `${title} belum bisa dimainkan jarak jauh`,
  detailNote: 'Game ini belum bisa dimainkan bareng layar teman jauh. Pilih game bertanda jarak jauh.',
  detailOk: 'Bisa dimainkan bareng layar teman jauh',
  /* On the far-away main screen. */
  farChip: 'Layar teman jauh',
  farHost: (name: string) => `Host: ${name}`,
  farJoin: 'Scan untuk ikut',
  farConnecting: 'Menyambung ke layar temanmu…',
  farReconnecting: 'Menyambung ulang…',
  farWaitTitle: 'Menunggu layar utama temanmu',
  farWaitText: 'Layar di sana sedang terputus. Begitu tersambung lagi, layar ini ikut otomatis.',
  farUnsupported: 'Game ini belum bisa ditonton dari jauh',
  farUnsupportedText: 'HP kalian tetap bisa ikut main. Lihat layar temanmu lewat video call.',
  farEnd: {
    stopped: 'Layar temanmu menghentikan main jarak jauh. Minta link baru kalau mau lanjut.',
    gone: 'Link ini sudah tidak berlaku. Minta link baru ke temanmu.',
    full: 'Sudah ada 3 layar teman di room ini. Mencoba lagi sebentar lagi…',
    limited: 'Terlalu banyak percobaan. Mencoba lagi sebentar lagi…',
  },
  farEndTitle: 'Sambungan berakhir',
  retry: 'Coba lagi',
};
