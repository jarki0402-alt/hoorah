/** Lab Kontrol texts (Bahasa Indonesia). */
export const STR = {
  title: 'Lab Kontrol',
  lead: 'Coba rasa kontrol langsung di HP ini, tanpa jaringan. Geser angka sampai pas, lalu tekan "Pakai setelan ini".',
  scopeNote:
    'Setelan disimpan di browser ini saja. Joystick dan usap berlaku untuk HP ini. Setelan Lari Terus dan Rusun berlaku di perangkat layar utama: buka /lab/ juga di perangkat layar lalu tekan Pakai, atau kirim angkanya ke developer.',
  overrideOn: 'Memakai setelan dari Lab',
  overrideOff: 'Memakai setelan bawaan',

  tabs: { stick: 'Joystick', swipe: 'Usap', haptic: 'Getar', rusun: 'Rusun', sound: 'Suara' },

  /* Save bar */
  save: 'Pakai setelan ini',
  reset: 'Kembali ke bawaan',
  saved: 'Tersimpan. Kirim angka ini ke developer:',
  resetDone: 'Kembali ke setelan bawaan.',
  copy: 'Salin angka',
  copied: 'Tersalin',
  copyFailed: 'Tidak bisa menyalin otomatis, tekan lama teksnya untuk menyalin',

  /* Joystick */
  stickHelp:
    'Sama seperti di game: taruh jempol di mana saja di separuh kiri kotak bawah, lalu geser. Tokoh di atas bergerak mengikuti. Tombol kanan bisa ditekan sambil menggeser.',
  stickRestHelp: 'Sentuh separuh kiri',
  stickBase: 'Alas joystick',
  stickBaseFixed: 'Tetap di titik sentuh',
  stickBaseFollow: 'Mengikuti jempol',
  stickBaseHint:
    'Tetap (bawaan, seperti Roblox): alas diam di tempat jempol mendarat, kenop berhenti di batas. Mengikuti: alas ikut terseret jika jempol melewati batas.',
  demoButtons: { main: 'Lompat', second: 'Dorong', third: 'Lempar' },
  demoPressed: (name: string) => `tombol ${name}`,
  stickZone: 'Area joystick: sentuh dan geser',
  stickArena: 'Arena uji joystick',
  stickRadius: 'Jarak jempol untuk kecepatan penuh',
  stickDead: 'Zona mati di tengah',
  stickCurve: 'Percepatan respons',
  stickCurveHint: 'Kecil = cepat ngebut, besar = lebih halus di awal',
  stickOut: (x: number, y: number, p: number) => `Arah ${x.toFixed(2)}, ${y.toFixed(2)} · tenaga ${p}%`,
  stickIdle: 'Belum disentuh',

  /* Swipe */
  swipeHelp: 'Usap di kotak bawah: kiri/kanan pindah jalur, atas lompat, bawah merunduk, ketuk juga lompat.',
  swipeZone: 'Area usap: usap ke satu arah',
  swipePreview: 'Pratinjau Lari Terus',
  swipeDistance: 'Jarak usap (selalu terhitung)',
  swipeFlickDistance: 'Jarak usap cepat',
  swipeFlickSpeed: 'Kecepatan jari untuk usap cepat',
  swipeTapPx: 'Gerak maksimal ketukan',
  runnerHeading: 'Lari Terus',
  laneTime: 'Lama pindah jalur',
  jumpV: 'Kecepatan naik lompat',
  gravity: 'Gravitasi saat naik',
  fallMul: 'Turun lebih cepat',
  fallMulHint: '1 = turun sama cepat dengan naik, lebih besar = mendarat lebih cepat',
  hang: 'Melayang di puncak',
  lagCatch: 'Pengejar jeda lompatan',
  jumpShape: (air: number, peak: number) => `Melayang ${air.toFixed(2)} dtk · tinggi ${peak.toFixed(2)} m`,
  lastSwipe: (dir: string, px: number, speed: number, ms: number) =>
    `Terakhir: ${dir} · ${px} px · ${speed.toFixed(2)} px/ms · terdeteksi ${ms} ms setelah sentuh`,
  lastTap: (ms: number) => `Terakhir: ketuk (lompat) · ${ms} ms`,
  noSwipe: 'Belum ada usapan',
  dirName: { up: 'atas', down: 'bawah', left: 'kiri', right: 'kanan' },
  runStats: (m: number, trips: number) => `${m} m · tersandung ${trips}x`,
  restart: 'Ulang lari',

  /* Rusun */
  rusunHelp:
    'Ayunan crane Rusun. Rusun berjalan di layar utama, jadi buka halaman ini di perangkat layar utama lalu tekan Pakai.',
  rusunPreview: 'Pratinjau ayunan Rusun',
  rusunFloor: 'Pratinjau di lantai',
  rusunNow: (floor: number, s: number) =>
    `Lantai ${floor}: satu ayunan bolak-balik ${s.toFixed(2)} dtk (${(s / 2).toFixed(2)} dtk per sisi)`,
  rusunHeading: 'Ayunan',
  rusunPeriod: 'Lama ayunan awal (bolak-balik)',
  rusunPeriodHint: (side: number) => `${side.toFixed(2)} dtk per sisi`,
  rusunSpeedup: 'Makin cepat per lantai',
  rusunMin: 'Ayunan tercepat',
  rusunSummary: (p1: number, p10: number, p20: number, from: number) =>
    `Lantai 1: ${p1.toFixed(2)} dtk · lantai 10: ${p10.toFixed(2)} dtk · lantai 20: ${p20.toFixed(2)} dtk${from > 0 ? ` · tercepat mulai lantai ${from}` : ''}`,

  /* Haptic */
  hapticHelp:
    'Tekan tiap tombol dan rasakan. Laporkan huruf tombol yang terasa bergetar, misalnya "A, C, F terasa; E tidak".',
  method: {
    vibrate: 'HP ini: getar Android (Vibration API)',
    switch: 'HP ini: iPhone, getar lewat saklar sistem (iOS 18 ke atas, getaran sistem harus aktif)',
    none: 'HP ini: tidak bisa bergetar, diganti kedipan di tepi layar',
  },
  tests: {
    single: 'Tik tunggal (saat tombol diklik)',
    burst3: 'Tik beruntun 3x',
    burst6: 'Tik beruntun 6x',
    burst10: 'Tik beruntun 10x',
    pointerDown: 'Tik saat jari menyentuh (pointerdown)',
    touchStart: 'Tik saat jari menyentuh (touchstart)',
    pointerUp: 'Tik saat jari diangkat (pointerup)',
    touchEnd: 'Tik saat jari diangkat (touchend)',
    move: 'Tik saat geser (tiap beberapa milimeter)',
    pattern: 'Pola game: tersandung (dua tik)',
  },
  moveZone: 'Geser jari di sini',
  tickGap: 'Jarak antar tik beruntun',
  flashLabel: 'Kedipan pengganti getar',
  flash: { auto: 'Otomatis', always: 'Selalu', off: 'Mati' },
  releaseFallback: 'Ulangi tik saat jari diangkat jika sentuhan tidak bergetar (iPhone)',
  on: 'Nyala',
  off: 'Mati',
  pressed: (n: number) => `ditekan ${n}x`,

  units: { px: 'px', ms: 'ms', s: 'dtk', speed: 'px/ms', mps: 'm/dtk', mps2: 'm/dtk²', pct: '%', x: 'x' },
} as const;

export const DIAG = {
  title: 'Diagnosa getar iPhone',
  intro: 'Coba 1 sampai 4 satu per satu, lalu kabari nomor mana yang terasa bergetar.',
  env: (method: string, hasSwitch: boolean) =>
    `Cara getar terdeteksi: ${method}. Saklar Safari: ${hasSwitch ? 'ada' : 'tidak ada'}.`,
  visible: 'Ketuk saklar asli ini langsung',
  hiddenHead: 'Saklar tersembunyi (cara pustaka umum)',
  hiddenOff: 'Saklar transparan di luar layar',
  overlay: 'Tombol yang sebenarnya saklar transparan',
  done: (n: number) => `Nomor ${n} ditekan.`,
} as const;

/** "Suara" tab: the Kampung Siluman sounds as the game plays them. */
export const SOUND = {
  help: 'Suara Kampung Siluman persis seperti di game. Tekan untuk mendengar.',
  play: 'Putar',
  items: {
    night: { title: 'Malam tiba', when: 'Semua tutup mata', what: 'Gong panjang + jangkrik' },
    growl: { title: 'Giliran Siluman', when: 'Siluman buka mata', what: 'Napas lalu auman macan' },
    genta: { title: 'Giliran Dukun', when: 'Dukun buka mata', what: 'Genta dipukul tiga kali' },
    flute: { title: 'Giliran Tabib', when: 'Tabib buka mata', what: 'Suling panjang bergema' },
    heart: {
      title: 'Detak jantung',
      when: 'Selama Siluman belum memilih',
      what: 'Makin cepat menjelang waktu habis',
    },
    rooster: { title: 'Pagi tiba', when: 'Semua buka mata', what: 'Kukuruyuk panjang (versi baru)' },
    kentongan: { title: 'Ada korban', when: 'Setelah ayam, jika ada korban', what: 'Kentongan tanda bahaya' },
    birds: { title: 'Malam aman', when: 'Setelah ayam, jika tidak ada korban', what: 'Kicau burung' },
    'win-village': { title: 'Warga menang', when: 'Akhir permainan', what: 'Bonang naik + gong' },
    'win-siluman': { title: 'Siluman menang', when: 'Akhir permainan', what: 'Auman + gong' },
  },
} as const;
