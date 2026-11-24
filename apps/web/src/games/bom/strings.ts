/**
 * Every player-facing text of Bom Oper (Indonesian, no em dash). Code and identifiers stay English.
 */
import type { ArenaId } from './arena';

const and = (list: readonly string[]): string =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} dan ${list[list.length - 1]}`;

/** Where (dx, dz) points as seen on the main screen: kanan, kiri atas, bawah... */
export function directionWord(dx: number, dz: number): string {
  const h = dx >= 0 ? 'kanan' : 'kiri';
  const v = dz >= 0 ? 'bawah' : 'atas';
  if (Math.abs(dx) > Math.abs(dz) * 2) return h;
  if (Math.abs(dz) > Math.abs(dx) * 2) return v;
  return `${h} ${v}`;
}

export const STR = {
  gameTitle: 'BOM OPER',
  noShell: 'Bom Oper harus dibuka dari aplikasi Kacawbalaw.',
  loadFailed: 'Gagal memuat Bom Oper. Periksa koneksi lalu buka lagi.',

  arenas: {
    halaman: { name: 'Halaman Rumah', sub: 'Pohon, sumur, dan bangku' },
    pasar: { name: 'Pasar Kaget', sub: 'Lapak berjajar dan peti' },
    atap: { name: 'Atap Gedung', sub: 'Tandon air dan mesin AC' },
  } satisfies Record<ArenaId, { name: string; sub: string }>,

  /* Picker */
  pickEyebrow: 'Bom Oper',
  pickTitle: 'Pilih tempat main',
  pickHint: 'Bom berdetak, waktunya rahasia. Oper sebelum BUM!',
  pickStart: 'Mulai',
  pickWaiting: (host: string) => (host ? `${host} sedang memilih tempat` : 'Host sedang memilih tempat'),
  pickScreenSub: (host: string) => (host ? `${host} memilih di HP` : 'Host memilih di HP'),
  pickNote: (n: number, rounds: number) => `${n} pemain · ${rounds} ronde · 3 nyawa`,

  roundOf: (no: number, total: number) => `Ronde ${no + 1}/${total}`,
  roundLong: (no: number, total: number) => `Ronde ${no + 1} dari ${total}`,
  brand: (no: number, total: number) => `RONDE ${no + 1}/${total}`,
  finalName: 'Ronde terakhir',
  finalLine: 'Dua bom sekaligus!',
  roundName: (no: number) => `Ronde ${no + 1}`,
  roundLine: 'Bom jatuh ke pemain acak',

  /* Intro card */
  howStick: 'Joystick',
  howStickSub: 'lari, pemegang bom sedikit lebih cepat',
  howPass: 'OPER',
  howPassSub: 'ketuk saat teman di dalam lingkar merah',
  howImmune: 'Kebal 2 detik',
  howImmuneSub: 'bom tidak bisa langsung dioper balik',

  /* HUD */
  holderBanner: (names: readonly string[]) => `BOM DI TANGAN ${and(names).toUpperCase()}`,
  dropBanner: 'BOM JATUH...',
  bannerSub: 'Sumbu menyala, waktu rahasia',
  boomBanner: (name: string) => `BUM! ${name.toUpperCase()}`,
  livesLabel: 'Nyawa',
  outPill: 'KELUAR',
  bombPill: 'BOM',
  immunePill: 'KEBAL',

  /* Call-outs */
  passFloat: 'OPER!',
  nearFloat: 'NYARIS!',
  boomFloat: 'BUM!',
  noOneFloat: 'Terlalu jauh',
  passToast: (a: string, b: string) => `${a} oper ke ${b}`,
  nearToast: (a: string) => `NYARIS! ${a} oper di detik terakhir`,
  boomToast: (name: string) => `BUM! ${name} kehilangan 1 nyawa`,
  outToast: (name: string) => `${name} kehabisan nyawa`,
  finalToast: 'Ronde terakhir: dua bom!',

  /* Score card */
  scoreTitle: (no: number) => `Ronde ${no + 1} selesai`,
  scoreNext: (s: number) => `Ronde berikutnya dalam ${Math.max(0, Math.ceil(s))}`,
  scoreLast: 'Menuju hasil...',
  scoreBoom: (names: readonly string[]) =>
    names.length > 0 ? `BUM di ${and(names)}` : 'Tidak ada yang meledak',

  /* Phone */
  pass: 'OPER',
  passNear: 'Dekat!',
  passFar: 'kejar teman',
  passIdle: 'kabur!',
  holdTitle: 'Kamu pegang bom!',
  runTitle: (names: readonly string[]) => `Kabur! Bom di ${and(names)}`,
  statLives: 'Nyawa',
  statRound: 'Ronde',
  nearestHint: (name: string, steps: number, dir: string) => `${name} ${steps} langkah di ${dir}`,
  immuneHint: (name: string, s: number) => `${name} kebal ${Math.max(1, Math.ceil(s))} detik`,
  chaseHint: 'Kejar teman terdekat lalu ketuk OPER',
  closingHint: (name: string, dir: string) => `${name} mendekat dari ${dir}!`,
  farHint: (name: string) => `${name} masih jauh. Jaga jarak!`,
  nearAlert: 'Dekat! Ketuk OPER',
  dangerAlert: 'Pemegang bom dekat!',
  introPhoneTitle: (no: number) => `Ronde ${no + 1}`,
  introPhoneSub: (final: boolean) => (final ? 'Ronde terakhir: dua bom!' : 'Bom jatuh sebentar lagi'),
  dropYou: 'Bom jatuh ke kamu!',
  dropYouSub: 'Siap-siap kejar teman',
  dropOther: 'Bom jatuh...',
  dropOtherSub: (names: readonly string[]) => `Ke ${and(names)}. Siap kabur!`,
  boomYou: 'BUM!',
  boomYouSub: 'Nyawa berkurang satu. Bangun lagi sebentar',
  boomOther: 'Selamat!',
  boomOtherSub: (name: string) => `BUM di ${name}`,
  outTitle: 'Nyawa habis',
  outSub: 'Kamu keluar. Sorakin yang masih bertahan!',
  scorePhone: (no: number) => `Ronde ${no + 1} selesai`,
  scorePhoneSub: (lives: number) => (lives === 1 ? 'Nyawa terakhir, hati-hati!' : `Masih ${lives} nyawa`),
  spectatorTitle: 'Arena sudah penuh',
  spectatorSub: 'Bom Oper untuk 8 pemain. Sorakin mereka dari sini!',
  resultPhoneTitle: (rank: number) => (rank === 1 ? 'Juara Bom Oper!' : `Peringkat ${rank}`),
  resultPhoneBig: (lives: number) => `${lives} nyawa`,
  resultPhoneSub: (passes: number) => `${passes} kali mengoper`,
  statPasses: 'Oper',
  statNear: 'Nyaris',

  /* Results */
  winner: (name: string) => `${name} juara Bom Oper!`,
  winnerSub: (arena: ArenaId, rounds: number) => `${STR.arenas[arena].name} · ${rounds} ronde`,
  rankLabel: (lives: number) => `${lives} nyawa`,

  awards: {
    champ: { title: 'Juara Bertahan', desc: (n: number) => `${n} nyawa tersisa di akhir` },
    passer: { title: 'Raja Oper', desc: (n: number) => `${n} kali mengoper bom` },
    slippery: { title: 'Paling Licin', desc: (s: number) => `Cuma memegang bom ${s} detik` },
    near: { title: 'Nyaris Meledak', desc: (n: number) => `${n} oper di detik terakhir` },
    panic: { title: 'Pelari Panik', desc: (m: number) => `Berlari ${m} meter` },
    tough: { title: 'Tahan Banting', desc: () => 'Bertahan dengan nyawa terakhir' },
    magnet: { title: 'Magnet Bom', desc: (n: number) => `Kebagian bom ${n} kali` },
    brave: { title: 'Pemberani', desc: () => 'Ikut kejar-kejaran sampai akhir' },
  },
} as const;
