/**
 * Prompt bank for Kompak Gak?. There is no right answer: every prompt is an everyday question
 * whose options are all reasonable, and players score by matching each other.
 *
 * Rules (checked by tests): at least 120 prompts, unique ids, 4 distinct options each,
 * prompt <= 90 chars, option <= 18 chars, no em dash. Family-friendly, no brands, no real
 * people, no politics or religion.
 */

export type Category =
  | 'Makanan'
  | 'Jajanan'
  | 'Kebiasaan'
  | 'Rumah'
  | 'Sekolah'
  | 'Kerja'
  | 'Jalanan'
  | 'Liburan'
  | 'Mudik'
  | 'Cuaca'
  | 'Hiburan'
  | 'Nongkrong';

export interface Prompt {
  id: string;
  category: Category;
  q: string;
  options: readonly [string, string, string, string];
}

export const LIMITS = { prompt: 90, option: 18 } as const;

const p = (
  id: string,
  category: Category,
  q: string,
  options: readonly [string, string, string, string],
): Prompt => ({
  id,
  category,
  q,
  options,
});

export const PROMPTS: readonly Prompt[] = [
  /* ---------------------------------------------------------------- Makanan */
  p('makan-sarapan', 'Makanan', 'Sarapan paling enak buat memulai hari…', [
    'Nasi uduk',
    'Bubur ayam',
    'Lontong sayur',
    'Roti bakar',
  ]),
  p('makan-bubur', 'Makanan', 'Bubur ayam paling nikmat dimakan dengan cara…', [
    'Diaduk rata',
    'Tidak diaduk',
    'Kuahnya dipisah',
    'Kerupuk duluan',
  ]),
  p('makan-telur', 'Makanan', 'Telur paling enak dimasak jadi…', ['Ceplok', 'Dadar', 'Rebus', 'Orak-arik']),
  p('makan-sambal', 'Makanan', 'Sambal yang paling wajib ada di meja makan…', [
    'Sambal terasi',
    'Sambal bawang',
    'Sambal matah',
    'Sambal kecap',
  ]),
  p('makan-mi-tambah', 'Makanan', 'Mi instan paling mantap kalau ditambah…', [
    'Telur',
    'Sawi',
    'Cabai rawit',
    'Keju',
  ]),
  p('makan-mi-kapan', 'Makanan', 'Makan mi instan paling enak saat…', [
    'Hujan',
    'Tengah malam',
    'Akhir bulan',
    'Habis berenang',
  ]),
  p('makan-nasgor', 'Makanan', 'Teman nasi goreng yang paling pas…', [
    'Telur ceplok',
    'Kerupuk',
    'Sate ayam',
    'Acar',
  ]),
  p('makan-gorengan', 'Makanan', 'Gorengan yang paling cepat habis di piring…', [
    'Bakwan',
    'Tahu isi',
    'Tempe goreng',
    'Pisang goreng',
  ]),
  p('makan-kuah', 'Makanan', 'Makanan berkuah paling cocok saat badan kurang fit…', [
    'Sop ayam',
    'Soto',
    'Bakso',
    'Mi rebus',
  ]),
  p('makan-sate', 'Makanan', 'Sate paling enak itu sate…', ['Ayam', 'Kambing', 'Padang', 'Taichan']),
  p('makan-padang', 'Makanan', 'Lauk pertama yang dicari di rumah makan Padang…', [
    'Rendang',
    'Ayam pop',
    'Telur balado',
    'Gulai tunjang',
  ]),
  p('makan-tempe', 'Makanan', 'Tempe paling enak diolah jadi…', [
    'Mendoan',
    'Tempe goreng',
    'Orek tempe',
    'Keripik tempe',
  ]),
  p('makan-nasi-habis', 'Makanan', 'Nasi di rumah habis, pengganti paling cepat…', [
    'Mi instan',
    'Roti',
    'Nasi bungkus',
    'Lontong',
  ]),
  p('makan-ayam', 'Makanan', 'Bagian ayam goreng yang paling diincar…', [
    'Paha',
    'Dada',
    'Sayap',
    'Kulitnya',
  ]),
  p('makan-pedas', 'Makanan', 'Level pedas yang paling aman untuk dipesan…', [
    'Tidak pedas',
    'Sedang',
    'Pedas',
    'Paling pedas',
  ]),
  p('makan-malam', 'Makanan', 'Lapar tengah malam, yang paling sering dicari…', [
    'Mi instan',
    'Nasi goreng',
    'Martabak',
    'Roti bakar',
  ]),
  p('makan-bumbu', 'Makanan', 'Makanan kurang nendang, paling sering ditambah…', [
    'Kecap manis',
    'Sambal',
    'Garam',
    'Saus tomat',
  ]),
  p('makan-kerupuk', 'Makanan', 'Kerupuk paling cocok jadi teman makan…', [
    'Nasi goreng',
    'Soto',
    'Gado-gado',
    'Bubur ayam',
  ]),
  p('makan-buah', 'Makanan', 'Buah yang paling sering ada di rumah…', ['Pisang', 'Jeruk', 'Pepaya', 'Apel']),
  p('makan-habis-pedas', 'Makanan', 'Minuman paling pas setelah makan pedas…', [
    'Es teh manis',
    'Air putih',
    'Es jeruk',
    'Susu',
  ]),
  p('makan-anak-kos', 'Makanan', 'Lauk andalan anak kos di akhir bulan…', [
    'Telur',
    'Mi instan',
    'Tempe',
    'Abon',
  ]),
  p('makan-rumah', 'Makanan', 'Masakan rumah yang paling bikin kangen…', [
    'Sayur asem',
    'Sayur sop',
    'Ayam goreng',
    'Tumis kangkung',
  ]),
  p('makan-ikan', 'Makanan', 'Ikan paling enak dimasak dengan cara…', [
    'Digoreng',
    'Dibakar',
    'Dipepes',
    'Digulai',
  ]),
  p('makan-lalapan', 'Makanan', 'Lalapan yang paling sering diambil duluan…', [
    'Timun',
    'Kemangi',
    'Kol',
    'Terong',
  ]),

  /* ---------------------------------------------------------------- Jajanan */
  p('jajan-martabak', 'Jajanan', 'Isi martabak manis yang paling laku…', [
    'Cokelat keju',
    'Kacang',
    'Cokelat',
    'Keju susu',
  ]),
  p('jajan-es', 'Jajanan', 'Es paling segar buat siang bolong…', [
    'Es kelapa',
    'Es campur',
    'Es cendol',
    'Es teh',
  ]),
  p('jajan-sekolah', 'Jajanan', 'Jajanan depan sekolah yang paling dikangenin…', [
    'Cilok',
    'Cimol',
    'Telur gulung',
    'Batagor',
  ]),
  p('jajan-pasar', 'Jajanan', 'Kue pasar yang paling sering dipilih duluan…', [
    'Klepon',
    'Kue lapis',
    'Risoles',
    'Onde-onde',
  ]),
  p('jajan-bakso', 'Jajanan', 'Isi mangkuk bakso yang paling wajib…', [
    'Bakso urat',
    'Mi kuning',
    'Bihun',
    'Tahu',
  ]),
  p('jajan-seblak', 'Jajanan', 'Isian seblak yang paling banyak dipilih…', [
    'Kerupuk',
    'Ceker',
    'Sosis',
    'Telur',
  ]),
  p('jajan-roti', 'Jajanan', 'Roti keliling paling enak rasa…', [
    'Cokelat',
    'Keju',
    'Kacang hijau',
    'Srikaya',
  ]),
  p('jajan-keliling', 'Jajanan', 'Pedagang keliling yang paling bikin buru-buru keluar rumah…', [
    'Tukang bakso',
    'Tukang es krim',
    'Tukang roti',
    'Tukang sate',
  ]),
  p('jajan-kopi', 'Jajanan', 'Teman minum kopi sore yang paling cocok…', [
    'Pisang goreng',
    'Roti bakar',
    'Kacang rebus',
    'Singkong goreng',
  ]),
  p('jajan-asam', 'Jajanan', 'Camilan asam pedas paling segar…', [
    'Rujak buah',
    'Asinan',
    'Mangga muda',
    'Lutis',
  ]),
  p('jajan-cilok', 'Jajanan', 'Cilok paling enak dimakan pakai…', [
    'Bumbu kacang',
    'Saus sambal',
    'Kecap',
    'Polos',
  ]),
  p('jajan-cocol', 'Jajanan', 'Gorengan paling enak dicocol…', [
    'Cabai rawit',
    'Saus kacang',
    'Sambal kecap',
    'Saus botol',
  ]),
  p('jajan-minuman', 'Jajanan', 'Minuman manis yang paling sering dibeli anak muda…', [
    'Es kopi susu',
    'Boba',
    'Es teh jumbo',
    'Jus buah',
  ]),
  p('jajan-malam', 'Jajanan', 'Jajanan malam yang paling panjang antreannya…', [
    'Martabak',
    'Nasi goreng',
    'Sate',
    'Pecel lele',
  ]),
  p('jajan-es-krim', 'Jajanan', 'Rasa es krim yang paling banyak dipilih…', [
    'Cokelat',
    'Vanila',
    'Stroberi',
    'Durian',
  ]),
  p('jajan-gorengan-beli', 'Jajanan', 'Beli gorengan, biasanya ambil berapa biji…', [
    'Dua',
    'Lima',
    'Sepuluh',
    'Sekantong besar',
  ]),
  p('jajan-camilan', 'Jajanan', 'Camilan yang paling sering dibawa ke rumah teman…', [
    'Keripik',
    'Kacang',
    'Gorengan',
    'Kue basah',
  ]),

  /* ---------------------------------------------------------------- Kebiasaan */
  p('biasa-bangun', 'Kebiasaan', 'Hal pertama yang dilakukan begitu bangun tidur…', [
    'Cek HP',
    'Minum air',
    'Ke kamar mandi',
    'Tidur lagi',
  ]),
  p('biasa-alarm', 'Kebiasaan', 'Alarm pagi biasanya dimatikan berapa kali…', [
    'Sekali bangun',
    'Dua tiga kali',
    'Lebih dari lima',
    'Tanpa alarm',
  ]),
  p('biasa-mandi', 'Kebiasaan', 'Mandi pagi paling enak pakai air…', [
    'Dingin',
    'Hangat',
    'Panas',
    'Sesuai cuaca',
  ]),
  p('biasa-baterai', 'Kebiasaan', 'Baterai HP mulai bikin panik di angka…', [
    '50 persen',
    '20 persen',
    '10 persen',
    '5 persen',
  ]),
  p('biasa-tidur-siang', 'Kebiasaan', 'Tidur siang yang paling ideal itu berapa lama…', [
    '15 menit',
    '30 menit',
    'Satu jam',
    'Sampai sore',
  ]),
  p('biasa-telat', 'Kebiasaan', 'Alasan telat yang paling klasik…', [
    'Macet',
    'Ketiduran',
    'Hujan',
    'Ban bocor',
  ]),
  p('biasa-chat', 'Kebiasaan', 'Balasan chat paling singkat yang sering dipakai…', [
    'Ok',
    'Wkwk',
    'Siap',
    'Y',
  ]),
  p('biasa-kesal', 'Kebiasaan', 'Paling kesal kalau ada orang yang…', [
    'Serobot antrean',
    'Telat janjian',
    'Bicara keras',
    'Pinjam tak balik',
  ]),
  p('biasa-nonton', 'Kebiasaan', 'Nonton film di rumah paling enak sambil…', [
    'Ngemil',
    'Rebahan',
    'Pakai selimut',
    'Ramai-ramai',
  ]),
  p('biasa-pasar', 'Kebiasaan', 'Saat belanja di pasar, kebiasaan paling umum…', [
    'Tawar harga',
    'Bawa tas sendiri',
    'Ke langganan',
    'Cari yang murah',
  ]),
  p('biasa-pinjam', 'Kebiasaan', 'Barang yang paling sering dipinjam lalu tidak kembali…', [
    'Pulpen',
    'Charger',
    'Payung',
    'Gunting',
  ]),
  p('biasa-jam-karet', 'Kebiasaan', 'Janjian jam 7, biasanya baru kumpul jam…', [
    'Jam 7 pas',
    '7 lewat 15',
    'Setengah 8',
    'Jam 8',
  ]),
  p('biasa-terserah', 'Kebiasaan', 'Ditanya mau makan apa, jawaban paling sering…', [
    'Terserah',
    'Apa saja',
    'Nasi padang',
    'Yang dekat',
  ]),
  p('biasa-minggu', 'Kebiasaan', 'Minggu pagi paling enak dipakai untuk…', [
    'Tidur lagi',
    'Olahraga',
    'Jalan ke pasar',
    'Bersih-bersih',
  ]),
  p('biasa-olahraga', 'Kebiasaan', 'Olahraga yang paling sering direncanakan tapi jarang jadi…', [
    'Lari pagi',
    'Ke tempat gym',
    'Bersepeda',
    'Renang',
  ]),
  p('biasa-tas', 'Kebiasaan', 'Barang yang selalu ada di dalam tas…', [
    'Charger',
    'Dompet',
    'Tisu',
    'Botol minum',
  ]),
  p('biasa-otw', 'Kebiasaan', 'Pesan "otw" biasanya artinya…', [
    'Sudah di jalan',
    'Baru mandi',
    'Baru bangun',
    'Mau berangkat',
  ]),
  p('biasa-menunggu', 'Kebiasaan', 'Kalau harus menunggu lama, paling sering…', [
    'Main HP',
    'Ngemil',
    'Melamun',
    'Ngobrol',
  ]),
  p('biasa-online', 'Kebiasaan', 'Barang yang paling sering dibeli online…', [
    'Baju',
    'Camilan',
    'Aksesori HP',
    'Alat dapur',
  ]),
  p('biasa-hobi', 'Kebiasaan', 'Hobi yang paling sering dijalani di waktu luang…', [
    'Main game',
    'Masak',
    'Berkebun',
    'Olahraga',
  ]),
  p('biasa-foto-makan', 'Kebiasaan', 'Sebelum makan di tempat baru, biasanya…', [
    'Foto makanannya',
    'Langsung makan',
    'Cuci tangan',
    'Cicip punya teman',
  ]),

  /* ---------------------------------------------------------------- Rumah */
  p('rumah-hilang', 'Rumah', 'Barang di rumah yang paling sering hilang…', [
    'Kunci motor',
    'Gunting',
    'Remot AC',
    'Sisir',
  ]),
  p('rumah-rebahan', 'Rumah', 'Bagian rumah paling nyaman buat rebahan…', [
    'Kamar tidur',
    'Ruang tamu',
    'Teras',
    'Depan kipas',
  ]),
  p('rumah-malas', 'Rumah', 'Pekerjaan rumah yang paling malas dikerjakan…', [
    'Cuci piring',
    'Setrika',
    'Menyapu',
    'Lipat baju',
  ]),
  p('rumah-gerah', 'Rumah', 'Saat gerah di rumah, paling enak…', [
    'Nyalakan kipas',
    'Mandi lagi',
    'Minum es',
    'Buka jendela',
  ]),
  p('rumah-tamu', 'Rumah', 'Suguhan wajib saat ada tamu datang…', [
    'Teh manis',
    'Kue kering',
    'Air mineral',
    'Kopi',
  ]),
  p('rumah-kaleng', 'Rumah', 'Kaleng kue di rumah biasanya isinya…', [
    'Rengginang',
    'Alat jahit',
    'Kue kering',
    'Kosong',
  ]),
  p('rumah-plastik', 'Rumah', 'Kantong plastik bekas di rumah biasanya disimpan di…', [
    'Plastik lagi',
    'Laci dapur',
    'Belakang pintu',
    'Kolong lemari',
  ]),
  p('rumah-mati-lampu', 'Rumah', 'Mati lampu malam hari, yang pertama dicari…', [
    'Senter HP',
    'Lilin',
    'Korek api',
    'Power bank',
  ]),
  p('rumah-hewan', 'Rumah', 'Hewan peliharaan yang paling umum di rumah…', [
    'Kucing',
    'Ayam',
    'Ikan',
    'Burung',
  ]),
  p('rumah-bersih', 'Rumah', 'Kapan paling sering bersih-bersih rumah…', [
    'Pagi hari',
    'Akhir pekan',
    'Mau ada tamu',
    'Kalau ingat',
  ]),
  p('rumah-lempar-tugas', 'Rumah', 'Tugas rumah yang paling sering dilempar ke orang lain…', [
    'Angkat galon',
    'Buang sampah',
    'Beli gas',
    'Cuci piring',
  ]),
  p('rumah-minum-pagi', 'Rumah', 'Minuman pagi yang paling umum di rumah…', [
    'Teh manis',
    'Kopi',
    'Air putih',
    'Susu',
  ]),
  p('rumah-jemuran', 'Rumah', 'Hujan turun tiba-tiba, yang pertama diselamatkan…', [
    'Jemuran',
    'Motor',
    'Sandal',
    'HP',
  ]),
  p('rumah-ruangan', 'Rumah', 'Tempat paling ramai saat semua orang di rumah…', [
    'Dapur',
    'Ruang tengah',
    'Teras',
    'Meja makan',
  ]),
  p('rumah-tanaman', 'Rumah', 'Tanaman yang paling sering ada di halaman rumah…', [
    'Cabai',
    'Lidah buaya',
    'Bunga',
    'Pohon mangga',
  ]),
  p('rumah-tidur', 'Rumah', 'Posisi tidur paling nyaman…', [
    'Miring',
    'Telentang',
    'Tengkurap',
    'Peluk guling',
  ]),

  /* ---------------------------------------------------------------- Sekolah */
  p('sekolah-pelajaran', 'Sekolah', 'Pelajaran sekolah yang paling ditunggu…', [
    'Olahraga',
    'Kesenian',
    'Matematika',
    'Jam kosong',
  ]),
  p('sekolah-kursi', 'Sekolah', 'Tempat duduk favorit di kelas…', [
    'Paling belakang',
    'Dekat jendela',
    'Paling depan',
    'Dekat pintu',
  ]),
  p('sekolah-kantin', 'Sekolah', 'Menu kantin sekolah yang paling laris…', [
    'Nasi kuning',
    'Gorengan',
    'Mi goreng',
    'Es teh',
  ]),
  p('sekolah-upacara', 'Sekolah', 'Hal yang paling diingat dari upacara hari Senin…', [
    'Panas terik',
    'Amanat panjang',
    'Lupa bawa topi',
    'Barisan miring',
  ]),
  p('sekolah-pr', 'Sekolah', 'PR paling sering dikerjakan kapan…', [
    'Malam sebelumnya',
    'Pagi di kelas',
    'Begitu pulang',
    'Bareng teman',
  ]),
  p('sekolah-kabar', 'Sekolah', 'Kabar paling bikin senang di sekolah…', [
    'Guru tidak masuk',
    'Pulang cepat',
    'Libur mendadak',
    'Ulangan batal',
  ]),
  p('sekolah-ulangan', 'Sekolah', 'Persiapan ulangan yang paling umum…', [
    'Belajar semalam',
    'Baca sekilas',
    'Pasrah',
    'Belajar bareng',
  ]),
  p('sekolah-lupa', 'Sekolah', 'Barang yang paling sering ketinggalan saat ke sekolah…', [
    'Topi',
    'Buku PR',
    'Dasi',
    'Bekal',
  ]),
  p('sekolah-seragam', 'Sekolah', 'Seragam sekolah yang paling nyaman dipakai…', [
    'Kaos olahraga',
    'Batik',
    'Pramuka',
    'Putih-putih',
  ]),
  p('sekolah-bekal', 'Sekolah', 'Bekal sekolah yang paling klasik…', [
    'Nasi goreng',
    'Nasi telur',
    'Roti selai',
    'Mi goreng',
  ]),
  p('sekolah-istirahat', 'Sekolah', 'Jam istirahat paling sering dipakai untuk…', [
    'Jajan',
    'Main bola',
    'Ngobrol',
    'Salin PR',
  ]),
  p('sekolah-pinjam', 'Sekolah', 'Alat tulis yang paling sering dipinjam teman…', [
    'Pulpen',
    'Penghapus',
    'Penggaris',
    'Rautan',
  ]),
  p('sekolah-guru', 'Sekolah', 'Kalimat guru yang paling sering terdengar…', [
    'Kumpulkan tugas',
    'Jangan ribut',
    'Buka halaman…',
    'Ada pertanyaan?',
  ]),
  p('sekolah-pulang', 'Sekolah', 'Pulang sekolah, yang pertama dilakukan…', [
    'Makan',
    'Tidur siang',
    'Main',
    'Ganti baju',
  ]),
  p('sekolah-piket', 'Sekolah', 'Tugas piket kelas yang paling dihindari…', [
    'Menyapu',
    'Hapus papan',
    'Buang sampah',
    'Rapikan meja',
  ]),

  /* ---------------------------------------------------------------- Kerja */
  p('kerja-rapat', 'Kerja', 'Rapat panjang yang sebenarnya bisa diganti dengan…', [
    'Satu pesan chat',
    'Email singkat',
    'Telepon 5 menit',
    'Tidak perlu',
  ]),
  p('kerja-sampai', 'Kerja', 'Hal pertama yang dilakukan begitu sampai di kantor…', [
    'Bikin kopi',
    'Cek pesan',
    'Sarapan',
    'Ngobrol dulu',
  ]),
  p('kerja-makan-siang', 'Kerja', 'Makan siang orang kantor paling sering…', [
    'Beli di warteg',
    'Bawa bekal',
    'Pesan antar',
    'Kantin kantor',
  ]),
  p('kerja-jam-berat', 'Kerja', 'Jam paling berat di tempat kerja…', [
    'Jam 2 siang',
    'Jam 9 pagi',
    'Jam 4 sore',
    'Senin pagi',
  ]),
  p('kerja-gajian', 'Kerja', 'Hal pertama yang dilakukan saat gajian…', [
    'Bayar tagihan',
    'Makan enak',
    'Menabung',
    'Belanja online',
  ]),
  p('kerja-tanggal-merah', 'Kerja', 'Tanggal merah paling enak jatuh di hari…', [
    'Jumat',
    'Senin',
    'Rabu',
    'Sabtu',
  ]),
  p('kerja-grup', 'Kerja', 'Grup chat yang paling ramai notifikasinya…', [
    'Grup keluarga',
    'Grup kantor',
    'Grup alumni',
    'Grup RT',
  ]),
  p('kerja-lembur', 'Kerja', 'Teman lembur yang paling setia…', ['Kopi', 'Mi instan', 'Musik', 'Camilan']),
  p('kerja-wfh', 'Kerja', 'Kerja dari rumah, pakaian yang paling umum…', [
    'Kaos oblong',
    'Celana pendek',
    'Piyama',
    'Kemeja rapi',
  ]),
  p('kerja-pulang', 'Kerja', 'Sampai rumah sepulang kerja, paling ingin langsung…', [
    'Rebahan',
    'Makan',
    'Mandi',
    'Nongkrong',
  ]),
  p('kerja-meja', 'Kerja', 'Benda yang paling sering ada di meja kerja…', [
    'Gelas kopi',
    'Tanaman kecil',
    'Camilan',
    'Kertas numpuk',
  ]),

  /* ---------------------------------------------------------------- Jalanan */
  p('jalan-ojek', 'Jalanan', 'Saat naik ojek, yang paling sering terjadi…', [
    'Ngobrol santai',
    'Diam saja',
    'Salah titik',
    'Kena hujan',
  ]),
  p('jalan-macet', 'Jalanan', 'Terjebak macet, yang paling sering dilakukan…', [
    'Dengar musik',
    'Main HP',
    'Ngomel',
    'Cari jalan tikus',
  ]),
  p('jalan-umum', 'Jalanan', 'Transportasi umum yang paling sering dinaiki…', [
    'Angkot',
    'Bus',
    'Kereta',
    'Ojek',
  ]),
  p('jalan-motor', 'Jalanan', 'Warna motor yang paling sering terlihat di jalan…', [
    'Hitam',
    'Merah',
    'Putih',
    'Biru',
  ]),
  p('jalan-klakson', 'Jalanan', 'Bunyi klakson di jalan paling sering artinya…', [
    'Awas, minggir',
    'Lampu hijau',
    'Halo teman',
    'Terima kasih',
  ]),
  p('jalan-parkir', 'Jalanan', 'Bayar parkir motor paling sering pakai uang…', [
    'Seribu',
    'Dua ribu',
    'Lima ribu',
    'Recehan',
  ]),
  p('jalan-lupa', 'Jalanan', 'Yang paling sering lupa saat naik motor…', [
    'Matikan sein',
    'Bawa jas hujan',
    'Kunci stang',
    'Isi bensin',
  ]),
  p('jalan-tersesat', 'Jalanan', 'Kalau tersesat, yang paling sering dilakukan…', [
    'Buka peta di HP',
    'Tanya warga',
    'Muter-muter',
    'Telepon teman',
  ]),
  p('jalan-keliling', 'Jalanan', 'Kendaraan paling enak buat keliling kota…', [
    'Motor',
    'Mobil',
    'Sepeda',
    'Jalan kaki',
  ]),
  p('jalan-bensin', 'Jalanan', 'Isi bensin paling sering…', [
    'Penuh sekalian',
    'Dua puluh ribu',
    'Pas mepet habis',
    'Sepuluh ribu',
  ]),
  p('jalan-lampu-merah', 'Jalanan', 'Berhenti di lampu merah, mata paling sering lihat…', [
    'Hitungan detik',
    'Layar HP',
    'Pengamen',
    'Spion',
  ]),

  /* ---------------------------------------------------------------- Liburan */
  p('libur-tempat', 'Liburan', 'Tempat liburan yang paling sering dipilih ramai-ramai…', [
    'Pantai',
    'Puncak',
    'Kebun binatang',
    'Mal',
  ]),
  p('libur-pantai', 'Liburan', 'Di pantai, kegiatan yang paling seru…', [
    'Main air',
    'Bikin istana pasir',
    'Foto-foto',
    'Makan ikan bakar',
  ]),
  p('libur-oleh', 'Liburan', 'Oleh-oleh yang paling aman dibawa pulang…', [
    'Makanan khas',
    'Kaos',
    'Gantungan kunci',
    'Kerupuk',
  ]),
  p('libur-pose', 'Liburan', 'Pose foto liburan yang paling umum…', [
    'Dua jari',
    'Lompat bareng',
    'Senyum biasa',
    'Pura-pura candid',
  ]),
  p('libur-lupa', 'Liburan', 'Barang yang paling sering ketinggalan saat liburan…', [
    'Charger',
    'Sikat gigi',
    'Handuk',
    'Sandal',
  ]),
  p('libur-puncak', 'Liburan', 'Di puncak yang dingin, paling enak menikmati…', [
    'Jagung bakar',
    'Wedang jahe',
    'Mi rebus',
    'Teh hangat',
  ]),
  p('libur-renang', 'Liburan', 'Berenang paling seru di…', ['Kolam renang', 'Pantai', 'Sungai', 'Taman air']),
  p('libur-lama', 'Liburan', 'Liburan yang paling ideal itu berapa hari…', [
    'Dua hari',
    'Tiga hari',
    'Seminggu',
    'Sebulan',
  ]),
  p('libur-bagian', 'Liburan', 'Bagian liburan yang paling seru…', [
    'Perjalanannya',
    'Kulinernya',
    'Foto-fotonya',
    'Rebahan di hotel',
  ]),
  p('libur-hotel', 'Liburan', 'Fasilitas penginapan yang paling dicari…', [
    'Kolam renang',
    'Sarapan',
    'Kasur empuk',
    'Wi-Fi kencang',
  ]),
  p('libur-bekal', 'Liburan', 'Bekal wajib saat jalan-jalan naik mobil…', [
    'Camilan',
    'Air minum',
    'Nasi bungkus',
    'Permen',
  ]),

  /* ---------------------------------------------------------------- Mudik */
  p('mudik-naik', 'Mudik', 'Mudik paling seru naik…', ['Mobil', 'Kereta', 'Bus', 'Motor']),
  p('mudik-bawaan', 'Mudik', 'Barang bawaan yang paling banyak saat mudik…', [
    'Oleh-oleh',
    'Baju',
    'Makanan',
    'Kardus',
  ]),
  p('mudik-sampai', 'Mudik', 'Hal pertama yang dicari setelah sampai di kampung…', [
    'Masakan nenek',
    'Kasur',
    'Teman lama',
    'Sinyal',
  ]),
  p('mudik-ditanya', 'Mudik', 'Pertanyaan saudara yang paling sering muncul saat kumpul keluarga…', [
    'Kapan nikah?',
    'Kerja di mana?',
    'Kok kurusan?',
    'Kapan lulus?',
  ]),
  p('mudik-capek', 'Mudik', 'Bagian mudik yang paling bikin capek…', [
    'Macetnya',
    'Antre tiket',
    'Packing',
    'Berangkat pagi',
  ]),
  p('mudik-rest-area', 'Mudik', 'Berhenti di rest area, yang paling sering dilakukan…', [
    'Ke toilet',
    'Beli kopi',
    'Tidur sebentar',
    'Jajan',
  ]),
  p('mudik-kue', 'Mudik', 'Kue kering yang paling cepat habis saat kumpul keluarga…', [
    'Nastar',
    'Kastengel',
    'Putri salju',
    'Lidah kucing',
  ]),
  p('mudik-kumpul', 'Mudik', 'Kegiatan paling seru saat kumpul keluarga besar…', [
    'Makan bareng',
    'Foto keluarga',
    'Main sama sepupu',
    'Begadang ngobrol',
  ]),
  p('mudik-pulang', 'Mudik', 'Saat balik dari kampung, bawaan yang paling berat…', [
    'Hasil kebun',
    'Makanan',
    'Kenangan',
    'Baju kotor',
  ]),

  /* ---------------------------------------------------------------- Cuaca */
  p('cuaca-hujan-sore', 'Cuaca', 'Hujan deras di sore hari, paling enak…', [
    'Tidur',
    'Makan mi kuah',
    'Ngeteh',
    'Nonton film',
  ]),
  p('cuaca-kehujanan', 'Cuaca', 'Kehujanan di jalan, yang paling sering dilakukan…', [
    'Berteduh',
    'Pakai jas hujan',
    'Terobos saja',
    'Tunggu reda',
  ]),
  p('cuaca-payung', 'Cuaca', 'Nasib payung yang paling sering terjadi…', [
    'Ketinggalan',
    'Hilang',
    'Dipinjam',
    'Rusak kena angin',
  ]),
  p('cuaca-makan-hujan', 'Cuaca', 'Makanan yang paling dicari saat hujan…', [
    'Bakso',
    'Gorengan',
    'Mi rebus',
    'Soto',
  ]),
  p('cuaca-terik', 'Cuaca', 'Siang yang terik, paling ingin…', [
    'Minum es',
    'Mandi',
    'Tidur di ubin',
    'Ngadem di mal',
  ]),
  p('cuaca-dingin', 'Cuaca', 'Pagi yang dingin, yang paling susah…', [
    'Bangun',
    'Mandi',
    'Lepas selimut',
    'Keluar rumah',
  ]),
  p('cuaca-suara', 'Cuaca', 'Suara yang paling menenangkan…', [
    'Hujan di genteng',
    'Ombak',
    'Kicau burung',
    'Kipas angin',
  ]),
  p('cuaca-musim', 'Cuaca', 'Musim yang paling disukai…', ['Kemarau', 'Hujan', 'Pancaroba', 'Musim buah']),
  p('cuaca-mendung', 'Cuaca', 'Langit mendung pagi-pagi, reaksi paling umum…', [
    'Bawa payung',
    'Tidur lagi',
    'Angkat jemuran',
    'Cuek saja',
  ]),

  /* ---------------------------------------------------------------- Hiburan */
  p('hibur-karaoke', 'Hiburan', 'Saat karaoke bareng, lagu yang paling sering dipilih…', [
    'Lagu galau',
    'Dangdut',
    'Lagu lawas',
    'Lagu anak',
  ]),
  p('hibur-film', 'Hiburan', 'Jenis film paling seru ditonton ramai-ramai…', [
    'Komedi',
    'Horor',
    'Aksi',
    'Drama',
  ]),
  p('hibur-permainan', 'Hiburan', 'Permainan masa kecil yang paling diingat…', [
    'Petak umpet',
    'Lompat tali',
    'Kelereng',
    'Gobak sodor',
  ]),
  p('hibur-alat-musik', 'Hiburan', 'Alat musik yang paling sering dimainkan di tongkrongan…', [
    'Gitar',
    'Kendang',
    'Ukulele',
    'Galon',
  ]),
  p('hibur-lomba', 'Hiburan', 'Lomba 17-an yang paling seru…', [
    'Balap karung',
    'Makan kerupuk',
    'Panjat pinang',
    'Tarik tambang',
  ]),
  p('hibur-aplikasi', 'Hiburan', 'Aplikasi di HP yang paling sering dibuka…', [
    'Aplikasi chat',
    'Media sosial',
    'Video',
    'Kamera',
  ]),
  p('hibur-bioskop', 'Hiburan', 'Nonton di bioskop, paling enak duduk di…', [
    'Tengah',
    'Paling belakang',
    'Paling depan',
    'Pinggir',
  ]),
  p('hibur-mainan', 'Hiburan', 'Mainan masa kecil yang paling dikangenin…', [
    'Layangan',
    'Gasing',
    'Mobil-mobilan',
    'Boneka',
  ]),
  p('hibur-camilan-film', 'Hiburan', 'Camilan paling cocok buat nonton film…', [
    'Popcorn',
    'Keripik',
    'Kacang',
    'Cokelat',
  ]),
  p('hibur-video', 'Hiburan', 'Video yang paling sering bikin lupa waktu…', [
    'Video masak',
    'Video kucing',
    'Video lucu',
    'Video tutorial',
  ]),

  /* ---------------------------------------------------------------- Nongkrong */
  p('nongkrong-tempat', 'Nongkrong', 'Tempat nongkrong yang paling asyik…', [
    'Angkringan',
    'Kafe',
    'Warung kopi',
    'Teras rumah',
  ]),
  p('nongkrong-pesan', 'Nongkrong', 'Pesanan pertama saat duduk di angkringan…', [
    'Teh panas',
    'Kopi',
    'Es jeruk',
    'Wedang jahe',
  ]),
  p('nongkrong-ambil', 'Nongkrong', 'Di angkringan, yang paling pertama diambil…', [
    'Nasi kucing',
    'Sate usus',
    'Gorengan',
    'Sate telur puyuh',
  ]),
  p('nongkrong-obrolan', 'Nongkrong', 'Obrolan yang paling sering muncul saat nongkrong…', [
    'Masa sekolah',
    'Rencana liburan',
    'Cerita lucu',
    'Mau makan apa',
  ]),
  p('nongkrong-pamit', 'Nongkrong', 'Saat nongkrong, "bentar lagi pulang" biasanya berarti…', [
    '10 menit lagi',
    'Satu jam lagi',
    'Tengah malam',
    'Tidak jadi pulang',
  ]),
  p('nongkrong-bayar', 'Nongkrong', 'Nongkrong ramai-ramai, bayarnya paling sering…', [
    'Bayar sendiri',
    'Patungan rata',
    'Ditraktir',
    'Ada yang kabur',
  ]),
  p('nongkrong-foto', 'Nongkrong', 'Yang paling sering jadi tukang foto di tongkrongan…', [
    'Yang HP-nya bagus',
    'Yang paling tinggi',
    'Yang paling sabar',
    'Siapa saja',
  ]),
  p('nongkrong-jam', 'Nongkrong', 'Nongkrong paling seru dimulai jam…', [
    'Sore hari',
    'Habis makan malam',
    'Jam 9 malam',
    'Tengah malam',
  ]),
  p('nongkrong-duduk', 'Nongkrong', 'Tempat duduk paling enak di warung…', [
    'Lesehan',
    'Bangku kayu',
    'Kursi plastik',
    'Berdiri saja',
  ]),
  p('nongkrong-hp', 'Nongkrong', 'Saat nongkrong, HP paling sering…', [
    'Ditaruh di meja',
    'Dipegang terus',
    'Dicas di warung',
    'Mode diam',
  ]),
];
