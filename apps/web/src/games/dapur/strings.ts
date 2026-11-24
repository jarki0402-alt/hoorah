/** Every player-facing text of Dapur Heboh (Bahasa Indonesia). */
import type { ItemLook } from './items';
import type { Difficulty, KitchenId } from './kitchens';
import type { DishId } from './recipes';

/** m:ss, rounding up so "0:01" shows until the very end. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 2480 -> "2.480" (Indonesian thousands separator). */
export function formatScore(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export const STR = {
  gameTitle: 'Dapur Heboh',
  loadError: 'Game tidak bisa dimuat. Coba lagi.',

  kitchens: {
    warung: { name: 'Warung Pagi', desc: 'Satu ruangan untuk belajar. Lempar jadi jalan pintas.' },
    terbelah: { name: 'Dapur Terbelah', desc: 'Pembatas di tengah. Bahan harus dilempar ke seberang.' },
    gerobak: { name: 'Gerobak Kembar', desc: 'Dua gerobak kuliner. Di Heboh, jaraknya bergeser.' },
    sibuk: { name: 'Jam Sibuk', desc: 'Terbelah, pesanan beruntun, kompor pindah posisi.' },
  } satisfies Record<KitchenId, { name: string; desc: string }>,

  levels: {
    santai: { name: 'Santai', desc: 'Selalu tertangkap' },
    normal: { name: 'Normal', desc: 'Tangan penuh = kotor' },
    heboh: { name: 'Heboh', desc: 'Pecah, tumpah, kebakaran' },
  } satisfies Record<Difficulty, { name: string; desc: string }>,

  dishes: {
    burger: 'Burger',
    salad: 'Salad',
    kentang: 'Kentang goreng',
    nasi: 'Nasi goreng telur',
    soda: 'Soda',
    paket: 'Paket burger',
  } satisfies Record<DishId, string>,

  items: {
    roti: 'Roti',
    daging: 'Daging mentah',
    dagingMatang: 'Daging matang',
    tomat: 'Tomat',
    tomatPotong: 'Tomat potong',
    selada: 'Selada',
    seladaPotong: 'Selada potong',
    kentang: 'Kentang',
    kentangPotong: 'Kentang potong',
    kentangGoreng: 'Kentang goreng',
    telur: 'Telur',
    nasi: 'Nasi',
    nasiGoreng: 'Nasi goreng',
    gosong: 'Makanan gosong',
    piring: 'Piring kosong',
    piringIsi: 'Piring berisi',
    burger: 'Burger',
    salad: 'Salad',
    gelas: 'Gelas kosong',
    soda: 'Soda',
    pemadam: 'Pemadam api',
  } satisfies Record<ItemLook, string>,

  sideTag: ['SISI PERSIAPAN', 'SISI MASAK'] as const,
  sideName: ['Sisi Persiapan', 'Sisi Masak'] as const,
  sideTask: [
    'Ambil bahan, potong, cuci piring, lalu lempar.',
    'Masak, isi soda, susun piring, antar ke loket.',
  ] as const,
  sideShort: ['ambil, potong, cuci', 'masak, isi soda, antar'] as const,
  openTag: 'SATU RUANGAN',
  openTask: 'Semua koki bebas bergerak. Lempar ke teman terdekat sebagai jalan pintas.',
  openShort: 'semua tugas',
  wallLabel: 'TIDAK BISA DILEWATI',
  basketLabel: {
    roti: 'ROTI',
    daging: 'DAGING',
    tomat: 'TOMAT',
    selada: 'SELADA',
    kentang: 'KENTANG',
    telur: 'TELUR',
    nasi: 'NASI',
  } as Record<string, string>,
  stoveLabel: 'KOMPOR',
  wokLabel: 'WAJAN',
  fryerLabel: 'PENGGORENG',
  boardLabel: 'TALENAN',
  sinkLabel: 'CUCI PIRING',
  rackLabel: 'PIRING',
  trashLabel: 'SAMPAH',
  passLabel: 'LOKET ANTAR',
  passSlot: 'TARUH PESANAN',
  sodaLabel: 'SODA',
  drinksLabel: 'MINUMAN',
  cupsLabel: 'GELAS',

  /* setup (main screen) */
  setupEyebrow: 'SATU TIM · 1–8 KOKI',
  setupTagline: 'Bagi tugas, lempar bahan ke seberang, antar pesanan sebelum pelanggan pulang.',
  cooksPill: (n: number) => `${n} koki`,
  recommendedPill: (kitchen: string) => `${kitchen} disarankan`,
  kitchenNo: (n: number) => `DAPUR ${n}`,
  recommended: 'Disarankan',
  bestNone: 'Belum ada bintang',
  best: 'Terbaik',
  sidesTitle: 'PEMBAGIAN SISI',
  sidesHint: 'Tukar posisi dari HP Host',
  sidesOpen: 'Satu ruangan: semua koki bebas bergerak, tanpa pembagian sisi.',
  throwArc: 'LEMPAR',
  levelTitle: 'TINGKAT KESULITAN',
  startButton: 'Mulai masak',
  hostPicks: (name: string) => `${name} memilih dari HP`,

  /* phone menus */
  menuEyebrow: (i: number, n: number) => `DAPUR HEBOH · ${i}/${n}`,
  menuKitchenTitle: 'Pilih dapur',
  menuKitchenHint: 'Ketuk dapur, lalu Lanjut',
  menuLevelTitle: 'Tingkat kesulitan',
  menuLevelHint: 'Santai untuk belajar, Heboh untuk yang berani',
  menuSidesTitle: 'Pembagian sisi',
  menuSidesHint: 'Ketuk nama untuk memindahkan ke sisi seberang',
  menuNext: 'Lanjut',
  menuBack: 'Kembali',
  menuStart: 'Mulai masak',
  menuWaiting: (name: string) => `${name} sedang menyiapkan dapur`,
  menuSideSub: (side: string) => `Sekarang di ${side}`,
  levelSub: (desc: string, chilies: number) => `${chilies} cabai · ${desc}`,

  /* main screen, play */
  timeLabel: 'WAKTU',
  scoreLabel: 'SKOR',
  countdownLabel: 'Cari kokimu!',
  go: 'Masak!',
  warning: '30 detik lagi!',
  timeUp: 'Waktu habis!',
  moveWarn: 'Kompor pindah!',
  moveWarnSub: 'Lihat tanda merah',
  moved: 'Kompor sudah pindah',
  ticketNew: 'Pesanan baru',
  ready: 'Siap tangkap!',
  throwPill: 'Lempar!',
  hitBubble: 'Tangan penuh, baju kotor!',
  nearlyBurnt: 'Hampir gosong!',
  burnt: 'Gosong!',
  fire: 'Kebakaran!',
  fireOut: 'Padam!',
  broke: 'Pecah!',
  spilled: 'Tumpah!',
  missed: 'Pelanggan pulang!',
  wrongDish: 'Tidak ada yang pesan ini',
  noPlates: 'Piring habis, cuci dulu!',
  served: (points: number) => `+${points}`,
  tip: (tip: number) => `tip +${tip}`,
  penalty: (n: number) => `-${n}`,
  partial: 'Satu lagi!',
  hintStart: 'Ambil bahan, olah, lalu antar ke loket. Lempar untuk mengoper!',
  feedServed: (name: string, dish: string) => `${name} mengantar ${dish}`,
  feedMissed: (dish: string) => `${dish} terlewat`,
  feedFire: 'Api! Ambil pemadam merah',
  feedFireOut: (name: string) => `${name} memadamkan api`,

  /* results (main screen) */
  resultEyebrow: (no: number, kitchen: string) => `DAPUR ${no} · ${kitchen.toUpperCase()}`,
  resultTitle: ['Dapur kacau!', 'Lumayan!', 'Dapur aman!', 'Dapur juara!'] as const,
  resultSub: (missed: number): string =>
    missed === 0
      ? 'Semua pelanggan pulang kenyang.'
      : missed === 1
        ? 'Pelanggan kenyang, cuma satu yang pulang kecewa.'
        : `${missed} pelanggan pulang kecewa.`,
  teamScore: 'SKOR TIM',
  toNextStar: (left: number, star: number) =>
    `Kurang ${formatScore(left)} lagi untuk bintang ${['pertama', 'kedua', 'ketiga'][star - 1] ?? ''}.`,
  allStars: 'Tiga bintang! Dapur terbaik malam ini.',
  statDelivered: 'pesanan terkirim',
  statMissed: 'pesanan terlewat',
  statTip: 'tip kecepatan',
  awardsTitle: 'PENGHARGAAN DAPUR',
  awardsNone: 'Belum ada penghargaan kali ini.',
  newBest: 'Rekor bintang baru!',
  resultSoon: 'Hasil lengkap sebentar lagi',
  shellTitle: (stars: number) =>
    `${['Dapur kacau!', 'Lumayan!', 'Dapur aman!', 'Dapur juara!'][stars] ?? ''} ${stars} bintang`,
  shellSub: (kitchen: string, score: number, delivered: number) =>
    `${kitchen} · Skor tim ${formatScore(score)} · ${delivered} pesanan terkirim`,
  rankLabel: (score: number) => `Skor tim ${formatScore(score)}`,

  /* phone, play */
  buttons: { grab: 'Ambil', grabSub: 'atau taruh', work: 'Kerja', workSub: 'tahan', throw: 'Lempar' },
  statTime: 'Waktu',
  statScore: 'Skor',
  countdownTitle: 'Siap masak!',
  countdownSub: (side: string) => `Kamu di ${side}`,
  countdownSubOpen: 'Semua koki di satu ruangan',
  alertCatch: 'Siap tangkap!',
  alertCatchBody: (item: string, from: string) => `${item} dari ${from}`,
  alertFullBody: 'Tanganmu penuh, taruh dulu!',
  alertHit: 'Bajumu kotor!',
  alertHitBody: 'Cuci di bak cuci dengan tangan kosong',
  alertFire: 'Ada api!',
  alertFireBody: 'Ambil pemadam merah, tahan Kerja',
  stagger: 'Aduh!',

  hint: {
    chop: (item: string) => `Potong ${item.toLowerCase()} di talenan`,
    chopping: 'Tahan Kerja sampai terpotong',
    throwTo: (name: string) => `Lempar ke ${name}`,
    throwAcross: 'Lempar ke seberang',
    cookMeat: 'Masak daging di kompor',
    fry: 'Goreng di penggorengan',
    wok: 'Masukkan ke wajan',
    toPlate: 'Taruh di piring',
    serve: 'Antar ke loket',
    finishPlate: 'Lengkapi isi piringnya',
    fillPlate: 'Isi piring dengan masakan',
    fillSoda: 'Isi soda: tahan Kerja di mesin soda',
    sodaFull: 'Penuh! Lepas Kerja, antar ke loket',
    trash: 'Buang ke tempat sampah',
    douse: 'Padamkan api: tahan Kerja',
    getFood: 'Ambil bahan dari keranjang',
    getPlate: 'Ambil piring di rak',
    catchNext: 'Tunggu lemparan atau ambil piring',
    wash: 'Cuci piring di bak cuci',
    clean: 'Bersihkan baju di bak cuci',
    pickUp: 'Ambil yang jatuh di lantai',
    getExtinguisher: 'Ada api! Ambil pemadam merah',
  },

  /* guided practice before the first game on a main screen (owner 2026-11-24) */
  guide: {
    go: 'Latihan dulu!',
    goSub: 'Tanpa waktu, tanpa skor',
    countSub: 'Latihan dulu, tanpa waktu',
    eyebrow: (i: number, n: number) => `LATIHAN · LANGKAH ${i} DARI ${n}`,
    phoneEyebrow: (i: number, n: number) => `LATIHAN ${i}/${n}`,
    statStep: 'Langkah',
    skipNote: 'Sudah bisa? Ketuk LEWATI di HP',
    press: 'Tekan',
    hold: 'Tahan',
    tapNow: 'ketuk sekarang',
    holdNow: 'tahan sekarang',
    skip: 'Lewati',
    skipSub: 'latihan',
    skipSure: 'Yakin?',
    skipSureSub: 'ketuk lagi',
    helper: (name: string) => `${name} mengerjakan bagian ini. Perhatikan!`,
    watch: 'Lihat layar, temanmu sedang bekerja',
    doneTitle: 'Latihan selesai!',
    doneSub: 'Sekarang masak beneran',
    served: 'Mantap!',
    steps: {
      order: {
        title: 'Ada pesanan: Kentang goreng',
        sub: 'Gerakkan joystick di HP untuk berjalan',
        phone: 'Gerakkan joystick untuk jalan',
      },
      walk: {
        title: 'Jalan ke peti kentang',
        sub: 'Berdiri di depannya sampai petinya menyala',
        phone: 'Jalan ke peti kentang',
      },
      take: {
        title: 'Ambil kentang dari peti',
        sub: 'Ketuk AMBIL di depan peti',
        phone: 'Ketuk AMBIL di depan peti',
      },
      board: {
        title: 'Taruh kentang di talenan',
        sub: 'Jalan ke talenan, lalu ketuk AMBIL',
        phone: 'Ke talenan, ketuk AMBIL',
      },
      chop: {
        title: 'Potong kentangnya',
        sub: 'Tahan KERJA di talenan sampai terpotong',
        phone: 'Tahan KERJA sampai terpotong',
      },
      throw: {
        title: 'Oper ke Sisi Masak',
        sub: 'Ambil kentang potong, lalu ketuk LEMPAR',
        phone: 'Ambil, lalu LEMPAR ke seberang',
      },
      fry: {
        title: 'Goreng kentangnya',
        sub: 'Bawa kentang potong, ketuk AMBIL di penggorengan',
        phone: 'Ketuk AMBIL di penggorengan',
      },
      rack: {
        title: 'Ambil piring',
        sub: 'Sambil menunggu matang, ketuk AMBIL di rak piring',
        phone: 'Ketuk AMBIL di rak piring',
      },
      plate: {
        title: 'Taruh kentang goreng di piring',
        sub: 'Bawa piring, ketuk AMBIL di penggorengan',
        phone: 'Bawa piring, ketuk AMBIL di penggorengan',
      },
      serve: {
        title: 'Antar ke pelanggan',
        sub: 'Bawa piringnya, ketuk AMBIL di LOKET ANTAR',
        phone: 'Ketuk AMBIL di loket antar',
      },
    },
    waitTitle: 'Tunggu sampai matang',
    waitSub: 'Lingkaran di penggorengan menunjukkan waktunya',
    waitPhone: 'Tunggu sampai matang',
    throwNow: 'Ketuk LEMPAR ke teman di seberang',
  },

  spectatorTitle: 'Ronde hampir selesai',
  spectatorSub: 'Kamu ikut memasak di ronde berikutnya.',
  resultPhoneSub: (stars: number, kitchen: string) => `${stars} bintang · ${kitchen}`,
  resultStatDeliveries: 'Antar',
  resultStatChops: 'Potong',
  resultStatCatches: 'Tangkap',

  /* awards */
  awards: {
    chops: { title: 'Raja Potong', desc: (n: number) => `${n} kali memotong bahan` },
    deliveries: { title: 'Kurir Kilat', desc: (n: number) => `${n} pesanan diantar ke loket` },
    firesOut: { title: 'Pemadam Andalan', desc: (n: number) => `${n} kali memadamkan api` },
    burnt: { title: 'Tukang Gosong', desc: (n: number) => `${n} masakan jadi arang` },
    goodThrows: { title: 'Pelempar Jitu', desc: (n: number) => `${n} lemparan tertangkap` },
    catches: { title: 'Tangkapan Ajaib', desc: (n: number) => `${n} kali menangkap lemparan` },
    stains: { title: 'Paling Belepotan', desc: (n: number) => `${n} noda di celemek` },
    badThrows: { title: 'Lemparan Nyasar', desc: (n: number) => `${n} lemparan pecah atau tumpah` },
    washed: { title: 'Juru Cuci', desc: (n: number) => `${n} piring dicuci bersih` },
  },
};
