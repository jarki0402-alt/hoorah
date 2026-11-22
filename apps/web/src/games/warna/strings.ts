/** Player-facing text of Petualangan Warna (Bahasa Indonesia). */
import type { Slot } from './levels';

export const SLOT_NAME: Record<Slot, string> = { 0: 'Merah', 1: 'Biru', 2: 'Hijau', 3: 'Kuning' };
/** Shape per colour, so colour-blind players can tell them apart. */
export const SLOT_SYMBOL: Record<Slot, string> = { 0: '▲', 1: '●', 2: '■', 3: '★' };
export const SLOT_SHAPE: Record<Slot, string> = { 0: 'segitiga', 1: 'lingkaran', 2: 'kotak', 3: 'bintang' };

export const LEVEL_TEXT: Record<string, { name: string; tip: string; sub: string }> = {
  kolam: {
    name: 'Kolam Kunang',
    tip: 'Seberangi kolam warnamu. Kolam warna lain membuatmu kembali ke titik simpan.',
    sub: 'Kenali kolam warna',
  },
  injak: {
    name: 'Tombol Injak',
    tip: 'Berdiri di tombol injak untuk membuka pintu. Gantian menahannya!',
    sub: 'Tombol injak dan pintu',
  },
  kotak: {
    name: 'Kotak Berat',
    tip: 'Kotak besar butuh dua pendorong. {B} menyeberang kolam atap ke tuas.',
    sub: 'Dorong berdua',
  },
  lift: {
    name: 'Lift Kunang',
    tip: 'Tahan tombol atau dorong tuas agar lift naik. Tuas tetap menyala.',
    sub: 'Lift dan tuas',
  },
  menara: {
    name: 'Menara Pundak',
    tip: 'Naik ke pundak teman. Lubang berwarna hanya bisa dimasuki warnanya.',
    sub: 'Berdiri di pundak',
  },
  besar: {
    name: 'Gua Besar',
    tip: 'Dorong kotak besar ke tombol, lalu kerja sama naik lift.',
    sub: 'Semua digabung',
  },
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

  // Stage picker
  pickEyebrow: 'PILIH TAHAP',
  pickTitle: 'Mulai dari tahap mana?',
  pickHint: (n: number) => `Kalian main ${n} tahap berturut-turut.`,
  pickStart: 'Mulai',
  pickWaiting: (host: string) => `${host} sedang memilih tahap…`,
  pickHostPicks: (host: string) => `${host} memilih di HP`,
  pickBest: (s: number) => (s > 0 ? `Terbaik ${stars(s)}` : 'Belum dimainkan'),
  screenPickTitle: 'Pilih tahap',

  // Intro
  stageOf: (i: number, n: number) => `Tahap ${i} dari ${n}`,
  introSolo: 'Main sendiri: kendalikan 2 karakter, tekan TUKAR untuk pindah.',
  countTitle: (name: string) => name,
  countSub: (color: string, sym: string) => `Warnamu: ${color} ${sym}`,
  countSubSolo: 'Kamu memegang dua warna',

  // HUD
  hudStage: (i: number, n: number) => `Tahap ${i} dari ${n}`,
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

  // Clear
  clearTitle: 'Tahap selesai!',
  clearTime: (t: string) => `Waktu ${t}`,
  clearGems: (a: number, b: number) => `Permata ${a}/${b}`,
  starClear: 'Keluar bersama',
  starGems: 'Semua permata',
  starTime: (par: string) => `Di bawah ${par}`,
  nextStage: (name: string) => `Berikutnya: ${name}`,
  lastStage: 'Petualangan selesai',

  // Restart vote
  voteTitle: 'Ulang tahap?',
  voteCount: (n: number, need: number) => `${n}/${need} setuju`,
  voteSoloBody: 'Tekan ULANG sekali lagi',
  voteBody: 'Tekan ULANG untuk setuju',
  restarted: 'Tahap diulang',

  // Phone
  phoneEyebrow: 'WARNAMU',
  soloEyebrow: 'MAIN SENDIRI',
  btnJump: 'LOMPAT',
  btnSwap: 'TUKAR',
  btnSwapSub: (to: string) => `ke ${to}`,
  btnPing: 'TANDA',
  btnRestart: 'ULANG',
  statGems: 'Permata',
  statDoor: 'Pintu',
  statTime: 'Waktu',
  statStage: 'Tahap',
  hintSafe: (mine: string, others: string) =>
    others ? `Aman: kolam ${mine}. Hindari: ${others}` : `Aman: kolam ${mine}`,
  hintSolo: (idle: string) => `${idle} diam di tempat. Tukar kapan saja.`,
  alertBack: 'Kembali ke titik simpan',
  alertDoor: 'Sudah di pintu!',
  alertDoorBody: 'Tunggu teman masuk',
  clearPhoneTitle: 'Tahap selesai!',
  clearPhoneSub: (s: string, t: string) => `${s} · ${t}`,
  watchTitle: 'Tunggu tahap berikutnya',
  watchSub: 'Kamu ikut begitu tahap ini selesai.',
  phoneDone: 'Petualangan selesai!',
  phoneDoneSub: (s: number, of: number) => `Bintang tim ${s} dari ${of}`,
  statStars: 'Bintang',

  // Result
  resultTitle: (s: number, of: number) =>
    s >= of ? 'Sempurna! Semua bintang!' : `Tim dapat ${s} dari ${of} bintang`,
  resultSub: (stages: number, gems: number) => `${stages} tahap selesai · ${gems} permata`,
  rankLabel: (gems: number) => `${gems} permata`,

  // Awards
  awardPillar: 'Tiang Kokoh',
  awardPillarDesc: (s: number) => `Jadi pijakan ${s} dtk`,
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
