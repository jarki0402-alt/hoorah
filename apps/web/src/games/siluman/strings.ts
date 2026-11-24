/** Player-facing text for Kampung Siluman (Bahasa Indonesia, no em dashes). */
import type { Extras, IntroCue, NightRole, Role, Side, Talk } from './logic';

export const ROLE_NAME: Record<Role, string> = {
  warga: 'Warga',
  siluman: 'Siluman',
  dukun: 'Dukun',
  tabib: 'Tabib',
  pemburu: 'Pemburu',
  pengkhianat: 'Pengkhianat',
};

/** One line on the role card: what this role does. */
export const ROLE_DUTY: Record<Role, string> = {
  warga: 'Cari siluman lewat diskusi dan voting.',
  siluman: 'Tiap malam, pilih satu warga bersama kawanmu. Siang hari, menyamarlah.',
  dukun: 'Tiap malam, lihat peran satu orang.',
  tabib: 'Tiap malam, lindungi satu orang. Tidak boleh orang yang sama dua malam berturut-turut.',
  pemburu: 'Saat tersingkir, kamu membawa satu orang bersamamu.',
  pengkhianat: 'Kamu warga yang diam-diam memihak siluman. Siluman tidak tahu kamu.',
};

export const SIDE_NAME: Record<Side, string> = { warga: 'Warga', siluman: 'Siluman' };

export const EXTRAS_NAME: Record<Extras, string> = {
  dasar: 'Peran dasar',
  pemburu: 'Tambah Pemburu',
  pengkhianat: 'Tambah Pengkhianat',
  keduanya: 'Tambah keduanya',
};

export const EXTRAS_SUB: Record<Extras, string> = {
  dasar: 'Warga, Siluman, Dukun, Tabib',
  pemburu: 'Membawa satu orang saat tersingkir',
  pengkhianat: 'Warga yang diam-diam memihak siluman',
  keduanya: 'Pemburu dan Pengkhianat',
};

export const TALK_NAME: Record<Talk, string> = { singkat: 'Singkat', sedang: 'Sedang', panjang: 'Panjang' };
export const TALK_SUB: Record<Talk, string> = {
  singkat: 'Diskusi 1 menit',
  sedang: 'Diskusi 2 menit',
  panjang: 'Diskusi 3 menit',
};

/** "Bunyi ini = ..." in the sound introduction. */
export const CUE_TITLE: Record<IntroCue, string> = {
  siluman: 'Giliran Siluman',
  dukun: 'Giliran Dukun',
  tabib: 'Giliran Tabib',
  weker: 'Tutup mata lagi',
  rooster: 'Pagi, semua buka mata',
};

export const CUE_SUB: Record<IntroCue, string> = {
  siluman: 'Geraman. Siluman buka mata dan memilih di HP.',
  dukun: 'Lonceng. Dukun buka mata dan melihat satu peran.',
  tabib: 'Seruling. Tabib buka mata dan melindungi satu orang.',
  weker: 'Weker. Yang tadi buka mata, tutup mata lagi.',
  rooster: 'Ayam berkokok. Malam selesai.',
};

export const CALL_SUB: Record<NightRole, string> = {
  siluman: 'Siluman, buka mata. Pilih siapa yang dibawa.',
  dukun: 'Dukun, buka mata. Lihat peran satu orang.',
  tabib: 'Tabib, buka mata. Lindungi satu orang.',
};

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]}`;

export const STR = {
  logo: 'Kampung Siluman',
  noShell: 'Buka Kampung Siluman dari layar utama Kacawbalaw.',
  guide: 'Pemandu',

  // Setup
  menuEyebrow: (step: number, steps: number) => `Langkah ${step}/${steps}`,
  menuRolesTitle: 'Peran tambahan',
  menuRolesHint: 'Warga, Siluman, Dukun, dan Tabib selalu ada.',
  menuTalkTitle: 'Lama diskusi siang',
  menuTalkHint: 'Waktu berdebat sebelum voting.',
  menuNext: 'Lanjut',
  menuBack: 'Kembali',
  menuStart: 'Mulai cerita',
  menuWaiting: (host: string) => `${host} sedang menyiapkan cerita...`,
  needPlayers: (n: number) => `Butuh minimal ${n} pemain`,
  pengkhianatLocked: (n: number) => `Butuh ${n} pemain atau lebih`,
  setupTitle: 'Siapkan cerita',
  setupHint: (host: string) => `${host} memilih di HP`,
  setupCount: (n: number, min: number) => (n >= min ? `${n} pemain siap` : `${n} pemain, butuh ${min}`),

  // Intro
  introEyebrow: 'Kenali bunyinya',
  introTitle: (cue: string) => `Bunyi ini = ${cue}`,
  introPhoneTitle: 'Kenali bunyinya',
  introPhoneSub: 'Dengarkan bunyi di layar utama. Tidak ada suara pemandu.',
  introSkip: 'Lewati',

  // Deal
  dealTitle: 'Intip peranmu di HP',
  dealSub: 'Tahan kartu untuk melihat. Jangan perlihatkan ke siapa pun.',
  cardEyebrow: 'Peranmu',
  cardTitle: 'Rahasia. Jangan perlihatkan.',
  cardTag: 'PERAN',
  cardSeen: 'Sudah lihat',
  cardWaiting: 'Menunggu yang lain...',
  cardHint: 'Tahan untuk mengintip.',
  kawan: (names: string[]) => `Kawanmu: ${list(names)}.`,
  noKawan: 'Kamu siluman satu-satunya.',
  traitorKnows: (names: string[]) => `Siluman: ${list(names)}.`,
  notes: (items: string[]) => `Catatan: ${items.join(', ')}.`,
  noteItem: (name: string, role: string) => `${name} ${role}`,

  // Dusk and night
  duskTitle: 'Tutup mata',
  duskSub: 'Semua tutup mata dalam',
  nightChip: (n: number) => `Malam ke-${n}`,
  dayChip: (n: number) => `Siang ke-${n}`,
  callTitle: (role: string) => `Giliran ${role}`,
  closedTitle: 'Semua tutup mata',
  closedSub: 'Dengarkan bunyi berikutnya',
  phoneDarkTitle: 'Tutup mata',
  phoneDarkSub: 'Buka mata hanya saat bunyi peranmu.',
  phoneDarkGhost: 'Arwah juga tutup mata',
  phoneNightEyebrow: (n: number, role: string) => `Malam ke-${n} · Kamu: ${role}`,
  silumanTitle: 'Siapa yang dibawa malam ini?',
  silumanHint: 'Pilihan kawanmu ikut terlihat. Pilihan terakhir saat weker yang dipakai.',
  silumanBadge: (names: string[]) => list(names),
  dukunTitle: 'Lihat peran siapa?',
  dukunHint: 'Satu orang per malam.',
  dukunSaw: (name: string, role: string) => `${name}: ${role}`,
  dukunSawSiluman: 'Siluman! Simpan rahasia ini baik-baik.',
  dukunSawOther: 'Bukan siluman. Tutup mata saat weker berbunyi.',
  tabibTitle: 'Lindungi siapa malam ini?',
  tabibHint: 'Bisa diganti sampai weker berbunyi.',
  tabibLast: 'Sudah dilindungi semalam',
  you: 'kamu',

  // Dawn and hunt
  dawnTitle: (n: number) => `Pagi ke-${n}`,
  dawnTaken: (name: string) => `${name} dibawa siluman semalam.`,
  dawnRole: (name: string, role: string) => `${name} ternyata ${role}. Ia jadi arwah.`,
  dawnNone: 'Tidak ada yang dibawa malam ini.',
  dawnNoneSub: 'Kampung selamat, untuk sekarang.',
  phoneDawnYou: 'Kamu dibawa siluman',
  phoneDawnYouSub: 'Kamu jadi arwah. Tetap menonton dan tebak siluman tiap siang.',
  huntTitle: (name: string) => `${name} si Pemburu membawa satu orang`,
  huntShot: (name: string, role: string) => `${name} ikut tersingkir. Ia ternyata ${role}.`,
  huntNone: 'Pemburu tidak membawa siapa pun.',
  huntPhoneTitle: 'Bawa satu orang bersamamu',
  huntPhoneHint: 'Pilih yang kamu yakini siluman.',
  huntPhoneWait: (name: string) => `${name} si Pemburu sedang memilih`,

  // Discussion and defence
  discussTitle: 'Diskusi',
  discussSub: 'Siapa siluman di antara kalian?',
  discussReady: (n: number, total: number) => `${n}/${total} siap voting`,
  suspectTitle: 'Siapa yang kamu curigai?',
  suspectHint: 'Tandamu tampil di layar. Ketuk lagi untuk batal.',
  suspectCount: (n: number) => `${n} curiga`,
  readyBtn: 'Siap voting',
  unreadyBtn: 'Batal siap',
  myCard: 'Kartu peranku',
  suspectBtn: 'Curigai',
  ghostTitle: 'Kamu arwah',
  ghostSub: 'Tonton dan bersorak. Saat voting, tebak siapa siluman untuk poin.',
  defenseTitle: (name: string) => `${name} membela diri`,
  defenseSub: 'Paling dicurigai. 15 detik untuk meyakinkan kampung.',
  defensePhoneYou: 'Giliranmu membela diri!',
  defensePhoneYouSub: 'Bicara sekarang. 15 detik.',
  defenseDone: 'Selesai',
  defensePhoneOther: (name: string) => `Dengarkan ${name}`,
  defensePhoneOtherSub: 'Setelah ini voting rahasia.',

  // Vote and reveal
  voteTitle: 'Voting rahasia',
  voteSub: 'Pilih di HP. Suara dibuka satu per satu.',
  voteVoted: (n: number, total: number) => `${n}/${total} sudah memilih`,
  votePhoneTitle: 'Siapa siluman yang diusir?',
  votePhoneHint: 'Rahasia. Suara dibuka di layar.',
  voteSkip: 'Lewati, tidak memilih',
  voteSend: 'Kirim suara',
  voteSentTitle: 'Suara terkirim',
  voteSentSub: 'Tunggu suara dibuka di layar.',
  guessPhoneTitle: 'Tebak siapa siluman',
  guessPhoneHint: 'Arwah tidak ikut voting. Tebakan benar dapat poin.',
  guessSend: 'Kirim tebakan',
  tallyTitle: 'Suara dibuka',
  tallySkip: 'Lewati',
  tallyPhone: 'Suara dibuka di layar',
  revealOut: (name: string) => `${name} diusir dari kampung`,
  revealRole: (role: string) => `Ternyata ${role}!`,
  revealTie: 'Suara seri. Tidak ada yang diusir.',
  revealNone: 'Tidak ada yang diusir.',
  phoneOutYou: 'Kamu diusir',
  phoneOutYouSub: 'Kamu jadi arwah. Tetap menonton dan tebak siluman.',

  // Final
  finalWin: (side: string) => `${side} menang!`,
  finalWargaSub: 'Semua siluman sudah terusir.',
  finalSilumanSub: 'Siluman menguasai kampung.',
  finalHeld: 'Kampung bertahan sampai akhir.',
  finalChronicle: 'Cerita kampung',
  chronNight: (n: number, name: string | null) =>
    name ? `Malam ${n}: ${name} dibawa siluman` : `Malam ${n}: tidak ada yang dibawa`,
  chronSaved: (name: string) => `Tabib menyelamatkan ${name}`,
  chronDay: (n: number, name: string | null, role: string | null) =>
    name ? `Siang ${n}: ${name} diusir (${role})` : `Siang ${n}: tidak ada yang diusir`,
  phoneFinal: (won: boolean, side: string) => (won ? `${side} menang!` : `${side} menang`),
  phoneFinalSub: (role: string) => `Peranmu: ${role}`,
  points: (n: number) => `${n} poin`,
  watchTitle: 'Ikut cerita berikutnya',
  watchSub: 'Cerita ini sudah berjalan. Tonton dan bersorak dulu.',
  arwahTag: 'Arwah',

  // Results
  resultSub: (nights: number) => `${nights} malam berlalu`,
  rankRole: (role: string, won: boolean) => (won ? `${role} · menang` : role),

  awards: {
    sly: 'Siluman Lihai',
    slyDesc: 'Lolos sampai siluman menang',
    seer: 'Mata Batin',
    seerDesc: (n: number) => `Menemukan ${n} siluman`,
    healer: 'Tangan Penyelamat',
    healerDesc: (n: number) => `Menyelamatkan ${n} nyawa`,
    hunter: 'Pemburu Jitu',
    hunterDesc: 'Membawa siluman saat tersingkir',
    detective: 'Detektif Kampung',
    detectiveDesc: (n: number) => `${n} suara tepat ke siluman`,
    ghost: 'Arwah Jeli',
    ghostDesc: (n: number) => `${n} tebakan arwah tepat`,
    traitor: 'Pengkhianat Licik',
    traitorDesc: 'Membantu siluman tanpa ketahuan',
    talker: 'Pembela Ulung',
    talkerDesc: 'Membela diri dan tetap di kampung',
    suspect: 'Paling Dicurigai',
    suspectDesc: (n: number) => `Dicurigai ${n} kali`,
    loyal: 'Warga Setia',
    loyalDesc: 'Menjaga kampung sampai akhir cerita',
  },
} as const;
