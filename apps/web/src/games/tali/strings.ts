/**
 * Every player-facing text of Satu Tali (Indonesian, no em dash). Code and identifiers stay English.
 */
import type { RouteId, SegmentKind } from './course';

/** Seconds as m:ss. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds + 1e-6));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const names = (list: readonly string[]): string =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} dan ${list[list.length - 1]}`;

export const STR = {
  gameTitle: 'SATU TALI',
  noShell: 'Satu Tali harus dibuka dari aplikasi Hoorah.',
  loadFailed: 'Gagal memuat Satu Tali. Periksa koneksi lalu buka lagi.',

  routes: {
    senja: { name: 'Tebing Senja', sub: 'Tebing batu di bawah langit jingga' },
    bambu: { name: 'Hutan Bambu', sub: 'Titian bambu di atas sungai' },
    salju: { name: 'Puncak Salju', sub: 'Lift es menuju puncak' },
  } satisfies Record<RouteId, { name: string; sub: string }>,
  segments: {
    gap: 'Celah',
    steps: 'Tangga batu',
    mover: 'Rakit geser',
    bar: 'Palang berputar',
    climb: 'Dinding panjat',
    beam: 'Titian sempit',
    lift: 'Lift naik',
  } satisfies Record<SegmentKind, string>,
  levelName: ['Pemanasan', 'Makin tinggi', 'Puncak'] as const,

  sectionOf: (no: number, total: number) => `Bagian ${no + 1}/${total}`,
  sectionLong: (no: number, total: number) => `Bagian ${no + 1} dari ${total}`,
  brand: (route: RouteId, no: number, total: number) =>
    `${STR.routes[route].name} · bagian ${no + 1}/${total}`,

  /* Route picker */
  pickEyebrow: 'Satu Tali',
  pickTitle: 'Pilih lintasan',
  pickHint: 'Semua terikat satu tali. Naik bareng sampai bendera terakhir.',
  pickStart: 'Mulai',
  pickWaiting: (host: string) => (host ? `${host} sedang memilih lintasan` : 'Host sedang memilih lintasan'),
  pickScreenSub: (host: string) => (host ? `${host} memilih di HP` : 'Host memilih di HP'),
  pickSolo: 'Main sendiri: kamu diikat ke karung pemberat.',
  pickTeam: (n: number) => `${n} pemain, satu tali`,
  recordLabel: (t: string) => `Rekor tim ${t}`,

  /* Intro card */
  introGoal: 'Semua berdiri di bendera untuk lanjut',
  introAhead: 'Rintangan di bagian ini',
  howStick: 'Joystick',
  howStickSub: 'jalan, tali menarik yang tertinggal',
  howJump: 'LOMPAT',
  howJumpSub: 'lompat bareng, PANJAT saat tergantung',
  howGrip: 'PEGANG',
  howGripSub: 'tahan tali, pinggiran, dan dinding panjat',
  howSack: 'LEMPAR',
  howSackSub: 'lempar karung ke seberang, PEGANG untuk menariknya',

  /* Countdown and call-outs */
  countTitle: 'Siap-siap!',
  countSub: (no: number, total: number) => `Bagian ${no + 1} dari ${total}`,
  introTitle: (no: number) => `Bagian ${no + 1}`,
  introSub: 'Lihat rintangannya di layar',
  go: 'NAIK!',
  syncFloat: 'Kompak!',
  catchFloat: 'Ditangkap!',
  climbFloat: 'Sampai atas!',
  saveFloat: 'Simpan!',
  sweepFloat: 'Awas palang!',
  catchToast: (name: string, by: readonly string[]) =>
    by.length > 0 ? `Ditangkap! ${names(by)} menahan ${name}` : `Ditangkap! ${name} tertahan tali`,
  rescueToast: (name: string, by: readonly string[]) =>
    by.length > 0 ? `${names(by)} menarik ${name} naik` : `${name} naik lagi`,
  wipeToast: 'Jatuh semua! Ulang dari bendera terakhir',
  saveToast: 'Titik simpan! Jatuh semua kembali ke sini',
  climbToast: (name: string) => `${name} sampai di atas dinding`,
  throwToast: 'Karung dilempar!',

  /* HUD */
  timeLabel: 'WAKTU TIM',
  leftLabel: (s: number) => `Sisa ${s} dtk`,
  flagsLabel: 'BENDERA',
  tensionLabel: 'Tegangan tali',
  tension: ['KENDUR', 'TEGANG', 'BAHAYA'] as const,
  catchesLabel: 'Tangkapan tim',
  sack: 'Karung',
  help: 'Tahan PEGANG saat teman jatuh. Mundur sambil PEGANG untuk menariknya naik.',
  helpSolo: 'LEMPAR karung ke seberang celah, lalu tahan PEGANG untuk menariknya.',

  /* Flag card */
  flagTitle: (no: number) => `Bendera ${no + 1}!`,
  timeoutTitle: 'Waktu habis',
  timeoutSub: 'Tim dipindah ke bagian berikutnya',
  flagTime: (t: string) => `Waktu ${t}`,
  flagWipes: (n: number) => (n === 0 ? 'Tanpa jatuh' : `Jatuh ${n} kali`),
  flagNext: (s: number) => `Bagian berikutnya dalam ${Math.max(0, Math.ceil(s))}`,
  flagLast: 'Menuju hasil...',
  starsOf: (n: number, max: number) => `${n}/${max} bintang`,

  /* Phone */
  jump: 'LOMPAT',
  climbRope: 'PANJAT',
  vault: 'NAIK',
  grip: 'PEGANG',
  gripSub: 'tahan',
  throw: 'LEMPAR',
  throwSub: 'karung',
  padTitle: (flags: number, total: number) => `Bendera ${flags}/${total}`,
  statTime: 'Waktu',
  statCatches: 'Tangkap',
  tiedTo: (list: readonly string[]) => `Terikat ke ${names(list)}`,
  ropeSlack: 'tali kendur',
  ropeTight: 'tali tegang',
  ropeDanger: 'tali tegang sekali!',
  friendFellTitle: 'Temanmu jatuh!',
  friendFellBody: 'Tahan PEGANG, lalu mundur untuk menarik naik',
  hangTitle: 'Kamu tergantung!',
  hangBody: 'Ketuk PANJAT untuk naik tali',
  caughtTitle: 'Ditangkap!',
  caughtBody: (by: readonly string[]) => (by.length > 0 ? `${names(by)} menahanmu` : 'Tali menahanmu'),
  ledgeTitle: 'Bergelantung!',
  ledgeBody: 'Ketuk NAIK untuk naik ke atas',
  sackTitle: 'Karung tergantung',
  sackBody: 'Tahan PEGANG untuk menarik karung',
  wallHint: 'Tahan PEGANG di dinding untuk memanjat',
  throwHint: 'Dekati karung lalu ketuk LEMPAR',
  flagPhoneTitle: (no: number) => `Bendera ${no + 1}!`,
  flagPhoneSub: (stars: number) =>
    stars === 3 ? 'Sempurna, tiga bintang!' : stars === 2 ? 'Mantap, dua bintang' : 'Berhasil, satu bintang',
  waitTitle: 'Tunggu sebentar',
  waitSub: 'Bagian berikutnya segera mulai',
  spectatorTitle: 'Tim sudah penuh',
  spectatorSub: 'Satu tali untuk 4 pemain. Sorakin mereka dari sini!',
  resultPhoneTitle: (stars: number, max: number) =>
    stars >= max ? 'Sampai puncak, sempurna!' : stars >= max * 0.6 ? 'Sampai puncak!' : 'Puncak terlewati!',
  resultPhoneSub: (t: string) => `Waktu tim ${t}`,
  statStars: 'Bintang',
  statCatchesLong: 'Tangkapan',

  /* Results */
  winner: (stars: number, max: number) =>
    stars >= max ? 'Sampai puncak bersama, sempurna!' : 'Sampai puncak bersama!',
  winnerSub: (route: RouteId, stars: number, max: number, t: string) =>
    `${STR.routes[route].name} · ${stars} dari ${max} bintang · waktu tim ${t}`,
  newRecord: 'Rekor tim baru!',
  rankLabel: (stars: number) => `${stars} bintang`,

  awards: {
    saver: { title: 'Penyelamat Terbaik', desc: (n: number) => `Menahan atau menarik teman ${n} kali` },
    drama: { title: 'Jatuh Paling Dramatis', desc: (n: number) => `Bergelantung di tali ${n} kali` },
    sync: { title: 'Lompat Paling Kompak', desc: (n: number) => `${n} lompatan bareng teman` },
    climber: { title: 'Raja Panjat', desc: (n: number) => `Memanjat ${n} dinding` },
    anchor: { title: 'Jangkar Tim', desc: (s: number) => `Memegang tali ${s} detik` },
    rope: { title: 'Tangan Besi', desc: (n: number) => `Memanjat tali ${n} kali` },
    leader: { title: 'Penunjuk Jalan', desc: (n: number) => `Duluan sampai bendera ${n} kali` },
    thrower: { title: 'Pelempar Karung', desc: (n: number) => `Melempar karung ${n} kali` },
    jumper: { title: 'Tukang Lompat', desc: (n: number) => `${n} lompatan` },
    buddy: { title: 'Teman Setia', desc: () => 'Tetap terikat sampai puncak' },
  },
} as const;
