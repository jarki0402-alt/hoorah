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
  | 'gambar'
  | 'panjat';

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
      'Lantai baru berayun di tali crane. Jatuhkan pas di atas menara, bergiliran. Makin tinggi, lantai makin kecil dan ayunan makin cepat. Yang merobohkan, kalah.',
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
      'Lihat ayunan crane di layar utama, bukan di HP.',
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
      'Permainan papan favorit sejuta umat. Lempar dadu dan pilih bidak dari HP, makan bidak lawan untuk mengirimnya pulang, lalu bawa keempat bidakmu ke tengah. Lebih dari empat pemain? Main beregu.',
    minPlayers: 1,
    maxPlayers: 8,
    control: 'Dadu & pilih bidak',
    orientation: 'Tegak',
    category: 'papan',
    mood: 'santai',
    available: true,
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
      'Ular-ular buah berebut makanan di arena. Arahkan ularmu dengan joystick di HP, makan biji supaya makin panjang, ngebut untuk memotong jalan lawan, dan jangan sampai kepalamu menabrak badan ular lain. Yang terpanjang saat waktu habis jadi juara.',
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
  gambar: {
    id: 'gambar',
    title: 'Gambar Kilat',
    tagline: 'Gambar, tebak, tertawa.',
    description: 'Segera hadir.',
    minPlayers: 3,
    maxPlayers: 16,
    control: 'Gambar dan ketik',
    orientation: 'Tegak',
    category: 'kuis',
    mood: 'ramai',
    available: false,
    badge: 'SEGERA',
    logoColor: '#FFFFFF',
    howTo: [],
    tips: [],
  },
  panjat: {
    id: 'panjat',
    title: 'Panjat Pinang',
    tagline: 'Panjat, rebut hadiahnya!',
    description: 'Segera hadir.',
    minPlayers: 2,
    maxPlayers: 8,
    control: 'Ritme',
    orientation: 'Tegak',
    category: 'lomba',
    mood: 'heboh',
    available: false,
    badge: 'SEGERA',
    logoColor: '#FFFFFF',
    howTo: [],
    tips: [],
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
  'gambar',
];
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
