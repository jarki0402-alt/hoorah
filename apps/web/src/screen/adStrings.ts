/** Promo break between games (AdBreak.tsx): text on the main screen. */
export const AD_STR = {
  eyebrow: 'JEDA SEBENTAR',
  title: 'Kacaw Pass',
  next: 'Berikutnya',
  offer: (trialMinutes: number, trialUsed: boolean) =>
    trialUsed
      ? 'Main sampai 16 orang, 30 game, tanpa iklan. Pakai kode Pass untuk membukanya.'
      : `Main sampai 16 orang, 30 game, tanpa iklan. Coba gratis ${trialMinutes} menit atau pakai kode Pass.`,
  trial: (trialMinutes: number) => `Coba gratis ${trialMinutes} menit`,
  pass: 'Punya kode Pass?',
  newBadge: 'BARU',
  remaining: (s: number) => `Game mulai dalam ${s} detik`,
  wait: 'Game berikutnya mulai setelah jeda ini',
} as const;
