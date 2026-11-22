/** Player-facing text of Hantu Tak Terlihat (Bahasa Indonesia). */
import type { MapId } from './maps';
import type { Fright, Skin } from './world';

export const MAP_NAME: Record<MapId, string> = { rumah: 'Rumah Tua', kampung: 'Kampung Malam' };
export const MAP_DESC: Record<MapId, string> = {
  rumah: 'Rumah gelap berlorong, hantu umum: bayangan, boneka',
  kampung: 'Kampung malam, hantu Nusantara yang lucu-seram',
};
export const FRIGHT_NAME: Record<Fright, string> = { ringan: 'Seram Ringan', beneran: 'Seram Beneran' };
export const FRIGHT_DESC: Record<Fright, string> = {
  ringan: 'Sisa cahaya lebih terang, efek lucu, hantu lebih pelan. Cocok untuk anak.',
  beneran: 'Gelap pekat, suara kejutan, hantu lebih cepat.',
};
export const SKIN_NAME: Record<Skin, string> = {
  bayangan: 'Bayangan',
  boneka: 'Boneka',
  pocong: 'Pocong',
  tuyul: 'Tuyul',
  genderuwo: 'Genderuwo',
  kuntilanak: 'Kuntilanak',
};

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const STR = {
  gameTitle: 'Hantu Tak Terlihat',
  loadError: 'Game gagal dimuat. Coba lagi dari menu.',

  // Setup
  menuEyebrow: (i: number, n: number) => `LANGKAH ${i} DARI ${n}`,
  menuMapTitle: 'Pilih tempat',
  menuMapHint: 'Bisa diganti lagi nanti di game berikutnya.',
  menuFrightTitle: 'Pilih rasa seram',
  menuFrightHint: 'Tanpa darah, tanpa suara pemandu.',
  menuNext: 'Lanjut',
  menuBack: 'Kembali',
  menuStart: 'Mulai',
  menuWaiting: (host: string) => `${host} sedang memilih tempat dan rasa seram…`,
  screenSetupTitle: 'Hantu Tak Terlihat',
  screenSetupMap: 'Tempat',
  screenSetupFright: 'Rasa seram',
  hostPicks: (host: string) => `${host} memilih di HP`,

  // Reveal
  revealEyebrow: (i: number, n: number) => `RONDE ${i} DARI ${n}`,
  revealTitle: 'Tahan kartu untuk melihat peranmu',
  revealGhost: 'HANTU',
  revealResident: 'PENGHUNI',
  revealGhostCaption: 'Tangkap penghuni. Posisimu rahasia di HP-mu.',
  revealResidentCaption: 'Cari 3 kunci, nyalakan sekring, kabur!',
  revealBlank: 'Peranmu',
  revealHint: 'Jangan tunjukkan layarmu.',
  screenReveal: 'Satu dari kalian adalah hantu…',
  screenRevealSolo: 'Ada yang mengintai di kegelapan…',
  screenRevealSub: 'Lihat peranmu di HP',

  // HUD
  hudKeys: (n: number, of: number) => `Kunci ${n}/${of}`,
  hudFuse: 'Sekring',
  hudFuseOff: 'MATI',
  hudFuseOn: 'NYALA',
  hudFusePct: (p: number) => `${Math.round(p * 100)}%`,
  hudSafe: (n: number) => `${n} aman`,
  hudExitOpen: 'Pintu keluar terbuka!',
  hudGhostLit: 'Hantu tersorot!',
  hudSilau: 'Hantu silau!',
  hudLightsOut: 'Lampu padam!',

  // Feed / floats
  feedKey: (name: string, n: number, of: number) => `${name} menemukan kunci ${n}/${of}`,
  feedFuse: (name: string) => `${name} menyalakan sekring!`,
  feedExit: 'Pintu keluar terbuka. Kabur!',
  feedCatch: (name: string) => `${name} jadi kunang-kunang`,
  feedEscape: (name: string) => `${name} berhasil kabur!`,
  feedNear: 'Lolos tipis!',
  noteEscaped: 'Kabur',
  feedSlam: 'Brak! Pintu terbanting',
  feedLit: (name: string) => `${name} menyorot hantu!`,
  feedBattery: (name: string) => `Senter ${name} habis`,

  // Round end
  endResidents: 'Penghuni menang!',
  endGhost: 'Hantu menang!',
  endEscaped: (a: number, b: number) => `${a} dari ${b} kabur`,
  endGhostWas: (name: string, skin: string) => `Hantunya: ${name} sebagai ${skin}`,
  endNext: (i: number) => `Ronde ${i} sebentar lagi`,
  endLast: 'Hasil akhir sebentar lagi',

  // Phone
  phoneResident: 'PENGHUNI',
  phoneGhost: 'KAMU HANTU',
  phoneFly: 'KUNANG-KUNANG',
  phoneKeys: (n: number, of: number) => `Kunci ${n}/${of}`,
  phoneCatches: (n: number, of: number) => `Tangkapan ${n}/${of}`,
  phoneFlyTitle: 'Terangi jalan teman',
  phoneFlyHint: 'Terbang bebas. Cahayamu membantu teman melihat.',
  statKeys: 'Kunci',
  statFuse: 'Sekring',
  statTorch: 'Senter',
  statTime: 'Waktu',
  btnRun: 'LARI',
  btnRunSub: (p: number) => `Stamina ${Math.round(p * 100)}%`,
  btnTorch: 'SENTER',
  btnTorchOn: 'nyala',
  btnTorchOff: 'mati',
  btnLights: 'MATIKAN LAMPU',
  btnLightsSub: 'semua padam',
  btnDoor: 'BANTING PINTU',
  btnDoorSub: 'pintu terdekat',
  hintGhost: 'Rahasia. Tutupi layarmu.',
  hintResident: 'Arahkan senter dengan joystick. LARI menguras stamina.',
  alertNear: 'Hantu dekat!',
  alertNearBody: 'Sorot dengan senter atau lari',
  alertExit: 'Pintu keluar terbuka!',
  alertExitBody: 'Lari ke pintu depan',
  alertBattery: 'Senter habis',
  alertBatteryBody: 'Matikan sebentar untuk mengisi',
  alertLit: (name: string) => `Kamu tersorot senter ${name}!`,
  alertLitBody: 'Menjauh dari cahaya',
  alertSilau: 'Silau! Kamu melambat',
  alertNoDoor: 'Tidak ada pintu dekat',
  escapedTitle: 'Kamu kabur!',
  escapedSub: 'Sorakkan temanmu yang masih di dalam.',
  endPhoneWin: 'Timmu menang!',
  endPhoneLose: 'Timmu kalah',
  endPhonePoints: (n: number) => `+${n} poin ronde ini`,
  watchTitle: 'Tunggu ronde berikutnya',
  watchSub: 'Kamu ikut begitu ronde ini selesai.',
  resultWin: 'Juara!',
  resultPlace: (n: number) => `Peringkat ${n}`,
  resultSub: (pts: number) => `${pts} poin`,
  statPoints: 'Poin',
  statEscapes: 'Kabur',
  statCatches: 'Tangkap',

  // Result
  resultTitle: (name: string) => `${name} paling berani!`,
  resultTie: (names: string[]) => `${names.join(' & ')} sama kuat!`,
  resultSubtitle: (res: number, ghost: number) => `Penghuni menang ${res}×, hantu menang ${ghost}×`,
  rankLabel: (pts: number) => `${pts} poin`,

  // Awards
  awardBrave: 'Paling Berani',
  awardBraveDesc: (n: number) => `Lolos tipis ${n}×`,
  awardBeam: 'Penyorot Jitu',
  awardBeamDesc: (s: number) => `Menyorot hantu ${s} dtk`,
  awardKeys: 'Pencari Kunci',
  awardKeysDesc: (n: number) => `${n} kunci`,
  awardFuse: 'Teknisi Sekring',
  awardFuseDesc: (s: number) => `Di sekring ${s} dtk`,
  awardGhost: 'Hantu Sunyi',
  awardGhostDesc: (n: number) => `${n} tangkapan`,
  awardRunner: 'Pelari Kilat',
  awardRunnerDesc: (n: number) => `Kabur ${n}×`,
  awardFly: 'Kunang Penolong',
  awardFlyDesc: (s: number) => `Menerangi ${s} dtk`,
};
