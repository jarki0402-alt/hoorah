import type { GfxReason, GfxTier } from '../games/common/gfx';

export const STR = {
  title: 'Diagnosa grafis',
  lead: 'Buka halaman ini di layar yang mau dicek, lalu foto layar ini.',
  browser: 'Browser',
  screen: 'Layar',
  refresh: 'Refresh layar',
  gpu: 'Chip grafis',
  webgl: 'WebGL',
  device: 'Perangkat',
  test: 'Uji GPU',
  tv: 'Dikenali sebagai TV',
  level: 'Level grafis game 3D',
  slow: 'Pernah patah-patah di',
  testing: 'Sedang menguji…',
  noWebgl: 'Tidak ada WebGL',
  unknown: 'tidak diketahui',
  yes: 'Ya',
  no: 'Tidak',
  none: 'belum pernah',
  perLayer: (ms: number) => `${ms.toLocaleString('id-ID')} ms per lapis 1280×720`,
  screenSize: (w: number, h: number, dpr: number, pw: number, ph: number) =>
    `${w}×${h} · DPR ${dpr.toLocaleString('id-ID')} · fisik ${pw}×${ph}`,
  deviceInfo: (cores: number | null, ram: number | null) =>
    `${cores ? `${cores} inti CPU` : 'CPU tidak diketahui'} · ${ram ? `RAM ${ram.toLocaleString('id-ID')} GB` : 'RAM tidak diketahui'}`,
  webglInfo: (v2: boolean, maxTexture: number) =>
    `${v2 ? 'WebGL 2' : 'WebGL 1'} · tekstur maks ${maxTexture}`,
  fps: (n: number) => `${n} fps`,
  retest: 'Uji ulang',
  auto: 'Otomatis',
  reset: 'Atur ulang',
  back: 'Kembali ke Hoorah',
  choose: 'Pilih level grafis',
  saved: 'Tersimpan di perangkat ini.',
} as const;

export const TIER_NAME: Record<GfxTier, string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Ringan',
};

export const REASON: Record<GfxReason, string> = {
  forced: 'pilihan manual',
  remembered: 'game sebelumnya patah-patah',
  probe: 'hasil uji GPU',
  tv: 'browser TV',
  software: 'tanpa GPU (perangkat lunak)',
  'weak-gpu': 'chip grafis ringan',
  mobile: 'HP atau tablet',
  desktop: 'laptop atau PC',
};
