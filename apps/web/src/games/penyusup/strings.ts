/** Every player-facing string of Penyusup lives here (Indonesian). */
import type { Mode, Role, Side } from './logic';
import type { Lang } from './words';

export const LANG_NAME: Record<Lang, string> = { id: 'Bahasa Indonesia', en: 'Bahasa Inggris' };
export const LANG_TAG: Record<Lang, string> = { id: 'ID', en: 'EN' };
export const MODE_NAME: Record<Mode, string> = { lisan: 'Diucapkan', ketik: 'Ketik' };
export const ROLE_NAME: Record<Role, string> = { warga: 'Warga', penyusup: 'Penyusup', kosong: 'Si Kosong' };

export const STR = {
  logo: 'PENYUSUP',
  noShell: 'Buka Penyusup dari Kacawbalaw di layar utama.',

  /* Setup (Host menu on the phone, mirrored on the main screen) */
  menuEyebrow: (n: number, total: number) => `PENGATURAN ${n}/${total}`,
  menuLangTitle: 'Bahasa kata',
  menuLangHint: 'Semua pemain dapat kata dalam bahasa ini.',
  langSub: { id: 'Kopi dan Teh, Bakso dan Mi Ayam', en: 'Coffee dan Tea, Pencil dan Crayon' } as Record<
    Lang,
    string
  >,
  menuModeTitle: 'Cara memberi petunjuk',
  menuModeHint: 'Bisa diganti di game berikutnya.',
  modeSub: {
    lisan: 'Ucapkan lantang. Layar hanya menunjukkan giliran.',
    ketik: 'Ketik di HP, petunjuk muncul di layar.',
  } as Record<Mode, string>,
  menuKosongTitle: 'Pakai Si Kosong?',
  menuKosongHint: 'Si Kosong tidak dapat kata dan harus berbaur.',
  kosongOn: 'Pakai Si Kosong',
  kosongOnSub: 'Lebih seru untuk 5 pemain atau lebih',
  kosongOnLocked: 'Butuh minimal 5 pemain',
  kosongOff: 'Tanpa Si Kosong',
  kosongOffSub: 'Hanya warga dan penyusup',
  menuNext: 'Lanjut',
  menuBack: 'Kembali',
  menuStart: 'Mulai!',
  menuWaiting: (host: string) => `${host} sedang memilih pengaturan…`,
  needPlayers: (n: number) => `Butuh minimal ${n} pemain`,

  /* Main screen: setup poster */
  setupEyebrow: 'GAME TEBAK KATA · CARI YANG BEDA',
  setupLead: 'Semua dapat kata yang sama, kecuali satu orang. Beri petunjuk, temukan yang beda.',
  setupHostPicks: (host: string) => `${host} memilih pengaturan di HP`,
  setupLang: 'BAHASA',
  setupMode: 'PETUNJUK',
  setupKosong: 'SI KOSONG',
  yes: 'Ya',
  no: 'Tidak',
  playersCount: (n: number) => `${n} pemain`,

  /* Main screen: header */
  roundChip: 'RONDE',
  finalChip: 'FINAL · POIN GANDA',
  modeChip: 'MODE',
  voteNo: (n: number, max: number) => `VOTING ${n}/${max}`,
  footer: (n: number, lang: string) => `${n} pemain · kata: ${lang}`,

  /* Deal */
  dealEyebrow: 'KATA SUDAH DIBAGIKAN',
  dealTitle: 'TAHAN KARTU DI HP',
  dealBody: 'Kata hanya terlihat selama kartu ditahan. Jangan sampai teman mengintip!',
  dealReady: (done: number, of: number) => `${done} dari ${of} sudah melihat`,

  /* Clue */
  turnEyebrow: 'GILIRAN',
  turnGiving: 'MEMBERI PETUNJUK',
  turnSpoken: 'Ucapkan satu kata dengan lantang. Jangan sebut kata rahasiamu.',
  turnTyped: 'Sedang mengetik satu kata petunjuk di HP…',
  turnShown: 'PETUNJUKNYA',
  turnSilent: 'Diam saja…',
  secondsOf: (s: number) => `DARI ${s} DTK`,
  doneList: 'Sudah:',
  nextUp: 'Berikutnya:',
  circuitNote: (n: number, of: number) => `Putaran ${n} dari ${of}`,
  wallTitle: 'PETUNJUK RONDE INI',

  /* Vote */
  voteEyebrow: 'VOTING',
  voteTitleA: 'SIAPA',
  voteTitleB: 'PENYUSUPNYA?',
  voteBody: 'Pilih di HP. Suara dibuka bersamaan.',
  voteLocked: (done: number, of: number) => `${done} dari ${of} suara terkunci`,

  /* Tally and reveal */
  tallyTitle: 'SUARA DIBUKA',
  tallyTie: 'SERI! TIDAK ADA YANG KELUAR',
  tallyNone: 'TIDAK ADA SUARA',
  tallyOut: (name: string) => `${name.toUpperCase()} TERSINGKIR`,
  votes: (n: number) => `${n} suara`,
  revealEyebrow: 'KARTU DIBUKA',
  revealWas: 'ternyata',
  revealWordLabel: 'KATANYA',
  revealNoWord: 'TANPA KATA',

  /* Guess */
  guessEyebrow: 'KESEMPATAN TERAKHIR',
  guessTitle: (name: string) => `${name.toUpperCase()} SI KOSONG MENEBAK`,
  guessBody: 'Tebak kata warga dalam 10 detik. Benar = curi kemenangan!',
  guessRight: 'BENAR! KEMENANGAN DICURI',
  guessWrong: 'SALAH! TEBAKAN MELESET',
  guessNone: 'WAKTU HABIS',

  /* Ronde end */
  sideTitle: {
    warga: 'WARGA MENANG',
    beda: 'PENYUSUP MENANG',
    kosong: 'SI KOSONG MENCURI KEMENANGAN',
  } as Record<Side, string>,
  reasonText: {
    caught: 'Semua yang beda tertangkap.',
    outnumber: 'Penyusup tinggal sebanyak warga.',
    escaped: 'Penyusup lolos sampai voting terakhir.',
    steal: 'Satu tebakan jitu membalik keadaan.',
  } as Record<'caught' | 'outnumber' | 'escaped' | 'steal', string>,
  wordWarga: 'KATA WARGA',
  wordBeda: 'KATA PENYUSUP',
  gained: (n: number) => (n > 0 ? `+${n}` : '0'),
  nextRound: (s: number) => `Ronde berikutnya dalam ${s}`,
  finalSoon: (s: number) => `Hasil akhir dalam ${s}`,
  finalTitle: 'HASIL AKHIR',

  /* Phone */
  cardEyebrow: 'KATA RAHASIAMU',
  cardTitle: (round: number, lang: string) => `Ronde ${round} · ${lang}`,
  cardCaption: 'Jangan ucapkan kata ini.',
  cardBlank: 'SI KOSONG',
  cardBlankCaption: 'Kamu tidak dapat kata. Dengarkan, lalu berbaur.',
  cardHint: 'Kamu bisa saja penyusup tanpa sadar. Dengarkan petunjuk yang lain.',
  cardHintKosong: 'Tebak kata warga dari petunjuk mereka. Kalau tertangkap, kamu boleh menebak.',
  cardSeen: 'Sudah lihat',
  cardWaiting: 'Menunggu yang lain melihat kartunya…',
  turnMine: 'GILIRANMU!',
  turnMineHint: 'Ucapkan satu kata petunjuk dengan lantang, lalu ketuk Selesai.',
  turnDone: 'Selesai',
  turnOther: (name: string) => `Giliran ${name}`,
  turnOtherHint: 'Dengarkan petunjuknya. Siapa yang terdengar beda?',
  turnOrder: (n: number) => `Giliranmu ke-${n}`,
  typeEyebrow: 'GILIRANMU · KETIK PETUNJUK',
  typeTitle: 'Satu kata petunjuk',
  typeHint: 'Jangan tulis kata rahasiamu. Kata muncul di layar utama.',
  typeErrOwn: 'Itu terlalu mirip kata rahasiamu!',
  typeErrEmpty: 'Petunjuk minimal 2 huruf.',
  outTitle: 'Kamu sudah tersingkir',
  outSub: 'Tetap ikut menebak penyusup saat voting untuk poin bonus.',
  voteMenuEyebrow: (n: number) => `VOTING · RONDE ${n}`,
  voteMenuTitle: 'Siapa penyusupnya?',
  voteMenuHint: 'Pilih satu, lalu kunci. Suara dibuka bersamaan di layar.',
  guessMenuTitle: 'Tebak penyusupnya',
  guessMenuHint: 'Kamu sudah keluar, tapi tebakan benar tetap dapat poin bonus.',
  voteLock: 'Kunci suara',
  voteSeat: (n: number) => `Pemain #${n}`,
  voteLockedTitle: 'Suaramu terkunci',
  voteLockedSub: 'Tunggu semua suara dibuka di layar utama.',
  watchTitle: 'Tonton dulu ya',
  watchSub: 'Kamu ikut dibagi kata di ronde berikutnya.',
  tallyPhoneTitle: 'Suara dibuka!',
  tallyPhoneSub: 'Lihat layar utama.',
  revealYouOut: 'Kamu tersingkir!',
  revealOtherOut: (name: string) => `${name} tersingkir`,
  guessPhoneEyebrow: 'SI KOSONG · 10 DETIK',
  guessPhoneTitle: 'Tebak kata warga',
  guessPhoneHint: 'Benar = kamu mencuri kemenangan ronde ini!',
  guessWaitTitle: (name: string) => `${name} sedang menebak`,
  guessWaitSub: 'Si Kosong tertangkap. Kalau tebakannya benar, dia menang!',
  roundYou: (role: string, word: string) => (word ? `Kamu ${role} · ${word}` : `Kamu ${role}`),
  roundPoints: 'Poin ronde',
  totalPoints: 'Total',
  finalTitlePhone: (rank: number) => (rank === 1 ? 'Juara!' : `Peringkat ${rank}`),
  points: (n: number) => `${n} poin`,

  /* Results */
  resultWinner: (name: string) => `${name} paling jeli!`,
  resultTie: (names: string[]) => `${names.join(' & ')} sama kuat!`,
  resultSub: (rounds: number) => `${rounds} ronde penuh kecurigaan`,
  rankLabel: (score: number) => `${score} poin`,
  awards: {
    liar: 'Pembohong Ulung',
    liarDesc: (n: number) => `Lolos ${n} kali sebagai yang beda`,
    detective: 'Detektif Jeli',
    detectiveDesc: (n: number) => `${n} tebakan tepat sasaran`,
    thief: 'Pencuri Kemenangan',
    thiefDesc: (n: number) => `Menebak kata warga ${n} kali`,
    bold: 'Petunjuk Paling Nekat',
    boldDesc: (n: number) => `Dicurigai ${n} kali padahal warga`,
    quick: 'Lidah Kilat',
    quickDesc: (s: number) => `Rata-rata petunjuk ${s} detik`,
    loyal: 'Warga Teladan',
    loyalDesc: (n: number) => `Menang ${n} kali bersama warga`,
    clean: 'Tak Tersentuh',
    cleanDesc: 'Tidak pernah dicurigai',
    listener: 'Pendengar Setia',
    listenerDesc: 'Ikut menebak sampai akhir',
  },
};
