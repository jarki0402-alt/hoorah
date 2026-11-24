/**
 * Every player-facing Jago Masak string (Indonesian). Never say "TV": the main screen can be a
 * laptop, tablet or Smart TV, so it is "layar".
 */
import type { Grade, GradeReason } from './logic';
import type { DishId, GestureMode, StepId, SwipeDir } from './recipes';

/** 1250 -> "1.250" (Indonesian thousands separator). */
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export interface StepText {
  title: string;
  /** Phone hint under the gesture pad. */
  hint: string;
  /** Short line on the main screen while the step runs. */
  cue: string;
}

const STEPS: Record<StepId, StepText> = {
  'nasgor-chop': {
    title: 'Iris bawang!',
    hint: 'Ketuk cepat untuk mengiris bawang merah dan bawang putih.',
    cue: 'Iris tipis-tipis',
  },
  'nasgor-pound': {
    title: 'Ulek bumbu!',
    hint: 'Ketuk cepat untuk mengulek cabai dan bawang sampai halus.',
    cue: 'Ulek sampai halus',
  },
  'nasgor-saute': {
    title: 'Tumis bumbu!',
    hint: 'Putar jari di lingkaran untuk menumis sampai harum.',
    cue: 'Tumis sampai harum',
  },
  'nasgor-toss': {
    title: 'Aduk nasinya!',
    hint: 'Putar terus sampai nasi rata kecokelatan.',
    cue: 'Aduk sampai rata',
  },
  'nasgor-egg': {
    title: 'Ceplok telur!',
    hint: 'Tahan untuk menggoreng. Lepas saat jarum di layar masuk zona emas.',
    cue: 'Lepas saat keemasan',
  },
  'nasgor-plate': {
    title: 'Sajikan!',
    hint: 'Usap ke bawah untuk menyendok nasi ke piring.',
    cue: 'Sendok ke piring',
  },
  'sate-cut': {
    title: 'Potong ayam!',
    hint: 'Ketuk cepat untuk memotong ayam jadi dadu.',
    cue: 'Potong dadu',
  },
  'sate-skewer': {
    title: 'Tusuk sate!',
    hint: 'Usap ke kanan untuk menusuk satu tusuk sate.',
    cue: 'Tusuk satu per satu',
  },
  'sate-fan': {
    title: 'Kipas baranya!',
    hint: 'Usap ke kiri berkali-kali supaya bara menyala.',
    cue: 'Kipas terus',
  },
  'sate-flip': {
    title: 'Balik satenya!',
    hint: 'Usap ke atas untuk membalik sate.',
    cue: 'Bolak-balik',
  },
  'sate-sauce': {
    title: 'Siram bumbu kacang!',
    hint: 'Tahan untuk menuang. Lepas saat jarum di layar masuk zona emas.',
    cue: 'Lepas saat pas',
  },
  'sate-sprinkle': {
    title: 'Taburi bawang goreng!',
    hint: 'Ketuk untuk menabur bawang goreng.',
    cue: 'Tabur yang rata',
  },
  'mart-mix': {
    title: 'Kocok adonan!',
    hint: 'Putar jari di lingkaran sampai adonan licin.',
    cue: 'Kocok sampai licin',
  },
  'mart-pour': {
    title: 'Tuang ke loyang!',
    hint: 'Tahan untuk menuang. Lepas saat jarum di layar masuk zona emas.',
    cue: 'Lepas saat pas',
  },
  'mart-butter': {
    title: 'Oles mentega!',
    hint: 'Putar jari untuk meratakan mentega.',
    cue: 'Oles merata',
  },
  'mart-sprinkle': {
    title: 'Taburi meses & keju!',
    hint: 'Ketuk cepat untuk menabur topping.',
    cue: 'Tabur yang banyak',
  },
  'mart-fold': {
    title: 'Lipat martabak!',
    hint: 'Usap ke kiri untuk melipat.',
    cue: 'Lipat jadi dua',
  },
  'mart-cut': {
    title: 'Potong-potong!',
    hint: 'Ketuk untuk memotong martabak.',
    cue: 'Potong rapi',
  },
};

const DISH_NAME: Record<DishId, string> = {
  nasgor: 'Nasi Goreng',
  sate: 'Sate Ayam',
  martabak: 'Martabak Manis',
};

const DISH_DESC: Record<DishId, string> = {
  nasgor: 'Nasi goreng kampung pedas dengan telur ceplok keemasan.',
  sate: 'Sate ayam bakar arang, disiram bumbu kacang.',
  martabak: 'Martabak tebal bersarang, penuh meses dan keju.',
};

const GRADE: Record<Grade, string> = {
  sempurna: 'Sempurna!',
  bagus: 'Bagus!',
  lumayan: 'Lumayan',
  gagal: 'Gagal',
};

const GRADE_SHORT: Record<Grade, string> = {
  sempurna: 'SEMPURNA',
  bagus: 'BAGUS',
  lumayan: 'LUMAYAN',
  gagal: 'GAGAL',
};

const DIR: Record<SwipeDir, string> = {
  up: 'Usap ke atas',
  down: 'Usap ke bawah',
  left: 'Usap ke kiri',
  right: 'Usap ke kanan',
};

export const STR = {
  noShell: 'Buka Jago Masak dari layar utama Kacawbalaw.',
  unknownPlayer: 'Pemain',
  offline: 'Terputus',

  step: (id: StepId): StepText => STEPS[id],
  dish: (id: DishId) => DISH_NAME[id],
  dishDesc: (id: DishId) => DISH_DESC[id],
  grade: (g: Grade) => GRADE[g],
  gradeShort: (g: Grade) => GRADE_SHORT[g],

  /** Why a grade happened, shown under the stamp. Hold steps word "over" by what overdoing does. */
  reason: (r: GradeReason, over: 'burn' | 'spill' | null): string => {
    switch (r) {
      case 'fast':
        return 'Cepat sekali';
      case 'done':
        return 'Beres';
      case 'slow':
        return 'Belum selesai';
      case 'golden':
        return over === 'spill' ? 'Takaran pas' : 'Keemasan';
      case 'close':
        return over === 'spill' ? 'Hampir pas' : 'Matang';
      case 'over':
        return over === 'spill' ? 'Kebanyakan' : 'Kecokelatan';
      case 'burnt':
        return over === 'spill' ? 'Tumpah!' : 'Gosong!';
      case 'raw':
        return over === 'spill' ? 'Kurang banyak' : 'Masih mentah';
      case 'missed':
        return 'Terlewat';
      case 'idle':
        return 'Belum mulai';
    }
  },

  modeCue: (mode: GestureMode, dir: SwipeDir | undefined, over: 'burn' | 'spill' | null): string => {
    switch (mode) {
      case 'tap':
        return 'Ketuk cepat';
      case 'stir':
        return 'Putar jari';
      case 'swipe':
        return DIR[dir ?? 'up'];
      case 'hold':
        return over === 'spill' ? 'Tahan untuk menuang' : 'Tahan untuk menggoreng';
    }
  },

  /* ---------------------------------------------------------------- main screen HUD */
  dishOf: (i: number, n: number) => `HIDANGAN ${i}/${n}`,
  stepOf: (i: number, n: number) => `LANGKAH ${i}/${n}`,
  introSteps: 'Langkah memasak',
  introGet: 'Siap-siap di HP!',
  readyLabel: 'Bersiap',
  doneWaiting: 'Selesai',
  zoneGold: 'PAS',
  holdHint: 'Lepas di zona emas',
  stars: (n: number) => `${n} bintang`,
  dishScore: (n: number) => `+${n}`,
  total: 'Total',
  points: (n: number) => `${n} poin`,
  popup: (n: number) => `+${n}`,
  streak: (n: number) => `Beruntun ${n}x`,
  showcaseTitle: (dish: DishId) => `${DISH_NAME[dish]} siap disajikan!`,
  finalTitle: 'Juara Dapur',
  /* Solo: score attack against your own record (PRD 6.4) */
  finalTitleSolo: 'Hasil Masakmu',
  chefFinalSolo: 'Terima kasih, koki hebat!',
  recordBefore: (best: number) => `Rekor: ${num(best)} poin`,
  recordFirst: (v: number) => `Rekor pertama tercatat: ${num(v)} poin`,
  recordNew: (best: number, prev: number) => `Rekor baru! ${num(best)} poin (sebelumnya ${num(prev)})`,
  recordTie: (best: number) => `Menyamai rekor: ${num(best)} poin`,
  recordShort: (best: number, gap: number) => `Rekor: ${num(best)} poin, kurang ${num(gap)} lagi`,
  finalTie: 'Juara bersama',
  waitingPlayers: 'Menunggu pemain tersambung…',
  goShout: 'MASAK!',
  chefName: 'CHEF MANGGA',

  /* ---------------------------------------------------------------- Chef Mangga */
  chefIntroFirst: (dish: DishId) => `Halo, koki! Kita masak ${DISH_NAME[dish]}!`,
  chefIntro: (dish: DishId) => `Sekarang, ${DISH_NAME[dish]}!`,
  chefReady: ['Siap?', 'Ayo!', 'Fokus, ya!', 'Gas!'],
  chefSempurna: ['Mantap!', 'Juara!', 'Wangi banget!', 'Pas sekali!'],
  chefBagus: ['Enak nih!', 'Bagus!', 'Lanjut, koki!'],
  chefLumayan: ['Sedikit lagi!', 'Hampir!', 'Ayo, lebih cepat!'],
  chefGagal: ['Waduh!', 'Aduh, belum jadi!', 'Ayo bangkit!'],
  chefBurnt: 'Waduh, gosong!',
  chefSpilled: 'Waduh, tumpah!',
  chefRaw: 'Masih mentah!',
  chefShowcase: ['Hmm, harum sekali!', 'Silakan dicicipi!', 'Cantik platingnya!'],
  chefFinal: 'Terima kasih, koki-koki hebat!',

  /* ---------------------------------------------------------------- phone */
  phoneStep: (dish: DishId, i: number, n: number) => `${DISH_NAME[dish]} · Langkah ${i}/${n}`,
  phoneReadyHint: 'Lihat layar. Siap-siap…',
  phoneDoneHint: 'Tunggu koki lain selesai.',
  phoneGradeEyebrow: (i: number, n: number, pts: number) => `Langkah ${i}/${n} · +${pts}`,
  phoneIntroEyebrow: (i: number, n: number) => `Hidangan ${i}/${n}`,
  phoneIntroSub: 'Lihat langkahnya di layar. Siap-siap!',
  phoneDishTitle: (dish: DishId) => `${DISH_NAME[dish]} jadi!`,
  phoneStarsBig: (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n)),
  phoneDishSub: (pts: number) => `+${pts} poin dari hidangan ini`,
  phoneStarsLabel: (n: number) => `${n} dari 3 bintang`,
  phonePerfects: 'Sempurna',
  phoneTotal: 'Skor total',
  phoneBestStreak: 'Beruntun terbaik',
  phoneFinalWin: 'Juara Dapur!',
  phoneFinalRank: (r: number) => `Peringkat ${r}`,
  phoneFinalScore: (s: number) => `${s} poin`,
  phoneFinalSub: (stars: number) => `Total ${stars} bintang`,
  phoneStarsTotal: 'Bintang',
  phoneIdle: 'Tunggu sebentar…',
  phoneRematch: 'Main lagi',
  phoneWatch: 'Lihat layar',

  /* ---------------------------------------------------------------- results */
  resultWinner: (name: string) => `${name} Juara Dapur!`,
  resultTie: (names: string[]) => `Seri: ${names.join(' & ')}`,
  resultSolo: (stars: number, max: number) => `Kamu dapat ${stars} dari ${max} bintang!`,
  resultSubtitle: (dishes: DishId[]) => dishes.map((d) => DISH_NAME[d]).join(' · '),
  rankLabel: (stars: number, perfects: number) => `${stars} bintang · ${perfects} Sempurna`,

  awardKnife: 'Pisau Tercepat',
  awardKnifeDesc: (secs: string) => `Memotong rata-rata ${secs} detik`,
  awardHeat: 'Anti Gosong',
  awardHeatDesc: 'Tidak pernah gosong atau tumpah',
  awardStir: 'Jago Aduk',
  awardStirDesc: (secs: string) => `Mengaduk rata-rata ${secs} detik`,
  awardStreak: 'Tangan Emas',
  awardStreakDesc: (n: number) => `${n} Sempurna beruntun`,
  awardStars: 'Bintang Dapur',
  awardStarsDesc: (n: number) => `Mengumpulkan ${n} bintang`,
  awardBrave: 'Koki Pantang Menyerah',
  awardBraveDesc: 'Terus masak sampai akhir',

  /** One decimal with a comma, Indonesian style. */
  secs: (ms: number) => (Math.round(ms / 100) / 10).toFixed(1).replace('.', ','),
};
