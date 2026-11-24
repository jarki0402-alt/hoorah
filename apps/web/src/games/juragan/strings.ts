/** Every text Juragan Nusantara shows to players (main screen and phones). Bahasa Indonesia. */
import type { CityKey, CornerKind, GroupId, TaxKind, TransportKind } from './board';
import type { CardId } from './cards';

/** Money is kept in thousands of rupiah. 860 -> "Rp 860 rb", 1250 -> "Rp 1,25 jt". */
export function rp(v: number): string {
  const n = Math.round(v);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 1000) return `${sign}Rp ${a} rb`;
  const jt = (a / 1000)
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
  return `${sign}Rp ${jt} jt`;
}

/** Without the "Rp" (tight spots such as rent tables). */
export function rpShort(v: number): string {
  return rp(v).replace('Rp ', '');
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]}`;
}

export const CITY_NAME: Record<CityKey, string> = {
  medan: 'Medan',
  palembang: 'Palembang',
  pontianak: 'Pontianak',
  balikpapan: 'Balikpapan',
  makassar: 'Makassar',
  palu: 'Palu',
  manado: 'Manado',
  ambon: 'Ambon',
  jayapura: 'Jayapura',
  labuanbajo: 'Labuan Bajo',
  denpasar: 'Denpasar',
  bandung: 'Bandung',
  surabaya: 'Surabaya',
  jakarta: 'Jakarta',
};

export const GROUP_NAME: Record<GroupId, string> = {
  sumatra: 'Sumatra',
  kalimantan: 'Kalimantan',
  sulawesi: 'Sulawesi',
  timur: 'Maluku & Papua',
  bali: 'Bali & Nusa Tenggara',
  jawa: 'Jawa',
};

export const TRANSPORT_NAME: Record<TransportKind, string> = {
  pelabuhan: 'Pelabuhan',
  bandara: 'Bandara',
};

export const CORNER_NAME: Record<CornerKind, string> = {
  start: 'Gajian',
  tilang: 'Pos Tilang',
  rehat: 'Ngopi Dulu',
  razia: 'Razia!',
};

/** Small print under each corner's name on the board. */
export const CORNER_NOTE: Record<CornerKind, string> = {
  start: 'Lewat: +Rp 200 rb',
  tilang: 'Cuma mampir',
  rehat: 'Santai sejenak',
  razia: 'Ke Pos Tilang',
};

export const TAX_NAME: Record<TaxKind, string> = {
  usaha: 'Pajak Usaha',
  kekayaan: 'Pajak Kekayaan',
};

export const TAX_NOTE: Record<TaxKind, string> = {
  usaha: 'Bayar Rp 100 rb',
  kekayaan: 'Bayar 10% saldo',
};

export const KABAR_NAME = 'Kabar';
export const KABAR_NOTE = 'Ambil kartu';

/** Building level names: 0 is the bank's bare land, 1 comes with the purchase, 4 is the top. */
export const LEVEL_NAME = ['Lahan', 'Rumah', 'Toko', 'Gedung', 'Hotel'] as const;

export interface CardText {
  title: string;
  body: string;
}

export const CARD_TEXT: Record<CardId, CardText> = {
  panen: { title: 'Panen Raya', body: 'Sawah dan kebunmu panen besar. Terima Rp 150 rb.' },
  banjir: {
    title: 'Banjir',
    body: 'Usahamu kebanjiran. Bayar perbaikan Rp 20 rb untuk tiap tingkat bangunanmu, paling sedikit Rp 50 rb.',
  },
  festival: {
    title: 'Festival Budaya',
    body: 'Kamu jadi panitia festival. Tiap pemain membeli tiket Rp 30 rb.',
  },
  promo: { title: 'Promo Wisata', body: 'Tiket murah! Maju ke Pelabuhan atau Bandara terdekat.' },
  arisan: { title: 'Menang Arisan', body: 'Namamu keluar di arisan RT. Terima Rp 100 rb.' },
  razia: { title: 'Kena Razia', body: 'Surat kendaraan ketinggalan. Langsung ke Pos Tilang.' },
  mudik: { title: 'Mudik Lebaran', body: 'Pulang kampung! Maju ke Gajian dan terima gaji.' },
  ban: { title: 'Ban Bocor', body: 'Tambal ban di pinggir jalan. Bayar Rp 50 rb.' },
  traktir: { title: 'Traktir Teman', body: 'Giliranmu mentraktir. Bayar Rp 20 rb ke tiap pemain.' },
  investor: {
    title: 'Investor Datang',
    body: 'Satu kotamu naik satu tingkat gratis. Belum punya kota? Terima Rp 100 rb.',
  },
  liburan: { title: 'Liburan ke Bali', body: 'Maju ke Denpasar. Lewat Gajian? Terima gaji.' },
  salah: { title: 'Salah Jalan', body: 'Kebablasan! Mundur 3 langkah.' },
  lomba: { title: 'Juara Lomba 17-an', body: 'Menang lomba balap karung. Terima Rp 50 rb.' },
  umkm: {
    title: 'Bantuan UMKM',
    body: 'Usaha kecilmu dapat bantuan. Kotamu yang termurah dan belum Hotel naik satu tingkat gratis. Belum punya kota? Terima Rp 100 rb.',
  },
  renovasi: {
    title: 'Renovasi Gotong Royong',
    body: 'Tetangga datang membantu. Pilih satu kotamu yang belum Hotel, naik satu tingkat gratis. Belum punya kota? Terima Rp 100 rb.',
  },
};

export const STR = {
  noShell: 'Buka Juragan Nusantara dari layar utama Kacawbalaw.',
  /** Player names of the offline demo (`?demo=N`, layout and performance tests). */
  demoNames: ['Rina', 'Budi', 'Sari', 'Joko', 'Dewi', 'Agus', 'Wati', 'Yudi'],
  unknownPlayer: 'Pemain',
  bank: 'Bank',
  title: 'JURAGAN NUSANTARA',

  /* ---------------------------------------------------------------- board print */
  boardTag: 'Beli kota, bangun usaha, tagih sewa',
  boardBank: 'BANK',
  boardKabar: 'KABAR',

  /* ---------------------------------------------------------------- HUD */
  roundLabel: 'Putaran',
  roundOf: (n: number, of: number) => `${n}/${of}`,
  lastRound: 'PUTARAN TERAKHIR!',
  lastRoundSub: 'Kesempatan terakhir jadi yang terkaya',
  roundsUp: 'Putaran selesai!',
  turnEyebrow: 'GILIRAN',
  cash: 'Saldo',
  worth: 'Aset',
  cities: 'Kota',
  jailedBadge: 'DITILANG',
  bankruptBadge: 'BANGKRUT',
  hintRoll: 'Lempar dadu dari HP',
  hintRollAuto: 'Melempar dadu…',
  hintRolling: 'Dadu bergulir…',
  hintMoving: (n: number) => `Jalan ${n} langkah`,
  hintBuy: (place: string) => `Beli ${place}?`,
  hintUpgrade: (place: string, level: string) => `Upgrade ${place} jadi ${level}?`,
  hintTakeover: (place: string) => `Rebut ${place}?`,
  hintRenovate: 'Pilih kota yang direnovasi',
  hintBought: (place: string) => `${place} terbeli, Rumah berdiri`,
  hintUpgraded: (place: string, level: string) => `${place} jadi ${level}`,
  hintTaken: (place: string) => `${place} berhasil direbut`,
  hintJail: 'Bayar denda atau diam satu giliran?',
  hintCard: 'Kartu Kabar',
  doubles: 'DOBEL!',
  doublesSub: 'Lempar lagi',

  intro: 'JURAGAN NUSANTARA',
  introSub: 'Beli kota, upgrade bangunannya, rebut kota lawan!',
  introFirst: (name: string, rounds: number) => `${rounds} putaran · ${name} jalan duluan`,

  finaleTitle: (name: string) => `${name} JADI JURAGAN!`,
  finaleSub: (worth: string) => `Total kekayaan ${worth}`,
  finaleLast: 'Satu-satunya yang bertahan',

  /* ---------------------------------------------------------------- tile card */
  cardPrice: 'Harga',
  cardRent: 'Sewa',
  cardDouble: 'SATU PULAU: SEWA ×2',
  cardIslandNote: 'Kuasai satu pulau penuh: sewa ×2.',
  cardUpgrade: (level: string) => `Upgrade ke ${level}`,
  cardTakeover: 'Harga rebut',
  cardHotelSafe: 'Hotel tidak bisa direbut',
  cardOwner: 'Pemilik',
  cardNoOwner: 'Belum dimiliki',
  cardForSale: 'DIJUAL',
  cardTransportOne: 'Punya 1',
  cardTransportTwo: 'Punya 2',
  cardTransportNote: 'Sewa naik bila punya Pelabuhan dan Bandara.',
  cardLevel: (lvl: number) => LEVEL_NAME[lvl] ?? '',
  cardIsland: (g: string) => `Pulau ${g}`,
  cardTransport: 'Transportasi',
  cardCorner: 'Pojok',
  cardTax: 'Pajak',
  cardKabar: 'Kartu kejadian',
  noteStart: 'Lewat atau berhenti di sini: terima gaji Rp 200 rb. Berhenti pas di sini: bonus Rp 100 rb.',
  noteTilang: 'Yang kena razia menunggu di kotak. Bayar denda Rp 50 rb, atau diam satu giliran.',
  noteRehat: 'Istirahat sejenak sambil ngopi. Tidak terjadi apa-apa.',
  noteRazia: 'Langsung ke Pos Tilang, tanpa gajian.',
  noteKabar: 'Ambil satu kartu kejadian: bisa untung, bisa buntung, bisa jalan-jalan.',
  noteTaxUsaha: 'Bayar Rp 100 rb ke bank.',
  noteTaxKekayaan: 'Bayar 10% dari saldo, paling sedikit Rp 50 rb.',

  /* ---------------------------------------------------------------- toasts */
  toastBuy: (name: string, place: string) => `${name} membeli ${place}`,
  toastRent: (payer: string, owner: string) => `${payer} bayar sewa ke ${owner}`,
  toastUpgrade: (name: string, level: string, place: string) => `${name} upgrade ${place} jadi ${level}`,
  toastUpgradeFree: (level: string, place: string) => `${place} naik jadi ${level}, gratis!`,
  toastTakeover: (name: string, place: string, owner: string) => `${name} merebut ${place} dari ${owner}!`,
  toastNoUpgrade: (place: string) => `Uang belum cukup untuk upgrade ${place}`,
  toastTopLevel: (place: string) => `${place} sudah Hotel, tingkat tertinggi`,
  toastSalary: 'Gajian!',
  toastPayday: 'Pas hari gajian! Bonus',
  toastTax: (name: string) => `${name} bayar pajak`,
  toastFine: (name: string) => `${name} bayar denda tilang`,
  toastWait: (name: string) => `${name} diam satu giliran`,
  toastJailed: (name: string) => `${name} kena tilang!`,
  toastTriple: 'Tiga kali dobel: kena tilang!',
  toastSell: (name: string, place: string) => `${name} menjual ${place} ke bank`,
  toastSellBuilding: (name: string, level: string, place: string) => `${name} menjual ${level} di ${place}`,
  toastBankrupt: (name: string) => `${name} bangkrut!`,
  toastCantBuy: (place: string) => `Uang tidak cukup untuk ${place}`,
  toastCardPay: (from: string, to: string) => `${from} bayar ke ${to}`,

  /* ---------------------------------------------------------------- phone */
  phoneIntroEyebrow: 'JURAGAN NUSANTARA',
  phoneIntroTitle: 'Siap jadi juragan?',
  phoneIntroSub: (rounds: number) =>
    `Beli kota, upgrade bangunannya, rebut kota lawan. Terkaya setelah ${rounds} putaran menang.`,
  phoneTurnEyebrow: 'GILIRANMU',
  phoneBonusEyebrow: 'DOBEL! LEMPAR LAGI',
  phoneRollTitle: 'Lempar dadu',
  phoneRollLabel: 'LEMPAR DADU',
  phoneRollHint: (cash: string, place: string) => `Saldo ${cash} · di ${place}`,
  phoneRolledEyebrow: 'DADU',
  phoneRolling: 'Dadu bergulir…',
  phoneRolled: (a: number, b: number) => `${a} + ${b} = ${a + b}`,
  phoneRolledSub: 'Bidakmu berjalan…',
  phoneRolledDoubles: 'Dobel! Nanti lempar lagi.',
  phoneBuyEyebrow: 'DIJUAL',
  phoneBuyTitle: (place: string) => `Beli ${place}?`,
  phoneBuySub: (rent: string) => `Langsung berdiri Rumah, sewa ${rent}. Satu pulau penuh: sewa ×2.`,
  phoneBuySubTransport: 'Sewa naik bila punya Pelabuhan dan Bandara.',
  phoneBuy: 'BELI',
  phoneSkip: 'LEWATI',
  phonePrice: 'Harga',
  phoneAfter: 'Sisa',
  phoneUpgradeEyebrow: 'KOTAMU',
  phoneUpgradeTitle: (place: string, level: string) => `Upgrade ${place} jadi ${level}?`,
  phoneUpgradeSub: (from: string, to: string) => `Sewa naik dari ${from} jadi ${to}.`,
  phoneUpgradeSubHotel: (from: string, to: string) =>
    `Sewa naik dari ${from} jadi ${to}. Hotel tidak bisa direbut lawan.`,
  phoneUpgrade: (level: string, cost: string) => `UPGRADE KE ${level.toUpperCase()} · ${cost}`,
  phoneCost: 'Biaya',
  phoneNewRent: 'Sewa baru',
  phoneTakeoverEyebrow: 'KOTA LAWAN',
  phoneTakeoverTitle: (place: string) => `Rebut ${place}?`,
  phoneTakeoverSub: (rent: string, owner: string, price: string, level: string) =>
    `Sewa ${rent} sudah dibayar. Bayar ${price} ke ${owner}, kota ini beserta ${level}-nya jadi milikmu.`,
  phoneTakeover: (price: string) => `REBUT · ${price}`,
  phoneNo: 'TIDAK',
  phoneTakeoverPrice: 'Harga rebut',
  phoneBuilding: 'Bangunan',
  phoneRenovateEyebrow: 'RENOVASI GOTONG ROYONG',
  phoneRenovateTitle: 'Kota mana yang naik tingkat?',
  phoneRenovateHint: 'Gratis! Waktu habis: kota terbaik dipilih.',
  phoneRenovateSub: (from: string, to: string, rentNow: string, rentNext: string) =>
    `${from} jadi ${to} · sewa ${rentNow} jadi ${rentNext}`,
  phoneRenovateConfirm: 'NAIKKAN GRATIS',
  phoneTookEyebrow: 'REBUT',
  phoneTookTitle: (place: string) => `${place} jadi milikmu!`,
  phoneTook: (amount: string, owner: string) => `${amount} dibayar ke ${owner}.`,
  phoneTakenTitle: 'Kotamu direbut!',
  phoneTaken: (name: string, place: string, amount: string) =>
    `${name} merebut ${place}. Kamu terima ${amount}.`,
  phoneJailEyebrow: 'KENA TILANG',
  phoneJailTitle: 'Bayar denda?',
  phoneJailSub: 'Bayar lalu langsung lempar dadu, atau diam satu giliran.',
  phoneJailPay: (fine: string) => `BAYAR ${fine}`,
  phoneJailWait: 'DIAM SAJA',
  phoneWatchEyebrow: (name: string) => `GILIRAN ${name.toUpperCase()}`,
  phoneWatchRoll: 'sedang melempar dadu',
  phoneWatchMove: (n: number) => `jalan ${n} langkah`,
  phoneWatchBuy: (place: string) => `menimbang membeli ${place}`,
  phoneWatchUpgrade: (place: string) => `menimbang upgrade ${place}`,
  phoneWatchTakeover: (place: string) => `menimbang merebut ${place}`,
  phoneWatchRenovate: 'memilih kota untuk direnovasi',
  phoneWatchJail: 'kena tilang, menimbang denda',
  phoneWatchCard: (title: string) => `membuka kartu ${title}`,
  phoneWatchWait: 'sedang menunggu',
  phoneCardEyebrow: 'KARTU KABAR',
  phonePaidTitle: 'Bayar sewa',
  phonePaid: (amount: string, owner: string) => `${amount} ke ${owner}`,
  phoneGotTitle: 'Dapat sewa!',
  phoneGot: (amount: string, payer: string) => `${amount} dari ${payer}`,
  phoneBankruptTitle: 'Bangkrut!',
  phoneBankruptSub: 'Uangmu habis. Tonton sampai selesai, ya.',
  phoneSpectator: 'Kamu menonton',
  phoneSpectatorSub: 'Permainan sudah berjalan. Ikut di permainan berikutnya, ya.',
  phoneWinTitle: 'Kamu Juragan!',
  phoneRank: (rank: number) => `Peringkat ${rank}`,
  phoneFinalSub: (headline: string) => headline,
  phoneRentGot: 'Sewa diterima',
  myCash: 'Saldomu',
  myWorth: 'Asetmu',
  myCities: 'Kotamu',
  myRank: 'Peringkatmu',
  phoneRematch: 'MAIN LAGI',

  /* ---------------------------------------------------------------- results */
  resultTitle: (name: string) => `${name} jadi Juragan Nusantara!`,
  resultSubtitle: (rounds: number) => `Juragan Nusantara · ${rounds} putaran`,
  rankLabel: (worth: number) => rp(worth),
  rankBankrupt: 'Bangkrut',
  awardRich: 'Juragan Terkaya',
  awardRichDesc: (v: string) => `Kekayaan ${v}`,
  awardCities: 'Raja Properti',
  awardCitiesDesc: (n: number) => `${n} kota dan transportasi`,
  awardRent: 'Tukang Tagih',
  awardRentDesc: (v: string) => `Sewa terkumpul ${v}`,
  awardConqueror: 'Penakluk',
  awardConquerorDesc: (n: number) => `${n} kota direbut`,
  awardBuilder: 'Pengusaha Sukses',
  awardBuilderDesc: (n: number) => `${n} kali upgrade`,
  awardTraveler: 'Pelancong',
  awardTravelerDesc: (n: number) => `${n} kali gajian`,
};
