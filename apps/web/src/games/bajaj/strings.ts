/** Every player-facing Bajaj Rush string (Indonesian) lives here, including text painted in the 3D world. */
import type { ItemKind, Mode } from './logic';
import type { MapId } from './maps/types';

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** 83456 ms -> "1:23.45" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${m}:${pad2(s)}.${pad2(cs)}`;
}

/** 1234 ms -> "+1.23" / "-0.42" */
export function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}`;
}

/** 95000 ms -> "1:35" */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

export const STR = {
  noShell: 'Bajaj Rush harus dibuka dari aplikasi Hoorah.',
  unknownPlayer: 'Pemain',
  cpuTag: 'CPU',

  /* ---------------- modes */
  modes: {
    gp: {
      name: 'Grand Prix',
      tag: 'Balapan penuh',
      desc: 'Enam bajaj, saling lempar item. Lawan CPU mengisi grid yang kosong.',
      sub: 'Semua pemain + lawan CPU',
    },
    duel: {
      name: 'Duel 1 lawan 1',
      tag: 'Adu langsung',
      desc: 'Dua bajaj, satu pemenang. Sendirian? Kamu lawan satu CPU tangguh.',
      sub: 'Satu lawan satu, tanpa grid penuh',
    },
    arena: {
      name: 'Arena Tempur',
      tag: 'Bertahan hidup',
      desc: 'Lapangan pasar penuh kardus. Tiap bajaj punya 3 lampu nyawa. Yang terakhir bertahan menang.',
      sub: '3 nyawa · 3 menit',
    },
    time: {
      name: 'Lawan Waktu',
      tag: 'Kejar rekor',
      desc: 'Tanpa lawan di jalan, tanpa item. Bajaj lain jadi bayangan. Putaran tercepat menang.',
      sub: 'Putaran tercepat menang',
    },
  } satisfies Record<Mode, { name: string; tag: string; desc: string; sub: string }>,

  /* ---------------- maps */
  maps: {
    kota: {
      name: 'Lingkar Kota',
      desc: 'Ruko, bundaran tugu, dan jalan layang di atas kemacetan.',
      mood: 'Siang cerah',
    },
    pantai: {
      name: 'Pesisir Pantai',
      desc: 'Dermaga kayu di atas laut, jembatan lengkung, dan mercusuar.',
      mood: 'Sore keemasan',
    },
    puncak: {
      name: 'Jalur Puncak',
      desc: 'Tikungan tajam di kebun teh, terowongan, dan kabut tipis.',
      mood: 'Pagi berkabut',
    },
    arena: {
      name: 'Lapangan Pasar',
      desc: 'Lapangan parkir pasar dengan rintangan dan lompatan.',
      mood: 'Senja',
    },
  } satisfies Record<MapId, { name: string; desc: string; mood: string }>,

  /* ---------------- menus (main screen + phones) */
  /** Arena skips the circuit step, so its menu has 2 steps instead of 3. */
  menuModeEyebrow: (total: number) => `LANGKAH 1 DARI ${total}`,
  menuModeTitle: 'Pilih mode',
  menuMapEyebrow: 'LANGKAH 2 DARI 3',
  menuMapTitle: 'Pilih sirkuit',
  menuKartEyebrow: (step: number, total: number) => `LANGKAH ${step} DARI ${total}`,
  menuKartTitle: 'Pilih warna bajaj',
  menuHostPicks: 'Host memilih dari HP',
  menuWaiting: (name: string) => `${name} (Host) sedang memilih…`,
  menuNext: 'Lanjut',
  menuBack: 'Kembali',
  menuReady: 'Siap',
  menuUnready: 'Ganti warna',
  menuStart: 'Mulai',
  menuHintMode: 'Ketuk mode, lalu Lanjut.',
  menuHintMap: 'Ketuk sirkuit, lalu Lanjut.',
  menuHintKart: 'Ketuk warna, lalu Siap.',
  menuHintHostStart: 'Mulai sekarang tanpa menunggu yang lain.',
  menuReadyCount: (ready: number, total: number) => `${ready}/${total} siap`,
  menuAutoReady: (s: number) => `Mulai otomatis dalam ${s} detik`,
  menuReadyTag: 'SIAP',
  menuChoosing: 'Memilih…',
  menuLaps: (n: number) => `${n} putaran`,
  menuOpponents: (n: number) => (n === 0 ? 'Tanpa CPU' : `${n} lawan CPU`),
  menuArenaOnly: 'Arena Tempur selalu di Lapangan Pasar.',
  menuLengthM: (m: number) => `${Math.round(m)} m`,
  takenBy: (name: string) => name,

  colorNames: {
    '#F2453D': 'Merah',
    '#2F8CFF': 'Biru',
    '#22B35E': 'Hijau',
    '#FFC928': 'Kuning',
    '#FF8A3D': 'Oranye',
    '#FF5C9A': 'Pink',
    '#14B8A6': 'Toska',
    '#C4C7CC': 'Abu',
  } as Record<string, string>,

  /* ---------------- items */
  items: {
    durian: 'Durian',
    firecracker: 'Petasan',
    boost: 'Turbo Kopi',
    oil: 'Tumpahan Oli',
    shield: 'Helm Baja',
    horn: 'Klakson Telolet',
  } satisfies Record<ItemKind, string>,
  itemRolling: 'Mengocok…',
  itemEmpty: 'Ambil kardus',

  /* ---------------- race HUD */
  place: 'POSISI',
  lap: 'PUTARAN',
  lives: 'NYAWA',
  timeLabel: 'WAKTU',
  bestLabel: 'TERBAIK',
  lastLabel: 'TERAKHIR',
  noLapYet: 'Belum ada',
  noTime: '–',
  lapValue: (lap: number, laps: number) => `${lap}/${laps}`,
  introSub: (mode: Mode, laps: number, racers: number) =>
    mode === 'arena'
      ? `3 nyawa · ${racers} bajaj`
      : mode === 'time'
        ? `${laps} putaran · kejar waktu terbaik`
        : `${laps} putaran · ${racers} bajaj`,
  introHint: 'Injak GAS untuk jalan, REM untuk mundur. Ambil kardus, lempar ke lawan!',
  introHintTime: 'Injak GAS, setir halus, kejar putaran tercepat.',
  go: 'GAS!',
  finalLap: 'PUTARAN TERAKHIR!',
  lapBanner: (lap: number, laps: number) => `PUTARAN ${lap}/${laps}`,
  newBest: 'REKOR BARU!',
  wrongWay: 'SALAH ARAH!',
  wrongWaySub: 'Putar balik',
  finished: 'FINIS!',
  finishedPlace: (place: number) => `Posisi ${place}`,
  bestLap: 'Putaran tercepat',
  lapTime: 'Waktu',
  timeLeft: (s: number) => `Balapan selesai dalam ${s} detik`,
  arenaClock: 'SISA WAKTU',
  arenaLeft: (n: number) => `${n} bajaj tersisa`,
  out: 'TERSINGKIR',
  outSub: 'Tonton sampai selesai',
  lifeLost: 'NYAWA HILANG!',
  offline: 'Terputus · dikemudikan CPU',
  spectator: 'Sedang menonton',
  standings: 'KLASEMEN',
  resultsTitle: 'HASIL BALAPAN',
  resultsTitleArena: 'HASIL ARENA',
  resultsTitleTime: 'HASIL LAWAN WAKTU',
  resultsCols: {
    place: 'POS',
    name: 'PEMBALAP',
    time: 'WAKTU',
    best: 'TERCEPAT',
    lives: 'NYAWA',
    hits: 'KENA',
  },
  dnf: 'Belum finis',
  lapsShort: (laps: number) => `${laps} put.`,
  livesShort: (n: number) => `${n} nyawa`,
  overviewTitle: 'PANTAUAN',
  sector: (n: number) => `SEKTOR ${n}`,
  hitDurian: 'Kena durian!',
  hitFirecracker: 'Kena petasan!',
  hitOil: 'Kepleset oli!',
  hitHorn: 'Kaget telolet!',
  blocked: 'Helm menahan!',
  shieldOn: 'Helm terpasang',
  boostOn: 'Turbo!',
  thrownBack: 'Dilempar ke belakang',
  rescued: 'Diderek balik ke jalan',
  airtime: 'Terbang!',
  ghostTag: 'BAYANGAN',

  /* ---------------- phone */
  phonePlace: (place: number, total: number) => `Posisi ${place}/${total}`,
  phoneLap: (lap: number, laps: number) => `Putaran ${lap}/${laps}`,
  phoneLives: (n: number) => `Nyawa ${n}/3`,
  phoneClock: (t: string) => `Sisa ${t}`,
  phoneBest: (t: string) => `Terbaik ${t}`,
  phoneNoBest: 'Belum ada catatan',
  phoneFinishedPlace: (place: number, total: number) => `Finis ${place}/${total}`,
  phoneFinishedTime: (t: string) => `Waktu ${t}`,
  phoneOut: 'Tersingkir',
  phoneHintGrid: 'Siap-siap! Tahan GAS saat lampu hijau.',
  phoneHintCountdown: 'Tunggu lampu hijau…',
  phoneHintRace: 'Tahan GAS untuk jalan · REM untuk mundur',
  phoneHintTime: 'Setir halus, rem sebelum tikungan.',
  phoneHintArena: 'Kejar kardus, lempar ke lawan, jaga nyawa!',
  phoneHintItem: (name: string) => `Ketuk ITEM untuk pakai ${name}`,
  phoneHintThrow: (name: string) => `ITEM melempar ${name} ke depan · tahan REM untuk ke belakang`,
  phoneHintFirecracker: 'ITEM: petasan mengejar lawan di depanmu',
  phoneHintWrongWay: 'Salah arah! Putar balik.',
  phoneHintFinalLap: 'Putaran terakhir, gas terus!',
  phoneHintFinished: 'Mantap! Tunggu yang lain di layar utama.',
  phoneHintOut: 'Kamu tersingkir. Tonton di layar utama.',
  phoneHintSpectator: 'Kamu menonton ronde ini. Ikut di ronde berikutnya!',
  phoneMenuWait: 'Lihat layar utama',

  /* ---------------- after the race */
  postEyebrow: 'SELESAI',
  postTitle: 'Main lagi?',
  postAgain: 'Main lagi',
  postAgainSub: 'Mode, sirkuit, dan warna yang sama',
  postChange: 'Ganti mode',
  postChangeSub: 'Kembali ke pilihan mode',
  postDone: 'Selesai',
  postDoneSub: 'Lihat hasil dan penghargaan',
  postWaiting: (name: string) => `${name} (Host) sedang memilih…`,
  postAuto: (s: number) => `Hasil akhir dalam ${s} detik`,

  /* ---------------- results */
  resultWinner: (name: string) => `${name} juara!`,
  resultCpuWinner: (name: string) => `${name} menang. Ayo balas dendam!`,
  resultSub: (mode: Mode, circuit: string, laps: number) =>
    mode === 'arena'
      ? 'Arena Tempur · Lapangan Pasar'
      : `${STR_MODE_NAME[mode]} · ${circuit} · ${laps} putaran`,
  resultLabel: (place: number, time: string | null) =>
    time ? `Ke-${place} · ${time}` : `Ke-${place} · belum finis`,
  resultLabelArena: (place: number, lives: number | null) =>
    lives === null ? `Ke-${place} · tersingkir` : `Ke-${place} · ${lives} nyawa`,
  resultLabelTime: (place: number, best: string | null) =>
    best ? `Ke-${place} · terbaik ${best}` : `Ke-${place} · tanpa catatan`,
  awardFastestLap: 'Putaran Kilat',
  awardFastestLapDesc: (t: string) => `Putaran tercepat ${t}`,
  awardItems: 'Jago Usil',
  awardItemsDesc: (n: number) => `${n} kali bikin lawan oleng`,
  awardOvertakes: 'Tukang Salip',
  awardOvertakesDesc: (n: number) => `${n} kali menyalip`,
  awardBoxes: 'Raja Kardus',
  awardBoxesDesc: (n: number) => `${n} kardus diambil`,
  awardClean: 'Sopir Rapi',
  awardCleanDesc: 'Paling jarang menabrak',
  awardSniper: 'Penembak Jitu',
  awardSniperDesc: (n: number) => `${n} lemparan kena`,
  awardTough: 'Paling Awet',
  awardToughDesc: (n: number) => `Bertahan dengan ${n} nyawa`,
  awardToughOutDesc: 'Bertahan paling lama',
  awardSteady: 'Paling Konsisten',
  awardSteadyDesc: (t: string) => `Selisih putaran cuma ${t}`,

  /* ---------------- CPU racers */
  cpuNames: [
    'Bang Jali',
    'Mpok Minah',
    'Pak Darto',
    'Teh Lilis',
    'Mas Bowo',
    'Cak Rudi',
    'Uda Rizal',
    'Kak Rani',
  ],

  /* ---------------- painted world text (fictional) */
  shopSigns: [
    'TOKO SUMBER REJEKI',
    'BENGKEL MAJU JAYA',
    'APOTEK SEHAT SELALU',
    'FOTOKOPI KILAT',
    'PULSA & AKSESORIS',
    'MARTABAK BANG UDIN',
    'LAUNDRY WANGI',
    'TOKO BESI SENTOSA',
    'SATE MADURA PAK KUMIS',
    'BAKMI AYAM 88',
    'MIE AYAM GANG MELATI',
    'SALON CANTIK AYU',
    'KOPI TUBRUK MANTAP',
    'TOKO KUE NONA',
    'JAMU BU SRI',
    'PERCETAKAN NUSA',
    'SEMBAKO MURAH',
    'SERVIS HP KILAT',
    'TOKO EMAS CAHAYA',
    'NASI UDUK BETAWI',
    'WARTEG BAHARI',
    'MEBEL JATI ASRI',
    'GROSIR KAIN MULIA',
    'SOTO LAMONGAN',
  ],
  tentBanners: ['PECEL LELE', 'SEAFOOD 99', 'NASI GORENG', 'SOTO AYAM', 'AYAM BAKAR', 'BUBUR AYAM'],
  cartLabel: 'BAKSO',
  billboards: [
    { title: 'KOPI SUSU GULA AREN', sub: 'Segar setiap pagi', bg: '#FF5A1F', fg: '#FFF7F0' },
    { title: 'SAMBAL MBAK RATIH', sub: 'Pedasnya bikin nagih', bg: '#F2453D', fg: '#FFF7F0' },
    { title: 'HOORAH!', sub: 'Main bareng di layar mana pun', bg: '#FFC928', fg: '#111214' },
    { title: 'MIE GORENG GURIH', sub: 'Masak 3 menit', bg: '#22B35E', fg: '#FFF7F0' },
    { title: 'BAJAJ RUSH', sub: 'Lingkar Kota · Balapan malam ini', bg: '#2F8CFF', fg: '#FFF7F0' },
    { title: 'ES TEH MANIS', sub: 'Dingin, murah, mantap', bg: '#111214', fg: '#FFC928' },
  ],
  gantryFinish: 'FINIS',
  gantryStart: 'START',
  roadSign: 'LINGKAR KOTA',
  flyoverSign: 'JALAN LAYANG',
  tuguPlaque: 'TUGU PERSATUAN',
  platePrefix: 'B',
  beachSigns: [
    'ES KELAPA MUDA',
    'IKAN BAKAR',
    'SEWA PAPAN SELANCAR',
    'JAGUNG MANIS',
    'KERANG REBUS',
    'POS JAGA PANTAI',
  ],
  beachGate: 'PESISIR PANTAI',
  pierSign: 'DERMAGA',
  mountainSigns: ['KEBUN TEH SARI', 'JAGUNG BAKAR', 'WARUNG KOPI KABUT', 'STROBERI PETIK', 'PONDOK PANDANG'],
  mountainGate: 'JALUR PUNCAK',
  tunnelSign: 'TEROWONGAN',
  arenaGate: 'LAPANGAN PASAR',
  arenaSigns: ['PASAR SENJA', 'PARKIR', 'ES CENDOL', 'SATE AYAM', 'BUAH SEGAR', 'GORENGAN'],
};

const STR_MODE_NAME: Record<Mode, string> = {
  gp: STR.modes.gp.name,
  duel: STR.modes.duel.name,
  arena: STR.modes.arena.name,
  time: STR.modes.time.name,
};
