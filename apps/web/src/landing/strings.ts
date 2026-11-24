/** Every text the landing page shows (Bahasa Indonesia). Code and comments stay in English. */
export const STR = {
  pageTitle: 'Kacawbalaw: game pesta di layar mana pun',

  // Hero
  heroChip: 'Gratis untuk 2 pemain',
  heroTitleA: 'Layar apa pun jadi ',
  heroTitleEm: 'konsol pesta.',
  heroTitleB: 'HP jadi stiknya.',
  heroSub: 'Tanpa install, tanpa daftar. Scan, tulis nama, main bareng sampai 16 orang.',
  /** Speech bubbles of the characters around the hero screen, shown one after another. */
  heroReactions: ['Hore!', 'Lagi!', 'Curang!', 'Seru!', 'Ayo!', 'Wih!', 'Gas!', 'Yes!'],
  start: 'Mulai main sekarang',
  startNote: 'Perangkat ini jadi layar utama. Pemain cukup scan QR pakai HP.',
  startAgain: 'Lanjutkan sebagai layar utama',
  startAgainNote: 'Perangkat ini pernah jadi layar utama. Tekan sekali, langsung main lagi.',
  joinWithCode: 'Gabung pakai kode',
  phoneAsScreen: 'Jadikan HP ini layar utama',
  phoneAsScreenNote: 'Lebih seru di layar besar: laptop, tablet, atau Smart TV.',

  // Code entry
  codeTitle: 'Sudah ada layar Kacawbalaw?',
  codeSub: 'Ketik 6 angka yang tampil di layar utama.',
  codeLabel: 'Kode room',
  codePlaceholder: '000 000',
  codeJoin: 'Gabung',
  codeHint: 'Kode berganti setiap kali layar utama dibuka.',
  codePanelTitle: 'Mau ikut main?',
  codePanelText: (host: string) =>
    `Buka ${host} di HP, lalu ketik kode yang tampil di layar utama. Bisa juga langsung scan QR-nya.`,
  close: 'Tutup',

  // Nearby screens (phones only)
  nearbyTitle: 'Ada layar Kacawbalaw di Wi-Fi ini',
  nearbyPlayers: (n: number) => (n > 0 ? `${n} pemain sudah masuk` : 'Belum ada pemain'),
  nearbyCode: (code: string) => `Kode ${code}`,
  nearbyJoin: 'Gabung',
  nearbyJoinLabel: (code: string) => `Gabung ke layar dengan kode ${code}`,
  nearbyOr: 'atau ketik kode',

  // Steps
  stepsTitle: 'Main dalam 3 langkah',
  stepsSub: 'Satu layar besar, beberapa HP, dan teman-teman. Itu saja.',
  steps: [
    {
      t: 'Buka Kacawbalaw di layar',
      d: 'Laptop, PC, tablet, atau Smart TV. Buka situs ini, tekan Mulai main, dan layar itu langsung jadi konsol.',
    },
    {
      t: 'Scan QR pakai HP',
      d: 'Arahkan kamera HP ke QR di layar utama. Tidak ada aplikasi yang perlu dipasang.',
    },
    {
      t: 'HP jadi stik',
      d: 'Tulis nama dan pilih tokohmu, lalu main. Tombol dan joystick muncul di HP masing-masing.',
    },
  ],
  stepLabel: (n: number) => `Langkah ${n}`,
  demoCode: 'Kode',
  dpadOk: 'OK',
  demoWaiting: 'Menunggu pemain',

  // Game showcase
  gamesTitle: (n: number) => `${n} game orisinal`,
  gamesSub: 'Dari lomba 17-an sampai balapan bajaj. Semua dibuat sendiri, semua dimainkan pakai HP.',
  moodAll: 'Semua',
  moodGroup: 'Saring menurut suasana',
  free: 'GRATIS',
  players: (min: number, max: number) => (min === max ? `${min} pemain` : `${min}–${max} pemain`),
  shown: (n: number) => `${n} game ditampilkan`,

  // Mode Pesta
  partyChip: 'Termasuk di Kacaw Pass',
  partyTitle: 'Mode Pesta',
  partySub:
    'Lima game acak berturut-turut. Poin dikumpulkan tiap game, Grand Final jadi penentu, juaranya naik podium.',
  partyPoints: ['5 game acak', 'Poin tiap game', 'Grand Final', 'Podium juara'],
  partySlot: (n: number) => `Game ${n}`,
  partyFinal: 'Grand Final',
  partyChampion: 'Juara pesta',
  partyPts: (n: number) => `${n} poin`,

  // Audience
  audienceTitle: 'Cocok untuk',
  audienceSub: 'Di mana pun ada layar dan orang yang suka seru-seruan.',
  audience: [
    { t: 'Keluarga di rumah', d: 'Dari nenek sampai si kecil, semua cukup pegang HP.' },
    { t: 'Tongkrongan', d: 'Adu heboh bareng teman sampai lupa waktu.' },
    { t: 'Acara kantor', d: 'Pemecah suasana untuk gathering atau acara akhir tahun.' },
    { t: 'Lomba 17-an', d: 'Tarik tambang, makan kerupuk, balap karung. Versi layar besar.' },
    { t: 'Arisan dan reuni', d: 'Kumpul lagi, ketawa lagi. Siapa pun bisa langsung ikut.' },
  ],

  // Devices
  devicesTitle: 'Jalan di layar mana pun',
  devicesSub: 'Layar utama cukup punya browser. HP siapa pun jadi stiknya, Android maupun iPhone.',
  devices: {
    pc: 'PC',
    laptop: 'Laptop',
    tablet: 'Tablet',
    smarttv: 'Smart TV',
    phone: 'HP mana pun',
  },
  roleScreen: 'Layar utama',
  rolePad: 'Stik',
  statGames: 'game',
  statPlayers: 'pemain',
  statInstall: 'install',

  // Pricing
  priceTitle: 'Gratis atau Kacaw Pass',
  priceSub: 'Mulai gratis. Pakai Pass kalau pestanya makin ramai.',
  freeName: 'Gratis',
  freeTag: 'Langsung main',
  freeCta: 'Main gratis',
  freeNote: 'Tanpa akun dan tanpa kartu.',
  freeItems: (players: number, games: number) => [
    `${players} pemain`,
    `${games} game + Game Minggu Ini`,
    'Iklan singkat di antara game',
  ],
  passName: 'Kacaw Pass',
  passPrice: 'Harga segera hadir',
  passItems: (players: number, games: number) => [
    `Sampai ${players} pemain`,
    `Semua ${games} game`,
    'Mode Pesta',
    'Tanpa iklan',
  ],
  trial: (minutes: number) => `Coba gratis ${minutes} menit`,
  trialNote: 'Uji coba dimulai dari layar utama.',
  passCodeNote: 'Sudah punya kode Pass? Host mengetiknya di HP, menu Lainnya.',

  // FAQ
  faqTitle: 'Pertanyaan yang sering muncul',
  faq: [
    {
      q: 'Perlu install aplikasi?',
      a: 'Tidak. Kacawbalaw berjalan di browser modern mana pun. Layar utama cukup membuka situs ini, HP cukup scan QR atau mengetik kode.',
    },
    {
      q: 'Butuh internet apa?',
      a: 'Layar utama dan semua HP perlu tersambung ke internet. Wi-Fi rumah atau paket data sama-sama bisa.',
    },
    {
      q: 'Harus satu Wi-Fi?',
      a: 'Tidak harus. Kalau HP dan layar utama ada di Wi-Fi yang sama, sambungannya langsung dan terasa lebih cepat. Beda jaringan tetap bisa main lewat server Kacawbalaw.',
    },
    {
      q: 'Smart TV apa saja yang bisa?',
      a: 'Smart TV dengan browser modern, misalnya Android TV, Tizen, atau webOS. Kalau browsernya lambat, sambungkan laptop ke Smart TV lewat kabel HDMI lalu buka Kacawbalaw di laptop.',
    },
    {
      q: 'Berapa banyak pemain?',
      a: 'Gratis untuk 2 pemain. Dengan Kacaw Pass, sampai 16 pemain dalam satu room. Sebagian besar game juga bisa dimainkan sendiri.',
    },
    {
      q: 'Aman untuk anak?',
      a: 'Semua game ramah keluarga dan tidak ada obrolan dengan orang asing. Pemain masuk lewat kode dari layar kalian sendiri.',
    },
    {
      q: 'Bagaimana memakai kode Pass?',
      a: 'Host, yaitu pemain pertama yang masuk, membuka menu Lainnya di HP-nya lalu mengetik kode Pass. Room langsung terbuka untuk lebih banyak pemain dan semua game.',
    },
  ],

  // Closing and footer
  closingTitle: 'Siap main malam ini?',
  closingSub: 'Buka Kacawbalaw di layar terbesar yang ada, bagikan QR-nya, lalu biarkan HP yang bekerja.',
  closingStart: 'Mulai main',
  closingPhone: 'Masukkan kode',
  footerCopy: '© Kacawbalaw',
  footerPrivacy: 'Kebijakan privasi',
  footerTerms: 'Syarat dan ketentuan',
  soon: 'segera',

  // Characters peeking next to section titles
  peekDevices: 'Pakai yang ada!',
  peekPrice: 'Ajak semua!',
  peekFaq: 'Ada yang bingung?',
} as const;
