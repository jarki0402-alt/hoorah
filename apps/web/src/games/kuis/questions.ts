/**
 * Question bank for Kuis Nusantara. Every entry is authored with the correct option first
 * (`answer: 0`); options are shuffled per session with a seeded RNG so the answer letter varies.
 *
 * Only well-established, non-contested, non-time-sensitive facts belong here.
 * Limits (checked by tests): question <= 120 chars, option <= 22 chars, fact <= 110 chars.
 */

import { ALAM } from './bank/alam';
import { BAHASA } from './bank/bahasa';
import { BUDAYA } from './bank/budaya';
import type { Category, Question } from './bank/define';
import { mk } from './bank/define';
import { GEOGRAFI } from './bank/geografi';
import { KULINER } from './bank/kuliner';
import { SEJARAH } from './bank/sejarah';

export type { Category, Question } from './bank/define';

/** The first questions, written together with the game. */
const CORE: readonly Question[] = [
  /* ---------------------------------------------------------------- Budaya: alat musik */
  mk(
    'musik-angklung',
    'Budaya',
    'Alat musik',
    'Alat musik bambu dari Jawa Barat yang dimainkan dengan cara digoyangkan adalah…',
    ['Angklung', 'Sasando', 'Kolintang', 'Gamelan'],
    'Angklung diakui UNESCO sebagai Warisan Budaya Takbenda pada 2010.',
  ),
  mk(
    'musik-sasando',
    'Budaya',
    'Alat musik',
    'Sasando, alat musik petik dengan bingkai daun lontar, berasal dari Pulau…',
    ['Rote', 'Lombok', 'Bali', 'Bangka'],
    'Daun lontar pada sasando berfungsi sebagai ruang gema yang memperkeras suaranya.',
  ),
  mk(
    'musik-kolintang',
    'Budaya',
    'Alat musik',
    'Kolintang, alat musik pukul dari bilah-bilah kayu, berasal dari daerah…',
    ['Minahasa', 'Toraja', 'Asmat', 'Mandailing'],
    'Kolintang biasanya dimainkan berkelompok dalam satu ansambel.',
  ),
  mk(
    'musik-tifa',
    'Budaya',
    'Alat musik',
    'Tifa adalah alat musik pukul tradisional yang khas dari…',
    ['Papua dan Maluku', 'Aceh dan Riau', 'Bali dan Lombok', 'Jawa dan Madura'],
    'Tifa berbentuk tabung kayu dengan kulit hewan di salah satu ujungnya.',
  ),
  mk(
    'musik-sape',
    'Budaya',
    'Alat musik',
    'Sape adalah alat musik petik tradisional dari suku…',
    ['Dayak', 'Batak', 'Asmat', 'Sasak'],
    'Badan sape terbuat dari kayu dan sering dihias ukiran khas Dayak.',
  ),
  mk(
    'musik-gamelan',
    'Budaya',
    'Alat musik',
    'Sebagian besar instrumen gamelan Jawa dan Bali dimainkan dengan cara…',
    ['Dipukul', 'Ditiup', 'Digesek', 'Dipetik'],
    'Gamelan diakui UNESCO sebagai Warisan Budaya Takbenda pada 2021.',
  ),
  mk(
    'musik-rebab',
    'Budaya',
    'Alat musik',
    'Alat musik tradisional berikut yang dimainkan dengan cara digesek adalah…',
    ['Rebab', 'Kendang', 'Saron', 'Bonang'],
    'Rebab ikut dimainkan dalam ansambel gamelan Jawa dan Sunda.',
  ),

  /* ---------------------------------------------------------------- Budaya: tarian */
  mk(
    'tari-kecak',
    'Budaya',
    'Tarian',
    'Tari Kecak yang terkenal dengan seruan "cak-cak-cak" berasal dari…',
    ['Bali', 'Jawa Tengah', 'Sumatra Barat', 'Papua'],
    'Kecak dibawakan puluhan penari pria yang duduk melingkar, tanpa iringan gamelan.',
  ),
  mk(
    'tari-saman',
    'Budaya',
    'Tarian',
    'Tari Saman yang dibawakan sambil duduk berbaris rapat berasal dari…',
    ['Aceh', 'Riau', 'Jambi', 'Bengkulu'],
    'Tari Saman diakui UNESCO sebagai Warisan Budaya Takbenda pada 2011.',
  ),
  mk(
    'tari-piring',
    'Budaya',
    'Tarian',
    'Tari Piring, tarian dengan piring di telapak tangan, berasal dari…',
    ['Sumatra Barat', 'Sulawesi Utara', 'Kalimantan Barat', 'Jawa Timur'],
    'Penari Tari Piring bergerak lincah tanpa menjatuhkan piring di tangannya.',
  ),
  mk(
    'tari-jaipong',
    'Budaya',
    'Tarian',
    'Tari Jaipong yang enerjik berasal dari provinsi…',
    ['Jawa Barat', 'Jawa Timur', 'Banten', 'DI Yogyakarta'],
    'Jaipong diciptakan oleh seniman Sunda Gugum Gumbira pada 1970-an.',
  ),
  mk(
    'tari-tortor',
    'Budaya',
    'Tarian',
    'Tari Tor-Tor adalah tarian tradisional dari suku…',
    ['Batak', 'Minangkabau', 'Bugis', 'Sasak'],
    'Tor-tor biasanya diiringi oleh musik gondang.',
  ),
  mk(
    'tari-pakarena',
    'Budaya',
    'Tarian',
    'Tari Pakarena, tarian lembut sambil memegang kipas, berasal dari…',
    ['Sulawesi Selatan', 'Maluku', 'Nusa Tenggara Barat', 'Bali'],
    'Pakarena dibawakan penari perempuan dengan gerakan pelan dan anggun.',
  ),
  mk(
    'tari-reog',
    'Budaya',
    'Seni pertunjukan',
    'Reog, pertunjukan dengan topeng kepala harimau berhias bulu merak, berasal dari…',
    ['Ponorogo', 'Banyuwangi', 'Cirebon', 'Surakarta'],
    'Pembarong mengangkat topeng Dadak Merak yang berat dengan gigitannya.',
  ),

  /* ---------------------------------------------------------------- Budaya: rumah adat */
  mk(
    'rumah-gadang',
    'Budaya',
    'Rumah adat',
    'Rumah Gadang dengan atap runcing melengkung adalah rumah adat dari…',
    ['Sumatra Barat', 'Sumatra Utara', 'Sulawesi Selatan', 'Kalimantan Timur'],
    'Ujung atap Rumah Gadang yang runcing disebut gonjong.',
  ),
  mk(
    'rumah-tongkonan',
    'Budaya',
    'Rumah adat',
    'Tongkonan adalah rumah adat dari suku…',
    ['Toraja', 'Dayak', 'Asmat', 'Mentawai'],
    'Atap Tongkonan melengkung tinggi menyerupai perahu.',
  ),
  mk(
    'rumah-honai',
    'Budaya',
    'Rumah adat',
    'Honai, rumah beratap jerami berbentuk kubah, adalah rumah adat dari…',
    ['Papua', 'Maluku', 'Nusa Tenggara Timur', 'Sulawesi Tengah'],
    'Honai dibuat rendah dan rapat agar tetap hangat di udara pegunungan.',
  ),
  mk(
    'rumah-joglo',
    'Budaya',
    'Rumah adat',
    'Joglo adalah rumah adat khas suku…',
    ['Jawa', 'Sunda', 'Bugis', 'Melayu'],
    'Tiang-tiang utama penyangga atap joglo disebut saka guru.',
  ),
  mk(
    'rumah-betang',
    'Budaya',
    'Rumah adat',
    'Rumah Betang, rumah panjang yang dihuni banyak keluarga, adalah rumah adat suku…',
    ['Dayak', 'Batak', 'Toraja', 'Nias'],
    'Satu Rumah Betang bisa dihuni beberapa keluarga sekaligus.',
  ),
  mk(
    'rumah-bolon',
    'Budaya',
    'Rumah adat',
    'Rumah Bolon adalah rumah adat dari provinsi…',
    ['Sumatra Utara', 'Sumatra Barat', 'Riau', 'Lampung'],
    'Rumah Bolon adalah rumah panggung tradisional milik masyarakat Batak.',
  ),
  mk(
    'rumah-kebaya',
    'Budaya',
    'Rumah adat',
    'Rumah Kebaya adalah rumah adat masyarakat…',
    ['Betawi', 'Sunda', 'Madura', 'Banjar'],
    'Namanya berasal dari atap yang tampak seperti lipatan kebaya bila dilihat dari samping.',
  ),

  /* ---------------------------------------------------------------- Budaya: pakaian, kain, senjata */
  mk(
    'kain-ulos',
    'Budaya',
    'Kain adat',
    'Ulos adalah kain tenun tradisional khas suku…',
    ['Batak', 'Minangkabau', 'Dayak', 'Bugis'],
    'Ulos sering diberikan sebagai tanda kasih dalam upacara adat.',
  ),
  mk(
    'baju-bodo',
    'Budaya',
    'Pakaian adat',
    'Baju Bodo adalah pakaian adat perempuan dari suku…',
    ['Bugis', 'Minangkabau', 'Sasak', 'Banjar'],
    'Baju Bodo berbentuk segi empat dengan lengan pendek.',
  ),
  mk(
    'batik-hari',
    'Budaya',
    'Batik',
    'Hari Batik Nasional diperingati setiap tanggal…',
    ['2 Oktober', '21 April', '28 Oktober', '10 November'],
    'Tanggal itu menandai pengakuan batik oleh UNESCO pada 2009.',
  ),
  mk(
    'batik-canting',
    'Budaya',
    'Batik',
    'Alat kecil untuk menorehkan malam (lilin panas) saat membuat batik tulis disebut…',
    ['Canting', 'Kujang', 'Cangkul', 'Centong'],
    'Batik cap memakai stempel tembaga, sedangkan batik tulis memakai canting.',
  ),
  mk(
    'kain-songket',
    'Budaya',
    'Kain adat',
    'Kota yang terkenal dengan kain songket bertabur benang emas adalah…',
    ['Palembang', 'Ambon', 'Jayapura', 'Manado'],
    'Songket ditenun dengan menyisipkan benang emas atau perak.',
  ),
  mk(
    'senjata-rencong',
    'Budaya',
    'Senjata',
    'Rencong adalah senjata tradisional dari…',
    ['Aceh', 'Bali', 'Maluku', 'Jawa Barat'],
    'Karena senjata ini, Aceh juga dijuluki Tanah Rencong.',
  ),
  mk(
    'senjata-kujang',
    'Budaya',
    'Senjata',
    'Kujang adalah senjata tradisional khas suku…',
    ['Sunda', 'Bugis', 'Dayak', 'Batak'],
    'Bilah kujang berbentuk melengkung dengan lekukan yang khas.',
  ),

  /* ---------------------------------------------------------------- Budaya: wayang dan tradisi */
  mk(
    'wayang-dalang',
    'Budaya',
    'Wayang',
    'Orang yang memainkan dan menyuarakan tokoh-tokoh wayang disebut…',
    ['Dalang', 'Sinden', 'Penghulu', 'Pawang'],
    'Pertunjukan wayang kulit semalam suntuk bisa berlangsung hingga dini hari.',
  ),
  mk(
    'wayang-semar',
    'Budaya',
    'Wayang',
    'Tokoh punakawan bertubuh gemuk yang dianggap paling bijak dalam wayang Jawa adalah…',
    ['Semar', 'Arjuna', 'Rahwana', 'Gatotkaca'],
    'Punakawan terdiri dari Semar, Gareng, Petruk, dan Bagong.',
  ),
  mk(
    'wayang-gatotkaca',
    'Budaya',
    'Wayang',
    'Tokoh wayang yang dijuluki "otot kawat tulang besi" adalah…',
    ['Gatotkaca', 'Semar', 'Petruk', 'Hanoman'],
    'Dalam pewayangan Jawa, Gatotkaca adalah putra Bima.',
  ),
  mk(
    'tradisi-karapan',
    'Budaya',
    'Tradisi',
    'Karapan Sapi, lomba pacu sapi yang meriah, adalah tradisi dari Pulau…',
    ['Madura', 'Bali', 'Lombok', 'Sumbawa'],
    'Sepasang sapi menarik kereta kayu yang dikendalikan seorang joki.',
  ),
  mk(
    'tradisi-fahombo',
    'Budaya',
    'Tradisi',
    'Tradisi lompat batu (fahombo) yang terkenal berasal dari Pulau…',
    ['Nias', 'Mentawai', 'Bangka', 'Belitung'],
    'Dahulu, lompat batu menjadi tanda kedewasaan pemuda Nias.',
  ),
  mk(
    'tradisi-ngaben',
    'Budaya',
    'Tradisi',
    'Ngaben adalah upacara adat di Bali yang berkaitan dengan…',
    ['Pembakaran jenazah', 'Panen padi', 'Pernikahan', 'Kelahiran bayi'],
    'Ngaben dipercaya membantu mengantar roh menuju alam berikutnya.',
  ),
  mk(
    'tradisi-pacujalur',
    'Budaya',
    'Tradisi',
    'Pacu Jalur, lomba perahu panjang tradisional, berasal dari provinsi…',
    ['Riau', 'Bali', 'Maluku', 'Gorontalo'],
    'Satu perahu jalur bisa didayung puluhan orang sekaligus.',
  ),
  mk(
    'tradisi-debus',
    'Budaya',
    'Tradisi',
    'Debus, seni bela diri yang mempertontonkan kekebalan tubuh, berasal dari…',
    ['Banten', 'Bali', 'Papua', 'Bengkulu'],
    'Debus berkembang di Banten sejak masa kesultanan.',
  ),
  mk(
    'tradisi-rambusolo',
    'Budaya',
    'Tradisi',
    'Rambu Solo adalah upacara pemakaman adat dari suku…',
    ['Toraja', 'Dayak', 'Sasak', 'Betawi'],
    'Rambu Solo bisa berlangsung beberapa hari dan dihadiri banyak kerabat.',
  ),

  /* ---------------------------------------------------------------- Kuliner */
  mk(
    'kuliner-rendang',
    'Kuliner',
    undefined,
    'Rendang adalah masakan khas dari suku…',
    ['Minangkabau', 'Betawi', 'Bugis', 'Sunda'],
    'Rendang dimasak berjam-jam dengan santan dan rempah hingga mengering.',
  ),
  mk(
    'kuliner-gudeg',
    'Kuliner',
    undefined,
    'Gudeg, olahan nangka muda yang manis, adalah makanan khas kota…',
    ['Yogyakarta', 'Bandung', 'Medan', 'Pontianak'],
    'Karena hidangan ini, Yogyakarta sering dijuluki Kota Gudeg.',
  ),
  mk(
    'kuliner-pempek',
    'Kuliner',
    undefined,
    'Pempek, olahan ikan dan sagu, adalah makanan khas kota…',
    ['Palembang', 'Padang', 'Makassar', 'Manado'],
    'Pempek disantap bersama kuah asam pedas yang disebut cuko.',
  ),
  mk(
    'kuliner-papeda',
    'Kuliner',
    undefined,
    'Papeda, makanan khas Papua dan Maluku, terbuat dari…',
    ['Sagu', 'Beras', 'Jagung', 'Singkong'],
    'Papeda biasanya disantap bersama ikan kuah kuning.',
  ),
  mk(
    'kuliner-rawon',
    'Kuliner',
    undefined,
    'Kuah rawon yang berwarna hitam pekat berasal dari bumbu…',
    ['Kluwek', 'Kecap manis', 'Kopi', 'Tinta cumi'],
    'Kluwek adalah biji buah pohon kepayang yang diolah agar aman dimakan.',
  ),
  mk(
    'kuliner-coto',
    'Kuliner',
    undefined,
    'Coto, sup daging dan jeroan sapi berbumbu kacang, adalah makanan khas kota…',
    ['Makassar', 'Medan', 'Surabaya', 'Padang'],
    'Coto Makassar biasanya disantap bersama ketupat.',
  ),
  mk(
    'kuliner-betutu',
    'Kuliner',
    undefined,
    'Ayam betutu, ayam berbumbu yang dimasak lama, adalah hidangan khas…',
    ['Bali', 'Aceh', 'Lampung', 'Gorontalo'],
    'Ayam betutu biasanya dimasak utuh dengan bumbu yang diisikan ke dalam perutnya.',
  ),
  mk(
    'kuliner-keraktelor',
    'Kuliner',
    undefined,
    'Kerak telor adalah jajanan khas masyarakat…',
    ['Betawi', 'Sunda', 'Jawa', 'Madura'],
    'Kerak telor dibuat dari beras ketan, telur, dan serundeng kelapa.',
  ),
  mk(
    'kuliner-tempe',
    'Kuliner',
    undefined,
    'Tempe dibuat dengan memfermentasi kedelai menggunakan…',
    ['Kapang Rhizopus', 'Bakteri yoghurt', 'Air garam', 'Cuka apel'],
    'Tempe adalah makanan fermentasi asli Indonesia dari Pulau Jawa.',
  ),
  mk(
    'kuliner-bikaambon',
    'Kuliner',
    undefined,
    'Meski bernama Ambon, bika ambon justru terkenal sebagai oleh-oleh khas kota…',
    ['Medan', 'Ambon', 'Makassar', 'Kupang'],
    'Bika ambon dikenal dengan tekstur berongga seperti sarang lebah.',
  ),
  mk(
    'kuliner-satelilit',
    'Kuliner',
    undefined,
    'Sate lilit, daging cincang yang dililitkan pada batang serai, berasal dari…',
    ['Bali', 'Madura', 'Padang', 'Ponorogo'],
    'Kata lilit berarti melilit, sesuai cara membuat sate ini.',
  ),
  mk(
    'kuliner-dodol',
    'Kuliner',
    undefined,
    'Dodol yang terkenal sebagai oleh-oleh khas Jawa Barat berasal dari kota…',
    ['Garut', 'Bogor', 'Cirebon', 'Sukabumi'],
    'Dodol dibuat dari tepung ketan, gula, dan santan yang diaduk lama.',
  ),
  mk(
    'kuliner-lumpia',
    'Kuliner',
    undefined,
    'Kota yang terkenal dengan lumpia berisi rebung adalah…',
    ['Semarang', 'Bandung', 'Malang', 'Bogor'],
    'Lumpia Semarang lahir dari perpaduan kuliner Tionghoa dan Jawa.',
  ),
  mk(
    'kuliner-tinutuan',
    'Kuliner',
    undefined,
    'Tinutuan, bubur sayur dengan labu kuning, adalah makanan khas kota…',
    ['Manado', 'Padang', 'Ambon', 'Kupang'],
    'Tinutuan juga dikenal dengan sebutan bubur Manado.',
  ),
  mk(
    'kuliner-pisangijo',
    'Kuliner',
    undefined,
    'Es pisang ijo, pisang berbalut adonan hijau, adalah hidangan khas kota…',
    ['Makassar', 'Medan', 'Malang', 'Bandung'],
    'Warna hijaunya biasanya berasal dari daun pandan atau daun suji.',
  ),
  mk(
    'kuliner-matah',
    'Kuliner',
    undefined,
    'Sambal khas Bali dari irisan bawang merah, cabai, dan serai mentah disebut…',
    ['Sambal matah', 'Sambal terasi', 'Sambal ijo', 'Sambal dabu-dabu'],
    'Matah dalam bahasa Bali berarti mentah.',
  ),
  mk(
    'kuliner-gadogado',
    'Kuliner',
    undefined,
    'Saus utama gado-gado terbuat dari…',
    ['Kacang tanah', 'Kelapa parut', 'Kedelai hitam', 'Wijen'],
    'Gado-gado berisi sayuran rebus, tahu, tempe, dan telur.',
  ),
  mk(
    'kuliner-sotobanjar',
    'Kuliner',
    undefined,
    'Soto Banjar adalah soto khas dari provinsi…',
    ['Kalimantan Selatan', 'Jawa Tengah', 'Sumatra Selatan', 'Bali'],
    'Kuah Soto Banjar beraroma rempah seperti kayu manis dan cengkih.',
  ),

  /* ---------------------------------------------------------------- Geografi */
  mk(
    'geo-bandung',
    'Geografi',
    undefined,
    'Ibu kota Provinsi Jawa Barat adalah…',
    ['Bandung', 'Bogor', 'Serang', 'Cirebon'],
    'Bandung dijuluki Kota Kembang.',
  ),
  mk(
    'geo-toba',
    'Geografi',
    undefined,
    'Danau Toba terletak di provinsi…',
    ['Sumatra Utara', 'Sumatra Barat', 'Aceh', 'Jambi'],
    'Di tengah Danau Toba terdapat Pulau Samosir.',
  ),
  mk(
    'geo-bromo',
    'Geografi',
    undefined,
    'Gunung Bromo yang terkenal dengan lautan pasirnya terletak di provinsi…',
    ['Jawa Timur', 'Jawa Tengah', 'Bali', 'Jawa Barat'],
    'Masyarakat Tengger menggelar upacara Yadnya Kasada di Gunung Bromo.',
  ),
  mk(
    'geo-selatsunda',
    'Geografi',
    undefined,
    'Selat yang memisahkan Pulau Jawa dan Pulau Sumatra adalah Selat…',
    ['Sunda', 'Malaka', 'Bali', 'Makassar'],
    'Gunung Anak Krakatau muncul di tengah Selat Sunda.',
  ),
  mk(
    'geo-selatlombok',
    'Geografi',
    undefined,
    'Selat yang memisahkan Pulau Bali dan Pulau Lombok adalah Selat…',
    ['Lombok', 'Bali', 'Sunda', 'Alas'],
    'Garis Wallace yang memisahkan fauna Asia dan Australia melintasi selat ini.',
  ),
  mk(
    'geo-komodo',
    'Geografi',
    undefined,
    'Taman Nasional Komodo terletak di provinsi…',
    ['Nusa Tenggara Timur', 'Nusa Tenggara Barat', 'Bali', 'Maluku'],
    'Taman Nasional Komodo menjadi Situs Warisan Dunia UNESCO sejak 1991.',
  ),
  mk(
    'geo-borobudur',
    'Geografi',
    undefined,
    'Candi Borobudur terletak di provinsi…',
    ['Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Jawa Barat'],
    'Borobudur adalah candi Buddha yang dibangun pada masa Wangsa Syailendra.',
  ),
  mk(
    'geo-rajaampat',
    'Geografi',
    undefined,
    'Kepulauan Raja Ampat berada di dekat ujung barat Pulau…',
    ['Papua', 'Sulawesi', 'Halmahera', 'Seram'],
    'Raja Ampat merujuk pada empat pulau besarnya: Waigeo, Batanta, Salawati, dan Misool.',
  ),
  mk(
    'geo-pontianak',
    'Geografi',
    undefined,
    'Kota yang dilintasi garis khatulistiwa dan memiliki Tugu Khatulistiwa adalah…',
    ['Pontianak', 'Balikpapan', 'Banjarmasin', 'Samarinda'],
    'Saat ekuinoks di bulan Maret dan September, bayangan tugu bisa lenyap sesaat.',
  ),
  mk(
    'geo-kapuas',
    'Geografi',
    undefined,
    'Sungai Kapuas mengalir di Pulau…',
    ['Kalimantan', 'Sumatra', 'Sulawesi', 'Papua'],
    'Sungai Kapuas mengalir melintasi Kota Pontianak sebelum bermuara ke laut.',
  ),
  mk(
    'geo-makassar',
    'Geografi',
    undefined,
    'Ibu kota Provinsi Sulawesi Selatan adalah…',
    ['Makassar', 'Manado', 'Palu', 'Kendari'],
    'Makassar terkenal dengan Pantai Losari dan Benteng Rotterdam.',
  ),
  mk(
    'geo-lombok',
    'Geografi',
    undefined,
    'Pulau Lombok termasuk wilayah provinsi…',
    ['Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Bali', 'Sulawesi Selatan'],
    'Suku asli Pulau Lombok adalah suku Sasak.',
  ),
  mk(
    'geo-kelimutu',
    'Geografi',
    undefined,
    'Danau Kelimutu yang airnya berwarna-warni terletak di Pulau…',
    ['Flores', 'Sumba', 'Timor', 'Alor'],
    'Warna air ketiga danau Kelimutu dapat berubah dari waktu ke waktu.',
  ),
  mk(
    'geo-seribu',
    'Geografi',
    undefined,
    'Kepulauan Seribu termasuk wilayah provinsi…',
    ['DKI Jakarta', 'Banten', 'Jawa Barat', 'Lampung'],
    'Meski bernama Seribu, jumlah pulaunya jauh lebih sedikit dari seribu.',
  ),

  /* ---------------------------------------------------------------- Alam dan fauna */
  mk(
    'alam-komodo',
    'Alam',
    'Fauna',
    'Komodo sebenarnya termasuk jenis hewan…',
    ['Biawak', 'Buaya', 'Iguana', 'Bunglon'],
    'Komodo hanya hidup liar di beberapa pulau di Nusa Tenggara Timur.',
  ),
  mk(
    'alam-cendrawasih',
    'Alam',
    'Fauna',
    'Burung cendrawasih yang berbulu indah banyak ditemukan di…',
    ['Papua', 'Bali', 'Jawa', 'Sumatra'],
    'Cendrawasih dijuluki burung surga karena keindahan bulunya.',
  ),
  mk(
    'alam-orangutan',
    'Alam',
    'Fauna',
    'Orangutan liar di Indonesia hidup di Pulau Kalimantan dan Pulau…',
    ['Sumatra', 'Jawa', 'Sulawesi', 'Papua'],
    'Orangutan Tapanuli dari Sumatra Utara diumumkan sebagai spesies baru pada 2017.',
  ),
  mk(
    'alam-rafflesia',
    'Alam',
    'Flora',
    'Provinsi yang dijuluki Bumi Rafflesia adalah…',
    ['Bengkulu', 'Jambi', 'Lampung', 'Riau'],
    'Rafflesia tidak punya daun dan hidup menumpang pada tumbuhan inangnya.',
  ),
  mk(
    'alam-badak',
    'Alam',
    'Fauna',
    'Badak jawa bercula satu dilindungi di Taman Nasional…',
    ['Ujung Kulon', 'Baluran', 'Bromo Tengger', 'Way Kambas'],
    'Ujung Kulon terletak di ujung barat Pulau Jawa, Provinsi Banten.',
  ),
  mk(
    'alam-anoa',
    'Alam',
    'Fauna',
    'Anoa, hewan yang mirip kerbau kerdil, adalah satwa endemik Pulau…',
    ['Sulawesi', 'Sumatra', 'Kalimantan', 'Jawa'],
    'Anoa hidup di hutan dan biasanya menghindari manusia.',
  ),
  mk(
    'alam-jalak',
    'Alam',
    'Fauna',
    'Burung putih dengan kulit biru di sekitar mata yang menjadi satwa endemik Bali adalah…',
    ['Jalak Bali', 'Murai Batu', 'Kakatua', 'Kenari'],
    'Jalak Bali adalah fauna identitas Provinsi Bali.',
  ),
  mk(
    'alam-melati',
    'Alam',
    'Flora',
    'Bunga yang ditetapkan sebagai puspa bangsa Indonesia adalah…',
    ['Melati putih', 'Anggrek bulan', 'Mawar merah', 'Kenanga'],
    'Anggrek bulan dijuluki puspa pesona, sedangkan rafflesia disebut puspa langka.',
  ),
  mk(
    'alam-kelapa',
    'Alam',
    'Flora',
    'Tanaman yang dijuluki pohon kehidupan karena hampir semua bagiannya bermanfaat adalah…',
    ['Kelapa', 'Pisang', 'Bambu', 'Jati'],
    'Sabut kelapa bisa diolah menjadi tali, keset, hingga media tanam.',
  ),
  mk(
    'alam-pesut',
    'Alam',
    'Fauna',
    'Pesut, lumba-lumba air tawar yang langka, hidup di Sungai…',
    ['Mahakam', 'Musi', 'Bengawan Solo', 'Citarum'],
    'Pesut Mahakam termasuk satwa yang terancam punah.',
  ),

  /* ---------------------------------------------------------------- Sejarah */
  mk(
    'sejarah-proklamasi',
    'Sejarah',
    undefined,
    'Naskah Proklamasi Kemerdekaan Indonesia diketik oleh…',
    ['Sayuti Melik', 'Soekarno', 'Mohammad Hatta', 'Ahmad Soebardjo'],
    'Proklamasi dibacakan di Jalan Pegangsaan Timur 56, Jakarta.',
  ),
  mk(
    'sejarah-sumpahpemuda',
    'Sejarah',
    undefined,
    'Sumpah Pemuda diikrarkan pada tanggal…',
    ['28 Oktober 1928', '20 Mei 1908', '17 Agustus 1945', '10 November 1945'],
    'Kongres Pemuda II yang melahirkan Sumpah Pemuda digelar di Batavia.',
  ),
  mk(
    'sejarah-supratman',
    'Sejarah',
    undefined,
    'Lagu kebangsaan Indonesia Raya diciptakan oleh…',
    ['W.R. Supratman', 'Ismail Marzuki', 'C. Simanjuntak', 'Kusbini'],
    'Supratman memperdengarkan lagu ini dengan biola pada Kongres Pemuda II.',
  ),
  mk(
    'sejarah-kutai',
    'Sejarah',
    undefined,
    'Prasasti batu peninggalan Kerajaan Kutai disebut…',
    ['Yupa', 'Lingga', 'Arca', 'Stupa'],
    'Kerajaan Kutai berada di wilayah Kalimantan Timur.',
  ),
  mk(
    'sejarah-sriwijaya',
    'Sejarah',
    undefined,
    'Kerajaan maritim besar yang berpusat di sekitar Palembang adalah…',
    ['Sriwijaya', 'Majapahit', 'Mataram', 'Singasari'],
    'Sriwijaya dikenal sebagai pusat pembelajaran agama Buddha.',
  ),
  mk(
    'sejarah-gajahmada',
    'Sejarah',
    undefined,
    'Mahapatih Majapahit yang mengucapkan Sumpah Palapa adalah…',
    ['Gajah Mada', 'Hayam Wuruk', 'Ken Arok', 'Raden Wijaya'],
    'Lewat Sumpah Palapa, ia bertekad menyatukan Nusantara.',
  ),
  mk(
    'sejarah-surabaya',
    'Sejarah',
    undefined,
    'Hari Pahlawan 10 November memperingati pertempuran besar di kota…',
    ['Surabaya', 'Bandung', 'Semarang', 'Medan'],
    'Pertempuran itu terjadi pada 1945, tak lama setelah proklamasi.',
  ),
  mk(
    'sejarah-kartini',
    'Sejarah',
    undefined,
    'Hari Kartini diperingati setiap tanggal…',
    ['21 April', '2 Mei', '20 Mei', '22 Desember'],
    'Surat-surat Kartini dibukukan dengan judul Habis Gelap Terbitlah Terang.',
  ),
  mk(
    'sejarah-hatta',
    'Sejarah',
    undefined,
    'Tokoh yang dijuluki Bapak Koperasi Indonesia adalah…',
    ['Mohammad Hatta', 'Soekarno', 'Sutan Sjahrir', 'Tan Malaka'],
    'Mohammad Hatta adalah wakil presiden pertama Indonesia.',
  ),
  mk(
    'sejarah-dewantara',
    'Sejarah',
    undefined,
    'Hari Pendidikan Nasional pada 2 Mei memperingati hari lahir…',
    ['Ki Hajar Dewantara', 'R.A. Kartini', 'Dewi Sartika', 'Mohammad Yamin'],
    'Ki Hajar Dewantara mendirikan perguruan Taman Siswa pada 1922.',
  ),
  mk(
    'sejarah-budiutomo',
    'Sejarah',
    undefined,
    'Hari Kebangkitan Nasional 20 Mei merujuk pada berdirinya organisasi…',
    ['Budi Utomo', 'Sarekat Islam', 'Indische Partij', 'Jong Java'],
    'Budi Utomo didirikan oleh para pelajar STOVIA di Batavia.',
  ),
  mk(
    'sejarah-diponegoro',
    'Sejarah',
    undefined,
    'Perang Jawa pada 1825–1830 dipimpin oleh…',
    ['Pangeran Diponegoro', 'Sultan Hasanuddin', 'Pattimura', 'Imam Bonjol'],
    'Diponegoro kemudian diasingkan hingga wafat di Makassar.',
  ),
  mk(
    'sejarah-bhinneka',
    'Sejarah',
    undefined,
    'Semboyan pada pita lambang Garuda Pancasila adalah…',
    ['Bhinneka Tunggal Ika', 'Tut Wuri Handayani', 'Gotong Royong', 'Merdeka atau Mati'],
    'Semboyan itu diambil dari Kakawin Sutasoma karya Mpu Tantular.',
  ),
  mk(
    'sejarah-prambanan',
    'Sejarah',
    undefined,
    'Candi Prambanan adalah candi bercorak agama…',
    ['Hindu', 'Buddha', 'Konghucu', 'Animisme'],
    'Prambanan dipersembahkan untuk Trimurti: Brahma, Wisnu, dan Siwa.',
  ),

  /* ---------------------------------------------------------------- Bahasa daerah */
  mk(
    'bahasa-maturnuwun',
    'Bahasa',
    'Bahasa daerah',
    '"Matur nuwun" berarti terima kasih dalam bahasa…',
    ['Jawa', 'Sunda', 'Bali', 'Madura'],
    'Bahasa Jawa memiliki tingkatan tutur, misalnya ngoko dan krama.',
  ),
  mk(
    'bahasa-haturnuhun',
    'Bahasa',
    'Bahasa daerah',
    '"Hatur nuhun" berarti terima kasih dalam bahasa…',
    ['Sunda', 'Jawa', 'Betawi', 'Bali'],
    'Bahasa Sunda dituturkan terutama di Jawa Barat dan Banten.',
  ),
  mk(
    'bahasa-horas',
    'Bahasa',
    'Bahasa daerah',
    '"Horas!" adalah salam khas dari suku…',
    ['Batak', 'Minangkabau', 'Dayak', 'Toraja'],
    'Horas biasa diucapkan sebagai salam sekaligus ungkapan selamat.',
  ),
  mk(
    'bahasa-sugeng',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Jawa, "sugeng enjing" berarti…',
    ['Selamat pagi', 'Selamat malam', 'Terima kasih', 'Sampai jumpa'],
    'Sugeng berarti selamat, sedangkan enjing berarti pagi.',
  ),
  mk(
    'bahasa-wilujeng',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Sunda, "wilujeng sumping" berarti…',
    ['Selamat datang', 'Selamat tidur', 'Selamat jalan', 'Apa kabar'],
    'Ucapan ini lazim dipakai untuk menyambut tamu.',
  ),
  mk(
    'bahasa-uda',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Minang, panggilan "uda" ditujukan untuk…',
    ['Kakak laki-laki', 'Kakak perempuan', 'Adik', 'Kakek'],
    'Untuk kakak perempuan, orang Minang memanggil "uni".',
  ),
  mk(
    'bahasa-beta',
    'Bahasa',
    'Bahasa daerah',
    'Dalam dialek Melayu Ambon, kata "beta" berarti…',
    ['Saya', 'Kamu', 'Mereka', 'Teman'],
    'Dalam dialek yang sama, kata "ale" berarti kamu.',
  ),
  mk(
    'bahasa-suksma',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Bali, "suksma" berarti…',
    ['Terima kasih', 'Selamat pagi', 'Permisi', 'Sampai jumpa'],
    'Ungkapan yang lebih lengkap adalah "matur suksma".',
  ),
  mk(
    'bahasa-gadang',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Minang, kata "gadang" pada Rumah Gadang berarti…',
    ['Besar', 'Tinggi', 'Indah', 'Lama'],
    'Rumah Gadang menjadi tempat tinggal keluarga besar Minangkabau.',
  ),
  mk(
    'bahasa-aye',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Betawi, kata "aye" berarti…',
    ['Saya', 'Ayah', 'Kamu', 'Ayo'],
    'Bahasa Betawi menyerap banyak kata dari Melayu, Tionghoa, Arab, dan Belanda.',
  ),
  mk(
    'bahasa-cai',
    'Bahasa',
    'Bahasa daerah',
    'Dalam bahasa Sunda, kata "cai" berarti…',
    ['Air', 'Api', 'Angin', 'Tanah'],
    'Karena itu banyak nama tempat di Jawa Barat diawali "Ci", seperti Cianjur.',
  ),
];

export const QUESTIONS: readonly Question[] = [
  ...CORE,
  ...BUDAYA,
  ...KULINER,
  ...GEOGRAFI,
  ...ALAM,
  ...SEJARAH,
  ...BAHASA,
];

/* ------------------------------------------------------------------ Session preparation */

/** A question as played in one session: options already shuffled, `answer` re-pointed. */
export interface PreparedQuestion {
  id: string;
  category: Category;
  topic?: string;
  q: string;
  options: string[];
  answer: number;
  fact: string;
}

/** mulberry32: tiny, fast, good enough for shuffling. Same seed, same sequence. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(list: T[], rnd: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list;
}

/** Shuffle one question's options; the correct answer's new index is tracked. */
export function shuffleQuestion(question: Question, rnd: () => number): PreparedQuestion {
  const order = shuffleInPlace([0, 1, 2, 3], rnd);
  return {
    id: question.id,
    category: question.category,
    ...(question.topic ? { topic: question.topic } : {}),
    q: question.q,
    options: order.map((i) => question.options[i]!),
    answer: order.indexOf(question.answer),
    fact: question.fact,
  };
}

/**
 * Pick `count` distinct questions and shuffle their options, deterministically from `seed`.
 * Questions listed in `recent` (asked in earlier sessions on this screen) are only used once the
 * fresh ones run out. Light polish on top of pure randomness: avoids the same category twice in a
 * row and the same answer letter three times in a row whenever the pool allows it.
 */
export function prepareQuestions(
  seed: number,
  count: number,
  bank: readonly Question[] = QUESTIONS,
  recent: ReadonlySet<string> = new Set(),
): PreparedQuestion[] {
  const rnd = seededRng(seed);
  const n = Math.max(0, Math.min(Math.floor(count), bank.length));
  const fresh = bank.filter((q) => !recent.has(q.id));
  const stale = bank.filter((q) => recent.has(q.id));
  const picked: Question[] = [];
  while (picked.length < n) {
    const pool = fresh.length ? fresh : stale;
    // Uniform over the remaining questions, minus the previous category when possible, so big
    // categories still show up more often but never twice in a row.
    const prev = picked[picked.length - 1]?.category;
    const eligible = pool.filter((q) => q.category !== prev);
    const from = eligible.length ? eligible : pool;
    const choice = from[Math.floor(rnd() * from.length)]!;
    pool.splice(pool.indexOf(choice), 1);
    picked.push(choice);
  }

  const out: PreparedQuestion[] = [];
  for (const question of picked) {
    let prepared = shuffleQuestion(question, rnd);
    const a = out[out.length - 1]?.answer;
    const b = out[out.length - 2]?.answer;
    if (a !== undefined && a === b && prepared.answer === a) {
      // Rotate by one so the letter changes but the shuffle stays deterministic.
      const options = [...prepared.options.slice(1), prepared.options[0]!];
      prepared = { ...prepared, options, answer: (prepared.answer + 3) % 4 };
    }
    out.push(prepared);
  }
  return out;
}
