import type { Track } from './audio';
import type { IconName } from './ui';

export type GameId =
  | 'tarik'
  | 'kuis'
  | 'rusun'
  | 'bajaj'
  | 'masak'
  | 'ular'
  | 'congklak'
  | 'kerupuk'
  | 'karung'
  | 'kompak'
  | 'ludo'
  | 'catur'
  | 'arena'
  | 'wilayah'
  | 'lari'
  | 'kata'
  | 'juragan'
  | 'dapur'
  | 'obby'
  | 'tali'
  | 'bom'
  | 'runtuh'
  | 'es'
  | 'langkah'
  | 'nyebrang'
  | 'penyusup'
  | 'eja'
  | 'siluman'
  | 'warna'
  | 'hantu';

/** Groups in the Host's game picker on the phone. */
export type GameCategory = 'papan' | 'lomba' | 'kuis' | 'aksi';

export const CATEGORIES: { id: GameCategory; label: string }[] = [
  { id: 'papan', label: 'Papan' },
  { id: 'lomba', label: 'Lomba' },
  { id: 'kuis', label: 'Kuis' },
  { id: 'aksi', label: 'Aksi' },
];

/**
 * What a game feels like, shown instead of a length (the length is automatic, see `automode.ts`).
 * Each mood has its own pill colour on the main screen and the phone.
 */
export type GameMood = 'heboh' | 'santai' | 'otak' | 'ramai';

export const MOODS: Record<GameMood, { label: string; icon: IconName }> = {
  heboh: { label: 'Heboh', icon: 'fire' },
  santai: { label: 'Santai', icon: 'smile' },
  otak: { label: 'Adu Otak', icon: 'brain' },
  ramai: { label: 'Ramai-ramai', icon: 'users' },
};

export interface GameInfo {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  control: string;
  orientation: 'Tegak' | 'Mendatar';
  category: GameCategory;
  mood: GameMood;
  available: boolean;
  badge?: 'BARU' | 'FAVORIT' | 'SEGERA';
  /** Release wave; games of the newest wave (3) carry the "Baru" label on the home screen. */
  wave?: number;
  /** A long game (15 minutes or more): left out of Mode Pesta so a party stays near half an hour. */
  long?: boolean;
  /**
   * Long-distance play (owner 2026-11-24): the game can be watched on a far-away main screen.
   * While one watches, only these games start (staged rollout).
   */
  remote?: boolean;
  logoColor: string;
  howTo: { t: string; d: string }[];
  track?: Track;
  tips: string[];
}

export const GAMES: Record<GameId, GameInfo> = {
  tarik: {
    id: 'tarik',
    title: 'Tarik Tambang',
    tagline: 'Dua tim, satu tali. Siapa paling kuat?',
    description:
      'Lomba khas 17-an versi layar besar. Dua tim adu cepat mengetuk HP. Kompakkan ritme untuk tarikan super, lalu seret lawan melewati garis.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Ketuk cepat',
    orientation: 'Mendatar',
    category: 'lomba',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Pegang mendatar', d: 'Dua tangan, ibu jari siap di tombol besar.' },
      { t: 'Ketuk secepatnya', d: 'Setiap ketukan menarik tali ke arah timmu.' },
      { t: 'Tarikan super', d: 'Ketuk pas saat cincin kuning sejajar garis putih.' },
    ],
    track: 'tarik',
    tips: [
      'Ketukan berirama lebih kuat daripada ketukan asal cepat.',
      'Tarikan super bisa membalik keadaan!',
    ],
  },
  kuis: {
    id: 'kuis',
    title: 'Kuis Nusantara',
    tagline: 'Seberapa kenal kamu dengan Indonesia?',
    description:
      'Acara kuis di ruang tamu. Jawab soal budaya, kuliner, dan alam Nusantara dari HP. Makin cepat benar, makin besar poinnya.',
    minPlayers: 1,
    maxPlayers: 16,
    control: 'Pilih jawaban',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'otak',
    available: true,
    remote: true,
    badge: 'FAVORIT',
    logoColor: '#FFFFFF',
    howTo: [
      { t: 'Baca soal di layar', d: 'Soal tampil besar di layar utama.' },
      { t: 'Jawab di HP', d: 'Pilih A, B, C, atau D secepat mungkin.' },
      { t: 'Kejar beruntun', d: '3 benar berturut-turut = poin dobel.' },
    ],
    track: 'kuis',
    tips: [
      'Waktu menjawab dihitung di HP-mu, jadi sinyal lambat tidak merugikan.',
      'Beruntun 3 kali menggandakan poin soal berikutnya.',
    ],
  },
  rusun: {
    id: 'rusun',
    title: 'Rusun',
    tagline: 'Susun setinggi mungkin, jangan sampai roboh!',
    description:
      'Lantai baru digeser crane ke kanan dan kiri, tepat di atas menara. Jatuhkan pas, bergiliran. Makin tinggi, lantai makin kecil dan geserannya makin cepat. Yang merobohkan, kalah.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Satu tombol',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'santai',
    available: true,
    badge: 'BARU',
    logoColor: '#FF5A1F',
    howTo: [
      { t: 'Tunggu giliran', d: 'HP-mu bergetar saat giliranmu tiba.' },
      { t: 'Jatuhkan pas', d: 'Tekan JATUHKAN saat lantai tepat di atas menara.' },
      { t: 'Jaga keseimbangan', d: 'Lantai yang terlalu ke pinggir bikin menara miring, lalu roboh.' },
    ],
    track: 'rusun',
    tips: [
      'Lihat gerak crane di layar utama, bukan di HP.',
      'Pantau meter KESEIMBANGAN di pojok kanan atas.',
    ],
  },
  bajaj: {
    id: 'bajaj',
    title: 'Bajaj Rush',
    tagline: 'Balapan bajaj 3D, saling lempar item.',
    description:
      'Balapan bajaj tiga roda di kota, pantai, dan puncak. Injak gas dari HP, ambil kardus berisi item, lempar durian ke lawan. Pilih mode: Grand Prix, Duel 1 lawan 1, Arena Tempur, atau Lawan Waktu.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Setir & pedal',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Pegang mendatar', d: 'Jempol kiri menyetir, jempol kanan injak GAS atau REM.' },
      { t: 'Pilih mode & sirkuit', d: 'Grand Prix, Duel, Arena Tempur, atau Lawan Waktu.' },
      { t: 'Lempar item', d: 'Ambil kardus, lalu lempar durian atau petasan ke lawan.' },
    ],
    track: 'bajaj',
    tips: [
      'Tahan REM sambil tekan ITEM untuk melempar ke belakang.',
      'Petasan mengejar lawan yang tepat di depanmu.',
    ],
  },
  masak: {
    id: 'masak',
    title: 'Jago Masak',
    tagline: 'Masak cepat, rapi, enak!',
    description:
      'Masak hidangan Nusantara langkah demi langkah: potong, ulek, aduk, dan balik. Gerakkan jari di HP seperti memasak sungguhan. Makin cepat dan rapi, makin banyak bintangnya.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Gerakan jari',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FF5A1F',
    howTo: [
      { t: 'Lihat langkahnya', d: 'Layar utama menunjukkan langkah masak berikutnya.' },
      { t: 'Gerakkan jari', d: 'Ketuk untuk memotong, putar untuk mengaduk, usap untuk membalik.' },
      { t: 'Kejar bintang', d: 'Cepat dan tepat dapat bintang tiga.' },
    ],
    track: 'masak',
    tips: ['Jangan kelamaan menggoreng, nanti gosong!', 'Bintang tiga butuh kecepatan dan ketepatan.'],
  },
  ular: {
    id: 'ular',
    title: 'Ular Tangga',
    tagline: 'Lempar dadu, naik tangga, awas ular!',
    description:
      'Permainan papan klasik dengan kejutan. Lempar dadu dari HP, panjat tangga, hindari ular. Kotak kejutan dan duel kilat bikin posisi bisa berbalik kapan saja.',
    minPlayers: 1,
    maxPlayers: 6,
    control: 'Lempar dadu',
    orientation: 'Tegak',
    category: 'papan',
    mood: 'santai',
    available: true,
    remote: true,
    long: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Lempar dadu', d: 'Saat giliranmu, ketuk tombol dadu di HP.' },
      { t: 'Naik dan turun', d: 'Kaki tangga membawamu naik, kepala ular membawamu turun.' },
      { t: 'Sampai paling atas', d: 'Yang pertama tiba di kotak terakhir menang.' },
    ],
    track: 'ular',
    tips: ['Kotak kejutan bisa menolong atau menjebak.', 'Mendarat di kotak lawan memicu duel kilat!'],
  },
  congklak: {
    id: 'congklak',
    title: 'Congklak',
    tagline: 'Sebar biji, kumpulkan paling banyak.',
    description:
      'Permainan tradisional di papan kayu. Pilih lubang dari HP, sebar bijinya satu per satu, dan isi lumbungmu sebanyak mungkin. Lebih dari dua pemain? Main beregu dan bergiliran.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Pilih lubang',
    orientation: 'Tegak',
    category: 'papan',
    mood: 'otak',
    available: true,
    remote: true,
    badge: 'BARU',
    logoColor: '#FFFFFF',
    howTo: [
      { t: 'Pilih lubang', d: 'Saat giliranmu, pilih satu lubang di sisimu dari HP.' },
      { t: 'Sebar bijinya', d: 'Biji disebar satu per satu searah jarum jam.' },
      { t: 'Isi lumbung', d: 'Pemilik biji terbanyak di lumbung menang.' },
    ],
    track: 'congklak',
    tips: [
      'Biji terakhir masuk lumbung sendiri? Kamu jalan lagi!',
      'Berhenti di lubang kosong milikmu bisa menembak biji lawan.',
    ],
  },
  kerupuk: {
    id: 'kerupuk',
    title: 'Makan Kerupuk',
    tagline: 'Tangan di belakang, gigit kerupuknya!',
    description:
      'Lomba 17-an paling seru. Kerupuk bergoyang di tali, tangan tidak boleh dipakai. Ketuk GIGIT tepat saat kerupuk di depan mulut. Habiskan duluan untuk menang.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Satu tombol',
    orientation: 'Tegak',
    category: 'lomba',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FF5A1F',
    howTo: [
      { t: 'Tunggu ayunannya', d: 'Kerupuk bergoyang di tali, ikuti di layar utama.' },
      { t: 'Gigit pas', d: 'Ketuk GIGIT saat kerupuk tepat di depan mulut.' },
      { t: 'Habiskan duluan', d: 'Yang pertama menghabiskan kerupuk menang.' },
    ],
    track: 'kerupuk',
    tips: [
      'Gigitan meleset bikin kamu tersedak sebentar.',
      'Makin sedikit kerupuknya, makin kencang goyangnya.',
    ],
  },
  karung: {
    id: 'karung',
    title: 'Balap Karung',
    tagline: 'Lompat berirama, jangan sampai jatuh!',
    description:
      'Masuk karung, siap, lompat! Ketuk mengikuti irama untuk lompatan jauh. Asal ketuk cepat malah bikin tersandung. Yang pertama melewati garis finis menang.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Ketuk berirama',
    orientation: 'Tegak',
    category: 'lomba',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Ikuti irama', d: 'Ketuk saat cincin pas di garis untuk lompatan jauh.' },
      { t: 'Jangan buru-buru', d: 'Ketukan asal cepat bikin karungmu tersandung.' },
      { t: 'Kejar finis', d: 'Yang pertama melewati garis finis menang.' },
    ],
    track: 'karung',
    tips: [
      'Irama lebih penting daripada kecepatan.',
      'Tiga lompatan pas berturut-turut memberi lompatan super.',
    ],
  },
  kompak: {
    id: 'kompak',
    title: 'Kompak Gak?',
    tagline: 'Pikiranmu sama dengan yang lain?',
    description:
      'Bukan soal benar atau salah. Semua menjawab pertanyaan yang sama, dan poin didapat kalau jawabanmu sama dengan kebanyakan orang. Berdua? Uji seberapa sehati kalian.',
    minPlayers: 2,
    maxPlayers: 16,
    control: 'Pilih jawaban',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'ramai',
    available: true,
    remote: true,
    badge: 'BARU',
    logoColor: '#FFFFFF',
    howTo: [
      { t: 'Baca pertanyaannya', d: 'Pertanyaan dan pilihan tampil di layar utama.' },
      { t: 'Tebak isi kepala teman', d: 'Pilih jawaban yang menurutmu dipilih kebanyakan orang.' },
      {
        t: 'Kumpulkan poin',
        d: 'Sama dengan mayoritas dapat poin. Berdua, sama-sama dapat poin kalau kompak.',
      },
    ],
    track: 'kompak',
    tips: ['Jangan jawab maumu sendiri, tebak jawaban teman.', 'Jawaban unik sendirian tidak dapat poin.'],
  },
  ludo: {
    id: 'ludo',
    title: 'Ludo',
    tagline: 'Keluarkan bidak, makan lawan, pulang duluan!',
    description:
      'Permainan papan favorit sejuta umat. Lempar dadu dan pilih bidak dari HP, makan bidak lawan untuk mengirimnya pulang, lalu bawa semua bidakmu ke tengah. Lima sampai delapan pemain? Papannya jadi segi lima sampai segi delapan, setiap orang punya warna sendiri.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Dadu & pilih bidak',
    orientation: 'Tegak',
    category: 'papan',
    mood: 'santai',
    available: true,
    remote: true,
    long: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Lempar dadu', d: 'Dapat 6 untuk mengeluarkan bidak dari kandang.' },
      { t: 'Pilih bidak', d: 'Pilih bidak yang mau dijalankan langsung di HP.' },
      {
        t: 'Makan dan pulang',
        d: 'Mendarat di bidak lawan mengirimnya pulang. Bawa semua bidakmu ke tengah.',
      },
    ],
    track: 'ludo',
    tips: ['Kotak bintang aman dari serangan.', 'Dapat 6? Kamu boleh lempar lagi.'],
  },
  catur: {
    id: 'catur',
    title: 'Catur',
    tagline: 'Adu strategi, satu lawan satu atau beregu.',
    description:
      'Catur dengan papan di HP-mu. Berdua, adu otak dengan jam catur. Ramai-ramai, bagi jadi dua tim dan voting setiap langkah di Catur Rame.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Papan di HP',
    orientation: 'Tegak',
    category: 'papan',
    mood: 'otak',
    available: true,
    remote: true,
    long: true,
    badge: 'BARU',
    logoColor: '#FFFFFF',
    howTo: [
      { t: 'Pilih bidak', d: 'Ketuk bidak di papan HP, langkah yang sah langsung ditandai.' },
      { t: 'Ketuk tujuan', d: 'Ketuk petak tujuan untuk melangkah.' },
      { t: 'Skak mat', d: 'Kunci raja lawan sampai tidak bisa lari.' },
    ],
    track: 'catur',
    tips: ['Lebih dari dua pemain? Catur Rame: tim voting tiap langkah.', 'Waktu habis berarti kalah.'],
  },
  arena: {
    id: 'arena',
    title: 'Ular Arena',
    tagline: 'Makan, memanjang, jebak lawan!',
    description:
      'Ular-ular berkepala tokoh berebut makanan di arena. Arahkan ularmu dengan joystick di HP, makan biji supaya makin panjang, ngebut untuk memotong jalan lawan, dan jangan sampai kepalamu menabrak badan ular lain. Yang terpanjang saat waktu habis jadi juara.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick & ngebut',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#7BE495',
    howTo: [
      { t: 'Arahkan joystick', d: 'Kepala ularmu menuju ke arah yang ditunjuk joystick di HP.' },
      { t: 'Makan', d: 'Makan biji dan sisa ular yang tumbang supaya makin panjang.' },
      {
        t: 'Jebak lawan',
        d: 'Kepala yang menabrak badan ular lain langsung tumbang. Tahan NGEBUT untuk memotong jalannya.',
      },
    ],
    track: 'arena',
    tips: [
      'NGEBUT memakan sedikit panjang badanmu, pakai seperlunya.',
      'Putar joystick melingkari lawan supaya dia tidak bisa keluar.',
    ],
  },
  wilayah: {
    id: 'wilayah',
    title: 'Rebut Wilayah',
    tagline: 'Kurung lahan, potong jejak lawan!',
    description:
      'Warnai lantai sebanyak mungkin. Gerakkan joystick ke segala arah untuk keluar dari wilayahmu sambil meninggalkan jejak, lalu kembali untuk mengurung lahan baru. Hati-hati: kalau jejakmu dipotong lawan sebelum pulang, kamu tumbang. Wilayah terluas saat waktu habis menang.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Gerak bebas', d: 'Arahkan joystick ke mana saja. Jejakmu melengkung mulus mengikuti gerakanmu.' },
      {
        t: 'Keluar dan kembali',
        d: 'Tinggalkan wilayahmu, buat lengkungan, lalu pulang untuk merebut lahan di dalamnya.',
      },
      {
        t: 'Potong jejak',
        d: 'Lewati jejak lawan yang belum pulang untuk menumbangkannya. Wilayah terluas menang.',
      },
    ],
    track: 'wilayah',
    tips: [
      'Lengkungan kecil lebih aman daripada satu lingkaran raksasa.',
      'Jejakmu sendiri juga berbahaya: jangan menabraknya.',
    ],
  },
  lari: {
    id: 'lari',
    title: 'Lari Terus',
    tagline: 'Lari, lompat, jangan sampai tertinggal!',
    description:
      'Semua pelari berlari bersama di atap-atap kota yang makin cepat. Satu usapan di HP memindahkanmu satu jalur, usap ke atas untuk lompat dan ke bawah untuk merunduk. Menabrak bikin tersandung dan tertinggal. Pelari terakhir yang bertahan jadi juara. Main sendiri? Lari sejauh mungkin sebelum waktu habis.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Usap',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Usap kiri atau kanan', d: 'Satu usapan pindah satu jalur. Hindari rintangan di depan.' },
      { t: 'Usap atas atau bawah', d: 'Lompati palang rendah, merunduk di bawah palang tinggi.' },
      { t: 'Jangan tertinggal', d: 'Tersandung membuatmu mundur. Keluar dari layar berarti gugur.' },
    ],
    track: 'lari',
    tips: ['Koin di jalur memberi poin tambahan.', 'Lihat jauh ke depan: rintangan muncul dari kejauhan.'],
  },
  kata: {
    id: 'kata',
    title: 'Sambung Kata',
    tagline: 'Sambung suku kata terakhir, jangan sampai buntu!',
    description:
      'Bergiliran menyebut kata yang diawali suku kata terakhir kata sebelumnya: buku, kuda, daun. Ketik di HP sebelum waktu habis. Kata salah, kata yang sudah dipakai, atau kehabisan waktu mengurangi nyawa. Pemain terakhir yang bertahan menang.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Ketik di HP',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'otak',
    available: true,
    remote: true,
    badge: 'BARU',
    logoColor: '#FFFFFF',
    howTo: [
      { t: 'Lihat suku kata', d: 'Kata berikutnya harus diawali suku kata terakhir kata sebelumnya.' },
      { t: 'Ketik cepat', d: 'Ketik kata di HP dan kirim sebelum waktu habis.' },
      { t: 'Jaga nyawa', d: 'Salah atau kehabisan waktu mengurangi nyawa. Terakhir bertahan menang.' },
    ],
    track: 'kata',
    tips: ['Kata yang sudah dipakai tidak boleh diulang.', 'Waktu per giliran makin singkat tiap putaran.'],
  },
  juragan: {
    id: 'juragan',
    title: 'Juragan Nusantara',
    tagline: 'Beli kota, bangun usaha, tagih sewa!',
    description:
      'Keliling papan kota-kota Nusantara. Beli kota dan dirikan rumah berwarna milikmu, naikkan jadi Toko, Gedung, lalu Hotel supaya sewanya naik, dan rebut kota lawan. Kartu kejadian bisa membawa untung atau buntung. Setelah putaran terakhir, pemain terkaya jadi juragan.',
    minPlayers: 1,
    maxPlayers: 6,
    control: 'Dadu & tombol',
    orientation: 'Tegak',
    category: 'papan',
    mood: 'santai',
    available: true,
    remote: true,
    long: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      {
        t: 'Beli kota',
        d: 'Lempar dadu dari HP. Beli kota kosong yang kamu singgahi, rumah warnamu langsung berdiri.',
      },
      {
        t: 'Naikkan usaha',
        d: 'Singgah lagi di kotamu untuk menaikkan Rumah jadi Toko, Gedung, lalu Hotel. Sewanya ikut naik.',
      },
      {
        t: 'Rebut kota lawan',
        d: 'Di kota lawan yang belum jadi Hotel, bayar sewa lalu rebut kotanya seharga 2 kali nilainya.',
      },
    ],
    track: 'juragan',
    tips: [
      'Kota yang sudah jadi Hotel aman dari rebutan.',
      'Simpan uang tunai untuk membayar sewa dan merebut kota lawan.',
    ],
  },
  dapur: {
    id: 'dapur',
    title: 'Dapur Heboh',
    tagline: 'Satu tim, satu dapur. Lempar bahan, antar pesanan!',
    description:
      'Masak bersama di dapur yang makin heboh. Ambil bahan, potong, masak, lalu susun di piring dan antar ke loket sebelum pelanggan pulang. Di Dapur Terbelah ada pembatas di tengah: bahan harus dilempar ke teman di seberang. Tangan penuh saat ditangkap? Bajumu kotor! Kumpulkan skor tim untuk tiga bintang.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick + 3 tombol',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      {
        t: 'Ambil dan olah',
        d: 'Ketuk Ambil di keranjang, tahan Kerja untuk memotong, taruh di kompor atau penggorengan.',
      },
      {
        t: 'Lempar ke seberang',
        d: 'Ketuk Lempar: bahan terbang ke teman terdekat. Pastikan tangannya kosong!',
      },
      {
        t: 'Antar pesanan',
        d: 'Susun di piring sesuai tiket, antar ke loket. Makin cepat, makin besar tipnya.',
      },
    ],
    track: 'dapur',
    tips: [
      'Bagi tugas: Sisi Persiapan memotong, Sisi Masak memasak dan mengantar.',
      'Piring kotor kembali ke bak cuci. Cuci supaya rak tidak kosong.',
      'Di level Heboh, masakan gosong bisa terbakar. Padamkan dengan pemadam merah.',
    ],
  },
  obby: {
    id: 'obby',
    wave: 3,
    title: 'Obby',
    tagline: 'Balapan rintangan. Siapa duluan ke bendera?',
    description:
      'Balapan di lintasan rintangan dari balok mainan: palang berputar, lantai yang hilang, ban berjalan, dan pegas lompat. Joystick untuk lari, tombol LOMPAT untuk melompat. Injak lantai kotak-kotak untuk menyimpan; jatuh berarti kembali ke titik simpan terakhirmu. Kamera ada di belakangmu dan menghadap ke depan. Sampai 4 orang, layar dibagi: tiap orang punya bagian sendiri. 5 orang atau lebih berbagi satu kamera, jadi yang tertinggal dipindah ke dekat rombongan. Tiga lintasan pendek, total poin menentukan juara.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick + LOMPAT',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Lari dan lompat', d: 'Joystick kiri untuk lari dan belok, tombol LOMPAT besar di kanan.' },
      { t: 'Titik simpan', d: 'Injak lantai kotak-kotak. Jatuh? Muncul lagi di titik simpan terakhirmu.' },
      {
        t: 'Jangan tertinggal',
        d: 'Main 5 orang atau lebih: keluar layar lebih dari 2 detik berarti dipindah ke titik simpan dekat rombongan.',
      },
    ],
    track: 'obby',
    tips: ['Palang berputar bisa dilompati.', 'Lari penuh sebelum menginjak pegas supaya terlempar jauh.'],
  },
  tali: {
    id: 'tali',
    wave: 3,
    title: 'Satu Tali',
    tagline: 'Satu jatuh, semua ikut tertarik. Naik bareng!',
    description:
      'Satu tim terikat satu tali elastis, mendaki tebing, hutan bambu, atau puncak salju lewat celah, rakit geser, palang berputar, dan dinding panjat. Kalau ada yang jatuh, tahan PEGANG supaya tidak ikut terseret, lalu mundur untuk menariknya naik. Sentuh bendera bersama untuk lanjut ke bagian berikutnya. Main sendiri? Kamu diikat ke karung pemberat yang bisa diseret dan dilempar.',
    minPlayers: 1,
    maxPlayers: 4,
    control: 'Joystick + LOMPAT + PEGANG',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Satu tali', d: 'Semua terikat. Kalau terlalu jauh, tali menarik yang tertinggal.' },
      { t: 'Tahan PEGANG', d: 'Teman jatuh? Tahan PEGANG, lalu mundur untuk menariknya naik.' },
      {
        t: 'Bendera bersama',
        d: 'Semua berdiri di bendera untuk lanjut. Jatuh semua? Ulang dari bendera terakhir.',
      },
    ],
    track: 'tali',
    tips: [
      'Tergantung di tali? Ketuk PANJAT berkali-kali untuk naik.',
      'Tahan PEGANG di dinding panjat untuk memanjat ke atas.',
      'Lompat bareng saat palang lewat. Yang telat ikut tertarik!',
    ],
  },
  bom: {
    id: 'bom',
    wave: 3,
    title: 'Bom Oper',
    tagline: 'Bom berdetak, waktunya rahasia. Oper sebelum BUM!',
    description:
      'Kejar-kejaran di halaman, pasar, atau atap gedung dengan bom yang sumbunya menyala. Waktu ledaknya rahasia, hanya percikan sumbu yang makin cepat. Dekati teman lalu ketuk OPER, tapi bom tidak bisa langsung dioper balik. Pemegang bom lari sedikit lebih cepat. BUM berarti kehilangan satu dari tiga nyawa, dan ronde terakhir memakai dua bom sekaligus.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick + OPER',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Lari', d: 'Joystick untuk lari. Pemegang bom sedikit lebih cepat, jadi selalu bisa mengejar.' },
      { t: 'Ketuk OPER', d: 'Tombol menyala "Dekat!" saat ada teman di dalam lingkar merah.' },
      { t: 'Tiga nyawa', d: 'BUM! Pemegangnya kehilangan satu nyawa. Nyawa terbanyak menang.' },
    ],
    track: 'bom',
    tips: [
      'Yang baru mengoper kebal 2 detik, jadi bom tidak bisa langsung kembali.',
      'Sumbu berdenyut makin cepat menjelang ledakan.',
      'Ronde terakhir ada dua bom!',
    ],
  },
  runtuh: {
    id: 'runtuh',
    wave: 3,
    title: 'Lantai Runtuh',
    tagline: 'Aturan berganti, petak yang salah runtuh!',
    description:
      'Panggung kuis malam tanpa soal tertulis. Tiap babak layar menyebut aturan baru: warna, simbol, angka, jangan diam, gelombang, sampai lampu padam. Pindah ke petak yang benar sebelum waktu habis, petak yang salah runtuh ke jurang. DORONG lawan di dekatmu, tapi tombolnya perlu jeda. Yang jatuh ikut lagi babak berikutnya, dan babak terakhir berpoin ganda.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick + DORONG',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Ikuti aturan', d: 'Tiap babak layar menyebut aturan: warna, simbol, angka, atau gerak.' },
      {
        t: 'Pindah petak',
        d: 'Joystick untuk pindah petak sebelum hitung mundur habis. Petak yang salah runtuh.',
      },
      { t: 'DORONG', d: 'Geser pemain di dekatmu. Setelah itu jeda 3 detik, terlihat di cincin tombol.' },
    ],
    track: 'runtuh',
    tips: [
      'Jatuh tidak lama: poinmu tetap, dan kamu ikut lagi di babak berikutnya.',
      'Babak Gelap berpoin ganda. Ingat petak yang menyala!',
    ],
  },
  es: {
    id: 'es',
    title: 'Seluncur Es',
    tagline: 'Tarik, bidik, lepas. Terakhir di atas es menang!',
    description:
      'Semua berdiri di bongkah es di laut dingin. Tarik ketapel di HP untuk arah dan kekuatan, lepas untuk mengunci. Waktu habis, semua meluncur bersamaan dan saling tabrak. Tiap luncuran tepi es retak dan patah. Terakhir di atas es dapat poin terbanyak, ronde terakhir berpoin ganda.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Ketapel: tarik dan lepas',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#EEF8FC',
    howTo: [
      {
        t: 'Tarik ke belakang',
        d: 'Tarik dari tokohmu di HP. Arah luncur kebalikan dari tarikan, makin jauh makin kuat.',
      },
      { t: 'Lepas untuk mengunci', d: 'Masih boleh bidik ulang sebelum hitung mundur habis.' },
      {
        t: 'Meluncur bersamaan',
        d: 'Tabrak lawan sampai tercebur. Tepi es yang retak patah setelah luncuran.',
      },
    ],
    track: 'es',
    wave: 3,
    tips: [
      'Bidikan dikunci di HP, jadi sinyal lambat tidak merugikan.',
      'Garis putus-putus merah di es: bagian itu patah setelah luncuran ini.',
      'Tercebur? Bersorak dari HP, lalu kembali ke es di ronde berikutnya.',
    ],
  },
  langkah: {
    id: 'langkah',
    title: 'Langkah Maut',
    tagline: 'Satu salah langkah, jatuh ke jurang!',
    description:
      'Jalan setapak di atas jurang gelap. Layar menampilkan panah, tekan arah yang sama di HP tepat waktu. Delapan babak menegangkan: Eskalator, Titian Tali, Tangga Gedung, Lorong Laser, Batu Sungai, Gua Runtuh, Ingat Jalan, Lift Rusak. Host memilih Acak atau babak tertentu. Yang jatuh ikut lagi babak berikutnya.',
    minPlayers: 1,
    maxPlayers: 16,
    control: 'Tombol arah',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Lihat panah di layar', d: 'Tekan tombol arah yang sama di HP tepat waktu.' },
      { t: 'Salah = jatuh', d: 'Salah arah atau terlambat, kamu jatuh. Ikut lagi di babak berikutnya.' },
      { t: 'Kejar beruntun', d: 'Tekan pas di ketukan untuk bonus beruntun. Makin lama makin cepat.' },
    ],
    track: 'langkah',
    wave: 3,
    tips: [
      'Waktu tekan diukur di HP, jadi tetap adil walau sinyal lambat.',
      'Di Lorong Laser, tunggu laser dekat dulu. Terlalu cepat juga jatuh!',
      'Babak terakhir berpoin ganda.',
    ],
  },
  nyebrang: {
    id: 'nyebrang',
    wave: 3,
    title: 'Nyebrang',
    tagline: 'Lompat serentak, jangan tertinggal kamera!',
    description:
      'Seberangi jalan penuh angkot, sungai berbatang kayu, dan rel kereta. Satu usap, satu lompatan. Kamera terus maju, yang tertinggal di tepi layar gugur. Balapan ke garis akhir atau bertahan sampai tinggal sendiri, di map Kota, Sungai, Rel, dan Malam.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Usap atau tombol arah',
    orientation: 'Tegak',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Usap untuk lompat', d: 'Satu usap ke mana saja = satu lompatan. Ketuk untuk maju.' },
      { t: 'Hindari dan pijak', d: 'Awas angkot dan kereta. Di sungai, pijak batang kayu dan teratai.' },
      { t: 'Jangan tertinggal', d: 'Kamera terus maju. Lolos tipis dari kendaraan dapat bonus.' },
    ],
    track: 'nyebrang',
    tips: [
      'Lampu merah berkedip di tepi rel artinya kereta datang. Tunggu dulu!',
      'Batang kayu membawamu ke samping. Lompat sebelum hanyut keluar layar.',
      'Ronde terakhir poinnya ganda.',
    ],
  },
  penyusup: {
    id: 'penyusup',
    wave: 3,
    title: 'Penyusup',
    tagline: 'Semua dapat kata yang sama, kecuali satu.',
    description:
      'Tiap pemain melihat kata rahasia di HP, tapi satu penyusup dapat kata yang mirip. Bergiliran beri petunjuk satu kata, diucapkan atau diketik, lalu pilih siapa yang beda. Ada Si Kosong yang tidak dapat kata sama sekali. Kata dalam Bahasa Indonesia atau Inggris.',
    minPlayers: 3,
    maxPlayers: 16,
    control: 'Kartu rahasia dan voting',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'ramai',
    available: true,
    remote: true,
    badge: 'BARU',
    logoColor: '#FFC928',
    howTo: [
      { t: 'Intip kartumu', d: 'Tahan kartu di HP untuk melihat kata rahasia. Lepas, kartu tertutup.' },
      { t: 'Beri petunjuk', d: 'Satu kata, bergiliran. Jangan terlalu jelas, jangan terlalu samar.' },
      { t: 'Cari yang beda', d: 'Pilih penyusupnya di HP. Suara dibuka bersamaan di layar.' },
    ],
    track: 'penyusup',
    tips: [
      'Kamu bisa saja penyusup tanpa sadar. Dengarkan dulu petunjuk yang lain.',
      'Si Kosong yang tertangkap masih bisa menang dengan menebak kata warga.',
      'Butuh 3 pemain atau lebih, jadi perlu Kacaw Pass.',
    ],
  },
  eja: {
    id: 'eja',
    title: 'Juara Eja',
    tagline: 'Dengar katanya, baca artinya, eja di HP.',
    description:
      'Lomba mengeja serentak. Layar membacakan kata dan menampilkan artinya, semua mengetik ejaannya di HP. Huruf dibuka bersama di layar. Kata makin sulit, salah eja mengurangi nyawa. Pilih Bahasa Indonesia atau English. Main sendiri: kejar rekor beruntun.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Papan ketik huruf',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'otak',
    available: true,
    remote: true,
    wave: 3,
    badge: 'BARU',
    logoColor: '#1C1A17',
    howTo: [
      { t: 'Dengar dan baca', d: 'Kata dibacakan dan artinya tampil di layar utama.' },
      { t: 'Ketik ejaannya', d: 'Ketik di HP lalu tekan Kirim. Kotak huruf menunjukkan panjang kata.' },
      { t: 'Jaga nyawa', d: 'Benar dapat 2 poin, salah eja mengurangi nyawa. Kata Sulit berpoin ganda.' },
    ],
    track: 'eja',
    tips: [
      'Tekan Dengar lagi di HP kalau kurang jelas.',
      'Nyawa habis? Tetap ketik di Latihan, kata yang benar masuk Kamus Saya.',
      'Kurang satu huruf ditandai, jadi kamu tahu hampir benar.',
    ],
  },
  siluman: {
    id: 'siluman',
    title: 'Kampung Siluman',
    tagline: 'Malam menyamar, siang berdebat.',
    description:
      'Siluman menyamar di antara warga. Malam hari semua tutup mata, layar memanggil tiap peran dengan bunyinya: Siluman memilih, Dukun melihat satu peran, Tabib melindungi. Siang hari kampung berdiskusi, mencurigai, lalu voting rahasia di HP. Tanpa moderator, layar yang memandu.',
    minPlayers: 5,
    maxPlayers: 16,
    control: 'Kartu peran dan voting',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'ramai',
    available: true,
    remote: true,
    wave: 3,
    badge: 'BARU',
    logoColor: '#FFE7A3',
    howTo: [
      { t: 'Intip peranmu', d: 'Tahan kartu di HP. Warga, Siluman, Dukun, atau Tabib. Rahasiakan!' },
      {
        t: 'Malam: tutup mata',
        d: 'Buka mata hanya saat bunyi peranmu, pilih di HP, tutup lagi saat weker.',
      },
      {
        t: 'Siang: cari siluman',
        d: 'Diskusi, tandai yang dicurigai, lalu voting. Yang tersingkir jadi arwah.',
      },
    ],
    track: 'siluman',
    tips: [
      'Hafalkan bunyinya: geraman Siluman, lonceng Dukun, seruling Tabib.',
      'Arwah tetap ikut: tebak siluman saat voting untuk poin.',
      'Butuh 5 pemain atau lebih, jadi perlu Kacaw Pass.',
    ],
  },
  warna: {
    id: 'warna',
    title: 'Petualangan Warna',
    tagline: 'Tiap tokoh punya warna. Hanya bersama semua bisa keluar.',
    description:
      'Teka-teki platform kerja sama di gua bercahaya. Tiap pemain dapat warna dan simbol sendiri. Kolam, gerbang, dan permata hanya untuk warna yang sama. Injak tombol, dorong kotak berat berdua, tarik tuas, naik lift, dan berdiri di pundak teman sampai semua masuk pintu warnanya.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick dan LOMPAT',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'ramai',
    available: true,
    wave: 3,
    badge: 'BARU',
    logoColor: '#FFE27A',
    howTo: [
      { t: 'Kenali warnamu', d: 'Kolam warnamu aman. Kolam warna lain = kembali ke titik simpan.' },
      { t: 'Kerja sama', d: 'Tombol injak, tuas, lift, dan kotak berat butuh teman.' },
      { t: 'Semua keluar', d: 'Naik ke pundak teman, lalu masuk pintu sesuai warnamu.' },
    ],
    track: 'warna',
    tips: [
      'Tiap warna punya simbol, jadi tetap jelas bagi yang buta warna.',
      'Main sendiri: kamu memegang dua karakter, tekan TUKAR untuk pindah.',
      'Macet? Tekan ULANG bersama untuk mengulang level.',
    ],
  },
  hantu: {
    id: 'hantu',
    title: 'Hantu Tak Terlihat',
    tagline: 'Hantunya cuma kelihatan saat kena senter.',
    description:
      'Rumah gelap, satu pemain diam-diam jadi hantu. Posisinya hanya tampil di peta rahasia di HP-nya, di layar ia tak terlihat kecuali tersorot senter. Penghuni mencari 3 kunci, menyalakan sekring, lalu kabur. HP penghuni berdetak makin cepat saat hantu mendekat. Pilih Rumah Tua atau Kampung Malam, Seram Ringan atau Seram Beneran. Tanpa darah.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Joystick, senter, dan lari',
    orientation: 'Mendatar',
    category: 'aksi',
    mood: 'heboh',
    available: true,
    wave: 3,
    badge: 'BARU',
    logoColor: '#A6F4E6',
    howTo: [
      { t: 'Intip peranmu', d: 'Tahan kartu di HP: penghuni atau hantu. Rahasiakan!' },
      { t: 'Penghuni', d: 'Cari 3 kunci dan nyalakan sekring. Sorot hantu agar silau, lalu kabur.' },
      { t: 'Hantu', d: 'Lihat peta rahasia di HP, tangkap penghuni, matikan lampu, banting pintu.' },
    ],
    track: 'hantu',
    tips: [
      'Disorot senter sebentar membuat hantu silau dan melambat.',
      'Titik merah berkedip di layar menunjukkan posisi hantu. Seram Ringan: sering. Seram Beneran: jarang, atau saat hantu mendekat.',
      'Yang tertangkap jadi kunang-kunang dan tetap menerangi jalan teman.',
      'Main sendiri: lawan hantu komputer.',
    ],
  },
};

export const CATALOG: GameId[] = [
  'bajaj',
  'masak',
  'tarik',
  'kuis',
  'rusun',
  'ular',
  'congklak',
  'kerupuk',
  'karung',
  'kompak',
  'ludo',
  'catur',
  'arena',
  'wilayah',
  'lari',
  'kata',
  'juragan',
  'dapur',
  'obby',
  'tali',
  'bom',
  'runtuh',
  'es',
  'langkah',
  'nyebrang',
  'penyusup',
  'eja',
  'siluman',
  'warna',
  'hantu',
];
/** Whether a far-away main screen can watch this game (long-distance play). */
export function playsRemote(id: GameId): boolean {
  return GAMES[id].remote === true;
}

export const FEATURED: GameId[] = ['bajaj', 'masak', 'tarik', 'kuis', 'rusun'];

/** Tabs of the game list, the same on the main screen's home and in the Host's phone picker. */
export type HomeTab = 'fit' | GameCategory;

export const HOME_TABS: { id: HomeTab; label: string }[] = [
  { id: 'fit', label: 'Pas untuk kalian' },
  ...CATEGORIES,
];

export function isHomeTab(v: unknown): v is HomeTab {
  return typeof v === 'string' && HOME_TABS.some((t) => t.id === v);
}

/**
 * Games listed under a tab. "Pas untuk kalian": playable games for this many players, the
 * recently played first. A category: its games in catalog order; `withSoon` keeps the
 * "segera hadir" teasers (the main screen shows them, the phone picker does not).
 */
export function gamesForTab(
  tab: HomeTab,
  players: number,
  recent: readonly string[] = [],
  withSoon = false,
): GameId[] {
  const n = Math.max(1, players);
  if (tab === 'fit') {
    const ok = (id: GameId) => GAMES[id].available && n >= GAMES[id].minPlayers && n <= GAMES[id].maxPlayers;
    const first = recent.filter((id): id is GameId => id in GAMES && ok(id as GameId));
    return [...first, ...CATALOG.filter((id) => ok(id) && !first.includes(id))];
  }
  return CATALOG.filter((id) => GAMES[id].category === tab && (withSoon || GAMES[id].available));
}
