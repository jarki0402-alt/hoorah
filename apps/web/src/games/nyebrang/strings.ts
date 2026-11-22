/** Every player-facing string of Nyebrang lives here (Indonesian). */
import type { MapId } from './lanes';
import type { DeathKind, MapPick, Mode } from './logic';

export const MAP_NAME: Record<MapPick, string> = {
  kota: 'Kota',
  sungai: 'Sungai',
  rel: 'Rel',
  malam: 'Malam',
  acak: 'Acak',
};

export const MAP_DESC: Record<MapPick, string> = {
  kota: 'Angkot, motor, dan bajaj lalu-lalang',
  sungai: 'Pijak batang kayu dan teratai',
  rel: 'Kereta lewat, tunggu lampu padam',
  malam: 'Gelap, ikuti lampu jalan',
  acak: 'Map berganti tiap ronde',
};

export const MODE_NAME: Record<Mode, string> = { balapan: 'Balapan', bertahan: 'Bertahan' };
export const MODE_DESC: Record<Mode, string> = {
  balapan: 'Pertama ke garis akhir. Gugur, kembali 3 detik',
  bertahan: 'Satu nyawa, terakhir berdiri menang',
};

export function formatClock(s: number): string {
  const sec = Math.max(0, Math.ceil(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const STR = {
  title: 'NYEBRANG',
  loadError: 'Gagal memuat Nyebrang. Coba buka lagi dari layar utama.',

  /* Setup */
  menuEyebrow: (n: number, total: number) => `PENGATURAN ${n}/${total}`,
  menuModeTitle: 'Pilih mode',
  menuModeHint: 'Berlaku untuk semua ronde.',
  menuMapTitle: 'Pilih map',
  menuMapHint: 'Acak: map berganti tiap ronde.',
  menuNext: 'Lanjut',
  menuBack: 'Kembali',
  menuStart: 'Mulai!',
  menuWaiting: (host: string) => `${host} sedang memilih mode dan map…`,
  setupHostPicks: (host: string) => `${host} memilih di HP`,
  setupLead: 'Lompat serentak menyeberangi jalan, sungai, dan rel. Kamera terus maju, yang tertinggal gugur.',
  setupMode: 'MODE',
  setupMap: 'MAP',

  /* HUD */
  roundChip: (n: number, total: number) => `RONDE ${n}/${total}`,
  finalChip: 'FINAL · POIN GANDA',
  camera: 'KAMERA',
  cameraLevel: (n: number) => `x${n}`,
  board: 'URUTAN LOMPAT',
  boardOut: 'gugur',
  boardBack: (s: number) => `kembali ${s}`,
  boardDone: (p: number) => `finis #${p}`,
  edgeHint: 'TEPI LAYAR MAJU, JANGAN TERTINGGAL',
  introRound: (n: number, total: number) => `RONDE ${n} DARI ${total}`,
  introFinal: 'RONDE FINAL · POIN GANDA',
  go: 'LOMPAT!',
  near: 'NYARIS!',
  nearPts: (n: number) => `+${n}`,
  train: 'KERETA!',
  out: 'GUGUR',
  outBack: (s: number) => `GUGUR · KEMBALI ${s}`,
  finish: (p: number) => `FINIS #${p}`,
  timeUp: 'WAKTU HABIS',
  last10: '10 DETIK LAGI',
  levelUp: 'KAMERA MAKIN CEPAT',
  record: 'REKOR BARU!',
  recordLine: (n: number) => `Rekor jarak: ${n}`,

  /* Ronde end */
  roundEndTitle: (n: number) => `HASIL RONDE ${n}`,
  colDistance: 'Jarak',
  colNear: 'Nyaris',
  colGained: 'Poin',
  nextRound: (s: number) => `Ronde berikutnya dalam ${s}`,
  finalSoon: (s: number) => `Hasil akhir dalam ${s}`,
  finalTitle: 'HASIL AKHIR',
  deathLine: (name: string, kind: DeathKind) => `${name} ${DEATH_TEXT[kind]}`,

  /* Phone */
  padTitle: (hops: number) => `${hops} lompatan`,
  padEyebrow: (place: number, mode: string, map: string) => `Posisi ${place} · ${mode} · ${map}`,
  padAction: 'MAJU',
  padHint: 'Usap ke mana saja: 1 usap = 1 lompatan. Ketuk = maju.',
  statRound: 'Ronde',
  statCamera: 'Kamera',
  statNear: 'Nyaris',
  trainTitle: 'KERETA!',
  trainBody: 'Kereta lewat. Tunggu sebentar, lalu maju.',
  banner: (s: number) => `Kembali dalam ${s}…`,
  countTitle: 'Siap-siap!',
  countSub: (map: string, mode: string) => `${mode} di map ${map}`,
  outTitle: 'GUGUR!',
  outSub: (row: number) => `Tertinggal di lompatan ${row}. Ronde ini kamu menonton dulu.`,
  doneTitle: (place: number) => `Finis #${place}!`,
  doneSub: 'Sorak untuk teman yang masih menyeberang.',
  hornLabel: 'Klakson iseng',
  watchTitle: 'Tonton dulu ya',
  watchSub: 'Kamu ikut di ronde berikutnya.',
  roundPhoneTitle: (n: number) => `Ronde ${n} selesai`,
  statDistance: 'Jarak',
  statGained: 'Poin ronde',
  statTotal: 'Total',
  finalPhone: (rank: number) => (rank === 1 ? 'Juara!' : `Peringkat ${rank}`),
  points: (n: number) => `${n} poin`,

  /* Results */
  resultWinner: (name: string) => `${name} paling jauh!`,
  resultTie: (names: string[]) => `${names.join(' & ')} sama hebat!`,
  resultSub: (rounds: number, map: string) => `${rounds} ronde · ${map}`,
  rankLabel: (score: number, dist: number) => `${score} poin · jarak ${dist}`,
  awards: {
    far: 'Penjelajah',
    farDesc: (n: number) => `Jarak terjauh ${n} lompatan`,
    near: 'Lolos Tipis',
    nearDesc: (n: number) => `${n} kali nyaris tertabrak`,
    river: 'Raja Sungai',
    riverDesc: (n: number) => `${n} lompatan di atas air`,
    rail: 'Penakluk Rel',
    railDesc: (n: number) => `Menyeberang rel ${n} kali`,
    bold: 'Paling Nekat',
    boldDesc: (n: number) => `${n} lompatan tanpa ragu`,
    tough: 'Pantang Menyerah',
    toughDesc: (n: number) => `Bangkit lagi setelah ${n} kali gugur`,
    safe: 'Paling Hati-Hati',
    safeDesc: 'Hampir tidak pernah gugur',
    back: 'Mundur Cantik',
    backDesc: (n: number) => `${n} langkah mundur demi selamat`,
    fan: 'Pemandu Sorak',
    fanDesc: 'Tetap seru sampai akhir',
  },
};

const DEATH_TEXT: Record<DeathKind, string> = {
  hit: 'tertabrak',
  train: 'tersambar kereta',
  water: 'tercebur',
  drift: 'hanyut',
  edge: 'tertinggal',
};

export const MAP_IDS: readonly MapId[] = ['kota', 'sungai', 'rel', 'malam'];
