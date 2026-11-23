/** Player-facing text of Petualangan Warna (Bahasa Indonesia). */
import type { BiomeId, Slot } from './levels';

export const SLOT_NAME: Record<Slot, string> = { 0: 'Merah', 1: 'Biru', 2: 'Hijau', 3: 'Kuning' };
/** Shape per colour, so colour-blind players can tell them apart. */
export const SLOT_SYMBOL: Record<Slot, string> = { 0: '▲', 1: '●', 2: '■', 3: '★' };
export const SLOT_SHAPE: Record<Slot, string> = { 0: 'segitiga', 1: 'lingkaran', 2: 'kotak', 3: 'bintang' };

export const LEVEL_TEXT: Record<string, { name: string; tip: string; sub: string }> = {
  'hutan-1': {
    name: 'Jalan Setapak',
    tip: 'Jalan ke kanan, lompat ke undakan, lalu masuk pintu warnamu.',
    sub: 'Jalan dan lompat',
  },
  'hutan-2': {
    name: 'Kolam Warna',
    tip: 'Kolam warnamu aman diseberangi. Lompati kolam warna lain.',
    sub: 'Kenali kolam warna',
  },
  'hutan-3': {
    name: 'Papan Kayu',
    tip: 'Papan kayu bisa ditembus dari bawah. Lompat naik dari papan ke papan.',
    sub: 'Papan kayu',
  },
  'hutan-4': {
    name: 'Tombol Injak',
    tip: 'Berdiri di tombol supaya pintu terbuka. Gantian menahannya.',
    sub: 'Tombol dan pintu',
  },
  'hutan-5': {
    name: 'Jamur Loncat',
    tip: 'Injak jamur untuk terpental tinggi, lalu arahkan ke tebing.',
    sub: 'Jamur pantul',
  },
  'hutan-6': {
    name: 'Sungai Kecil',
    tip: 'Biru lewat papan di atas kolam merah. Merah melompati kolam biru.',
    sub: 'Kolam dan papan',
  },
  'hutan-7': {
    name: 'Undakan Tinggi',
    tip: 'Undakan setinggi dua petak. Satu ketukan lompat sudah cukup.',
    sub: 'Lompat dua petak',
  },
  'hutan-8': {
    name: 'Dua Pintu',
    tip: 'Dua pintu, empat tombol. Satu menahan, satu lewat, lalu gantian.',
    sub: 'Kerja sama tombol',
  },
  'hutan-9': {
    name: 'Jamur Kembar',
    tip: 'Jamur melempar ke papan tinggi. Lompat dari papan ke tebing.',
    sub: 'Jamur dan papan',
  },
  'hutan-10': {
    name: 'Lompat Kolam',
    tip: 'Tiga kolam berjajar. Seberangi kolam warnamu, lompati yang lain.',
    sub: 'Kolam bergantian',
  },
  'hutan-11': {
    name: 'Padang Bunga',
    tip: 'Santai dulu. Kumpulkan permata, jamur di kanan melempar tinggi.',
    sub: 'Level santai',
  },
  'hutan-12': {
    name: 'Papan dan Tombol',
    tip: 'Tombol ada di atas papan. Tahan di sana, temanmu lewat pintu.',
    sub: 'Tombol di ketinggian',
  },
  'hutan-13': {
    name: 'Gerbang Warna',
    tip: 'Gerbang hanya terbuka untuk warnanya. Merah lewat bawah, biru lewat atas.',
    sub: 'Gerbang warna',
  },
  'hutan-14': {
    name: 'Jembatan Kayu',
    tip: 'Merah menahan tombol kiri, biru lewat lalu menahan tombol kanan.',
    sub: 'Saling bantu',
  },
  'hutan-15': {
    name: 'Tuas Pohon',
    tip: 'Tuas di papan tinggi membuka pintu. Jamur membawamu ke sana.',
    sub: 'Tuas',
  },
  'hutan-16': {
    name: 'Kotak Kayu',
    tip: 'Dorong kotak ke tebing, naik, lalu tarik tuas.',
    sub: 'Kotak dorong',
  },
  'hutan-17': {
    name: 'Kebun Jamur',
    tip: 'Santai: dua jamur, banyak permata di atas papan.',
    sub: 'Level santai',
  },
  'hutan-18': {
    name: 'Dua Jalur',
    tip: 'Merah lewat gerbang bawah dan menahan tombol. Pintu atas terbuka untuk biru.',
    sub: 'Dua jalur',
  },
  'hutan-19': {
    name: 'Jamur dan Pintu',
    tip: 'Satu terpental ke tombol di atas, satu lagi lewat pintu.',
    sub: 'Tombol tinggi',
  },
  'hutan-20': {
    name: 'Sungai Lebar',
    tip: 'Naik lewat papan ke tuas, buka pintunya, lalu seberangi kolam.',
    sub: 'Kolam dan tuas',
  },
  'hutan-21': {
    name: 'Tangga Jamur',
    tip: 'Jamur, papan, lalu tuas di atas membuka pintu tebing.',
    sub: 'Memanjat tinggi',
  },
  'hutan-22': {
    name: 'Kotak dan Jamur',
    tip: 'Jamur untuk permata, kotak untuk naik ke tuas pintu.',
    sub: 'Kotak dan jamur',
  },
  'hutan-23': {
    name: 'Jalur Warna',
    tip: 'Merah di lorong bawah menahan tombol. Biru naik dengan jamur.',
    sub: 'Dua lantai',
  },
  'hutan-24': {
    name: 'Lift Kayu',
    tip: 'Satu menahan tombol, satu naik lift. Di atas, tombol menurunkan lagi.',
    sub: 'Lift',
  },
  'hutan-25': {
    name: 'Air Terjun',
    tip: 'Santai: naik papan demi papan sambil mengumpulkan permata.',
    sub: 'Level santai',
  },
  'hutan-26': {
    name: 'Kotak dan Tombol',
    tip: 'Kotak juga bisa menekan tombol. Dorong ke tombol, pintu terbuka.',
    sub: 'Kotak menekan tombol',
  },
  'hutan-27': {
    name: 'Menara Hutan',
    tip: 'Terpental ke kanan, naik zig-zag, tarik tuas, lalu ke pintu kiri atas.',
    sub: 'Memanjat zig-zag',
  },
  'hutan-28': {
    name: 'Benteng Akar',
    tip: 'Merah menahan tombol di lorong, biru menarik tuas di atas. Saling buka jalan.',
    sub: 'Puncak kerja sama',
  },
  'hutan-29': {
    name: 'Jembatan Lift',
    tip: 'Naik lift bergantian, lalu dorong kotak untuk naik ke pintu.',
    sub: 'Lift dan kotak',
  },
  'hutan-30': {
    name: 'Puncak Hutan',
    tip: 'Semua jadi satu: jamur, gerbang, tombol, tuas, dan kolam. Kalian pasti bisa!',
    sub: 'Puncak',
  },
  'gua-1': {
    name: 'Kolam Kunang',
    tip: 'Kolam warnamu aman. Kolam warna lain membuatmu kembali ke bendera.',
    sub: 'Kolam warna',
  },
  'gua-2': {
    name: 'Gerbang Kristal',
    tip: 'Pintu biru di kiri, pintu merah di kanan. Gerbang hanya terbuka untuk warnanya.',
    sub: 'Gerbang warna',
  },
  'gua-3': { name: 'Tuas Tua', tip: 'Naik undakan, lewati tuas supaya pintu besi terbuka.', sub: 'Tuas' },
  'gua-4': {
    name: 'Lift Kunang',
    tip: 'Tahan tombol supaya lift naik. Di atas ada tombol untuk menjemput teman.',
    sub: 'Lift',
  },
  'gua-5': {
    name: 'Tombol Kembar',
    tip: 'Dua pintu, empat tombol. Gantian menahan supaya semua lewat.',
    sub: 'Kerja sama tombol',
  },
  'gua-6': {
    name: 'Kotak Penolong',
    tip: 'Dorong kotak ke tebing, naik, lalu tarik tuas. Kabel kuning menunjukkan pintunya.',
    sub: 'Kotak dorong',
  },
};

/** Worlds (dunia) of the stage picker. */
export const BIOME_TEXT: Record<BiomeId, { name: string; sub: string }> = {
  hutan: { name: 'Hutan', sub: 'Papan kayu, jamur, tombol' },
  gua: { name: 'Gua', sub: 'Kotak, tuas, lift' },
  gurun: { name: 'Gurun', sub: 'Pasir isap, lantai rapuh' },
  salju: { name: 'Salju', sub: 'Es licin, balok meluncur' },
  awan: { name: 'Awan', sub: 'Angin naik, awan pantul' },
};

export function levelName(id: string): string {
  return LEVEL_TEXT[id]?.name ?? id;
}

/** A stage tip with colour placeholders filled in ({A} = first colour, {B} = second). */
export function levelTip(id: string): string {
  return (LEVEL_TEXT[id]?.tip ?? '').replace('{A}', SLOT_NAME[0]).replace('{B}', SLOT_NAME[1]);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function stars(n: number, of = 3): string {
  return '★'.repeat(Math.max(0, n)) + '☆'.repeat(Math.max(0, of - n));
}

export const STR = {
  gameTitle: 'Petualangan Warna',
  loadError: 'Game gagal dimuat. Coba lagi dari menu.',

  // Stage picker: world, then stage
  pickEyebrow: 'PILIH DUNIA',
  pickTitle: 'Mau main di dunia mana?',
  pickHint: (n: number) => `Kalian main ${n} level berturut-turut.`,
  pickNext: 'Pilih level',
  pickStart: 'Mulai',
  pickBack: 'Ganti dunia',
  levelEyebrow: (world: string) => `DUNIA ${world.toUpperCase()}`,
  levelTitle: 'Pilih level',
  levelHint: 'Level terbuka berurutan. Selesaikan untuk membuka berikutnya.',
  levelLabel: (n: number) => `Level ${n}`,
  levelLocked: 'Terkunci',
  soon: 'Segera hadir',
  worldStars: (got: number, of: number) => `${got}/${of} bintang`,
  pickWaiting: (host: string) => `${host} sedang memilih level…`,
  pickHostPicks: (host: string) => `${host} memilih di HP`,
  pickBest: (s: number) => (s > 0 ? `Terbaik ${stars(s)}` : 'Belum dimainkan'),
  screenPickTitle: 'Pilih dunia',
  screenLevelTitle: (world: string) => `Perjalanan ${world}`,
  journeyNext: 'Level berikutnya',

  // Intro
  stageOf: (i: number, n: number) => `Level ${i} dari ${n}`,
  worldLevel: (world: string, n: number) => `${world} · Level ${n}`,
  goal: 'Bawa semua ke pintu warnanya',
  introSolo: 'Main sendiri: kendalikan 2 karakter, tekan TUKAR untuk pindah.',
  skipFloat: 'Level dilewati',
  countTitle: (name: string) => name,
  countSub: (color: string, sym: string) => `Warnamu: ${color} ${sym}`,
  countSubSolo: 'Kamu memegang dua warna',

  // HUD
  hudStage: (i: number, n: number) => `Level ${i} dari ${n}`,
  hudCheckpoint: 'titik simpan',
  hudGems: 'Permata',
  legendTitle: 'Warna punya simbol',
  pushNeed: (have: number, need: number) => `Dorong berdua ${have}/${need}`,
  inExit: 'Di pintu',
  waitingFor: (names: string) => `Menunggu ${names}`,
  allAtDoor: 'Semua di pintu!',

  // Floats and feed
  gemFloat: '+1 permata',
  checkpointFloat: 'Titik simpan!',
  backFloat: 'Balik!',
  pingFloat: 'Di sini!',
  doorOpen: 'Pintu terbuka',
  liftUp: 'Lift naik',

  // Hints
  hintPlate: 'Injak tombol ini supaya pintunya terbuka',
  hintLever: 'Lewati tuas ini untuk menariknya',
  hintBox: 'Dorong kotak ini, lalu naik ke atasnya',
  hintExit: 'Masuk ke pintu warnamu',
  hintLift: 'Tombol ini menggerakkan lift',

  // Clear
  clearTitle: 'Level selesai!',
  skippedTitle: 'Level dilewati',
  skippedNote: 'Level berikutnya sudah terbuka',
  clearTime: (t: string) => `Waktu ${t}`,
  clearGems: (a: number, b: number) => `Permata ${a}/${b}`,
  starClear: 'Keluar bersama',
  starGems: 'Semua permata',
  starTime: (par: string) => `Di bawah ${par}`,
  nextStage: (name: string) => `Berikutnya: ${name}`,
  lastStage: 'Petualangan selesai',

  // Restart vote
  voteTitle: 'Ulang level?',
  voteCount: (n: number, need: number) => `${n}/${need} setuju`,
  voteSoloBody: 'Tekan ULANG sekali lagi',
  voteBody: 'Tekan ULANG untuk setuju',
  restarted: 'Level diulang',

  // Phone
  phoneEyebrow: 'WARNAMU',
  soloEyebrow: 'MAIN SENDIRI',
  btnJump: 'LOMPAT',
  btnSwap: 'TUKAR',
  btnSwapSub: (to: string) => `ke ${to}`,
  btnPing: 'TANDA',
  btnRestart: 'ULANG',
  btnHint: '?',
  btnHintSub: 'Petunjuk',
  btnSkip: 'LEWATI',
  statGems: 'Permata',
  statDoor: 'Pintu',
  statTime: 'Waktu',
  statStage: 'Level',
  hintSafe: (mine: string, others: string) =>
    others ? `Aman: kolam ${mine}. Hindari: ${others}` : `Aman: kolam ${mine}`,
  hintSolo: (idle: string) => `${idle} diam di tempat. Tukar kapan saja.`,
  alertBack: 'Kembali ke titik simpan',
  alertDoor: 'Sudah di pintu!',
  alertDoorBody: 'Tunggu teman masuk',
  clearPhoneTitle: 'Level selesai!',
  clearPhoneSub: (s: string, t: string) => `${s} · ${t}`,
  watchTitle: 'Tunggu level berikutnya',
  watchSub: 'Kamu ikut begitu level ini selesai.',
  phoneDone: 'Petualangan selesai!',
  phoneDoneSub: (s: number, of: number) => `Bintang tim ${s} dari ${of}`,
  statStars: 'Bintang',

  // Result
  resultTitle: (s: number, of: number) =>
    s >= of ? 'Sempurna! Semua bintang!' : `Tim dapat ${s} dari ${of} bintang`,
  resultSub: (stages: number, gems: number) => `${stages} level selesai · ${gems} permata`,
  rankLabel: (gems: number) => `${gems} permata`,

  // Awards
  awardPusher: 'Pendorong Andal',
  awardPusherDesc: (s: number) => `Mendorong kotak ${s} dtk`,
  awardGems: 'Pemburu Permata',
  awardGemsDesc: (n: number) => `${n} permata`,
  awardHelper: 'Penjaga Tombol',
  awardHelperDesc: (s: number) => `Menahan tombol dan tuas ${s} dtk`,
  awardFirst: 'Paling Cepat Pulang',
  awardFirstDesc: (n: number) => `Pertama di pintu ${n} kali`,
  awardJumper: 'Pelompat Ulung',
  awardJumperDesc: (n: number) => `${n} lompatan`,
  awardBrave: 'Pantang Menyerah',
  awardBraveDesc: (n: number) => `Bangkit ${n} kali`,
};
