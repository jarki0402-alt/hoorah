/**
 * Sambung Kata word list, compiled for this game: everyday Indonesian vocabulary (base words plus
 * the most common derived forms people actually say, like "makanan" or "berlari"), lowercase
 * a-z only, 3-12 letters, no proper nouns and no rude words. Grouped by first letter to keep it
 * compact; `wordList()` parses, validates and de-duplicates it.
 */

const BY_LETTER: Readonly<Record<string, string>> = {
  a: `abad abadi abai abang abdi abjad abon abu acak acar acara acuan acuh acung adab adaptasi adat
    adegan adik adil adonan adopsi adu aduk agak agama agar agen agenda agung agresif ahli air ajaib
    ajak ajar ajaran akademi akal akan akar akhir akhlak akibat akrab akrobat aksara aksen aksesori
    aksi akta aktif aktivitas aktor aktris aktual akuarium akun akuntan akur akurat alam alamat
    alami alang alarm alas alasan alat album alergi alfabet alih alim alir aliran alis alokasi alot
    alpa alpukat alternatif alu alun amal amalan aman amanah amanat amandel amarah amat amatir
    ambang ambil ambisi ambruk ambulans amfibi amis ampas amplas amplop ampuh ampun amuk anak
    analisis ancam ancang andal andalan andil andong aneh aneka angan angin angka angkasa angkat
    angklung angkot angkringan angkuh angkutan angguk anggap anggaran anggota anggrek anggun anggur
    angsa animasi anjing anjlok anjungan antar antara antariksa antena antibiotik antik anting
    antre antrean antusias anugerah anyam anyaman anyelir anyir apa apartemen apel apem api apik
    apotek apresiasi apung arah arang arca arena aren argumen arif arisan arit aritmetika arloji
    aroma arsip arsitek arsitektur arti artikel artis arus asah asal asam asap asbak asin asinan
    asing asisten asli asma aspal aspirasi asrama asuh asuhan asumsi asuransi asyik atap atas atlas
    atlet atmosfer atom atraksi atur aturan audio audisi aula awak awal awam awan awas awet ayah
    ayakan ayam ayat ayo ayun ayunan azan
    abrasi ajudan akhiran akuntansi alunan ambisius andai anggapan angkatan angker anoa apalagi
    arung astronomi astronot atasan atletik autentik awalan ayak`,

  b: `bab babak babat babi baca bacaan badai badak badan badminton badut bagai bagan bagasi bagi
    bagian bagus bahagia bahan bahasa bahaya bahkan bahu baik bajigur baju bak bakar bakat bakmi
    bakpao bakso bakteri baku bakul bakwan balado balai balap balapan balas balasan balet balik
    baling baliho balita balkon balok balon bambu ban bandar bandara bandeng bandel bandul bangau
    bangga bangkit bangkrut bangku bangsa bangun bangunan banjir bank bantal banteng bantu bantuan
    banyak bapak bara barang barat baris barisan barongsai baru basah basi basket baskom bata batal
    batagor batang batas baterai batik batin batu batuk bau baut bawa bawah bawang bayam bayang
    bayangan bayar bayi bazar bebas bebek beban becak beda bedak bedug begadang begitu bekal bekas
    bekerja bekicot beku bel belah belai belajar belakang belalang belanga belanja belantara belas
    beli beliung belimbing beling belok belokan belum belut benalu benang benar bencana benci benda
    bendahara bendera bendung bendungan bengkak bengkel bengkuang bengong benih bening bensin
    bentang bentuk benteng benua beo beranda berangkat beras berat berani berapa berbaris
    berbelanja berbicara berburu bercanda bercerita berdansa berdiri berdoa berdua beres bergerak
    bergoyang berguna berharga berhasil berhenti berhitung beri berita berjalan berjuang berkah
    berkas berkata berkebun berkemah berkumpul berlari berlatih berlayar berlian berlibur bermain
    bermimpi bernyanyi berpesta berpikir bersama bersatu bersepeda bersih bersin bersinar
    bersyukur bertanya bertani berteman bertemu beruang berubah berwarna besar besi besok betah
    betina betis beton betul biasa biawak biaya bibir bibit bicara bidadari bidak bidan bidang
    bihun bijak biji bila bilang bilangan bilik bimbang bimbing bina binar binatang bingkai bingung
    bintang bintik biola bioskop biru bisa bisik bisikan bising biskuit bisnis bisu bius blangkon
    blender blok blus bobot bocah bocor bodi bohlam bohong boikot boks bola boleh bolos bolpoin bolu
    boneka bonsai bonus bordir borong boros bos bosan botak botol brankas brokoli bros brosur buah
    buaian buang buat buaya bubar bubuk bubur budaya budi budidaya bugar buih bujang bujuk bujur
    buka bukan bukit bukti buku bulan bulat bulir bulu bumbu bumi buncis buncit bundar bundaran
    bunga bungkus bunglon bungsu buntu buntut bunyi bupati buram burger buru buruan buruh burung
    bursa busa busana busi busuk busur butik butir buta butuh buyar buyut
    badung bahari bahtera bait baja bajak bakti balada banding bangsal bantah bantaran barter batako
    baur bayaran bayu bedah belang belia beliau benderang benjol berbagi berbeda berbuah berbunga
    bercahaya berdandan berdebar berenang bergabung bergantung bergegas bergembira berguling
    berharap berhias beringin berjemur berjoget berkaca berkat berkedip berkeliling berkilau
    berlomba berlutut bernapas berpelukan berputar bersalaman bersantai bersembunyi bersenandung
    bersorak bertamu bertualang berunding berwisata betapa biang bibi bijaksana bilah bilas binaraga
    bincang bingkisan biografi blokir bonceng bongkar buatan budiman bulanan bumerang bunda bungkuk
    buntal buruk`,

  c: `cabai cabang cabut cacar cacat cacing cadangan cagar cahaya cair cakalang cakap cakar cakram
    cakrawala cakue calon camat camilan campur canda candaan candi canggih cangkang cangkir cangkok
    cangkul canting cantik capai capek capit cara cari cat catat catatan catur cawan cecak cedera
    cegah cek cekatan cekung celah celaka celana celengan celoteh celup cemara cemas cemberut
    cemerlang cempaka cempedak cendana cenderawasih cenderung cendol cengeng cengkeh centong cepat
    ceplok cerah ceramah cerdas cerdik ceret cerewet ceria cerita cermat cermin cerobong cerpen
    ceruk cetak cetakan cicak cicil cicilan cicip ciduk cilik cilok cincang cincin cinta cipratan
    cipta ciptaan cireng cita citra coba coblos cobek cocok cokelat colek colokan comot condong
    congklak contoh corak coret corong cuaca cubit cuci cucian cucu cuek cuka cukup cukur cula cuma
    cumi cungkil cuplikan curah curam curang curhat curi curiga cuti
    cadas cakup cakupan camar capaian cendawan cengkerama cerna cetek cicit ciri cucur curahan`,

  d: `dada dadar dadu daerah daftar dagang dagangan dagelan daging dagu dahaga dahan dahi dahsyat
    dalam dalang dalih damai damar damba dambaan dampak dan danau dandan dandang dangdut dangkal
    dansa dapat dapur dara darah darat daratan dari darurat dasar dasbor dasi daster data datang
    datar daun daur dawai dawet daya dayung debar debat debit debu debur degup dekap dekat dekorasi
    delapan delima delman delta demam demi demo demokrasi denah dendam dendang dendeng denda dengan
    dengar dengkul dengkur dengung dentang dentum denyut depan deras derajat deret derita dering
    derma dermaga desa desain desak desir desis detak detektif detik dewa dewan dewasa dewi dia
    diagram dialog diam diet digital didih didik dikte dinamis dinamo dinas dinding dingin dini
    dinosaurus diploma diri dirgahayu direktur dirigen disiplin diskon diskusi doa dobrak dodol
    dokter dokumen dolar domba dompet dongeng dongkrak donat donor dorong dorongan dosa dosen dosis
    drama drastis drum dua duda duduk duel duga duit duka dukung dukungan dulu dunia duplikat durasi
    duri durian dus dusta dusun duta duyung
    dakon damping dandanan darma dasawarsa dedaunan dedikasi definisi dekade demikian desah detail
    dialek dimensi dingklik diorama dirgantara dobel dokar dominan dukacita dulang`,

  e: `ebi eceran edar edisi edukasi efek efektif efisien egrang eja ejaan ejek ekonomi ekor
    ekosistem eksklusif eksotis eksperimen ekspedisi ekspor ekspres ekstra ekstrem ekuator elang
    elastis elektronik elemen eliminasi elit elok emak email emas embik embun ember emosi empal
    empang empat empedu emper emping empuk enak enam enau encer endap endapan endus energi enggan
    enggang engkau engkol engsel enteng entah entok episode era eram erat erosi esai eskalator esok
    estafet etalase etika etnik evaluasi
    elegan elektron emblem embusan empati endemik entri esensi etnis ekspresi`,

  f: `fajar fakta faktor fakultas famili fantasi farmasi fase fasih fasilitas fauna favorit fenomena
    fermentasi feri festival figur fiksi film filsafat filter final firasat fisik fisika fitur
    flamingo flora flu fobia fokus fondasi formal formasi formulir forum fosil foto fotografer
    fotokopi frasa frekuensi fungsi
    fatal filosofi finis fleksibel fotosintesis`,

  g: `gabah gabung gabus gadai gading gadis gaduh gagak gagal gagang gagap gagah gagasan gaharu gajah
    gaji galah galak galaksi galau galeri gali galon gamang gambar gambaran gamelan gampang ganas
    ganda gandeng gandum gang ganggu gangguan ganjal ganjil ganteng ganti gantung gapura gaplek
    garam garasi garing garis garpu garuda garuk gas gasing gatal gaul gaun gawai gawang gaya gayung
    gebrak gedung gegabah gelandang gelang gelap gelar gelas gelatik gelatin geledek gelembung geli
    gelinding gelisah gelombang gelora gema gemar gemas gembala gembira gembok gemericik gemetar
    gemilang gempa gemuk gemuruh genangan genap gendang gendong gendut generasi genggam gengsi
    gentar genteng gentong geografi gepeng gerabah gerah gerai gerak gerakan gerbang gerbong gereja
    gergaji gerhana gerigi gerimis gerobak gerutu gesek geser gesit getah getar getaran getir getuk
    gigi gigih gigil gigit gilir giliran gimbal gincu ginjal girang gitar gizi global goda godaan
    godok gol golongan gombal gong gorden goreng gorengan gorila gosip gosok gotong goyang grafik
    gratis grup gua gubuk gudang gudeg gugup gugur gugus gula gulai gulat guling gulma gulung
    gulungan gumam gumpal guncangan gundah gundul gunting guntur gunung gurami gurih gurita guru
    gurun gusar gusi gusur guyonan guyur
    gabungan gairah galian gambut ganjaran garansi garda gelak gelanggang gelegar gembur genderang
    gesper giat gilingan golek goyah gubernur gulali gurauan`,

  h: `habis habitat hadang hadap hadiah hadir hafal hafalan hajatan hak hakim hal halal halaman
    halang halangan halilintar halo halte halus hama hambar hambat hamil hampa hampar hamparan
    hampir hancur handuk hangat hangus hantu hanya hanyut hapus harap harapan harga hari harian
    harimau harmoni harmonika harta haru harum harus hasil hasrat hati haus hawa hebat heboh hektar
    helai helikopter helm hemat hendak hening herbal heran hering hewan hias hiasan hibur hiburan
    hidang hidangan hidrogen hidung hidup hijab hijau hikayat hikmah hilang hilir himpit himpun
    hindar hinggap hingga hipnotis hipotesis hirup histeris hitam hitung hitungan hiu hobi hoki
    honor hormat horor hotel hubung hubungan hujan hukum hulu huma humas humor huni hunian huruf
    hutan
    hadirin hakikat halimun hambatan hantaran harmonis hela heroik higienis himpunan`,

  i: `iba ibadah ibarat ibu idaman ide ideal identik identitas idola iga ijazah ijuk ikal ikan ikat
    ikatan iklan iklim ikhlas ikrar ikut ilalang ilham ilmu ilmuwan ilusi imajinasi imbal imbalan
    imbang imbuhan imigrasi impian impor imun imut inang inap incar incaran inci indah indikator
    indra induk industri info informasi infus ingat ingatan ingin ingkar ingus ini inisial inovasi
    insan insang insiden insinyur inspirasi instan instruksi intan interaksi inti intip intisari
    investasi irama iri iringan iris irisan irit isak isap isi isolasi istana istilah istimewa
    istirahat istri isu isyarat itik itu iuran izin
    ibunda ikon ilmiah imbauan indekos infeksi inisiatif interval ironis irigasi`,

  j: `jabat jabatan jadi jadwal jaga jagat jagoan jagung jahat jahe jahil jahit jahitan jajan jajanan
    jaket jaksa jala jalak jalan jalanan jalin jalinan jalur jam jamak jambore jambu jambul jamin
    jaminan jamrud jamu jamuan jamur jangan janggal jangka jangkar jangkau jangkrik jangkung jantan
    jantung janji janur jarak jarang jargon jari jaring jaringan jarum jas jasa jati jatuh jauh
    jawab jawaban jawara jaya jebak jebakan jeda jejak jelaga jelajah jelas jelek jeli jelita jemari
    jembatan jempol jemput jemur jemuran jenaka jendela jenggot jengkal jengkel jengkol jenguk jenis
    jenius jentik jenuh jepit jepitan jepret jeram jerami jerat jerawat jernih jeruji jeruk jidat
    jilat jinak jingga jinjing jinjit jiplak jitu jiwa jodoh joget joglo jok joki jompo jongkok joran
    jorok jual jualan juang juara jubah judul juga jujur jumbo jumlah jumpa juntai juri jurnal
    jurnalis jurang juru jurus jurusan jus justru juta jutaan
    janin jasmani jatah jilbab jumpalitan`,

  k: `kabar kabel kabin kabur kabut kaca kacamata kacang kacau kadal kadang kado kafe kagum kail kain
    kaisar kakak kakao kakap kakatua kakek kaki kaku kalah kalajengking kalau kaldu kalem kaleng
    kalender kali kalimat kalkulator kalori kalung kamar kambing kamboja kamera kami kampanye
    kampung kampus kamu kamuflase kamus kanal kanan kancil kancing kandang kandas kandung kangen
    kangkung kanguru kantin kantong kantor kantuk kapak kapal kapan kapas kapasitas kapten kapuk
    kapur karang karangan karaoke karamel karat karakter karbon karcis kardus karena karet kari
    karier karpet kartu kartun karton karung karya kasar kasih kasir kasti kastil kasuari kasur kata
    katak kategori katrol katun kau kaum kaus kawan kawanan kawasan kawat kawin kaya kayu kayuh
    keadaan keajaiban kebab kebakaran kebal kebanggaan kebaya keberanian kebersihan kebiasaan kebun
    kecambah kecap kecapi kecebong kecelakaan kecepatan kecerdasan kecewa kecil kecoak kedai kedap
    kedelai kedinginan kedip kedondong kedua kehidupan kehujanan keindahan keju kejar kejuaraan
    kejut kejutan kekar kekayaan kekuatan kelabu kelahiran kelambu kelaparan kelapa kelas kelelawar
    kelengkeng kelereng keliling kelinci kelip keliru kelok kelompok keluar keluarga keluh kemah
    kemampuan kemangi kemas kemasan kembali kembang kembar kembung kemeja kemenangan kemerdekaan
    kemiri kemoceng kempis kemudi kemudian kemuning kenal kenalan kenang kenangan kenanga kenari
    kencang kencur kendali kendang kendaraan kendi kendur kening kentang kenyal kenyang kepala
    kepang kepik kepiting keping kepodang kepompong kepul kera kerabat kerah kerajaan kerajinan
    kerak keramaian keramas keramik kerang kerangka keranjang kerapu keras kerbau kerdil kereta
    keren keriting kerikil kering keringat keripik keris kerja kerokan kertas kerudung keruh
    kerumunan kerupuk kesabaran kesal kesalahan kesan kesatria kesayangan kesehatan kesempatan
    kesenian kesiangan ketan ketapel ketat ketel ketik ketimun ketombe ketoprak ketua ketupat khas
    khawatir khayalan khusus kiat kibar kicau kidal kijang kikir kilat kilau kilo kimia kincir kios
    kiper kipas kiri kirim kiriman kisah kita klakson klasik klepon klinik klip klub koala kobar
    kobra kocak kocok kode kodok koin kokoh kolak kolam koleksi kolom kolong komedi komik kompak
    kompas kompor kompos kompres komputer komodo kondektur kondisi konser kontes konyol koper kopi
    kopiah koran korek kostum kota kotak kotor kreasi kreatif krim kristal kritik kuah kuaci kuali
    kuas kuat kubah kubis kubus kucing kuda kudapan kue kuitansi kukang kuku kukus kukusan kuliah
    kuliner kulit kulkas kumal kumbang kumis kumpul kumpulan kunci kuncup kuning kunjung kunjungan
    kuno kunyah kunyit kuota kupas kupu kurang kurir kurma kursi kursus kurus kurva kusam kuskus
    kusut kutilang kutip kutu kutub kuyup
    kabupaten kaget kajian kalkun kandidat kapsul karedok karnaval kasus kebetulan kebijakan
    kecamatan kecombrang kegiatan kekasih kelak kelomang kelopak kelurahan kemarau kemungkinan
    kendala kepingan kepulauan keputusan kerap ketenangan ketumbar khatulistiwa kikis kilometer
    kisaran klien kolektor kolibri komentar komunitas konsep konsumen kontak koridor kosmetik kosong
    krayon kriuk kuasa kukuh kupon kuping kwetiau`,

  l: `laba labirin labu laci lada ladang lagak lagi lagu laguna lahan lahap lahar lahir lain lajang
    laju lajur laki lakon laksa laksana laku lalap lalapan lalat lalu lama lamar lamaran lamban
    lambai lambang lambat lambung lampau lampion lampu lancar lancip landak landai landasan langganan
    langit langka langkah langsat langsing langsung lanjut lansia lanskap lantai lantang lantas
    lantunan lap lapang lapangan lapar lapis lapor laporan lapuk larang larangan lari laris laron
    larut larva laser latar latih latihan laut lautan lauk lawak lawan layak layang layangan layar
    layu lebah lebar lebat lebih lecet ledakan ledeng lega legenda leher lekas lekat lekuk lelah
    lelang lele lelucon leluhur lem lemah lemak lemang lemari lembah lembap lembar lembing lembut
    lemon lempar lemparan lempeng lemper lencana lengah lengan lengang lengkap lengkung lensa
    lentera lentur lepas lereng lesehan lesu lesung letak letih letus lewat liang liar libur liburan
    licin lidah lidi liga lihai lihat lilin lilit lima limau limbah limpa limun lincah lindung
    lingkar lingkaran lingkungan lintah lintang lintas lipan lipat lipatan lipstik lirih lirik lisan
    listrik liter lobak lobi lobster lodeh logam logat logika logo lokal lokasi loket lolos lomba
    lompat lompatan loncat lonceng longgar longsor lontar lontong loreng lorong loteng lowongan luang
    luas lubang lucu lugas lugu luka lukis lukisan lulus lumayan lumbung lumpia lumpuh lumpur lumrah
    lumut luncur lunak lunas lunglai luntur lupa lurah luruh lurus lusa lusuh lutung lutut
    lafal laga lakban lambaian lampiran langgar lanjutan latah lazim lelap lemas lembaga lembur
    lempung lenggang letupan liku limpah lingkup lintasan liur lokakarya lonjong lumer`,

  m: `maaf macam macan macet madu mading magang magnet mahal mahasiswa mahir mahkota main mainan
    majalah majikan maju makam makan makanan maket makhluk makin makna maksud malam malas malu mama
    mamalia mampir mampu mana mandi mandiri mandor manfaat mangga manggis mangkuk manik manis manja
    mantap mantel manusia marah marga margarin markas marmer martabak masa masak masakan masalah
    masih masjid masker maskot masuk masyarakat mata matahari matang matras mati mau mawar mebel
    medali media megah meja mekar melamin melamun melati melatih melayang meledak meleleh melihat
    melipat melodi melon melompat melukis memanah memancing memang memanjat memasak memasang
    membaca membantu membeli membuat membuka memeluk memilih memori memotong menabung menanam
    menang menara menari menangis mencari mencuci mendaki mendayung mendengar mendorong mendung
    menelan menendang mengaduk mengajar mengantuk mengayuh mengeja mengepel mengetik menggambar
    menggoreng menghitung mengukur mengunyah mengupas menit meniup menjaga menjahit menjangan
    menjemur menjual menolong menonton mentah mentari mentega mentimun menu menulis menunggu
    menyanyi menyapu menyeberang menyelam menyikat menyimak menyiram menyusun merah merak merangkak
    merawat merdu mereka meriah meriam merica mesin mesra meteor meter metode mewah mewarnai
    mikrofon milik mimbar mimpi minat mineral minggu minimal minta minum minuman minyak mirip miring
    misal misi miskin misteri mitos mobil modal mode model modern mogok mohon molek momen monster
    monumen monyet mosaik motif motivasi motor muat muatan mual muda mudah mudik mujarab muka mula
    mulai mulia mulus mulut mumi mumpung muncul mundur mungil mungkin murah murid murni murung
    musala musang museum musibah musik musim musisi musuh musyawarah mutiara mutlak mutu
    mahoni majemuk makmur maksimal malang mancanegara mandat mangsa mantan mantra manual markisa
    maskapai masukan matematika materi maupun medan medis mekanik melambai melamar melangkah melawan
    melempar melindungi melinjo meluncur memahat memanen memanggang memanggil memar membajak
    membalas membangun membawa membersihkan memeras memerah memeriksa memetik memijat meminjam
    meminta meminum memotret memukau menanti menantu menarik menangkap mencatat mencium mencoba
    menduga menebak menempel menerima mengajak mengambil mengangkat mengantar mengapung mengasah
    mengayun mengecat mengejar mengeluh menggali menggigit menggosok menghafal menghias menghibur
    mengikat menginap mengintip mengirim mengkudu mengobrol mengulang menikmati menimbang menjawab
    menjelajah menjelang menjinjing menonjol menukar menumpang menyalin menyambut menyapa menyerah
    menyerbu menyusul merajut merakit merebus merekam merenung merias meringis merobek merpati
    mertua migrasi mikroskop miliar mimik minder mingguan miniatur molen montir moral muara mukena
    muncrat murai murbei mustahil`,

  n: `nabati nada nadi nafkah naga naik nakal nakhoda nalar naluri nama nampan nanas nangka nanti
    napas narasi narasumber nasi nasib nasihat nasional naskah naungan negara negatif negeri nekat
    nelayan nenek neon neraca netral ngambek ngamen ngamuk nganga ngantuk ngarai ngebut ngengat
    ngeri ngiang ngidam ngigau ngilu ngobrol ngopi ngotot niat nikah nikmat nila nilai noda nomor
    nominal nominasi nona nonton normal nostalgia nota novel nuansa nuklir nurani nusa nutrisi
    nyala nyali nyaman nyamuk nyanyi nyanyian nyaring nyaris nyata nyawa nyenyak nyeri nyiru nyiur
    nyonya
    negosiasi niaga niscaya notasi nuri`,

  o: `oase obat obeng obesitas objek obor obral obrol obrolan observasi ocehan ogah ojek oknum
    oktaf olah olahan olahraga oleh oles oli olimpiade ombak omelan omong omongan omzet oncom
    onggok ongkos operasi operator opini opor optik optimis orang oranye orbit organ organisasi
    orisinal orkes orkestra oseng otak otomatis otot oval oven ozon
    ompong onderdil opsi optimal organik orientasi ornamen otomotif`,

  p: `pabrik pacar pacu pacul padam padang padat padepokan padi pagar pagi pagoda paha pahala paham
    pahat pahit pahlawan pajak pajangan pakai pakaian pakan pakar paket pakis paksa paku palang palem
    palet paling palsu palu paman pamer pameran panah panas panci pancing pancingan pancuran panda
    pandai pandan pandang pandu panekuk panen pangeran panggang panggil panggilan panggung pangkas
    pangkat pangkuan panglima pangsit panik panitia panjang panjat panji pantai pantang pantas
    pantau pantul pantun papan paprika para parade parah parang parfum pariwisata parit parkir paru
    parut parutan pasang pasangan pasar pasien pasir paspor pasta pastel pasti pasukan patah patok
    patroli patuh patung patungan pawai pawang payah payung pecah pecahan pecel peci pecut pedagang
    pedal pedang pedas pedati pedih peduli pegang pegangan pegas pegawai pegunungan pejabat pejalan
    pejuang pekan pekarangan pekat pekerja pekerjaan pelabuhan pelajar pelajaran pelan pelana
    pelangi pelanggan pelari pelat pelatih pelaut pelayan pelepah peliharaan pelita pelosok peluang
    peluh peluit peluk pelukan pelukis pemadam pemain pemanah pemanas pemandangan pemandu pemanis
    pematang pembaca pembantu pembeli pemburu pemenang pemilu pemuda pena penari penasaran pencak
    pencipta pendaki pendek pendekar pendengar pendidikan pendopo penemu pengamen pengantin pengawal
    penggaris penghapus penghuni pengki pengemudi pengusaha penjaga penjahit penjual penolong
    penonton pensil penting penuh penulis penumpang penyanyi penyelam penyok penyu pepaya pepes
    perabot perahu perak perang perangko perantau perasaan peraturan perawat perban perca percaya
    percik perdana perekat perempuan perenang pergelangan pergi peri periksa perintah perisai
    perjalanan perkakas perkedel perkemahan perkutut perlahan perlombaan perlu permadani permainan
    permata permen pernah perpustakaan persegi persik pertama pertandingan pertanyaan pertemuan
    pertunjukan perut pesan pesanan peselancar pesawat pesepeda pesisir pesta pesulap peta petai
    petak petani petasan peternak peti petik petir petualang petualangan petugas peyek piala piano
    pidato pijakan pijat pikir pikiran piknik pilek pilih pilihan pilot pimpin pinang pindah
    pinggang pinggir pinguin pinjam pintar pintu pion pipa pipet pipi piramida piring pisang pisau
    pita planet plastik plester pohon pojok pokok pola polisi polos polusi pompa pondok pongah poni
    ponsel popok populer porselen porsi pos poster potong potongan potret prajurit prakarya praktik
    pramugari pramuka presiden prestasi pria prima program promosi proyek puas puasa pucat pucuk
    pudar puding puing puji pujian pukat pukul pulang pulau pulen pulpen pulsa puluh punah punai
    puncak punggung pungut puntung punya pupil pupuk pura puri purnama pusaka pusar pusaran pusat
    puskesmas puspa pusing putar putaran putih putik putra putri putus puyuh
    padahal padu paduan pancaran pandangan pangkal panorama pantulan papeda paralel parasut pare
    pari pasak patokan paus pedoman pegal pelembap pelikan pemandian pemanasan pemula penat pendapat
    pendingin penerbang pengalaman penggemar pengumuman penjelajah penyakit pepatah peradaban peran
    peranan perapian perbatasan perhatian perilaku peringatan perkara perkebunan perlengkapan
    permukaan permukiman persahabatan pertanian pesona pesut petang petis petunjuk piagam piket
    pilar pindang pipit piton piyama pori posisi positif potensi praktis pramusaji pribadi prinsip
    prioritas produk profesi prosedur proses pukis pulas pundak putu`,

  r: `raba rabun racik racikan racun radar radio ragam ragi ragu rahang rahasia rahmat raih raja
    rajawali rajin rajut rak raket rakit raksasa rakus rakyat ramah ramai ramal rambat rambu rambut
    rambutan ramping rampung ramu ramuan rancang rangka rangkai rangkaian rangkul ranjang ransel
    rantai rantang ranting ranum rapat rapi rapor rapuh rasa rata ratu ratus raut rawa rawat rawit
    raya rayap rayu rayuan rebab rebah rebana rebung rebus rebusan rebut reda redup regang regu
    rehat rekam rekaman rekan rekat rekening rekor rekreasi rela relawan rem remah remaja remang
    rempah rempeyek remuk rencana rencong renda rendah rendang renang rengginang rentang renung
    renyah reptil reruntuhan resah resep resmi restoran retak rewel rezeki riak riang rias riasan
    ribu ribut rimba rimbun rinci rindang rindu ringan ringkas rintangan rintik rintis risau risiko
    ritsleting riuh riwayat robek robot roda roket rok rombongan rompi rongga rongsok ronde rosela
    rotan roti royal ruang ruangan rubah rugi rujak rukun rumah rumbia rumit rumpun rumput rumus
    runcing runtuh runtut runut rupa rupiah rusa rusak rusuk rute rutin
    raga raib rakitan ranah rantau rasional rawan referensi rekayasa relasi relief renovasi rentan
    resepsi ria ritme roman rotasi royong`,

  s: `sabar sabit sabuk sabun sadap sadar sadel safari sagu sah sahabat saing saingan sains saja
    sajak saji sajian sakit saksi saksofon saku salah salak salam salep salin salju salon salto
    salur saluran sama samar sambal sambil sambung sambungan sambut sambutan sampah sampai sampan
    sampel sampo sampul samping samudra sanak sanca sandal sandar sandaran sandi sandiwara sangat
    sanggul sangkar sangu santai santan santun sapa sapaan sapi sapu saputangan sarang sarapan
    sarden sari saring saringan sarung sasaran sate satpam satu satwa saudara saus sawah sawi sawo
    sayang sayap sayembara sayup sayur sayuran sebab sebar sebelah seberang sedan sedang sedap
    sederhana sedekah sedih sedikit sedotan seduh segala segan segar segel segera segitiga sehat
    sejarah sejoli sejuk sekali sekat sekoci sekolah sekop sekoteng sekretaris selada selai selalu
    selam selamat selancar selang selaput selasih selatan seledri selendang selera selesai selimut
    selip selokan seluruh semak semangat semangka sembako sembilan semboyan sembuh sembunyi semen
    semester semi seminar sempit sempurna semua semur semut senam senang sendiri sendok sendu senja
    sengaja sengat senggol seni seniman senter sentuh senyum senyuman sepak sepat sepatu sepeda sepi
    seprai seragam serabi serai serak serangga seram serat serba serbet serbuk sereal seret
    sertifikat seru seruling serius sesak sesat sesuai setel setia setor setrika sewa siaga siamang
    siang siap siapa siaran siasat sibuk sidang sidat sifat sigap sikap sikat siku siklus silang
    silat silau silsilah simak simbol simpan simpanan simpang simpul sinar sinden sindir sindiran
    sinetron singa singgah singgasana singkat singkong sinyal siomai siput siram siraman sirene
    sirip sirkus sirsak sirup sisa sisi sisir sistem siswa sita situ situs skala skor slogan sobat
    soal sobek soda sofa solar sombong sop sopan sopir sore sorak sorakan sorot sosis sosok soto
    sotong spanduk spons srikaya stadion stasiun stiker stok stroberi studio suap suar suara suami
    suasana subuh suci sudah sudi sudut suguhan suhu suka sukarela sukses suku sukun sulam sulaman
    sulap sulit suling sulung sumbang sumbangan sumber sumbu sumpit sumur sundul sungai sungguh
    sungkan sungut sunting suntik suntuk sunyi sup suplemen supaya surai suram surat surau surut
    suruh surya survei susah susu susul susun susunan suster susut sutra sutradara swasta syahdu
    syair syal syarat syukur
    saat sabana sahut sakti saldo saling salmon sambar sampingan sanggar sanggup santri saraf saran
    sarana sarat satelit satuan sawit sebal sebentar sedia sekarang sekitar sektor selebaran
    selempang selisih semampai semanggi semarak sembari semerbak sempat semprot senandung senar
    senggang sentosa sepanjang sepupu serah serambi serasi serial seribu serigala serikat sering
    seroja serta seruan sesaat sesal sesi sesuatu setempat setengah setiap setop sewaktu siluet
    simpanse simulasi singkap sirih sisik situasi siulan skuter songket songkok sosial spesial
    stamina standar status stempel steril strategi stres struktur suatu subur sumbat super suvenir
    syukuran`,

  t: `tabah tabel tabib tablet tabrak tabuh tabung tabungan tadah tadi tagih tahan tahap tahu tahun
    tahunan tajam takar takaran takhta takjub taktik takut talas talang talenan tali taman tamasya
    tamat tambah tambak tambal tambang tambun tampan tampil tampilan tamu tanah tanam tanaman tanda
    tanding tandu tanduk tandus tangan tangga tanggal tanggap tangguh tanggung tangis tangkai
    tangkap tangkapan tangkas tangki tanjakan tanjung tanpa tantangan tante tanya tapai tapak tape
    tapi tapir tari tarian tarif tarik tarikan taring taruh taruna tas tata tatap tauge taufan tawa
    tawar tawon tayang tayangan teater tebak tebakan tebal tebing tebu tebus teduh tegak tegang
    tegas tegur teguran teh tekad tekan tekanan teknik teknologi teks tekstil tekun telaga telapak
    telepon televisi teliti telinga teluk telur tema teman tembaga tembang tembikar tembok tempat
    tempayan tempe tempel temu tenaga tenang tenda tengah tenggat tenggelam tenggiri tenggorokan
    tengkuk tengok tenis tentang tentara tenteram tentu tenun tepat tepi tepian tepuk tepukan
    tepung terampil terang terapung teras terasi teratai terbakar terbalik terbang terbit terbuka
    terdampar terdengar teri terigu terima terjang terjatuh terjebak terjun terka terkejut terkenal
    terkunci terlambat terlihat terminal termos ternak teropong terowongan terpaksa terpeleset
    terpilih terpukau tersandung tersenyum tersesat tertawa tertib tertidur tertinggal terumbu
    terung terus tes tetangga tetap tetes tetesan tiang tiap tiara tiba tidur tiga tikar tiket
    tikungan tikus tilang tim timah timba timbang timbangan timbul timpa timun timur tindak tindakan
    tinggal tinggi tingkah tingkat tinjau tinju tinta tipe tipis tirai tiram tiru tisu titik titip
    titipan tiup tiwul toga toilet tokek toko tokoh tolak toleransi tolong tomat tombak tombol tong
    tongkat tongkol tongseng tonton tontonan topan topeng topi topik toples total tradisi traktor
    trampolin tren trenggiling trotoar truk tua tuan tuas tubuh tudung tugas tugu tuju tujuan tujuh
    tukang tukar tukik tulang tulis tulisan tulus tumbuh tumbuhan tumis tumit tumpah tumpeng tumpuan
    tumpuk tumpukan tumpul tuna tunai tunangan tunas tunda tunggu tunjuk tuntas tupai turbin turis
    turun turunan tusuk tutup tutur
    taat tabir tabur tagihan tajuk talam talenta tambahan tambur tampak tampung tandan tandas
    tanggapan tanggul tangkis tantang tapal tapis target tarung tatakan tatanan tebar tegap tegel
    teguk tekuk teladan telat telentang telungkup tembus tempa tempo tempuh tenteng tenunan teori
    terakhir terapi terbaik terdekat terharu teriak teriakan terik terendam termasuk terobos
    terpesona tersedia tertarik tertua tertutup tiada tiarap tidak titian tonggak tonjol topang
    tradisional transfer transportasi trik tropis tuang tuntun tuntunan turut tutor`,

  u: `uang uap uban ubah ubi ubin ucap ucapan udang udara ufuk uji ujian ujar ujung ukir ukiran
    ukulele ukur ukuran ulang ulangan ular ulat ulek ulekan ulet ulos ulung umbi umbul umpama umpan
    umum umur undang undangan undi undian unduh unggah unggas unggul unggun ungkap ungsi ungu unik
    unit universitas unjuk unsur unta untuk untung upacara upah upaya urai urap urat urus urusan
    urut usaha usai usang usap usia usil usir usul usulan usus utama utang utara utuh utus utusan
    ulam ulasan undakan unggahan ungkapan untai untaian urutan utas`,

  v: `vaksin vakum valid vanili variabel variasi vas vegetarian ventilasi verifikasi versi vertikal
    veteran via vibrasi video vila virtual virus visa visi visual vital vitamin vokal voli volt
    volume vonis`,

  w: `wabah wacana wadah waduk wahana wajah wajan wajar wajib wajik wakil waktu walau walet wali
    wangi wanita warga waris warisan warna warta wartawan warung wasiat wasit waspada wastafel watak
    wawancara wawasan wayang wedang wejangan wibawa wilayah wiraswasta wirausaha wisata wisuda wol
    wortel wujud
    waru waswas wijen wisma`,

  y: `yaitu yakin yang yatim yayasan yel yodium yoga yogurt`,

  z: `zaitun zakat zaman zamrud zat zebra ziarah zigzag zirah zona`,
};

/** Shortest and longest accepted word (letters). */
export const MIN_WORD = 3;
export const MAX_WORD = 12;

const VALID = /^[a-z]+$/;

/** True for a lowercase a-z string of 3-12 letters. */
export function isWordShape(word: string): boolean {
  return word.length >= MIN_WORD && word.length <= MAX_WORD && VALID.test(word);
}

/** The whole list: validated, de-duplicated and sorted. */
export function wordList(): string[] {
  const out = new Set<string>();
  for (const block of Object.values(BY_LETTER)) {
    for (const w of block.split(/\s+/)) {
      if (isWordShape(w)) out.add(w);
    }
  }
  return [...out].sort();
}

/** Raw entries that would be dropped (wrong shape or listed twice); for the unit tests. */
export function listProblems(): { invalid: string[]; duplicates: string[]; misplaced: string[] } {
  const seen = new Set<string>();
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const misplaced: string[] = [];
  for (const [letter, block] of Object.entries(BY_LETTER)) {
    for (const w of block.trim().split(/\s+/)) {
      if (!isWordShape(w)) invalid.push(w);
      else if (seen.has(w)) duplicates.push(w);
      if (w[0] !== letter) misplaced.push(w);
      seen.add(w);
    }
  }
  return { invalid, duplicates, misplaced };
}
