/** Every text the admin dashboard shows (Bahasa Indonesia). Code stays in English. */
import {
  ADMIN_PASSWORD_MIN,
  type AdminError,
  type AdminEventKind,
  type FreeTierCheckId,
  type PassKind,
  type PassStatus,
  type ReportKind,
  type ReportStatus,
  type SystemHistoryHours,
  type UsageDays,
} from '@hoorah/protocol';
import type { MemoryLevel } from './logic';

export type ErrorCode = AdminError | 'network' | 'server';

export const STR = {
  admin: 'Admin',
  pageTitle: 'Kacawbalaw Admin',
  loading: 'Memuat…',
  retry: 'Coba lagi',
  cancel: 'Batal',
  close: 'Tutup',
  save: 'Simpan',
  done: 'Selesai',
  dash: '-',

  // Login
  loginLead: 'Masuk untuk mengelola Pass, room, dan server.',
  username: 'Username',
  password: 'Kata sandi',
  login: 'Masuk',
  loggingIn: 'Memeriksa…',
  loginMissing: 'Isi username dan kata sandi.',
  sessionEnded: 'Sesi berakhir. Silakan masuk lagi.',

  // Shell
  logout: 'Keluar',
  signedInAs: (name: string) => `Masuk sebagai ${name}`,
  tabsLabel: 'Menu admin',
  updatedAt: (time: string) => `Diperbarui ${time}`,
  loadFailed: 'Gagal memuat data.',

  // Pass list
  passTitle: 'Kacaw Pass',
  passLead: 'Kode untuk membuka semua game dan lebih dari 2 pemain.',
  kindFiltersLabel: 'Saring jenis Pass',
  allKinds: 'Semua jenis',
  createPass: 'Buat Pass',
  createCodes: (n: number) => `Buat ${n} kode`,
  filtersLabel: 'Saring Pass',
  copyCode: (code: string) => `Salin kode ${code}`,
  copyMessage: 'Salin pesan',
  share: 'Bagikan',
  extend: 'Perpanjang',
  revoke: 'Cabut',
  reactivate: 'Aktifkan lagi',
  remove: 'Hapus',
  actionsFor: (code: string) => `Tindakan untuk ${code}`,
  remaining: (left: string) => `Sisa ${left}`,
  endedAt: (date: string) => `Berakhir ${date}`,
  revokedAt: (date: string) => `Dicabut ${date}`,
  until: (date: string) => `Sampai ${date}`,
  untilLabel: 'Sampai',
  upToPlayers: (n: number) => `Sampai ${n} pemain`,
  liveRooms: (live: number, max: number | null) =>
    max === null ? `Dipakai di ${live} room sekarang` : `Dipakai di ${live}/${max} room sekarang`,
  usage: (rooms: number, peak: number) =>
    rooms === 0 ? 'Belum pernah dipakai' : `Total ${rooms} room, paling ramai ${peak} pemain`,
  lastUsed: (rel: string) => `Terakhir dipakai ${rel}`,
  useBy: (date: string) => `Pakai sebelum ${date}`,
  usedBefore: (date: string) => `Batas pakai lewat ${date}`,
  runsDays: (days: number) => `${days} hari sejak pertama dipakai`,
  usesPromo: (uses: number, max: number | null) =>
    max === null ? `Dipakai di ${uses} layar` : `Dipakai ${uses}/${max} layar`,
  usesSingle: (uses: number) => (uses === 0 ? 'Belum dipakai' : `Dipakai di ${uses} layar`),
  runWindow: (from: string, to: string) => `Mulai ${from}, habis ${to}`,
  firstRun: (at: string) => `Pertama dipakai ${at}`,

  // Create form
  createTitle: 'Buat Pass baru',
  kindField: 'Jenis',
  kindHelp: {
    shared: 'Satu kode untuk banyak layar sampai tanggal berakhir.',
    single: 'Setiap kode hanya untuk satu layar utama, berjalan sejak pertama dipakai.',
    promo: 'Satu kode untuk beberapa layar, masing-masing berjalan sejak pertama dipakai.',
  } satisfies Record<PassKind, string>,
  durationDaysField: 'Durasi',
  durationDaysHelp: (min: number, max: number) =>
    `Dalam hari, ${min} sampai ${max}. Dihitung sejak kode pertama dipakai di layar utama.`,
  durationDaysPromoHelp: (min: number, max: number) =>
    `Dalam hari per layar, ${min} sampai ${max}. Dihitung sejak kode pertama dipakai di layar itu.`,
  fewerDays: 'Kurangi hari',
  moreDays: 'Tambah hari',
  useByField: 'Berlaku dipakai sampai',
  useByLabel: 'Bisa dipakai sampai',
  countField: 'Jumlah kode',
  countHelp: (max: number) => `1 sampai ${max} kode acak sekaligus.`,
  fewerCodes: 'Kurangi kode',
  moreCodes: 'Tambah kode',
  quotaField: 'Kuota layar',
  quotaHelp: 'Berapa layar utama boleh memakai kode ini.',
  quotaLimited: 'Tentukan',
  quotaCount: 'Jumlah layar',
  fewerScreens: 'Kurangi layar',
  moreScreens: 'Tambah layar',
  quotaValue: (max: number | null) => (max === null ? 'Layar tanpa batas' : `Kuota ${max} layar`),
  labelField: 'Catatan',
  labelPlaceholder: 'Contoh: Main bareng Sabtu',
  labelHelp: 'Hanya terlihat di sini, tidak ditampilkan ke pemain.',
  labelMissing: 'Isi catatan dulu.',
  codeField: 'Kode',
  codeOptional: 'opsional',
  codeHelp: 'Kosongkan untuk kode acak',
  codeTooShort: (min: number) => `Kode minimal ${min} huruf atau angka.`,
  durationField: 'Berlaku',
  pickDate: 'Pilih tanggal',
  endDateField: 'Tanggal dan jam berakhir',
  maxPlayersField: 'Maks pemain',
  maxPlayersHelp: (min: number, max: number) => `Antara ${min} dan ${max} pemain per room.`,
  fewerPlayers: 'Kurangi pemain',
  morePlayers: 'Tambah pemain',
  maxRoomsField: 'Maks room bersamaan',
  maxRoomsHelp: 'Berapa room boleh memakai kode ini pada waktu yang sama.',
  unlimited: 'Tanpa batas',
  creating: 'Membuat…',

  // Success
  createdTitle: 'Pass siap dibagikan',
  createdLead: 'Kirim kode ini ke teman. Mereka mengetiknya di HP saat masuk room.',
  createdBatchTitle: (n: number) => `${n} kode siap dibagikan`,
  createdBatchLead: 'Salin atau unduh daftarnya sekarang. Semua kode juga ada di daftar Pass.',
  copyAll: 'Salin semua',
  allCopied: 'Semua kode tersalin',
  downloadCsv: 'Unduh CSV',
  downloadFailed: 'Gagal mengunduh file. Pakai Salin semua.',
  codesLabel: 'Kode yang dibuat',
  copied: 'Tersalin',
  codeCopied: 'Kode tersalin',
  messageCopied: 'Pesan tersalin',
  copyFailed: 'Gagal menyalin. Tekan lama kodenya untuk menyalin manual.',

  // Extend
  extendTitle: (code: string) => `Perpanjang ${code}`,
  currentEnd: 'Berakhir sekarang',
  newEnd: 'Berakhir baru',
  saving: 'Menyimpan…',
  extended: 'Pass diperpanjang',

  // Revoke / delete
  revokeTitle: (code: string) => `Cabut Pass ${code}?`,
  revokeBody:
    'Kode ini tidak bisa dipakai lagi. Room yang sedang memakainya kembali ke 2 pemain untuk orang baru, pemain yang sudah masuk tetap di kursinya.',
  revokeConfirm: 'Cabut Pass',
  revoked: 'Pass dicabut',
  reactivated: 'Pass aktif lagi',
  removeTitle: (code: string) => `Hapus Pass ${code}?`,
  removeBody:
    'Pass dan riwayat pemakaiannya (jumlah room, pemain terbanyak) ikut terhapus dan tidak bisa dikembalikan. Pemain yang sudah masuk tetap di kursinya.',
  removeConfirm: 'Hapus permanen',
  removed: 'Pass dihapus',

  // Room tab
  roomTitle: 'Room aktif',
  roomLead: 'Diperbarui otomatis setiap 5 detik.',
  roomCode: 'Kode room',
  screenOnline: 'Layar tersambung',
  screenOffline: 'Layar terputus',
  roomPlayers: (connected: number, players: number, max: number) =>
    `${connected}/${players} pemain dari ${max} kursi`,
  roomPlayersHint: 'terhubung / terisi',
  roomShows: 'Layar',
  roomPass: 'Pass',
  roomPassUntil: (code: string, date: string) => `${code}, sampai ${date}`,
  roomNoPass: 'Tanpa Pass',
  roomAge: (created: string, active: string) => `Dibuat ${created}, aktivitas terakhir ${active}`,
  roomEmpty: 'Belum ada room yang aktif',
  roomEmptyHelp: 'Room muncul di sini begitu layar utama dibuka.',

  // Server tab
  serverTitle: 'Server',
  serverLead: 'Kondisi VM dan relay, diperbarui otomatis setiap 30 detik.',

  // Account tab
  accountTitle: 'Akun',
  accountUser: 'Username',
  changePassword: 'Ganti kata sandi',
  currentPassword: 'Kata sandi sekarang',
  newPassword: 'Kata sandi baru',
  repeatPassword: 'Ulangi kata sandi baru',
  passwordHelp: `Minimal ${ADMIN_PASSWORD_MIN} karakter.`,
  passwordMissing: 'Isi kata sandi sekarang.',
  passwordShort: `Kata sandi baru minimal ${ADMIN_PASSWORD_MIN} karakter.`,
  passwordMismatch: 'Kedua kata sandi baru tidak sama.',
  passwordSame: 'Kata sandi baru harus berbeda dari yang sekarang.',
  passwordChanged: 'Kata sandi diganti. Perangkat lain sudah dikeluarkan.',
  changingPassword: 'Mengganti…',
} as const;

export const TABS = {
  pass: 'Pass',
  settings: 'Pengaturan',
  reports: 'Pengaduan',
  errors: 'Galat',
  room: 'Room',
  server: 'Server',
  usage: 'Pemakaian',
  security: 'Keamanan',
  account: 'Akun',
} as const;

/** Server tab: live monitors, VM, app, database, history and egress. */
export const MON = {
  liveTitle: 'Pemantauan langsung',
  ram: 'RAM',
  cpu: 'Beban CPU (1 menit)',
  ofTotal: (used: string, total: string) => `${used} dari ${total}`,
  cpuValue: (load: string, cpus: number) => `${load} dari ${cpus} inti`,
  sparkHint: 'Bacaan selama halaman ini terbuka',
  sparkLabel: (title: string) => `Bacaan ${title} selama halaman ini terbuka`,
  sparkWaiting: 'Menunggu bacaan berikutnya',

  nowTitle: 'Sekarang',
  screens: 'Layar',
  screensHint: 'Layar utama tersambung',
  phones: 'HP',
  phonesHint: 'HP pemain tersambung',
  rooms: 'Room',
  roomsHint: 'Sedang terbuka',
  players: 'Pemain',
  playersHint: 'Kursi terisi di semua room',
  direct: 'Jalur langsung',
  directValue: (direct: number, phones: number) => `${direct} dari ${phones} HP`,
  directHint: (relay: number) =>
    relay === 0 ? 'WebRTC di Wi-Fi yang sama' : `WebRTC di Wi-Fi yang sama, ${relay} HP lewat server`,
  relay: 'Data relay',
  relayHint: 'Dikirim server lewat WebSocket, rata-rata 30 detik',

  serverCard: 'Server (VM)',
  ramUsed: 'RAM terpakai',
  swapUsed: 'Swap terpakai',
  noSwap: 'Tidak ada swap',
  load: (cpus: number) => `Beban CPU (1 / 5 / 15 menit), ${cpus} inti`,
  disk: 'Disk',
  diskUnknown: 'Tidak terbaca',
  vmUptime: 'VM menyala',
  notProc: 'RAM dibaca dari Node, bukan dari Linux: ini angka perangkat ini, bukan VM.',
  withPct: (text: string, pct: string) => `${text} (${pct})`,

  appCard: 'Aplikasi Kacawbalaw',
  rss: 'Memori proses',
  rssValue: (rss: string, target: string) => `${rss} dari target ${target}`,
  heap: 'Heap JavaScript',
  node: 'Versi Node',
  running: 'Berjalan',
  runningValue: (span: string, since: string) => `${span}, sejak ${since}`,

  dbCard: 'Database',
  dbFile: 'Ukuran file (dengan WAL)',
  rows: (n: string) => `${n} baris`,

  historyTitle: 'Riwayat',
  historyLead: 'Dicatat setiap 5 menit, disimpan 14 hari.',
  historyRanges: 'Rentang riwayat',
  historyEmpty:
    'Belum ada riwayat. Sampel pertama dicatat sekitar 1 menit setelah server menyala, lalu setiap 5 menit.',
  chartRam: 'RAM terpakai',
  chartCpu: 'Beban CPU per inti',
  chartPlayers: 'Pemain (terbanyak)',
  chartEgress: 'Data keluar VM',
  chartRelay: 'Data relay server',
  chartRelayNote:
    'Kartu jaringan VM belum terbaca, jadi yang tampil adalah data yang dikirim server lewat WebSocket.',
  chartBytesNote: (total: string, bucket: string) => `${total} dalam rentang ini, per ${bucket}.`,
  bucketMinutes: (n: number) => `${n} menit`,
  bucketHour: 'jam',
  noData: 'Belum ada data.',
  chartEmptyRange: 'Tidak ada bacaan di rentang ini.',
} as const;

/** Words the charts read out to screen readers. */
export const CHART = {
  summary: (last: string, max: string) => `terakhir ${last}, tertinggi ${max}`,
} as const;

export const LEVELS: Record<MemoryLevel, string> = {
  ok: 'Normal',
  warn: 'Tinggi',
  over: 'Kritis',
};

export const HISTORY_RANGES: Record<SystemHistoryHours, string> = {
  24: '24 jam',
  168: '7 hari',
  336: '14 hari',
};

/** Friendly names for the database tables (the raw name is shown next to them). */
export const TABLE_LABELS: Record<string, string> = {
  admins: 'Admin',
  admin_sessions: 'Sesi admin',
  passes: 'Kacaw Pass',
  pass_uses: 'Pemakaian Pass',
  system_samples: 'Sampel sistem',
  net_counter: 'Penghitung kartu jaringan',
  net_hourly: 'Data keluar per jam',
  usage_hourly: 'Pemakaian per jam',
  game_hourly: 'Game per jam',
  admin_events: 'Log keamanan',
  meta: 'Catatan internal',
};

/** "Data keluar VM" card. */
export const EGRESS = {
  title: 'Data keluar VM',
  month: (name: string) => `Bulan tagihan ${name}`,
  notMeasured: 'Belum terukur',
  notMeasuredBody:
    'Kartu jaringan VM belum terbaca. Di VM, server membaca /sys milik host yang dipasang di /host/sys (HOST_SYS_PATH). Di laptop atau saat npm run dev, bagian ini memang kosong.',
  stale: 'Kartu jaringan tidak terbaca pada sampel terakhir. Angka berhenti di pembacaan terakhir.',
  cloudflare: (when: string) =>
    `Awan oranye Cloudflare terdeteksi (terakhir ${when}). Lewat proxy Cloudflare, data keluar tidak masuk jatah gratis dan ditagih Google, juga lebih lambat dari Indonesia. Matikan proxy (pilih DNS only) di Cloudflare kalau bukan sedang darurat.`,
  route: 'Jalur',
  routeDirect: 'Langsung ke VM, gratis',
  allowance: (free: string, pct: string) => `Jatah gratis ${free} per bulan, terpakai ${pct}`,
  soFar: 'Sejauh ini',
  soFarHint: (pct: string) => `${pct} dari jatah gratis`,
  projected: 'Perkiraan akhir bulan',
  projectedHint: (pct: string, perDay: string, days: string) =>
    `${pct}, laju sekitar ${perDay}/hari (${days} terakhir)`,
  projectedRough: (pct: string) => `${pct}, perkiraan kasar (data kurang dari sehari)`,
  paceDays: (n: string) => `${n} hari`,
  today: 'Hari ini (WIB)',
  todayHint: (yesterday: string) => `Kemarin ${yesterday}`,
  previous: 'Bulan lalu',
  previousPartial: 'Sebagian, pengukuran mulai di tengah bulan',
  inbound: 'Data masuk ke VM bulan ini',
  inboundValue: (bytes: string) => `${bytes}, gratis`,
  dailyTitle: 'Data keluar per hari, 14 hari terakhir',
  total: 'Total',
  perDayAvg: 'Rata-rata per hari',
  peak: 'Puncak',
  freeOk: (bytes: string) => `Aman, ${bytes}`,
  freeOver: (bytes: string) => `Di luar free tier, ${bytes}`,
  freeUnknown: (bytes: string) => (bytes ? `Belum dinilai, ${bytes}` : 'Belum terbaca'),
  freeUnjudged: 'Syarat free tier baru dinilai di VM (saat kartu jaringannya terbaca).',
  freeWarn:
    'Ada syarat free tier yang tidak terpenuhi: VM atau disknya bisa ikut ditagih. Cek di Google Cloud Console.',
  measured: (iface: string, since: string) =>
    `Diukur dari kartu jaringan VM (${iface}) sejak ${since}, sama dengan yang dihitung Google.`,
  billingNote:
    'Bulan dipotong menurut waktu Pacific seperti Google (tanggal 1 sekitar pukul 14.00 atau 15.00 WIB). Jatah 200 GiB berlaku untuk seluruh akun billing.',
} as const;

export const FREE_TIER: Record<FreeTierCheckId, string> = {
  ram: 'RAM VM setara e2-micro (1 GB)',
  disk: 'Disk maksimal 30 GB',
};

/** "Pemakaian" tab. */
export const USAGE = {
  title: 'Pemakaian',
  lead: 'Angka gabungan tanpa nama pemain atau kode room. Diperbarui setiap menit.',
  ranges: 'Rentang pemakaian',
  roomsCreated: 'Room dibuka',
  roomsCreatedHint: (closed: string) => `${closed} sudah tutup`,
  gameStarts: 'Game dimainkan',
  gameStartsHint: 'Setiap kali layar masuk ke game',
  avgPlayersGame: 'Pemain per game',
  avgPlayersGameHint: 'Rata-rata saat game dimulai',
  avgDuration: 'Durasi room',
  avgDurationHint: 'Rata-rata dari dibuka sampai layar ditutup',
  avgPlayersRoom: 'Pemain per room',
  avgPlayersRoomHint: (empty: string) => `Rata-rata terbanyak, ${empty} room tanpa pemain`,
  passes: 'Pass dipakai',
  passesHint: 'Room yang mulai memakai Pass',
  chartRooms: (bucket: 'hour' | 'day') =>
    bucket === 'hour' ? 'Room dibuka per jam' : 'Room dibuka per hari',
  chartGames: (bucket: 'hour' | 'day') =>
    bucket === 'hour' ? 'Game dimulai per jam' : 'Game dimulai per hari',
  heatTitle: 'Kapan orang bermain',
  heatLead: 'Game dimulai menurut hari dan jam (WIB).',
  heatBusiest: (day: string, hour: string) => `Tersibuk: ${day}, sekitar ${hour}`,
  heatCell: (day: string, from: string, to: string, n: string) => `${day} ${from}–${to}: ${n} game`,
  hourRange: (day: string, from: string, to: string) => `${day} ${from}–${to}`,
  heatLabel: (busiest: string) => `Game dimulai per hari dan jam. ${busiest}.`,
  heatEmpty: 'Belum ada game dimulai di rentang ini.',
  less: 'Sedikit',
  more: 'Banyak',
  topTitle: 'Game terpopuler',
  topPlays: (n: string) => `${n} kali`,
  topPlayers: (avg: string) => `rata-rata ${avg} pemain`,
  emptyTitle: 'Belum ada pemakaian di rentang ini',
  emptyBody: 'Angka muncul begitu ada room dibuka dan game dimulai.',
  games: (n: string) => `${n} game`,
  rooms: (n: string) => `${n} room`,
} as const;

export const USAGE_RANGES: Record<UsageDays, string> = {
  1: '24 jam',
  7: '7 hari',
  30: '30 hari',
};

/** Monday first, like the heatmap. */
export const WEEKDAYS_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;

/** "Keamanan" tab. */
export const SECURITY = {
  title: 'Keamanan',
  lead: 'Masuk admin, ganti kata sandi, dan kode Pass yang salah selama 30 hari terakhir. Diperbarui setiap 30 detik.',
  failedLogins: 'Gagal masuk admin',
  wrongPasses: 'Kode Pass salah',
  last24h: '24 jam terakhir',
  listTitle: 'Catatan terbaru',
  times: (n: number) => `${n} kali`,
  emptyTitle: 'Belum ada catatan',
  emptyBody: 'Masuk admin, ganti kata sandi, dan percobaan kode Pass yang salah muncul di sini.',
  byUser: (name: string) => `oleh ${name}`,
  note: 'Percobaan yang sama dari satu alamat dalam satu menit digabung jadi satu baris.',
} as const;

export const EVENT_LABELS: Record<AdminEventKind, string> = {
  login_ok: 'Admin masuk',
  login_failed: 'Gagal masuk admin',
  login_limited: 'Masuk admin diblokir sementara',
  password_changed: 'Kata sandi diganti',
  password_failed: 'Gagal ganti kata sandi',
  pass_wrong: 'Kode Pass salah',
  pass_limited: 'Tebakan kode Pass diblokir',
};

export const STATUS: Record<PassStatus, string> = {
  active: 'Aktif',
  expired: 'Habis',
  revoked: 'Dicabut',
};

/** Pass kinds as chips on the cards and in the create form. */
export const PASS_KINDS: Record<PassKind, string> = {
  shared: 'Kode bersama',
  single: 'Kode sekali pakai',
  promo: 'Kode promo',
};

/** The kind filter above the Pass list (short, so the row fits a phone). */
export const KIND_FILTER_LABEL: Record<PassKind, string> = {
  shared: 'Bersama',
  single: 'Sekali pakai',
  promo: 'Promo',
};

/** The `jenis` column of the CSV download. */
export const CSV_KINDS: Record<PassKind, string> = {
  shared: 'bersama',
  single: 'sekali pakai',
  promo: 'promo',
};

/** "Pengaturan" tab. */
export const SETTINGS = {
  title: 'Pengaturan',
  lead: 'Berlaku untuk semua layar utama tanpa perlu deploy. Layar yang sedang terbuka mengikuti saat room berikutnya dibuat.',
  openAll: 'Mode uji coba: semua terbuka',
  openAllHelp: 'Semua room mendapat semua game dan Mode Pesta, tanpa iklan dan tanpa perlu Pass.',
  openAllOn: 'Sedang aktif: pemain tidak melihat batasan versi gratis.',
  adsTitle: 'Iklan promo',
  adsEnabled: 'Tampilkan iklan promo',
  adsEnabledHelp: 'Jeda singkat di antara game, hanya di room gratis.',
  adSeconds: 'Durasi iklan (detik)',
  adEveryGames: 'Iklan setiap berapa game',
  adMinGapMin: 'Jarak minimal antar iklan (menit)',
  trialTitle: 'Coba gratis',
  trialMinutes: 'Lama Coba gratis (menit)',
  trialHelp: 'Sekali per layar utama: semua game, Mode Pesta, tanpa iklan.',
  weeklyTitle: 'Game Minggu Ini',
  weeklyField: 'Pilih game',
  weeklyAuto: 'Otomatis (berganti tiap minggu)',
  weeklyHelp: 'Game ini bisa dimainkan gratis selama seminggu.',
  between: (min: number, max: number) => `Antara ${min} dan ${max}.`,
  less: (what: string) => `Kurangi ${what}`,
  more: (what: string) => `Tambah ${what}`,
  save: 'Simpan pengaturan',
  reset: 'Batalkan perubahan',
  saved: 'Pengaturan disimpan',
  savedAt: (time: string) => `Tersimpan ${time}`,
  unsaved: 'Ada perubahan yang belum disimpan.',
} as const;

export const REPORT_KINDS_LABEL: Record<ReportKind, string> = {
  teknis: 'Masalah teknis',
  pass: 'Pass dan pembayaran',
  saran: 'Saran',
  lainnya: 'Lainnya',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  baru: 'Baru',
  diproses: 'Diproses',
  selesai: 'Selesai',
};

/** "Pengaduan" tab. */
export const REPORTS = {
  title: 'Pengaduan',
  lead: 'Laporan dari pemain lewat "Laporkan masalah". Diperbarui setiap menit.',
  filtersLabel: 'Saring pengaduan',
  all: 'Semua',
  contact: 'Kontak',
  copyContact: 'Salin kontak',
  noContact: 'Tanpa kontak',
  statusField: 'Status',
  statusChanged: (label: string) => `Ditandai ${label.toLowerCase()}`,
  context: 'Detail teknis',
  newCount: (n: number) => `${n} pengaduan baru`,
  empty: {
    all: { title: 'Belum ada pengaduan', body: 'Laporan dari layar utama dan HP pemain muncul di sini.' },
    baru: { title: 'Tidak ada pengaduan baru', body: 'Semua pengaduan sudah ditangani.' },
    diproses: {
      title: 'Tidak ada yang sedang diproses',
      body: 'Tandai pengaduan sebagai Diproses saat kamu menanganinya.',
    },
    selesai: { title: 'Belum ada yang selesai', body: 'Pengaduan yang sudah beres muncul di sini.' },
  } satisfies Record<ReportStatus | 'all', { title: string; body: string }>,
} as const;

export const ROLE_LABEL: Record<'screen' | 'controller', string> = {
  screen: 'Layar utama',
  controller: 'HP',
};

/** Rows of the technical context under a report or an error. */
export const CONTEXT = {
  role: 'Perangkat',
  page: 'Halaman',
  game: 'Game',
  room: 'Room',
  version: 'Versi aplikasi',
  userAgent: 'Browser',
  viewport: 'Ukuran layar',
  rtt: 'Ping ke server',
  rttValue: (ms: number) => `${ms} ms`,
  link: 'Jalur',
  links: { direct: 'Langsung (WebRTC)', relay: 'Lewat server' } as Record<string, string>,
} as const;

/** "Galat" tab. */
export const GALAT = {
  title: 'Galat',
  lead: 'Error dari layar utama dan HP, digabung per pesan. Diperbarui setiap menit.',
  times: (n: string) => `${n} kali`,
  first: 'Pertama',
  last: 'Terakhir',
  stack: 'Stack',
  noStack: 'Tidak ada stack.',
  latest: 'Konteks terakhir',
  remove: 'Hapus',
  removed: 'Galat dihapus',
  removeAll: 'Hapus semua',
  removeAllTitle: 'Hapus semua galat?',
  removeAllBody:
    'Semua catatan galat dihapus dan tidak bisa dikembalikan. Galat yang terjadi lagi akan muncul lagi.',
  removeAllConfirm: 'Hapus semua',
  removedAll: 'Semua galat dihapus',
  emptyTitle: 'Tidak ada galat',
  emptyBody: 'Error yang terjadi di layar utama atau HP pemain muncul di sini.',
  summary: (groups: string, total: string) => `${groups} jenis, ${total} kejadian`,
} as const;

export const FILTERS = {
  active: 'Aktif',
  expired: 'Habis',
  revoked: 'Dicabut',
  all: 'Semua',
} as const;

export const EMPTY: Record<keyof typeof FILTERS, { title: string; body: string }> = {
  active: { title: 'Belum ada Pass aktif', body: 'Buat Pass, lalu bagikan kodenya ke teman.' },
  expired: { title: 'Belum ada Pass yang habis', body: 'Pass yang lewat waktunya muncul di sini.' },
  revoked: { title: 'Belum ada Pass yang dicabut', body: 'Pass yang kamu cabut muncul di sini.' },
  all: { title: 'Belum ada Pass', body: 'Buat Pass pertama, lalu bagikan kodenya ke teman.' },
};

export const CREATE_PRESETS = {
  '3h': '3 jam',
  '1d': '1 hari',
  '3d': '3 hari',
  '7d': '7 hari',
  '30d': '30 hari',
} as const;

/** "Berlaku dipakai sampai" chips of single and promo codes. */
export const USE_BY_PRESETS = {
  '7d': '7 hari',
  '30d': '30 hari',
  '90d': '90 hari',
  '180d': '6 bulan',
  '365d': '1 tahun',
} as const;

export const EXTEND_STEPS = {
  '3h': '+3 jam',
  '1d': '+1 hari',
  '7d': '+7 hari',
} as const;

/** What the main screen shows, by `AdminRoom.page`. */
export const ROOM_PAGE: Record<string, string> = {
  home: 'Beranda',
  detail: 'Detail game',
  loading: 'Memuat',
  results: 'Hasil',
  join: 'Menunggu pemain',
  game: 'Main game',
};
export const roomPlaying = (title: string) => `Main: ${title}`;
export const ROOM_PAGE_UNKNOWN = 'Tampilan layar belum diketahui';

export const ERRORS: Record<ErrorCode, string> = {
  unauthorized: 'Sesi berakhir. Silakan masuk lagi.',
  invalid_login: 'Username atau kata sandi salah',
  rate_limited: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
  bad_request: 'Isian belum benar. Periksa lagi.',
  not_found: 'Data ini sudah tidak ada. Muat ulang daftar.',
  code_taken: 'Kode sudah dipakai Pass lain',
  wrong_password: 'Kata sandi sekarang salah',
  weak_password: `Kata sandi baru minimal ${ADMIN_PASSWORD_MIN} karakter.`,
  expired_time: 'Waktu berakhir harus di masa depan, maksimal 1 tahun',
  network: 'Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.',
  server: 'Server sedang bermasalah. Coba lagi sebentar lagi.',
};

/** Units for durations and relative times ("5 menit lalu", "2 jam lagi"). */
export const TIME = {
  justNow: 'baru saja',
  soon: 'sebentar lagi',
  never: 'belum pernah',
  ago: (span: string) => `${span} lalu`,
  ahead: (span: string) => `${span} lagi`,
  seconds: (n: number) => `${n} detik`,
  minutes: (n: number) => `${n} menit`,
  hours: (n: number) => `${n} jam`,
  days: (n: number) => `${n} hari`,
} as const;

const HOW_TO_USE =
  'Cara pakai: masuk room dari HP, lalu ketik kode ini saat diminta (atau di menu "Tambah pemain").';

/** The text friends receive on WhatsApp. */
export function shareMessage(code: string, until: string, maxPlayers: number): string {
  return [
    `Kode Kacaw Pass: ${code}`,
    `Berlaku sampai ${until}, sampai ${maxPlayers} pemain.`,
    HOW_TO_USE,
  ].join('\n');
}

/** The share text of a single-use or promo code: it runs `days` from its first use on a screen. */
export function shareMessageRunning(code: string, days: number, useBy: string, maxPlayers: number): string {
  return [
    `Kode Kacaw Pass: ${code}`,
    `Berlaku ${days} hari sejak pertama dipakai di layar utama, sampai ${maxPlayers} pemain.`,
    `Pakai sebelum ${useBy}.`,
    HOW_TO_USE,
  ].join('\n');
}
