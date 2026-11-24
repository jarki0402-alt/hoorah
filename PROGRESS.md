# PROGRESS — Hoorah

Catatan pengerjaan proyek. Entri terbaru di paling atas. Setiap perubahan kode, konfigurasi, atau infrastruktur wajib dicatat di sini (lihat `CLAUDE.md`).

## Status saat ini

- **Fase:** Fase 1 (MVP) selesai dibangun, menunggu uji di perangkat sungguhan oleh pemilik.
- **Jalan di:** Docker lokal (nginx), `http://192.168.0.104:1010`, dan produksi `https://hoorah.fajarrizky.my.id` di VM Google Cloud (IP `35.212.156.209` sejak 2026-11-20). Gelombang 3 dikerjakan lokal dulu; deploy VM ditunda.
- **Game:** 30 game (18 lama + Gelombang 3: Obby, Lantai Runtuh, Nyebrang, Penyusup, Satu Tali, Bom Oper, Seluncur Es, Langkah Maut, Juara Eja, Kampung Siluman, Petualangan Warna, Hantu Tak Terlihat), semua bisa main sendiri kecuali Kompak Gak?, Kampung Siluman, Penyusup. Gambar Kilat dan Panjat Pinang dihapus.
- **Hoorah Pass (uji coba):** kode Pass bersama dari dashboard admin `http://192.168.0.102:1010/admin/`, disimpan di SQLite (`/data/hoorah.db` di Docker).
- **Infrastruktur cloud:** VM e2-micro Google Cloud (Oregon) dipakai bersama Suwwara. Deploy Hoorah siap (`DEPLOY.md`, **build di VM** lewat `deploy/vm/update.sh`, folder `/home/fajarrizky04febriano/hoorah`); langkah VM dijalankan pemilik.
- **Kode:** GitHub `jarki0402-alt/hoorah` (publik), branch `main`.

## Antrean perubahan (diminta pemilik, belum dikerjakan)

Daftar ini hasil diskusi. Tidak ada yang dikerjakan sebelum pemilik memutuskan dan bilang "eksekusi". Item yang selesai dipindah ke Log.

1. **Kode Pass dimasukkan di layar, bukan di HP.** Layar mengingat kode sampai Pass habis; HP cukup scan QR, gabung lewat layar terdekat (Wi-Fi sama), atau ketik kode room. Tombol "Hoorah Pass" di halaman awal dan menu lobi, status "Pass aktif sampai ...", tombol "Lepas Pass". Batas "room bersamaan" di admin menjadi "layar bersamaan". Belum diputuskan: cara mengetik di Smart TV (a. papan huruf di layar, b. di layar atau dari HP Host sebagai keyboard jarak jauh, c. kode lebih pendek), nasib kode yang tersimpan di HP, kolom kode di HP dihapus total atau tidak. Ubah PRD 3.4.1 dulu.
2. **Pembayaran (setelah uji coba).** Login Google lewat QR di layar, Midtrans (QRIS/GoPay untuk Harian), prabayar tanpa perpanjangan otomatis, 1 layar aktif per Pass, trial 7 hari diganti 1 Pass Harian gratis per akun, kode admin jadi kode tukar. Iklan: iklan sendiri dulu, lalu Google H5 Games Ads; iklan berhadiah belum diputuskan. Semua menunggu keputusan pemilik, lalu PRD 3.4.
3. **Suwwara terasa kurang mulus sejak Hoorah di VM.** Ukur dulu di VM (`uptime`, `free -m`, `swapon --show`, `docker stats --no-stream`, `vmstat 1 5`). Pilihan: A. build tidak di VM (GitHub Actions, membalik keputusan 2026-11-16), B. perketat batas RAM/CPU dan prioritas Hoorah, C. Hoorah pindah ke VPS Indonesia berbayar (keputusan terkunci, izin pemilik).
4. **Joystick terasa seperti Roblox.** Joystick sudah jenis mengambang dan mengikuti jempol (`apps/web/src/controller/pad.tsx`, radius 52 px, zona mati 14%). Rencana: halaman uji joystick (tanpa jeda jaringan, penggeser radius/zona mati/percepatan) untuk dicoba di HP, lalu seragamkan respons karakter (percepatan cepat, belok instan), lingkaran samar saat diam, zona sentuh separuh kiri penuh, tombol utama paling besar di lengkungan jempol. Pisahkan masalah joystick dari masalah jeda jaringan.
5. **Lari Terus: usap dan lompat kurang enak dibanding runner di HP.** Penyebab yang dicurigai: jeda HP ke layar lewat relay Oregon (±200 ms; jauh lebih kecil kalau tersambung langsung di Wi-Fi sama), ambang usap `SWIPE_PX = 34`, `laneTime 0.2`, lompatan (`jumpV 6.6`, `gravity 19`, melayang ±0,7 dtk), umpan balik di layar dan HP. Ukur dulu jalur sambungan saat dicoba, lalu setel bersama pemilik di perangkat sungguhan.
6. **Tampilan 2D yang terlihat seperti 3D (2.5D).** Gaya isometrik atau 3/4 dengan bayangan, cahaya, kedalaman berlapis, dan sprite hasil render. Lebih ringan dari 3D untuk Smart TV dan build VM. Tentukan game mana yang dipakai.
7. **Rusun: lantai digeser lurus kanan-kiri, jarak jatuh dekat.** Sekarang lantai menggantung di tali yang berayun seperti bandul (`SWING_AMPLITUDE`, `SWING_R` di `apps/web/src/games/rusun/`), jadi naik-turun dan memantul. Ubah jadi troli lurus kanan-kiri tanpa pantulan, lantai menggantung dekat di atas puncak menara; kesulitan tetap dari kecepatan geser yang makin cepat. Setel bersama pemilik di perangkat sungguhan.
8. **Gelombang 3: 12 game baru, katalog jadi 30** (disetujui pemilik 2026-11-22; genre umum, tidak semuanya bertema Indonesia; semua nama sementara, isi orisinal, tidak meniru game yang dirujuk pemilik). Ubah PRD 6.3 dulu (menggantikan rencana gelombang lama: Penyusup lama, kartu, Tebak Nada, Ngibul, Kata Terlarang, Gendang Ritme, Pacu Jalur, Gambar Kilat, Panjat Pinang).
   - **Mesin bersama "dunia kotak 3D"** (Three.js, 3D sederhana bergaya kotak-kotak, fisika kotak/bola ditulis sendiri tanpa library baru, joystick mengambang ala Roblox di kiri + tombol besar di kanan, kamera mengikuti rombongan):
     1. **Satu Tali** (1–4, kerja sama): terikat tali elastis, lintasan parkour naik dan maju dengan rintangan, titik simpan. LOMPAT + PEGANG. Main sendiri: karung pemberat atau dikecualikan (belum diputuskan).
     2. **Obby** (1–8): balapan lintasan rintangan, titik simpan, kontrol ala Roblox. Usul: kamera mengikuti rombongan, yang tertinggal dipindah ke titik simpan dekat rombongan (belum diputuskan).
     3. **Lantai Runtuh** (1–8, sesi ±5 menit): babak berganti aturan (kotak acak, warna, simbol, angka, jangan diam, gelombang, gelap). Tombol DORONG dengan jeda **3 detik** (keputusan pemilik). Skor per babak, yang jatuh ikut lagi babak berikutnya.
     4. **Bom Oper** (2–8): kejar-kejaran, tap OPER saat dekat untuk memindahkan bom, waktu ledak acak, tidak bisa langsung dioper balik.
     5. **Seluncur Es** (2–8, bukan sumo): semua membidik bersamaan di HP seperti ketapel (arah + kekuatan) selama hitung mundur, lalu meluncur serentak dengan fisika di platform es yang mengecil; terakhir berdiri menang.
   - **Kontrol arah (atas/kanan/kiri/bawah):**
     6. **Langkah Maut** (1–16): babak menegangkan (Eskalator makin cepat, Titian Tali, Tangga Gedung, Lorong Laser, Batu Sungai, Gua Runtuh, Ingat Jalan, Lift Rusak); salah arah = jatuh. Waktu tekan diukur di HP. Satu game banyak babak atau dipecah (belum diputuskan).
     7. **Nyebrang** (1–8): lompat menyeberang serentak, kamera terus maju, banyak map (Kota, Sungai, Rel, Pasar, Salju, Pabrik, Luar Angkasa, Malam), mode Balapan dan Bertahan. Tampilan wajib jelas berbeda dari game sejenis (avatar buah, warna Hoorah). 2D tampak atas atau 3D kotak (belum diputuskan).
   - **2D:**
     8. **Juara Eja** (lomba mengeja, 1–8): pilih bahasa Indonesia atau Inggris saat mulai; layar menampilkan definisi, contoh kalimat, jumlah huruf, dan membacakan kata (Web Speech jika suara tersedia, cadangan: huruf awal sebagai petunjuk); ketik di HP (papan ketik Sambung Kata). Definisi ditulis sendiri, tidak disalin dari KBBI/kamus.
     9. **Petualangan Warna** (1–8, kerja sama): teka-teki platform; tiap pemain pilih avatar sendiri dan mendapat warna; kolam/pintu/permata hanya untuk warna yang sama; tombol injak, kotak, tuas, lift, berdiri di pundak teman; semua masuk pintu keluar. Main sendiri: 2 karakter dengan tombol TUKAR.
     10. **Hantu Tak Terlihat** (1–8, horor): satu pemain hantu, posisinya hanya di HP-nya dan terlihat di layar saat kena senter; penghuni mencari kunci dan sekring di rumah gelap; HP penghuni berdetak saat hantu dekat. Main sendiri lawan hantu komputer. Pilihan "Seram Ringan"/"Seram Beneran", tanpa darah; tema hantu Nusantara dan/atau umum per map (belum diputuskan). Suara lewat Web Audio.
   - **Sosial (HP sebagai layar rahasia, dikecualikan dari aturan main sendiri):**
     11. **Kampung Siluman** (5–16, werewolf): layar jadi pemandu tanpa moderator; Warga, Siluman, Dukun, Tabib (opsional Pemburu, Pengkhianat); malam di HP, siang diskusi, voting, yang tersingkir jadi arwah.
     12. **Penyusup** (3–16, undercover): mayoritas dapat satu kata, penyusup kata mirip, opsional Si Kosong; petunjuk tiap ronde lalu voting; bank pasangan kata Indonesia dan Inggris.
   - **Keputusan pemilik 2026-11-22 (mengikuti rekomendasi):** Satu Tali main sendiri dengan karung pemberat; Obby kamera mengikuti rombongan, yang keluar layar >2 dtk dipindah ke titik simpan dekat rombongan (diam 1 dtk); Langkah Maut satu game banyak babak (Host pilih Acak atau babak); Nyebrang 2D sudut 3/4 (2.5D), bukan 3D kotak; Hantu Tak Terlihat dua map: Rumah Tua (hantu umum) dan Kampung Malam (hantu Nusantara); Penyusup petunjuk diucapkan, ada mode Ketik; game sosial dikunci Pass, uji coba lewat Pass Harian gratis nanti, katalog tetap menampilkan label "3+ pemain".
   - **Keputusan pemilik 2026-11-22:** tampilan 18 game yang sudah terdeploy **tidak diubah dulu**. Papan desain hanya untuk 12 game baru; papan "Game lama" yang sudah terlanjur dibuat (Lama-1, Lama-2, Lama-4) hanya referensi.
   - **Keputusan pemilik 2026-11-22 (aturan tambahan dari papan desain):** Bom Oper pakai 3 nyawa dan 2 bom di ronde akhir, **tanpa Arwah Jahil** (yang habis nyawa keluar dulu). Seluncur Es pakai poin ganda babak akhir, **tanpa Penjaga Ombak**. Langkah Maut pakai "ikut lagi babak berikutnya" dan pesan "nyaris rekor". **Pocong boleh** di map Kampung Malam (Hantu Tak Terlihat), dibuat lucu-seram tanpa simbol atau bacaan agama. Rusun dikerjakan nanti sekalian. Usulan (belum diputuskan): pemain yang sudah keluar hanya bisa bersorak dan menebak juara dari HP, tanpa memengaruhi permainan.
   - **Keputusan pemilik 2026-11-22 (suara):** **mesin musik adaptif** (lapisan tensi 0–3, sedikit lebih cepat di 10 detik terakhir, bunyi momen penting, musik mengecil saat pengumuman) dipakai di 12 game baru dulu; game lama menyusul. **Suara pemandu** boleh berupa file kecil (melonggarkan aturan "tanpa file audio" khusus suara pemandu, dimuat hanya di layar utama; musik tetap Web Audio). Suara dibuat pemilik sendiri di Google AI Studio (Gemini TTS) memakai naskah dari Claude, lalu dikonversi kecil (mis. `afconvert` bawaan macOS). Kampung Siluman memakai Mode Tutup Mata dengan pemandu layar (tanpa chat siluman). Kata di Juara Eja (ratusan kata, 2 bahasa) belum tercakup: perlu skrip API nanti atau suara browser sebagai cadangan.
   - **Keputusan pemilik 2026-11-22 (sebelum eksekusi):** pemain yang sudah keluar di Bom Oper dan Seluncur Es menunggu, tapi tetap bisa bersorak memakai tombol reaksi platform yang sudah ada ("Sorak!" dan "Huuu~", `reactions: true` di tampilan HP menunggu, gelembung + bunyi di layar utama), tanpa memengaruhi permainan dan tanpa tebak juara; kata di Juara Eja dibacakan suara browser jika tersedia; Gambar Kilat dan Panjat Pinang dihapus dari katalog "segera hadir"; kuntilanak ikut di Kampung Malam; Nyebrang 4 map dulu (Kota, Sungai, Rel, Malam); container Docker lain di Mac (Suwwara, es-migrasi-lab, kunai) dibiarkan mati, hanya Hoorah yang hidup. Suara: tanpa suara pemandu, detak jam + weker sebagai bunyi waktu standar, bunyi panggilan per peran di Kampung Siluman, tanpa getar di malam hari; aturan "tanpa file audio" tetap. **Lab Kontrol** (joystick, usap Lari Terus dengan penunjuk jeda, uji getar) dikerjakan dulu; getar iPhone memakai trik saklar semaksimal mungkin (tik tunggal, tik beruntun, tik saat geser jika bisa) + kedipan pengganti; getar penuh lewat App Clip ditunda.
   - **Keputusan pemilik 2026-11-22:** seluruh pekerjaan ini **lokal dulu** (Docker di Mac); deploy ke VM ditunda sampai masalah build di VM (beban ke Suwwara) dibahas.
   - **Desain disetujui pemilik 2026-11-22:** papan 12 game baru di kanvas (halaman "Desain 30 game") disetujui, kecuali Juara Eja yang harus dibuat jauh lebih sederhana (sedang direvisi).
   - **Desain:** papan desain semua game (layar utama, HP, orientasi kontroler, babak, psikologi pemain) dibuat di kanvas Claude Design pemilik sebelum coding.
   - **Usulan urutan:** perbaikan Rusun, mesin dunia kotak dimulai dari Obby (sekaligus menjawab item 4), Satu Tali, Lantai Runtuh, Seluncur Es, Bom Oper, lalu game kontrol arah, 2D, dan sosial.
9. **Rapikan dokumen dan infrastruktur.** IP VM berganti ke `35.212.156.209` (2026-11-20): perbarui `DEPLOY.md` (baris 133, 179, 183). Status di atas masih menyebut Cloudflare Tunnel, padahal Hoorah sudah jalan di VM. `docker/.env.example` belum di-commit (pemilik cek isinya). IP VM masih ephemeral; IP statis bisa berbiaya, tanyakan dulu.

10. **STUN + TURN Cloudflare (diskusi 2026-11-22, belum dikerjakan):** STUN `stun.cloudflare.com` (gratis tanpa batas) + TURN Cloudflare (gratis 1.000 GB/bulan, lalu $0,05/GB) untuk HP yang gagal tersambung langsung; data tidak lewat VM (tidak mengganggu Suwwara, data keluar VM turun), DNS Hoorah tetap awan abu-abu. Server membuat kredensial TURN sementara per room lewat API (rahasia di `.env`), STUN sendiri jadi cadangan selama uji lalu port 3478 bisa ditutup. Pengaman: server berhenti memberi kredensial TURN bila perkiraan pemakaian bulan ini mendekati 800 GB, pemakaian TURN tampil di admin, indikator persen sambungan langsung vs TURN. Pemilik perlu membuat TURN key di dashboard Cloudflare (menu Realtime).

11. **[SELESAI 2026-11-22, lihat Log] Tutorial singkat di semua game (disetujui pemilik 2026-11-22).** Di layar utama sebelum ronde pertama: 3–4 langkah bergambar (aset game sendiri, panah/gerakan, satu kalimat), HP mini yang menyorot tombol, kartu asal-usul "Terinspirasi dari ..., bedanya ..." (boleh menyebut nama game asli sebagai teks, tanpa logo/aset). Muncul otomatis hanya pertama kali per game per perangkat layar, lalu lewat tombol "Cara main" (detail game + menu jeda). Host bisa Lewati; tombol "Paham!" di setiap HP, tutorial selesai saat semua menekan. Satu mesin bersama, isi per game berupa data, animasi SVG/CSS tanpa video. Gelombang 2: mesin + 5 contoh (Ular Tangga, Petualangan Warna, Kampung Siluman, Bajaj Rush, Kuis Nusantara), dinilai pemilik dulu; Gelombang 3–4: 25 sisanya. Latihan tombol di HP ditunda. Commit/push dan TURN Cloudflare ditunda sampai pembaruan besar (keputusan pemilik 2026-11-22: fokus lokal).

## Format entri

```markdown
### YYYY-MM-DD — Judul singkat

**Apa yang diubah:** ...
**Alasan:** ...
**File:** `path/a.ts`, `path/b.ts`
**Verifikasi:** perintah yang dijalankan → hasil (lulus/gagal), atau "tidak diverifikasi: alasan"
**Selanjutnya / catatan:** ...
```

## Log

### 2026-11-24 · Penyempurnaan 6 game real-time jarak jauh + kiriman ke layar teman sampai 20 kali per detik

**Apa yang diubah:**
- **`playout.ts` (sama di Tarik, Karung, Wilayah, Bom, Runtuh, Es) + tes:** jeda gambar di B menyesuaikan diri: perjalanan tercepat dari 8 paket terakhir + `clamp(1,5 × jarak paket + 2 × jitter, 60, 250)` ms, bergerak halus (maks 10% lebih cepat / 25% lebih lambat), menahan paket terbaru saat jalur langsung jatuh ke relay. Jalur langsung ±75–90 ms di belakang perjalanan tercepat.
- **Jam server di B:** hitung mundur dan GO (Tarik `cd`, Karung `gs`, Wilayah `go`), jam ronde, sumbu Bom (`FuseClock`, panjang sumbu tetap rahasia), jadwal petak dan kartu aturan Runtuh (`sl`), hitung mundur bidik Es.
- **Seluncur Es:** selama ada layar teman, kunci bidikan yang terlambat sampai dinilai dari stempel HP (tunggu tambahan 0,35 dtk). Tanpa layar teman sama seperti sebelumnya.
- Kirim tiap 60 ms (±16 kali per detik) di Tarik, Karung, Bom, Runtuh, Es; Wilayah tetap 70 ms (paket bisa sampai 7 KB).
- **Shell (`screen/store.ts`):** paket ke layar teman dulu selalu menunggu 50 ms setelah perubahan pertama, sehingga kiriman 50–60 ms tergabung menjadi ±10 kali per detik. Sekarang paket berangkat segera bila 50 ms sejak paket terakhir sudah lewat (maks 20 kali per detik). Baris tes rollout yang terlalu panjang dirapikan (biome).

**File:** `apps/web/src/games/{tarik,karung,wilayah,bom,runtuh,es}/**` (playout.ts, playout.test.ts, mirror.ts, replica.ts, director.ts, tes), `apps/web/src/screen/store.ts`, `apps/web/src/screen/mirror.test.ts`.

**Verifikasi:**
- `npm run check`: lulus (11 peringatan lint lama, 138 file / 2349 tes unit, build).
- `npx playwright test e2e/remote.spec.ts e2e/remote-games.spec.ts`: 13/13 lulus, jalur langsung A↔B "1 ms" di localhost, cuplikan A/B cocok.
- `npm run docker:up`: lulus, `curl http://192.168.0.104:1010/health` → `{"ok":true,...}`, katalog di aset berisi 20 game `remote`, teks "Jalur langsung" ada di build.

**Berikutnya / sisa:** oper bom (Bom) dan dorong (Runtuh) dinilai menurut posisi saat tekanan tiba di A, belum diputar mundur. Layar A dan B harus versi sama (field baru wajib). Belum diuji antar-kota sungguhan.

### 2026-11-24 · Jalur langsung layar A↔B (WebRTC), hitung mundur sinkron, Langkah Maut + Rusun + Makan Kerupuk (20 game jarak jauh)

**Apa yang diubah** (eksekusi pemilik 2026-11-24: "paling optimal dan smooth"):
- **Jalur langsung A↔B:** layar A membuka WebRTC ke setiap layar teman (`screen/farlink.ts`): kanal `ms` (berurutan, andal: tampilan shell + suara) dan `mg` (tanpa urutan, tanpa kirim ulang: keadaan game, terbaru menang). Sinyal lewat pesan baru `mirrorRtc` (A hanya offer/hangup, cermin hanya answer/hangup, 12 sinyal per 10 dtk, divalidasi server, server mengisi `from`), id per cermin (`mirrors.ids`). Relay ke `'mirror'` bisa membawa `skip` (cermin yang sudah tersambung langsung tidak dikirimi lagi). Jalur putus/belum terbuka: otomatis lewat server, kirim ulang penuh saat jalur terbuka atau mati; B membuang paket lama (`PacketOrder`), detak tiap 1 dtk, mati setelah 3,5 dtk, coba lagi 2/5/15/30/60 dtk. Panel A dan chip B menampilkan "Jalur langsung · N ms" atau "Lewat server". Tanpa TURN (keputusan terkunci): di sebagian jaringan seluler/CGNAT tetap lewat server.
- **Hitung mundur shell di B sinkron:** hasil, Mode Pesta, jeda iklan, dan tutorial dikirim sebagai batas waktu server (`timer`), B hanya menampilkan (`screen/countdown.ts`).
- **Skema jam server untuk game adu tepat waktu:** jadwal gerak dikirim berpatokan jam server, B menggambar dari `game.now()` (tidak menunggu paket), tekanan dinilai dari stempel HP:
  - **Langkah Maut** (`remote: true`): panah di B tepat waktu (jangkar `o` jam server, isyarat awal dibangun 1,5 dtk sebelum main), toleransi saat ada cermin 0,6 dtk (normal 0,25), umur stempel maks 0,8 dtk.
  - **Rusun** (`remote: true`): posisi troli dihitung dari jam server di B. **Menyimpang dari PRD 6.3** (dicatat di PRD, menunggu konfirmasi pemilik): hanya selama ada layar teman, tekanan dinilai pada stempel HP (maks 600 ms ke belakang) dan lantai bergeser ke titik itu selama jatuh; jatuh otomatis 600 ms setelah batas waktu. Tanpa layar teman perilaku sama seperti sebelumnya.
  - **Makan Kerupuk** (`remote: true`): ayunan tiap kerupuk dihitung dari jam server di B; selama ada cermin stempel dipercaya sampai 1 dtk dan akhir ronde menunggu 750 ms (stempel). Dua aturan diperketat untuk semua mode: tekanan yang distempel saat tersedak atau setelah batas waktu diabaikan.
- Kasus e2e baru untuk ketiganya; `e2e/remote.spec.ts` memeriksa "Jalur langsung · N ms" di A dan B.

**File:** `packages/protocol/src/{constants,messages,validate,protocol.test}.ts`, `apps/server/src/{rooms.ts,rooms.mirror.test.ts}`, `apps/web/src/shared/{net,games}.ts`, `apps/web/src/screen/{farlink.ts,countdown.ts,mirror.ts,mirror.test.ts,store.ts,remote.tsx,strings.ts,screen.css,pages/ResultsPage.tsx,pages/PartyPage.tsx,pages/AdBreak.tsx,tutorial/TutorialOverlay.tsx}`, `apps/web/src/games/langkah/**`, `apps/web/src/games/rusun/**`, `apps/web/src/games/kerupuk/**`, `PRD-Hoorah.md`, `e2e/remote.spec.ts`, `e2e/remote-games.spec.ts`.

**Verifikasi:**
- `npx tsc --noEmit` server, protocol, web: lulus. `npx biome check` file terkait: lulus.
- `npx vitest run` server + protocol + screen + shared: 494 lulus; langkah 37, rusun 58, kerupuk 47 lulus.
- `npx playwright test e2e/remote.spec.ts e2e/remote-games.spec.ts` (kecuali Tarik/Karung/Wilayah yang sedang disempurnakan agen lain): 10/10 lulus, jalur langsung A↔B "2 ms" di localhost. Cuplikan Langkah Maut dan Makan Kerupuk A/B sama.
- `npm run check` penuh dan Docker menunggu penyempurnaan 6 game real-time selesai (entri berikutnya).

**Berikutnya / sisa:** pemilik konfirmasi pengecualian Rusun. Ingat Jalan (Langkah Maut): pemain di B kehilangan ±0,1–0,3 dtk waktu menghafal. Penyempurnaan Tarik, Karung, Wilayah, Bom, Runtuh, Es masih berjalan. Server dan web harus dideploy bersama (keduanya satu image).

### 2026-11-24 · Main bareng teman jauh: Rebut Wilayah (17 game jarak jauh)

**Apa yang diubah:** Rebut Wilayah bisa ditampilkan di layar teman jauh (`remote: true`). Lantai wilayah tidak dikirim utuh: setiap paket membawa perubahan pemilik petak bernomor (diulang 600 ms) dan beberapa pita 4 baris lantai yang bergilir (seluruh lantai ±1,8 detik), jadi paket hilang pulih sendiri dan layar yang baru tersambung mendapat lantai penuh dalam ≤6 paket. Jejak dan posisi pemain di setiap paket, ±12 paket per detik, rata-rata 1,6 KB (maks 3,2 KB, batas 7.000 karakter). `scene.ts` menggambar dari antarmuka `StageModel` (dipakai pertandingan asli dan replika). Kasus Wilayah di `e2e/remote-games.spec.ts`.

**File:** `apps/web/src/games/wilayah/{mirror.ts,mirror.test.ts,replica.ts,scene.ts,director.ts,main.tsx}`, `apps/web/src/shared/games.ts`, `apps/web/src/screen/mirror.test.ts`, `e2e/remote-games.spec.ts`.

**Verifikasi:**
- `npx vitest run` wilayah + rollout 62/62 lulus; `npx playwright test e2e/remote-games.spec.ts --grep Wilayah` lulus, cuplikan A dan B sama (tabrakan di tengah, B dipotret sesaat sesudah A).
- Semua game paket ini masuk, lalu `npm run check` lulus (11 peringatan lint lama, 129 file / 2217 tes unit, build).
- `npm run docker:up` lulus, `curl http://192.168.0.104:1010/health` → `{"ok":true,...}`, katalog di aset container berisi 17 game `remote`.

**Berikutnya / sisa:** di B, wilayah baru menyebar dari tengah area yang direbut (di A dari jejak). Game jarak jauh sekarang 17; sisanya (Ular Arena, Nyebrang, Hantu, Warna, Dapur, dan game cepat/3D) belum, karena telat 0,2–0,4 detik terasa tidak adil.

### 2026-11-24 · Main bareng teman jauh: Seluncur Es, Balap Karung, Lantai Runtuh

**Apa yang diubah** (eksekusi pemilik 2026-11-24, saat sedang main bareng teman):
- **Seluncur Es** (`remote: true`): `EsReplica` (mesin kotak, pola Bom Oper), kirim tiap 75 ms waktu game saat membidik/meluncur, ±1,3 KB. Bidikan, es mengecil (dikirim sebagai ukuran, bukan kejadian, jadi aman bila paket hilang), MELUNCUR!/DUK!/BYUR!/NYARIS! diputar ulang. Efek dipindah ke `show.ts`, papan skor `boardOf` dipakai A dan B.
- **Balap Karung** (`remote: true`): `KarungReplica` (pola Tarik), kirim ±14 kali per detik saat balapan, maks ±2,1 KB. Lompatan diputar ulang dari penghitung (lompat panjang/pendek/super), GUBRAK!, finis, kilat foto, timer. Efek dipindah ke `effects.ts`.
- **Lantai Runtuh** (`remote: true`): `RuntuhReplica` (mesin kotak), jadwal setiap petak yang tidak utuh dikirim di setiap paket (dikelompokkan), jadi satu paket hilang tidak menghilangkan apa pun; B memutar retak/jatuh/naik pada waktu game yang tepat. Efek dipindah ke `show.ts`.
- Kasus e2e baru di `e2e/remote-games.spec.ts` untuk ketiganya.

**File:** `apps/web/src/games/es/{mirror.ts,mirror.test.ts,replica.ts,show.ts,director.ts,hud.tsx,logic.ts,main.tsx}`, `apps/web/src/games/karung/{mirror.ts,mirror.test.ts,replica.ts,effects.ts,director.ts,hud.tsx,main.tsx}`, `apps/web/src/games/runtuh/{mirror.ts,mirror.test.ts,replica.ts,show.ts,director.ts,main.tsx}`, `apps/web/src/shared/games.ts`, `apps/web/src/screen/mirror.test.ts`, `e2e/remote-games.spec.ts`.

**Verifikasi:** `npx tsc --noEmit -p apps/web` lulus (di luar folder Wilayah yang sedang dikerjakan), `npx biome check` lulus, `npx vitest run` es + karung + runtuh + rollout lulus (39 + 99 tes), `npx playwright test e2e/remote-games.spec.ts` Seluncur Es, Balap Karung, Lantai Runtuh lulus; cuplikan A dan B sama (pemain, arena, HUD, hitung mundur). `npm run check` penuh dan Docker belum dijalankan untuk commit ini (Rebut Wilayah masih dikerjakan di pohon kerja yang sama; CI GitHub menjalankan pemeriksaan penuh).

**Berikutnya / sisa:** pecahan pinggir es yang hanyut acak per layar (di B bisa terlihat di posisi berbeda). Rebut Wilayah menyusul.

### 2026-11-24 · Main bareng teman jauh: Tarik Tambang + Bom Oper (game real-time pertama)

**Apa yang diubah:**
- **Tarik Tambang** (`remote: true`): A mengirim keadaan ±14 kali per detik saat menarik (4 kali per detik di fase lain, langsung saat ada kejadian), ±1 KB untuk 8 pemain. `TarikReplica` menggerakkan `TarikScene` + `Hud` yang sama, posisi tali dan tenaga diinterpolasi 100 ms di belakang paket terbaru, ketukan disebar ulang dari total supaya penarik tetap bergoyang, SUPER! bernomor (6 terakhir), cincin super mengikuti waktu server. HUD dipindah ke `board.ts` dan efek panggung ke `effects.ts` (dipakai A dan B).
- **Bom Oper** (`remote: true`): A mengirim tiap 75 ms waktu game saat mengejar dan langsung saat kejadian, ±1,2 KB (maks ±2,2 KB). `BomReplica` mengisi `BomMatch` lokal yang tidak pernah berjalan lalu memakai `BomScene` + `Hud` yang sama; posisi diinterpolasi, efek (OPER, BUM, toast, confetti) diputar saat waktu B mencapainya. Panjang sumbu tetap rahasia (hanya bagian yang sudah terbakar). Efek dipindah ke `show.ts`.
- `e2e/remote.spec.ts` memakai Bajaj Rush sebagai contoh game yang belum bisa jarak jauh (Tarik sekarang bisa). `e2e/remote-games.spec.ts`: kasus Tarik dan Bom (menunggu sampai permainan berjalan, Bom dimulai dari HP Host setelah "Tetap tegak").

**File:** `apps/web/src/games/tarik/{mirror.ts,mirror.test.ts,replica.ts,board.ts,effects.ts,director.ts,main.tsx}`, `apps/web/src/games/bom/{mirror.ts,mirror.test.ts,replica.ts,show.ts,director.ts,main.tsx}`, `apps/web/src/shared/games.ts`, `apps/web/src/screen/mirror.test.ts`, `e2e/remote.spec.ts`, `e2e/remote-games.spec.ts`.

**Verifikasi:** `npx tsc --noEmit -p apps/web` lulus, `npx biome check` lulus, `npx vitest run` tarik + bom + rollout 120/120 lulus, `npx playwright test` Tarik, Bom, dan alur dua layar dasar lulus; cuplikan A dan B identik (Tarik saat menarik, Bom saat bom dipegang Bayu). Setelah kelima game masuk: `npm run check` lulus (11 peringatan lint lama, 125 file / 2161 tes unit, build); `npm run docker:up` lulus, `curl http://192.168.0.104:1010/health` → `{"ok":true,...}`, kode replika Bom/Tarik ada di aset container.

**Berikutnya / sisa:** angka "+N" dan goyangan penarik di B dibangun ulang dari total ketukan (mirip, tidak persis). Pemain di tempat B merasakan telat ±0,2–0,4 detik lewat Oregon. Data ke B ±15 KB/detik per layar teman saat game real-time.

### 2026-11-24 · Main bareng teman jauh: Juragan Nusantara

**Apa yang diubah:** Juragan bisa ditampilkan di layar teman jauh (`remote: true`). `mirror.ts` (pemilik petak sebagai dua larik 24 angka, pemain sebagai tuple, ±2 KB untuk 6 pemain akhir game) dan `replica.ts` mengisi `JuraganView` + `HudStore` yang sama dengan A. Dadu, jalan bidak, koin, dan kartu Kabar diputar ulang di B menurut nomor efek (8 terakhir disimpan; yang terlambat digambar langsung di tempat). Sinkron pemilik/bangunan dipindah ke `view.showTiles` supaya A dan B memakai satu jalur. Kasus Juragan ditambahkan ke `e2e/remote-games.spec.ts`.

**File:** `apps/web/src/games/juragan/{mirror.ts,mirror.test.ts,replica.ts,driver.ts,main.tsx,scene/view.ts}`, `apps/web/src/shared/games.ts`, `apps/web/src/screen/mirror.test.ts`, `e2e/remote-games.spec.ts`.

**Verifikasi:** `npx tsc --noEmit -p apps/web` lulus (di luar folder Tarik/Bom yang sedang dikerjakan), `npx biome check` lulus, `npx vitest run` juragan + rollout 94/94 lulus, `npx playwright test e2e/remote-games.spec.ts --grep Juragan` lulus; cuplikan A dan B sama (papan, HUD, kartu petak). `npm run check` penuh dan Docker belum dijalankan (alasan sama dengan entri di bawah).

**Berikutnya / sisa:** lempar dadu dan goyang koin acak per layar (angka dadu sama). Jeda lokal di B diabaikan, hanya jeda A yang membekukan B.

### 2026-11-24 · Main bareng teman jauh: Penyusup + Kampung Siluman

**Apa yang diubah** (eksekusi pemilik 2026-11-24, paket cepat agar bisa langsung main bareng teman):
- **Penyusup** dan **Kampung Siluman** bisa ditampilkan di layar teman jauh (`remote: true`). Masing-masing punya `mirror.ts` (`toMirror` murni, `applyMirror` memeriksa input, `MirrorScene`) dan stage yang sama dipakai A dan B lewat antarmuka scene (`PenyusupScene`, `SilumanScene`).
- Rahasia tetap di HP: peran, kata, aksi malam, pilihan suara per orang, dan skor tengah ronde tidak pernah dikirim; peran/kata hanya saat layar A memang membukanya. Curiga di Kampung Siluman dikirim sebagai jumlah saja.
- Jam memakai waktu server dan berhenti saat A ditahan atau B dijeda. Suara dan musik (termasuk intensitas dan tempo) diteruskan shell. Ukuran keadaan terbesar ±2 KB untuk 16 pemain.
- Tes rollout di `screen/mirror.test.ts` sekarang memuat 10 game. Tes e2e baru `e2e/remote-games.spec.ts` (per game: Host + HP, layar B lewat link, game dimulai, cuplikan A dan B).

**File:** `apps/web/src/games/penyusup/{mirror.ts,mirror.test.ts,logic.ts,screen.tsx,main.tsx}`, `apps/web/src/games/siluman/{mirror.ts,mirror.test.ts,logic.ts,screen.tsx,main.tsx}`, `apps/web/src/shared/games.ts`, `apps/web/src/screen/mirror.test.ts`, `e2e/remote-games.spec.ts`.

**Verifikasi:**
- `npx tsc --noEmit -p apps/web`: lulus. `npx biome check` file terkait: lulus.
- `npx vitest run` penyusup, siluman, shared, screen: lulus (Penyusup 30 tes, Kampung Siluman 27 tes, rollout 7 tes).
- `npx playwright test e2e/remote-games.spec.ts`: 2/2 lulus; cuplikan layar A dan B identik untuk kedua game.
- `npm run check`, e2e penuh, dan `npm run docker:up` **tidak dijalankan** untuk commit ini: agen lain sedang mengubah folder Tarik, Bom, dan Juragan di pohon kerja yang sama. CI GitHub menjalankan lint, typecheck, tes, dan build untuk commit ini; Docker dijalankan setelah semua game paket ini selesai.

**Berikutnya / sisa:**
- Tarik Tambang, Bom Oper, dan Juragan menyusul.
- Penyusup: teks "Rina memilih pengaturan di HP" bertumpuk dengan baris avatar di layar 1280x720 (sama di A dan B, masalah lama).

### 2026-11-24 · Main bareng teman jauh (dua layar utama, satu room) tahap 1 + 2

**Apa yang diubah** (keputusan pemilik 2026-11-24, eksekusi tahap 1 dan 2):
- **Konsep:** layar A (Host) menjalankan game; layar B di tempat lain membuka link dari A dan **menggambar sendiri** halaman dan game yang sama dari keadaan yang dikirim A (bukan video/berbagi layar). HP di tempat B scan QR di layar B dan masuk room A. Obrolan lewat telepon/video call di luar aplikasi.
- **Protokol + server:** hello `role:'mirror'` dengan kunci rahasia 8 karakter (`mirrorKey` di welcome layar A), relay target `'mirror'` (hanya dari layar), `{t:'mirrors', count, key}` ke layar A, `{t:'mirrorsOff'}` (putuskan + kunci baru, error `mirror_stopped`), maks 3 cermin per room, kunci/kode salah dihitung ke batas 20 kode salah per menit, cermin tidak memakan kursi dan tidak bisa mengendalikan apa pun, kunci ikut snapshot room. Link: `/J/<kode>-<kunci>` → `/main?mirror=...` (`parseMirrorLink`).
- **SDK:** `GameInit.mirror`, `game.isMirror`, `game.publish(state)` (hanya saat ada cermin, duplikat tidak dikirim), `game.mirrored`, event `mirror`/`mirrors`.
- **Layar A:** tombol "Main bareng teman jauh / LDR? Tetap main bareng!" di bilah atas beranda (bisa dengan d-pad Host), panel link besar + QR + 4 langkah + status "Menunggu layar teman…"/"Layar teman tersambung", Salin link, Putuskan layar teman; tombol menjadi hijau "Teman jauh tersambung". Snapshot tampilan (halaman, fokus, rak beranda, roda Acak, detail, hasil, pesta, tutorial, iklan, musik) dikirim maks tiap 50 ms bila berubah, penuh saat cermin bergabung; suara A ikut dikirim.
- **Layar B:** mode pengikut (tombol/remote lokal tidak menggerakkan halaman, tombol suara dan layar penuh tetap), chip "Layar teman jauh · Host: <nama>", QR + kode room di pojok (detail: kanan atas), "Menunggu layar utama temanmu" saat A putus, kartu selesai + Coba lagi. Game dimuat dengan pengaturan persis milik A, keadaan terakhir diserahkan setelah iframe siap.
- **Game didukung (tahap 2):** Kuis Nusantara, Sambung Kata, Juara Eja, Kompak Gak?, Ular Tangga, Ludo, Congklak, Catur. Masing-masing punya `mirror.ts` (+ tes: round trip, input rusak ditolak, ukuran < 5 KB) dan replika di layar B tanpa aturan/CPU; timer dikirim sebagai waktu berakhir; animasi (pion, biji congklak, bidak catur, efek) diputar sendiri di B; Juara Eja membacakan kata juga di B. Selama ada cermin, game lain bertanda "Belum bisa jarak jauh" dan tidak bisa dimulai; Mode Pesta dan Acak hanya dari 8 game itu; picker Host ikut menandai.

**File:** `packages/protocol/src/{constants,messages,validate,protocol.test}.ts`, `packages/sdk/src/{bridge,index}.ts`, `apps/server/src/{rooms,index}.ts`, `apps/server/src/rooms.mirror.test.ts`, `apps/web/src/main.ts`, `apps/web/src/shared/{net,games}.ts`, `apps/web/src/screen/{mode.ts,mirror.ts,mirror.test.ts,nav.follow.test.ts,remote.tsx,store.ts,bridge.ts,nav.ts,party.ts,strings.ts,components.tsx,main.tsx,screen.css,pages/*}`, `apps/web/src/controller/{store,strings}.ts,picker.tsx,picker.css`, `apps/web/src/games/{kuis,kata,eja,kompak,ular,ludo,congklak,catur}/**` (mirror.ts, replica/MirrorScene, refactor kecil driver/screen), `e2e/remote.spec.ts`, `e2e/hoorah.spec.ts`.

**Verifikasi:**
- `npm run check`: lulus (11 peringatan lint lama, 120 file / 2111 tes unit, build).
- `npm run e2e`: run penuh 12/12 lulus (run sebelumnya 11/12: tes paket gratis gagal di klik kartu Obby, masalah lama; sekarang tes itu menyimpan cuplikan `free-tier-detail-failed` bila gagal). Tes baru `e2e/remote.spec.ts` (≈20 dtk): panel, link B, B mengikuti fokus Host, picker menandai, detail Kuis di kedua layar, HP lewat QR B muncul di A dan B, putuskan + link baru, Kuis berjalan di kedua layar. Cuplikan A dan B identik.
- `npm run docker:up`: lulus. IP LAN laptop berubah menjadi 192.168.0.104; `curl http://192.168.0.104:1010/health` → `{"ok":true,...}`, `/J/...` 200, teks "Main bareng teman jauh" dan "Belum bisa jarak jauh" ada di build.

**Berikutnya / sisa:**
- Belum dicoba dengan dua lokasi sungguhan (butuh deploy VM, dengan izin pemilik). Di Wi-Fi yang sama bisa dicoba dengan dua perangkat.
- Hitung mundur hasil/pesta, tutorial, dan gelembung reaksi di B berjalan lokal (bisa selisih sedikit).
- Tahap 3 (Juragan, Kampung Siluman, Penyusup, Seluncur Es) dan tahap 4 menyusul.
- Tes paket gratis kadang gagal di run penuh: selidiki dari cuplikannya.

### 2026-11-24 · Pilih tokoh setelah masuk (layar penuh + Siap), "Memilih tokoh…" di layar utama, ikon menu jeda polos

**Apa yang diubah:**
- **Alur HP baru** (permintaan pemilik: pemilih tokoh di halaman nama terasa terpotong): Kode → Nama → Masuk → halaman **"Pilih tokohmu"** layar penuh (pratinjau, Acak, tab Tokoh/Kulit/Rambut/Warna rambut/Baju, kisi mengisi sisa layar, tombol **Siap**) → lobi. Halaman nama kembali ringkas (nama + Masuk). HP mendatar: pratinjau di kiri, kisi di kanan.
  - Hanya saat join baru (bukan sambung ulang). Tokoh terakhir sudah terpilih, cukup ketuk Siap.
  - Setiap pilihan langsung terkirim (`profile` dengan `picking: true`) dan tampil di kursi layar utama; kursi menulis **"Memilih tokoh…"** (kuning, berkedip pelan) sampai Siap.
  - Host memulai game saat ada yang masih memilih: HP itu otomatis selesai memilih dengan tokoh yang sedang terpilih.
  - Protokol: `PlayerInfo.picking?`, `profile.picking?` (divalidasi boolean). Server: `Player.picking`, hanya dikirim saat HP tersambung.
- **Menu jeda remote Host:** ikon tidak lagi di kotak berwarna, polos seperti tombol remote beranda (Keluar tetap merah, status Nyala/Mati di bawah label). Properti `tint` dihapus.

**File:** `packages/protocol/src/{messages.ts,validate.ts,protocol.test.ts}`, `apps/server/src/{rooms.ts,rooms.test.ts}`, `apps/web/src/controller/{store.ts,avatar-editor.tsx,setup.tsx,room.tsx,strings.ts,ingame.tsx,controller.css}`, `apps/web/src/screen/{pages/JoinPage.tsx,strings.ts,screen.css}`, `e2e/hoorah.spec.ts`, `e2e/host-offer.spec.ts`.

**Verifikasi:**
- `npm run check`: lulus (11 peringatan lint lama, 109 file / 2042 tes unit, build).
- `npm run e2e`: run penuh terakhir 11/11 lulus. Satu run penuh sebelumnya 10/11: tes paket gratis gagal di klik kartu Obby di beranda (masalah lama, lulus saat dijalankan sendiri 2x). E2e sekarang memeriksa halaman pilih tokoh, "Memilih tokoh…" di layar utama sampai Siap, dan menekan Siap di setiap join.
- Cuplikan e2e: halaman pilih tokoh iPhone (kisi lega, Siap di bawah), menu jeda (ikon polos), layar utama 1080p (Budi "Siap main").
- `npm run docker:up`: lulus, `http://192.168.0.121:1010/health` → `{"ok":true,...}`, teks baru ada di build.

**Berikutnya / sisa:** tes paket gratis kadang gagal di run penuh (klik kartu beranda); selidiki penyebabnya. Belum commit, belum deploy VM.

### 2026-11-24 · Ganti nama Kacawbalaw + logo, avatar tokoh di aplikasi dan 30 game, `/` selalu landing, kedipan Hantu, Obby layar dibagi, latihan Dapur

**Apa yang diubah:**
- **Nama dan logo** (keputusan pemilik 2026-11-24, juga dicatat di PRD bagian atas dan CLAUDE.md):
  - Semua teks pemain: Hoorah menjadi **Kacawbalaw**, Hoorah Pass menjadi **Kacaw Pass** (strings semua game, layar utama, HP, admin, landing, judul, meta pratinjau). Nama file CSV admin `kacaw-pass-...csv`.
  - `shared/art/brand.ts` (baru): logo tulisan "kacaw / balaw" (Baloo 2 ExtraBold, celah antarhuruf sama dari ukuran huruf terukur, satu bentuk w gelombang) dan ikon dua pita miring (satu pita di bawah 24 px). `Logo`, `LogoMark`, `Wordmark` di `shared/ui.tsx`.
  - `public/icon.svg` (favicon satu pita), `icon-app.svg`, PNG `apple-touch-icon`/`icon-192`/`icon-512` dari `scripts/brand-icons.mjs`; `manifest.webmanifest` + meta `application-name`/`apple-mobile-web-app-title` = "Kacawbalaw". `brand.test.ts` menjaga file ikon tetap sama dengan kode (`UPDATE_ICONS=1` menulis ulang).
  - Nama internal tidak diubah: package `@hoorah/*`, repo, image, folder dan subdomain VM, kunci `hoorah.*`.
- **Avatar pemain = 24 tokoh** (menggantikan buah):
  - Protokol: `Look` (tokoh, kulit 1-5, model rambut dari tokoh lain, warna rambut 0-7, warna baju 0-7), `parseLook`, `PlayerInfo.look`, hello `look?`/`fruit?`, pesan baru `profile` (ganti nama dan tokoh di room). Server menyimpan look, membagi buah per kursi (`freeFruit`), HP lama tanpa look mendapat tokoh dari buahnya, snapshot lama dipulihkan.
  - HP: pemilih tokoh (`controller/avatar-editor.tsx`): Tokoh, Kulit, Rambut, Warna rambut, Baju, Acak; tersimpan di HP; tombol "Ubah nama dan tokoh" di lobi (tidak saat game berjalan).
  - `people.ts`: `resolveLook`, palet rambut/baju/kulit, `avatarMarkup` (pengganti `fruitMarkup` pada kisi 64), `castHead` untuk gambar dekoratif. `Avatar` memakai `PersonBadge`.
  - Layar utama, HP, admin, key art semua game, gambar tutorial (`fruit()` sekarang menggambar tokoh; Bajaj dan Lari pakai `fruitHead`), karakter 3D dunia kotak (`kotak/render/avatar.ts`: orang kotak-kotak dengan kulit, rambut/kerudung/topi, baju), dan 28 game memakai look pemain. Bajaj Rush dan Lari Terus: karakter 3D tetap buah (keputusan pemilik), HUD-nya tokoh. Lawan komputer memakai tokoh yang tidak dipilih pemain.
  - Game Phaser 2D: kepala dibuat saat look pertama muncul (`games/common/heads.ts`, dipakai tarik, karung, kerupuk, wilayah, warna, hantu; arena dan nyebrang punya atlas sendiri). Juragan: kepala pion 3D dari look.
- **`/` selalu landing page:** perangkat yang pernah jadi layar utama melihat tombol "Lanjutkan sebagai layar utama"; `/?depan` dihapus (`shared/visit.ts`, `main.ts`, `landing/hero.tsx`). Logo di bilah atas layar utama membuka landing di tab baru ("Tentang Kacawbalaw").
- **Hantu Tak Terlihat:** kedipan merah 3x di posisi hantu di layar utama (`world.ts` `PING`, `scene.ts` `drawPing`). Seram Ringan tiap 8 detik dan setiap tertangkap; Seram Beneran tiap 15 detik atau saat hantu dekat penghuni (jarak minimal 5 detik). Tips katalog ditambah.
- **Obby:** kamera dari belakang menghadap ke depan (joystick atas = maju, `stickToCourse`). Sampai 4 orang layar dibagi (1 penuh, 2 kiri-kanan, 3-4 empat bagian; 3 orang: bagian keempat rombongan), 5+ satu kamera rombongan (aturan tarik ke rombongan hanya di mode ini). Bingkai bernama per bagian, label nama 3D disembunyikan saat dibagi, bayangan diturunkan.
- **Dapur Heboh:** latihan praktik di dapur sungguhan sebelum game pertama di layar ini (`guide.ts` + tes): satu pesanan Kentang goreng, panah memantul di atas stasiun, kartu langkah di layar, langkah dan tombol yang disorot di HP, langkah berikut hanya setelah langkah sekarang dikerjakan, Lewati (ketuk 2x), jam tidak berjalan, lalu ronde biasa. Tombol pad HP sekarang menghormati `pulse` (`is-pulse`).

**Alasan:** permintaan pemilik 2026-11-24 ("eksekusi semuanya", Kacaw Pass, nama di ikon Kacawbalaw, domain nanti, Bajaj dan Lari tetap buah dulu).

**File:** `deploy/nginx/hoorah-server.conf` (tipe manifest), `packages/protocol/src/{look.ts,messages.ts,validate.ts,index.ts,protocol.test.ts}`, `apps/server/src/{rooms.ts,rooms.test.ts}`, `apps/web/src/shared/{art/brand.ts,art/brand.test.ts,art/people.ts,person.tsx,ui.tsx,brandStrings.ts,visit.ts,tutorial/draw.ts,kotak/render/avatar.ts,kotak/render/players.ts,games.ts,art/*.ts}`, `apps/web/src/controller/{avatar-editor.tsx,setup.tsx,room.tsx,store.ts,strings.ts,common.tsx,pad.tsx,main.tsx,controller.css}`, `apps/web/src/screen/**`, `apps/web/src/landing/{hero.tsx,steps.tsx,strings.ts}`, `apps/web/src/admin/{main.tsx,csv.ts,csv.test.ts,strings.ts}`, `apps/web/src/main.ts`, `apps/web/src/games/*/**` (semua game), `apps/web/src/games/common/{cpu.ts,heads.ts}`, `apps/web/{index.html,*/index.html,public/*}`, `scripts/brand-icons.mjs`, `e2e/hoorah.spec.ts`, `PRD-Hoorah.md`, `CLAUDE.md`.

**Verifikasi:**
- `npm run check`: lulus (lint 11 peringatan lama, typecheck, 109 file / 2040 tes unit, build).
- `npm run e2e`: 11/11 lulus (run akhir pada kode final, 3,5 menit). Sebelumnya gagal karena (1) bug sungguhan: aplikasi HP crash saat dimuat (`pick` dipakai sebelum dideklarasikan di `controller/store.ts`, diperbaiki), (2) tes masih mengeklik tombol buah (diganti pemilih tokoh: Mia, Bram, tab Baju), (3) Dapur kini diawali latihan (tes memeriksa kartu latihan lalu Lewati 2x), (4) klik kartu Obby di tes paket gratis kadang hilang (diulang otomatis sampai halaman detail terbuka, lulus 2x berturut-turut).
- `npm run docker:up`: lulus. `curl http://192.168.0.121:1010/health` → `{"ok":true,...}`. Build berisi teks baru ("Kacaw Pass" ada, "Hoorah Pass" tidak ada, "Lanjutkan sebagai layar utama", "Tulis nama & pilih tokohmu"), `/manifest.webmanifest` bertipe `application/manifest+json` (aturan nginx baru), ikon PNG 200.
- Cek tampilan (Playwright, server dev, tanpa error halaman): landing 1440x900 perangkat lama (tombol Lanjutkan), beranda layar utama 1280x720 (logo baru), halaman nama + pemilih tokoh di HP (Pixel 7), Juragan demo 4 pion berkepala tokoh, Obby `?demo=1/2/3&people=1` di 1280x720 dan 1024x768 (4:3): kamera awal terlalu rendah sehingga pemain terpotong, diperbaiki (FOLLOW_RIG lebih tinggi dan jauh, tes baru "runner whole in the picture"); label bagian layar dan jam disusun ulang (jam di tengah, label di pojok, klasemen samping disembunyikan saat dibagi).

**Berikutnya / sisa:**
- Belum dicek di perangkat sungguhan: kepala tokoh di game Phaser (muncul beberapa ms setelah look pertama), pion Juragan, kepala koki Dapur, panah dan kartu latihan Dapur di 16:9/16:10/4:3, layar dibagi Obby dengan banyak pemain.
- Bajaj Rush dan Lari Terus masih buah di 3D (diganti nanti).
- Belum commit dan belum deploy VM.

### 2026-11-24 · Avatar pemeran (24 tokoh) di landing page, landing lebih ramai, garis progres dihapus

**Apa yang diubah:**
- **Pemeran Hoorah di kode** (baru):
  - `apps/web/src/shared/art/people.ts` berisi gambar 24 tokoh dan 14 ekspresi, sama persis dengan desain avatar versi 2 yang disetujui pemilik di Claude Design.
  - Isinya hanya fungsi yang menghasilkan teks SVG, tanpa DOM. Setiap gambar memakai id clip-path baru supaya tidak bentrok kalau tokoh yang sama tampil dua kali.
  - `shared/person.tsx`: `PersonArt` (tokoh tanpa bingkai) dan `PersonBadge` (lingkaran berwarna dengan cincin warna pemain, pengganti `Avatar` buah).
  - `shared/peopleStrings.ts`: nama tokoh.
  - Tes `people.test.ts` memeriksa semua tokoh × semua ekspresi: markup lengkap, tanpa NaN, dan setiap clip-path ada definisinya.
- **Landing page: semua buah diganti tokoh.**
  - Bagian pembuka: 3 HP (Leo, Putri, Bayu). 3 tokoh melayang (Lala, Kiki, Doni) berganti ekspresi dan muncul gelembung reaksi bergiliran (Hore!, Seru!, Wih!, dan lainnya).
  - Adegan langkah: pemain Mia, Juna, dan Sinta.
  - Podium Mode Pesta: Lala menang, Rio senang, Bayu menangis.
  - Kartu "Cocok untuk": rombongan 3 tokoh per kartu (keluarga, tongkrongan, kantor, 17-an, arisan).
  - Penutup: tokoh melayang (Rio, Ayu, Dino).
- **Lebih ramai:**
  - Pawai 24 tokoh berjalan di bawah bagian pembuka (`cast.tsx`, `Parade`).
  - Tokoh mengintip di samping judul Perangkat (Kai), Harga (Bayu, melet), dan Tanya jawab (Tara, gugup), dengan gelembung kata.
  - Kerumunan 8 tokoh bersorak di bawah ajakan penutup. Mereka muncul bergiliran saat terlihat.
  - Mode ringan Smart TV dan "kurangi gerakan" mematikan semua animasi baru.
  - Di HP sempit, gelembung kata dan tokoh melayang di penutup disembunyikan supaya tidak menutupi teks.
- **Garis progres di atas dihapus**, beserta CSS-nya.
- **Teks pembuka:** "Scan, pilih buah" menjadi "Scan, tulis nama" (netral selama aplikasi masih memakai buah).
- **e2e free tier:** ditambah jeda 800 ms setelah masuk beranda, sama seperti tes lain.
  - Tes ini gagal 2 kali berturut-turut karena klik kartu Obby terlalu cepat sehingga halaman detail tidak terbuka.
  - Setelah ada jeda, tes lulus 2 kali berturut-turut.
  - Penyebabnya waktu, bukan perubahan landing.

**Alasan:** permintaan pemilik 2026-11-23: avatar pemeran dipakai di landing page, landing terasa sepi, dan garis progres tidak perlu.

**File:**
- baru: `apps/web/src/shared/art/people.ts`, `apps/web/src/shared/art/people.test.ts`, `apps/web/src/shared/person.tsx`, `apps/web/src/shared/peopleStrings.ts`, `apps/web/src/landing/cast.tsx`;
- diubah: `apps/web/src/landing/{hero,steps,party,info,main,art}.tsx`, `apps/web/src/landing/strings.ts`, `apps/web/src/landing/landing.css`, `e2e/hoorah.spec.ts`, `PROGRESS.md`.

**Verifikasi:**
- `npm run check` lulus: 105 file tes, 1991 tes, build OK. Ada 11 peringatan lint lama, tidak ada yang baru.
- `npm run e2e`: 10 lulus, 1 gagal (free tier, karena waktu, lihat di atas). Setelah diperbaiki, tes itu dijalankan ulang 2× dan lulus. Suite penuh belum dijalankan ulang.
- `npm run docker:up` OK; `/health` → `{"ok":true,...}`. Teks baru ada di aset container, `lp-progress` sudah tidak ada.
- Tangkapan layar Playwright di 1920×1080 (16:9), 1440×900 (16:10), 1024×768 (4:3), dan HP 390×844: tanpa galat halaman, tanpa gulir menyamping. Hero, pawai, podium, harga, penutup, dan HP dicek visual.

**Berikutnya:**
- Mengganti buah di aplikasi (pemilih avatar di HP, layar utama, game, protokol `fruit` menjadi avatar) secara bertahap.
- Daftar "layar terdekat" di landing masih menampilkan buah pemain sungguhan sampai langkah itu dikerjakan.

### 2026-11-23 · Landing page di `/`, layar utama pindah ke `/main`

**Apa yang diubah:**
- **Alamat** (`apps/web/src/main.ts`):
  - `/` = landing page; layar utama dan HP = `/main`; `/R/<kode>` dan `?r=` tetap langsung ke halaman gabung.
  - Perangkat yang pernah menjalankan layar utama (`hoorah.screenUsed`) langsung ke `/main`; `/?depan` tetap menampilkan landing.
  - `?tv`, `?ctrl`, `?diag` tidak berubah.
- **Landing page** (`apps/web/src/landing/`, dibuat oleh agent, ±13 KB gzip, gambar game dimuat setelah tampil pertama):
  1. Hero dengan tombol Mulai main sekarang / Gabung pakai kode. Di HP: kotak kode 6 angka paling atas, plus kartu "Ada layar Hoorah di Wi-Fi ini" dari `/api/nearby`.
  2. Cerita 3 langkah dengan perangkat menempel saat digulir.
  3. Etalase 30 game: dua baris bergeser berlawanan arah, saring suasana, chip GRATIS.
  4. Mode Pesta: 5 kotak terbuka bergiliran, lalu podium.
  5. Cocok untuk.
  6. Perangkat + angka menghitung naik.
  7. Gratis vs Pass: "Harga segera hadir", Coba gratis 60 menit.
  8. Tanya jawab.
  9. Ajakan penutup + kaki halaman (privasi/syarat "segera").

  Juga:
  - Animasi muncul saat digulir, fruit parallax, hormat "kurangi gerakan".
  - Navigasi panah dan remote; zoom diizinkan di landing.
  - Judul dan meta deskripsi/OG di `index.html` ("Hoorah: game pesta di layar mana pun"); belum ada gambar OG.
- **Default yang dipakai** (4 keputusan belum dijawab pemilik): alamat seperti di atas, harga "segera hadir", 9 bagian, tanpa tombol WhatsApp.
- e2e memakai `/main`; tes baru untuk landing. CLAUDE.md mencatat alamat baru.

**Alasan:** permintaan pemilik 2026-11-23.

**File:** `apps/web/src/main.ts`, `apps/web/src/landing/*` (baru: `main.tsx`, `hero.tsx`, `steps.tsx`, `showcase.tsx`, `party.tsx`, `info.tsx`, `art.tsx`, `artLoader.ts`, `motion.ts`, `nav.ts`, `logic.ts`, `logic.test.ts`, `strings.ts`, `landing.css`), `apps/web/index.html`, `e2e/hoorah.spec.ts`, `e2e/host-offer.spec.ts`, `CLAUDE.md`, `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: 11 peringatan lint (5 lama + 6 urutan spesifisitas di `landing.css`), 1984 tes, build.
- `npm run e2e`: 11/11 lulus, termasuk tes landing: tombol mulai ke `/main`, kunjungan ulang langsung `/main`, `/?depan`, HP mengetik kode lalu masuk ke halaman nama.
- Agent memeriksa tangkapan layar di 1920×1080, 1440×900, 1024×768, 390×844, 320×568 (tanpa gulir menyamping, tanpa galat konsol). Saya meninjau hero, cerita langkah, etalase, Mode Pesta, harga, FAQ, dan penutup.
- `npm run docker:up` → `/health` ok; `/`, `/main`, `/R/123456` = 200 HTML; judul baru dan teks landing ada di aset.

**Selanjutnya / catatan:**
- Belum dicoba di Smart TV dan HP sungguhan.
- Gambar pratinjau OG (1200×630) belum ada.
- Halaman privasi/syarat belum ada.
- Di layar 4K murni (3840 px CSS), logo bilah atas terlihat kecil.
- Peringatan lint `landing.css` bisa dirapikan.

### 2026-11-23 · Tombol Lainnya di remote, tanda Gratis/Coba/PASS, hitung mundur Pass, jam kode di admin

**Apa yang diubah:**
- **Remote HP:**
  - Tautan "Punya kode Hoorah Pass?" dan "Laporkan masalah" di atas D-pad dihapus, karena sering tertekan tidak sengaja.
  - Baris tombol jadi 3+3: Kembali, Beranda, Ganti Host / Getar, **Lainnya**, Keluar.
  - Lainnya membuka lembar berisi kode Pass dan Laporkan masalah.
  - Lobi pemain: tautan dipindah ke tombol Lainnya di baris Getar/Keluar.
- **Tanda akses:**
  - Layar utama (bilah atas beranda dan halaman gabung) menampilkan chip abu-abu "Gratis · 2 pemain", oranye "Coba gratis · N menit", kuning "PASS · sisa 23:59:59" (hitung mundur jika < 48 jam) atau "PASS · sampai <tanggal jam>", biru "Uji coba · semua terbuka".
  - HP: badge di bawah nama (Gratis / Coba gratis · N mnt / PASS / Uji coba).
- Pengingat toast 30 dan 5 menit sebelum Coba gratis/Pass habis.
- Saat Pass habis: toast. Game yang sedang jalan tetap selesai, lalu tawaran Pass muncul sekali ("Hoorah Pass sudah berakhir").
- **Admin:** kode sekali pakai menampilkan "Mulai <jam>, habis <jam>"; kode promo menampilkan "Pertama dipakai <jam>". Server mengirim `firstStartedAt`/`lastRunsUntil`.
- Pass 1 hari = tepat 24 jam sejak kode pertama dipakai di layar.

**Alasan:** permintaan pemilik 2026-11-23.

**File:**
- `apps/web/src/controller/{room.tsx,common.tsx,strings.ts,controller.css}`
- `apps/web/src/screen/{components.tsx,store.ts,strings.ts,screen.css,pages/JoinPage.tsx,pages/OfferOverlay.tsx}`
- `apps/web/src/shared/{when.ts,ui.tsx}`
- `apps/web/src/admin/{pass-card.tsx,strings.ts,csv.test.ts,logic.test.ts}`
- `apps/server/src/{passes.ts,admin/service.ts}`, `packages/protocol/src/admin.ts`
- `e2e/hoorah.spec.ts`, `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: 5 peringatan lint lama, 1964 tes, build.
- `npm run e2e`:
  - 8 lulus, 2 gagal: tes Pass masih mencari `.pass-chip` lama, dan Dapur ikut gagal karena saklar semua terbuka tidak dikembalikan.
  - Locator diganti `.access-chip.is-pass`, lalu kedua tes lulus.
- Uji Playwright (server DB memori):
  - kode sekali pakai 1 hari dipakai lewat Lainnya, lalu layar utama menampilkan "PASS · sisa 23:59:59" dan HP badge PASS;
  - admin mencatat mulai dan habis tepat 24 jam;
  - remote di 320×568 dan 568×320: nama dan badge terlihat, tidak ada tombol di atas D-pad.
- `npm run docker:up` → `/health` ok, teks baru ada di aset container.

**Selanjutnya:** coba di HP sungguhan.

### 2026-11-23 · Fase 0 MVP: gratis vs Pass, Coba gratis, kode voucher, iklan promo, pengaduan, galat, pengaturan admin

**Apa yang diubah** (dikerjakan 4 agent paralel dengan kontrak bersama di `packages/protocol/src/access.ts`, lalu disambungkan):
- **Protokol:**
  - `RoomAccess` (free/trial/pass/open), `AppConfig`, hello layar membawa id layar.
  - Pesan baru: `{t:'trial'}`, welcome/room membawa `access` + `config`, `{t:'config'}`, `{t:'trial',ok:false}`, `{t:'turnedAway'}`.
  - `PassKind` (shared/single/promo), PassReject `used`, `LIMITS.premiumPlayers` 16.
  - Tipe admin untuk config, pengaduan, galat, dan pembuatan kode massal.
- **Server:**
  - Migrasi 3 (kolom pass, `entitlements`, `trials`, `settings`, `reports`, `error_groups`).
  - Akses room open > pass > trial > free. Kursi: gratis 2, pass sesuai kode, trial/open 16.
  - Kode sekali pakai menempel ke layar (pindah maks 1x/6 jam); kode promo dengan kuota per layar.
  - Coba gratis 1x per layar (maks 3 layar per alamat per 30 hari).
  - `POST /api/report` dan `/api/errors` (dibatasi per alamat).
  - Admin: config, pengaduan, galat, buat kode massal.
  - Layar utama diberi tahu saat pemain ke-3 ditolak.
  - `OPEN_ALL=1` menyalakan "semua terbuka" sampai pemilik menyimpan pengaturan.
- **Layar utama:**
  - Daftar gratis + Game Minggu Ini (bergilir Senin WIB, `shared/freeTier.ts`).
  - Chip PASS / GRATIS MINGGU INI.
  - Tawaran Pass (game terkunci, Mode Pesta, pemain ke-3, Coba gratis habis).
  - Chip hitung mundur Coba gratis.
  - Acak hanya game yang bisa dimainkan bagi room gratis.
  - Warna Hutan 1–5 saja tanpa Pass.
  - Iklan promo 15 dtk tidak bisa dilewati (`screen/ads.ts` + `pages/AdBreak.tsx`). Aturannya: setiap 2 game selesai, jarak minimal 10 menit, bukan sebelum game pertama, bukan di Mode Pesta. Game berikutnya di-prefetch selama iklan, dan iklan selesai sendiri bila Coba gratis/Pass aktif.
  - Petunjuk "Laporkan masalah" di halaman gabung.
  - Pencatat galat (juga dari iframe game).
- **HP:**
  - "Punya kode Hoorah Pass?" di lobi dan remote Host (PassEntry), kode `used`, Coba gratis dari lembar Pass.
  - Lembar "Laporkan masalah" di remote, lobi, dan menu jeda/pemain.
  - Pencatat galat.
  - Selama iklan, HP menampilkan "Bersiap, game dimulai…" dan Host tetap bisa memakai D-pad.
- **Admin `/admin/`:**
  - Jenis kode (bersama/sekali pakai/promo), buat sampai 500 sekaligus, salin semua/unduh CSV, chip jenis + pemakaian.
  - Tab Pengaturan (semua terbuka, iklan, angka-angka, lama Coba gratis, Game Minggu Ini), tab Pengaduan (status Baru/Diproses/Selesai), tab Galat.
- **Docker lokal:** `OPEN_ALL=1` (uji coba semua terbuka). VM tidak berubah: bawaan mati, nyalakan di admin.

**Alasan:** keputusan pemilik 2026-11-23 (PRD 3.4.2).

**File (ringkas):**
- `packages/protocol/src/{access.ts (baru),access.test.ts (baru),messages.ts,pass.ts,admin.ts,constants.ts,validate.ts,index.ts,protocol.test.ts}`
- `apps/server/src/{db.ts,passes.ts,rooms.ts,limiter.ts,index.ts,config.ts,settings.ts (baru),trials.ts (baru),reports.ts (baru),rooms.access.test.ts (baru),reports.test.ts (baru),rooms.pass.test.ts,admin/*}`
- `apps/web/src/admin/*` (+ `settings-tab`, `reports-tab`, `errors-tab`, `csv`, `feedback`)
- `apps/web/src/screen/{store.ts,strings.ts,components.tsx,main.tsx,screen.css,ads.ts,prefetch.ts,adStrings.ts,reportContext.ts,pages/*}`
- `apps/web/src/shared/{freeTier.ts,report.ts,reportStrings.ts,ui.tsx}`
- `apps/web/src/controller/{store.ts,pass.tsx,report.tsx,room.tsx,ingame.tsx,main.tsx,setup.tsx,strings.ts,controller.css}`
- `apps/web/src/games/warna/*`, `apps/web/vite.config.ts`, `apps/web/src/env.d.ts`
- `docker/compose.yaml`, `playwright.config.ts`, `e2e/hoorah.spec.ts`
- `PRD-Hoorah.md` (3.4.2), `PLAN.md` (3b), `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: 5 peringatan lint lama, 1964 tes dalam 103 file, build.
- `npm run e2e`:
  - 10 tes. Run pertama 9 lulus + 1 gagal (tes baru "free tier": chip Coba gratis hanya ada di beranda).
  - Setelah tes diperbaiki: lulus.
  - Tes lain lulus dengan saklar semua terbuka dimatikan/dinyalakan lewat API admin untuk bagian batas gratis.
- Uji manual (dev server, DB memori, iklan dipercepat): iklan tampil sebelum Kuis, HP Host menyembunyikan Pilih game, game mulai setelah hitung mundur, tanpa galat.
- Agent memeriksa tata letak HP 320×568 dan 568×320 (tanpa gulir/perkecil) dan dashboard 390/1280 px.
- `npm run docker:up` → `/health` ok, `POST /api/report` = 204 (migrasi jalan di DB Docker yang ada), teks baru ada di aset container.

**Selanjutnya / catatan:**
- Belum dicoba di HP dan layar sungguhan.
- Versi aplikasi di laporan masih `dev` pada build Docker/GitHub, karena `.git` tidak ikut build. Perlu `ARG HOORAH_VERSION` di Dockerfile + build-arg di workflow.
- Pilihan game di HP Host (picker) belum menampilkan chip PASS.
- RTT HP belum ikut di laporan.
- Galat yang terjadi sangat awal saat game dimuat belum tertangkap.

### 2026-11-23 · QR: pinggiran 2 kotak, abu-abu #B8B8B8

**Apa yang diubah:**
- Pinggiran terang QR 2 kotak (dari 3). Batas aman: lebih tipis lagi, latar gelap menempel ke kotak penanda.
- Latar `#B8B8B8` (dari `#C4C4C4`), kontras dengan hitam ±10:1.

**Alasan:** pemilik 2026-11-23: scan secepat dan seoptimal mungkin, silau sekecil mungkin.

**File:** `apps/web/src/screen/{components.tsx,screen.css}`, `PROGRESS.md`

**Verifikasi:**
- `BarcodeDetector` Chromium membaca QR di semua uji:
  - ukuran 400, 110, dan 80 px;
  - 110 px buram;
  - silau (kecerahan 160% + buram);
  - redup (50% + buram);
  - kontras 50%.
- `npm run check` lulus.
- `npm run docker:up` → `/health` ok, warna baru ada di aset container.

**Selanjutnya:** uji kamera HP sungguhan.

### 2026-11-23 · QR abu-abu, pinggiran lebih tipis

**Apa yang diubah:** latar QR `#C4C4C4` (dari `#EDEDED`) dengan kotak hitam pekat `#000`, kontras ±12:1. Pinggiran terang 3 kotak (dari 4), supaya area terang yang menyilaukan kamera di ruangan gelap lebih sedikit.
**Alasan:** pemilik 2026-11-23: layarnya sangat terang, putih di sekitar QR menyilaukan.
**File:** `apps/web/src/screen/{components.tsx,screen.css}`, `PROGRESS.md`
**Verifikasi:**
- `BarcodeDetector` Chromium membaca QR di 400 px, 110 px, 110 px buram, dan 400 px dengan kecerahan 160% + buram (simulasi silau): semuanya terbaca.
- `npm run check` lulus.
- `npm run docker:up` → `/health` ok, warna baru ada di aset container.

**Selanjutnya:** uji kamera HP sungguhan di ruangan gelap dan terang.

### 2026-11-23 · QR gabung: lebih renggang, tanpa logo, tidak silau, sudut rapi

**Apa yang diubah:**
- QR pakai tingkat koreksi L. Link produksi turun ke 25×25 kotak (dari 29×29), jadi tiap kotak ±16% lebih besar.
- Logo di tengah QR dihapus. Tanpa logo, tidak ada kotak yang perlu dikoreksi, sehingga tingkat L aman.
- Latar QR `#EDEDED`, bukan putih penuh, supaya kamera tidak silau dari dekat dan kotak hitam tidak "luber".
- Kartu QR `overflow: hidden`: sudut putih tidak lagi menyembul dari bingkai oranye yang membulat.
- `QrWithLogo` diganti `QrCard`.

**Alasan:** pemilik 2026-11-23: QR tidak rapi, dan scan dari dekat lebih lambat daripada dari jauh. Penyebabnya fokus, silau, dan pola piksel layar.

**File:** `apps/web/src/screen/{components.tsx,screen.css,pages/JoinPage.tsx}`, `PROGRESS.md`

**Verifikasi:**
- QR halaman gabung dibaca `BarcodeDetector` Chromium → `HTTP://192.168.0.104:5173/R/<kode>` (25 kotak + pinggiran 4).
- `npm run check` lulus: 5 peringatan lint lama, 1863 tes, build.
- `npm run docker:up` → `/health` ok, perubahan ada di aset container.

**Selanjutnya:** uji scan dengan kamera iPhone dan Android di jarak dekat dan jauh.

### 2026-11-23 · Petualangan Warna tanpa batas level, musik beranda lebih pelan, QR lebih cepat, bulan Lantai Runtuh

**Apa yang diubah:**
- **Petualangan Warna:**
  - Batas 4 level per sesi dihapus. Setelah tiap level (bintang tampil), fase baru `next`. HP Host menawarkan **Lanjut ke Level N** (otomatis setelah 10 detik), **Pilih level lain** (kembali ke peta dunia), atau **Selesai** (halaman hasil, menghitung semua level yang dimainkan).
  - Pemain lain melihat "Menunggu Host memilih…". Level terakhir dunia menunggu pilihan Host.
  - Di peta setelah bermain, Host juga bisa Selesai.
  - Teks "tahap" di tips diganti "level".
  - `WarnaMatch` tidak lagi menerima jumlah level; aturan otomatis `warna` tidak dipakai.
- **Musik beranda:**
  - Lagu menu 40% dari volume lagu game.
  - Memudar setelah 2 menit tanpa aktivitas (fokus, halaman, pemain baru), dan kembali pelan saat ada aktivitas.
  - Efek suara tidak berubah. Musik tetap mulai otomatis begitu browser mengizinkan suara (biasanya setelah ketukan atau klik pertama, aturan browser).
- **Beranda:**
  - Label OK di tombol bagian atas dihapus.
  - Bagian atas game menampilkan 2 baris deskripsi game, ditambah chip kontrol dan posisi HP di baris atas (kalimat pendek diganti deskripsi supaya muat di 16:9).
- **Lantai Runtuh:** bulan sabit dulu dilubangi langsung di petak, sehingga lubangnya menembus warna petak dan tampak bulatan hitam. Sekarang sabit digambar di kanvas terpisah lalu ditempel.
- **QR lebih cepat:**
  - Link `HTTPS://HOST/R/<kode>` huruf kapital (mode alfanumerik QR, 29×29 dari 33×33).
  - Pinggiran putih 4 kotak, logo 11% (dari 16%), QR di halaman gabung 260 px (dari 214).
  - `main.ts` mengubah `/R/<kode>` menjadi `/?r=<kode>`. nginx sudah mengembalikan index.html untuk path apa pun, jadi tidak perlu aturan baru.
- **Gabung lebih cepat:**
  - `Net` bisa menahan hello (`hold`/`release`). Di halaman nama, HP sudah membuka koneksi WebSocket (handshake TCP/TLS ke server selesai saat nama diketik).
  - "Masuk" hanya mengirim hello. Server uWS menjaga soket yang belum hello tetap hidup dengan ping otomatis.

**Alasan:** permintaan pemilik 2026-11-23.

**File:** `apps/web/src/games/warna/{logic.ts,logic.test.ts,driver.ts,views.ts,strings.ts,hud.tsx,main.tsx}`, `apps/web/src/shared/{automode.ts,games.ts,audio.ts,net.ts}`, `apps/web/src/screen/{store.ts,strings.ts,components.tsx,screen.css,pages/HomePage.tsx,pages/JoinPage.tsx,pages/home.css}`, `apps/web/src/controller/store.ts`, `apps/web/src/games/runtuh/scene.ts`, `apps/web/src/main.ts`, `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: 5 peringatan lint lama, 1863 tes, build. Tes Warna baru: lanjut otomatis ke level 2, kembali ke peta, Selesai, bintang maksimum mengikuti level yang dimainkan.
- `npm run e2e`: 9 dari 9 lulus.
- Playwright:
  - `/R/<kode>` di HP berubah jadi `/?r=<kode>` dan bisa masuk room. "Masuk" sampai menjadi Host ±140 ms di lokal.
  - Beranda 16:9 dan 4:3 tidak menabrak bilah atas.
- `npm run docker:up` → `/health` ok. `http://192.168.0.104:1010/R/123456` = 200 HTML. Teks "Lanjut ke Level" ada di aset container.

**Selanjutnya / catatan:**
- QR huruf kapital dan bunyi/getar perlu dicoba dengan kamera HP sungguhan (iPhone dan Android).
- Simbol bulan dan alur level Warna belum dilihat langsung di layar (diuji lewat tes logika).
- Kecepatan buka halaman dari Indonesia baru akan banyak membaik dengan Cloudflare Pages (tahap terpisah).

### 2026-11-23 · HP: D-pad cincin, menu jeda gaya remote tanpa gulir, "Jadi Host?" selalu terlihat

**Apa yang diubah:**
- **D-pad remote Host** (`ringpad.tsx`): lingkaran penuh dibagi empat potongan melengkung (atas/kanan/bawah/kiri, garis X tipis) dengan OK oranye di tengah.
  - Ketukan di mana pun dalam seperempat cincin dihitung sebagai arah itu.
  - Tepi 3D, tombol turun saat ditekan, getar.
  - Ukurannya ikut ruang yang ada (tegak dan mendatar).
  - D-pad kotak lama dan CSS-nya dihapus.
- **Tombol bawah remote:** baris tombol punya wadah sendiri (container query). Kalau lebarnya < 380 px, lima tombol jadi 3 + 2 dengan ukuran huruf yang sama, jadi "Kembali" dan "Beranda" tidak menempel lagi.
- **Menu jeda Host dan menu pemain:**
  - Satu layar tanpa gulir dan tanpa diperkecil di semua ukuran.
  - Tombol gaya remote: kotak 3D, ikon besar di kotak berwarna, label di bawah.
  - Host: Lanjutkan, aksi 2×2 (Tambah pemain, Ulang, Ganti Host, Keluar game), satu baris sakelar Musik/Suara/Getar (hijau "Nyala", abu-abu "Mati").
  - Pemain: Lanjut main, kode room untuk ajak teman, Kode Pass/Getar/Keluar room.
  - HP tegak: tombol dikumpulkan di bawah dekat jempol. HP mendatar: dua kolom.
  - Ikon baru `music` dan `ticket`. Kotak konfirmasi: Batal dan Ya dalam satu baris.
- **Tambah pemain di HP:** info cara bergabung dihapus (sudah tampil di layar utama). Isinya satu baris pendek, tombol **Selesai**, dan **Kode Pass** (membuka popup Pass).
- **Layar belakang popup bergerak:**
  - Mutasi yang masuk/keluar `.sheet`, atau terjadi di dalamnya, tidak lagi memicu hitung ulang `fit.ts`.
  - Kelas `fit-scroll` (menu bergulir) dihapus karena menu sudah muat.
- **Ganti Host:** pertanyaan "Jadi Host?" tertutup layar "Putar HP-mu" (z-index 90 di atas sheet 80), sehingga pemain tujuan tidak melihatnya.
  - Sheet tawaran sekarang `.sheet-top` (z-index 95).
  - HP tujuan bergetar, berbunyi dua nada pendek (Web Audio), sheet bergoyang, dan ada hitungan "Sisa N detik untuk menjawab" (batas 30 detik dari `LIMITS.hostOfferMs`).

**Alasan:** permintaan pemilik 2026-11-23.

**File:** `apps/web/src/controller/{ringpad.tsx (baru),room.tsx,ingame.tsx,hostoffer.tsx,fit.ts,strings.ts,controller.css}`, `apps/web/src/shared/ui.tsx`, `e2e/hoorah.spec.ts`, `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: 5 peringatan lint lama, 1863 tes, build.
- `npm run e2e`:
  - Run pertama: 8 lulus, 1 gagal (teks lama "Hanya Host yang bisa menjeda." dan "QR tampil di layar utama").
  - Tes diperbarui, lalu "full flow" lulus. Tes Ganti Host (`host-offer.spec.ts`) dan tombol arah (Kanan/OK dipakai di beberapa tes) lulus.
- Audit Playwright di 320×568, 360×640, 390×844, 568×320, 640×360, 740×360, 844×390 untuk remote Host, lobi, menu jeda, Tambah pemain, konfirmasi keluar, dan menu pemain: semuanya `--fit-s` = 1 (tidak diperkecil) dan tidak meluap (tidak perlu gulir).
- D-pad Kanan memindah fokus layar utama (party → random).
- "Jadi Host?" tampil di atas layar "Putar HP-mu" saat game mendatar berjalan.
- `npm run docker:up` → `http://192.168.0.104:1010/health` = `{"ok":true,...}`, teks baru ada di aset container.

**Selanjutnya / catatan:**
- Belum dicoba di HP sungguhan (getar, bunyi, sentuhan D-pad cincin).
- Bunyi di HP butuh izin audio browser dari ketukan sebelumnya; kalau ditolak, tetap ada getar dan goyangan.

### 2026-11-23 · Mode Pesta 5 game diacak, roda Acak, beranda "Semua", perbaikan HP (jeda, mendatar)

**Apa yang diubah:**
- **Mode Pesta:** 5 game (dulu 3). Isinya diacak ulang setiap kali mulai dan tidak terlihat dulu. Game panjang (Ular Tangga, Ludo, Catur, Juragan; penanda `long` di katalog) tidak ikut.
- **Halaman pesta baru** (`page 'party'`, ke HP dikirim sebagai `loading`):
  - "Pesta dimulai!" dengan 5 kotak (kotak 5 = Grand Final, poin ganda). Kotak berikutnya mengacak lalu berhenti di game yang dimainkan. Hitung mundur 5 detik (8 detik setelah game). OK langsung main, Kembali keluar pesta.
  - Setelah tiap game tampil klasemen: batang poin, +poin game terakhir, dan "X menyalip Y".
  - Setelah Grand Final: podium Juara Pesta, dengan "Pesta lagi" dan "Ke beranda".
  - Halaman hasil game saat pesta: tombol "Lihat klasemen" / "Lihat juara" dengan hitung mundur. Tabel lama di halaman hasil dihapus.
- **Beranda:**
  - Tombol kecil Mode Pesta/Acak diganti dua kartu khusus di depan setiap baris, dan Mode Pesta terpilih saat beranda dibuka.
  - Poster besar di bagian atas: Mode Pesta berupa kolase game dengan "?" dan mahkota, Acak berupa roda.
  - Tombol aksi di bagian atas bisa diklik mouse atau sentuh.
  - Acak membuka roda besar (maks 10 game yang cocok jumlah pemain), berbunyi tiap irisan, lalu "Terpilih" dengan Main sekarang / Putar lagi.
- **Tab:**
  - "Semua" jadi tab pertama dan default. Urutannya per layar: cocok jumlah pemain dulu, lalu yang baru dimainkan di layar ini, lalu game baru, lalu yang tidak cocok, lalu "segera".
  - "Pas untuk kalian" pindah ke posisi kedua.
  - Pilihan game di HP Host mengikuti urutan yang sama (tanpa judul kategori).
- **Kartu terpotong:** baris pertama digeser setinggi padding atas, sehingga cincin fokus terpotong. Perbaikan: geser dihitung dari baris pertama, padding atas 22 px, tinggi area 372 px.
- **HP, jeda dan tambah pemain:** `fit.ts` memperkecil seluruh layar kalau isinya tidak muat, sehingga font terlihat mengecil. Menu dalam game (`.fit-scroll`) sekarang hanya dirapatkan lalu digulir, tidak pernah diperkecil.
- **HP mendatar:** pill HOST bertumpuk dengan pill Kode di HP kecil.
  - Grid status sekarang `auto 1fr auto`, dengan HOST di tengah sisa ruang.
  - Lewat container query, "Terhubung" tinggal titik di bawah 320 px dan label "Kode" hilang di bawah 230 px.

**Alasan:** permintaan pemilik 2026-11-23.

**File:** `apps/web/src/screen/{party.ts,party.test.ts,store.ts,main.tsx,strings.ts,specialArt.tsx}`, `apps/web/src/screen/pages/{HomePage.tsx,PartyPage.tsx,WheelOverlay.tsx,ResultsPage.tsx,home.css,party.css}`, `apps/web/src/shared/{games.ts,homeRows.ts,homeRows.test.ts}`, `apps/web/src/controller/{picker.tsx,common.tsx,fit.ts,ingame.tsx,controller.css}`, `e2e/hoorah.spec.ts`, `PRD-Hoorah.md` (bab 9, catatan Mode Pesta 2026-11-23), `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: lint 5 peringatan lama, 1863 tes, build.
- `npm run e2e`: 8 lulus, 1 gagal (Acak sekarang membuka roda, bukan detail). Tes disesuaikan, lalu kedua tes "same Wi-Fi" lulus.
- Tangkapan layar Playwright:
  - beranda 16:9, 16:10, 4:3;
  - roda berputar dan berhenti tepat di irisan terpilih;
  - halaman pesta (awal, klasemen, juara) dan klasemen 4:3;
  - HP Host mendatar 568/640/667/740 px dan tegak 320 px: tidak ada tumpukan;
  - menu jeda dan tambah pemain mendatar: font sama dengan layar lain.
- `npm run docker:up` → `http://192.168.0.104:1010/health` = `{"ok":true,...}`, teks "Pesta dimulai" ada di aset container.

**Selanjutnya / catatan:**
- Belum dicoba di HP dan Smart TV sungguhan.
- Satu game pesta selesai sungguhan belum dimainkan ujung ke ujung; klasemen dan juara diuji dengan mengisi skor lewat store.
- Penyusup ikut pesta (tidak ditandai panjang); tandai `long` kalau terasa lama.

### 2026-11-23 · Image dibangun di GitHub Actions, VM hanya mengambil (tahap A)

**Apa yang diubah:** workflow `Check` sekarang punya job kedua `image` (hanya push ke `main`, setelah lint/typecheck/tes lulus) yang membangun `docker/Dockerfile` target `release` dan mendorongnya ke `ghcr.io/jarki0402-alt/hoorah` dengan tag `latest` dan `sha-<7 karakter commit>` (cache GitHub Actions). `deploy/vm/update.sh` tidak lagi membangun: setelah `git pull`, ia mengambil `sha-<commit HEAD>`, menunggu sampai 15 menit kalau GitHub masih membangun (cek tiap 20 dtk, `HOORAH_IMAGE_WAIT`), langsung berhenti dengan petunjuk kalau package masih Private, lalu menandai image `hoorah-server:<commit>` dan memasang seperti sebelumnya (file web, tautan `current`, cek sehat, rollback otomatis, bersih-bersih). Build di VM tetap ada sebagai jalan darurat `HOORAH_BUILD_LOCAL=1` (dengan cek memori 1000 MB lama). `DEPLOY.md` (alur, langkah 4, 6a package Public, 6b update, masalah umum), komentar `docker/Dockerfile` dan `deploy/vm/compose.yaml`, serta `CLAUDE.md` (tabel stack + aturan server) diperbarui.
**Alasan:** keputusan pemilik 2026-11-23: build di VM membebani Suwwara (RAM + swap ±1 GB sesaat). Membalik keputusan 2026-11-16.
**File:** `.github/workflows/check.yml`, `deploy/vm/update.sh`, `deploy/vm/compose.yaml`, `docker/Dockerfile`, `DEPLOY.md`, `CLAUDE.md`, `PLAN.md`, `PROGRESS.md`
**Verifikasi:** `bash -n deploy/vm/update.sh` lulus. `update.sh` diuji di Mac dengan `docker`/`curl`/`sleep` tiruan: (1) image belum ada lalu muncul → menunggu, tag `hoorah-server:<commit>`, salin web, pasang (berhenti di `mv -T` yang khusus Linux, sama seperti sebelumnya); (2) "denied" → pesan package Private, keluar; (3) tidak pernah muncul → pesan tab Actions setelah batas waktu. YAML workflow dan compose VM valid (`ruby -ryaml`, `docker compose config -q`). Image target `release` dibangun lokal, `/web` berisi 9 entri. `npm run docker:up` → `http://192.168.0.104:1010/health` = `{"ok":true,...}`. Job GitHub `image` belum diverifikasi sampai pemilik push.
**Selanjutnya / catatan:** pemilik push, cek tab Actions, jadikan package Public (DEPLOY.md 6a), lalu `update.sh` di VM. Berikutnya tahap A2 (update di titik aman + protokol N/N-1), lalu Cloudflare.

### 2026-11-23 · Commit semua pekerjaan lokal + catatan rancangan produksi

**Apa yang diubah:** semua perubahan sejak `18d6481` di-commit (push oleh pemilik). `PLAN.md` bab 3a mencatat diskusi produksi yang ditahan: nama, game gratis, skema Pass, harga, QRIS di layar utama, update tanpa ganggu pemain, build di GitHub, TURN Cloudflare.
**Alasan:** pemilik minta commit sekarang dan harga disimpan dulu sebelum masuk PRD.
**File:** `PLAN.md`, `PROGRESS.md` (dokumen); commit mencakup seluruh perubahan kode 2026-11-22.
**Verifikasi:** `npm run check` (lint + typecheck + tes unit + build) lulus sebelum commit. Docker tidak dijalankan ulang karena kode tidak berubah sejak pemeriksaan 2026-11-22. `docker/.env.example` tidak ikut commit (menunggu pemilik memeriksa isinya).
**Selanjutnya / catatan:** pemilik `git push`; langkah Cloudflare (TURN key) oleh pemilik; build di GitHub dan kode TURN menunggu "eksekusi".

### 2026-11-23 · PLAN.md: catatan serah terima antarsesi

**Apa yang diubah:** file baru `PLAN.md` berisi keadaan sekarang, yang sudah selesai sejak commit `18d6481`, yang akan dikerjakan (ketajaman kanvas 9 game Phaser + 10 game Three.js, Petualangan Warna lanjutan, commit), yang belum terealisasi (status Antrean + catatan tersisa), dan skema yang sudah diterapkan (pindah Host, Ludo segi-N, Petualangan Warna, Beranda, `deviceScale()`). `CLAUDE.md` menyuruh membaca `PLAN.md` di awal sesi.
**Alasan:** pemilik akan membersihkan chat dan minta semua dicatat.
**File:** `PLAN.md` (baru), `CLAUDE.md`, `PROGRESS.md`
**Verifikasi:** hanya dokumen, tidak ada kode yang berubah.
**Selanjutnya / catatan:** tunggu "eksekusi" untuk item di PLAN.md bab 3.

### 2026-11-22 · Petualangan Warna baru, Ludo segi 5–8, pindah Host dengan persetujuan, Beranda baru

**Apa yang diubah:**
- **Petualangan Warna** (rancangan disetujui pemilik):
  - Lompat selalu 2,5 petak, ditahan = lompat lagi saat mendarat. Coyote 0,15 s, buffer 0,20 s, kontrol udara +50%, lari penuh setelah joystick lewat 25%. Ada geser sudut atap dan naik tepi (0,3 petak).
  - HP: setengah kanan layar = LOMPAT (opsi `jumpZone`, hanya game ini), dengan tombol kecil TUKAR/TANDA, ?, LEWATI, ULANG di kanan atas.
  - Kejelasan: kabel tuas/tombol ke pintu, pembuka yang menyorot pintu keluar, petunjuk 2 tahap (? berdenyut setelah 45 s), papan bantu diam-diam setelah 3 kali jatuh di kolam yang sama, Host bisa Lewati level setelah 3 menit.
  - Dunia + level: Hutan 1–30 baru (papan kayu tembus, jamur pantul), Gua 1–6 (ide 6 peta lama digambar ulang), Gurun/Salju/Awan "Segera hadir". Pilih dunia + level di HP Host, peta perjalanan 30 titik di layar utama, 3 bintang, kemajuan disimpan di browser layar utama (`hoorah.warna.progress.v2`). Gerbang warna dipasangkan untuk 3–4 warna.
  - Latar Hutan dan Gua lebih hidup (lapisan paralaks, daun, sinar, kunang-kunang), gerak ambient dikurangi jika di bawah 45 FPS selama 3 s.
- **Ludo**: tim dihapus. 2–4 pemain papan klasik, 5–8 pemain papan segi 5 sampai segi 8 (petak per sisi 11/9/7/7, 53–60 langkah pulang, klasik 56). 8 warna: merah, hijau, kuning, biru, merah muda, tosca, oranye, cokelat. Panel pemain menyesuaikan jumlah. Nama "test4" 3 kali di screenshot pemilik = nama kembar, bukan bug.
- **Pindah Host dengan persetujuan**:
  - Protokol: `hostOffer`/`hostOfferCancel`/`hostReply` dari HP; `hostOffer`/`hostOfferEnd`/`hostChanged` dari server; `LIMITS.hostOfferMs` 30 s.
  - Server: maks 1 permintaan per room, hanya Host aktif yang boleh menawarkan, hanya target yang boleh menjawab, batal jika Host berganti atau salah satu keluar.
  - HP: tombol "Ganti Host" di pad Host dan menu jeda, dialog Terima/Tolak.
  - Toast di layar utama.
- **Beranda**: satu layar tanpa gulir panjang. Hero game yang difokus, dua tombol cepat (Mode Pesta, Acak game), satu baris rak (Pas untuk kalian, Heboh, Adu Otak, Ramai-ramai, Santai, Semua) yang sama dengan grup di HP, grid 5×2 yang bergeser per baris. Poster besar dan baris bertumpuk (game muncul hingga 3 kali) dihapus.

**Alasan:** permintaan pemilik 2026-11-22 ("eksekusi semua"): kontrol Petualangan Warna tidak enak (lompat harus ditahan), peta mepet dan membingungkan; Ludo 5+ pemain jadi beregu; perlu serah Host dengan persetujuan; Beranda berantakan dengan 30 game.

**File:**
- Petualangan Warna:
  - baru: `apps/web/src/games/warna/{maps-hutan,maps-gua,palette}.ts`
  - diubah: `levels.ts`, `reach.test.ts`, `world.ts`, `logic.ts`, `driver.ts`, `views.ts`, `hud.tsx`, `scene.ts`, `textures.ts`, `thumb.ts`, `strings.ts`, `tutorial.ts`, `warna.css`, `world.test.ts`, `logic.test.ts`
  - `apps/web/src/controller/thumbs/warna.ts`
- Ludo:
  - `apps/web/src/games/ludo/{logic,geometry,board-art,colors,strings,store,screen,driver,brain,results,views,tutorial}.ts(x)`, `ludo.css`, `logic.test.ts`, `brain.test.ts`
  - `apps/web/src/shared/art/ludo.ts`, `apps/web/src/shared/games.ts`
- Pindah Host:
  - `packages/protocol/src/{messages,validate,constants}.ts` + tes
  - `apps/server/src/rooms.ts`, `apps/server/src/rooms.hostoffer.test.ts`
  - `apps/web/src/controller/{hostoffer.tsx,store.ts,strings.ts,room.tsx,ingame.tsx,controller.css,pad.tsx,pad.css}`
  - `apps/web/src/screen/{store.ts,strings.ts}`
  - `e2e/host-offer.spec.ts`, `e2e/hoorah.spec.ts`
- Beranda: `apps/web/src/screen/pages/{HomePage.tsx,home.css}`, `apps/web/src/screen/homeFocus.ts`, `apps/web/src/shared/{homeRows.ts,homeRows.test.ts}`
- Dokumen: `PRD-Hoorah.md` (Ludo, Petualangan Warna, ROLE-02), `PROGRESS.md`

**Verifikasi:**
- `npm run check` lulus: 94 file, 1858 tes, build. Dua teks tutorial (Ludo, Warna) terlalu panjang dan sudah dipendekkan.
- `npm run e2e` lulus 9/9, termasuk `host-offer.spec.ts` baru.
- `npm run docker:up` exit 0, `/health` `{"ok":true}`. Teks baru ("Ganti Host", "segi 5", "Pas untuk kalian", "Bawa semua ke pintu warnanya") ditemukan di aset container.
- Beranda: screenshot 16:9, 16:10, 4:3 tanpa tumpang tindih.
- Ludo: dicek visual 5/7/8 pemain di 16:9, 16:10, 4:3.
- Petualangan Warna: dicek di 1280×720 + Pixel 7. Belum dicek di 16:10 dan 4:3, maupun di HP/layar sungguhan.

**Selanjutnya / catatan:**
- Petualangan Warna:
  - urutan kerja sama (siapa menahan tombol mana) belum dicek mesin, hanya ditinjau manual;
  - aturan "maks 3 lompatan berbahaya berturut-turut" belum ditegakkan, belum ada pemecah otomatis;
  - Gua 7–30, Gurun, Salju, Awan menyusul setelah pemilik mencoba Hutan.
- Ludo: tema HP masih 4 warna klasik (hiasan saja).
- Vitest butuh Node 22 (Node 20 di PATH default gagal start).

### 2026-11-22 · Perbaikan: Dapur masih pecah di laptop (skala layar utama tidak terhitung)

**Apa yang diubah:** penyebab sebenarnya: game berjalan di iframe di dalam `.tv-stage` yang diperbesar layar utama dengan CSS transform (dasar 1280 px, mis. 1,5x di layar 1080p, 1,18x di MacBook). Dapur hanya melihat ukuran iframe (1280 px) dan devicePixelRatio, jadi kanvasnya terlalu kecil lalu diregangkan browser. Perubahan sebelumnya malah membuat laptop 1080p DPR 1 lebih buram (kanvas 1280 px, dulu 1920). Sekarang `deviceScale()` baru di `common/stage.ts` ikut menghitung pembesaran iframe (kotak `frameElement` di layar / lebar iframe, aman jika bukan same-origin). Skala dibulatkan ke atas per 0,25 (lebih besar sedikit tetap tajam), dicek ulang tiap detik karena layar utama bisa memperbesar tanpa event resize di iframe. Pengaman dilonggarkan: di bawah 40 FPS selama 4 detik.
**File:** `apps/web/src/games/common/stage.ts`, `apps/web/src/games/dapur/{textures.ts,main.tsx}`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (93 file, 1754 tes, build). `npm run docker:up` exit 0, `/health` ok. Probe Playwright di Docker: 1920x1080 DPR 1 kanvas 1920x1080 (pas layar); 1512x982 DPR 2 kanvas 3200x2080 (layar fisik 3024). Chromium dengan GPU Mac: 60 FPS di 3200x2080, pengaman tidak turun, close-up tajam tanpa piksel. Chromium tanpa GPU: turun sendiri ke 2560 (pengaman bekerja).
**Berikutnya:** game kanvas lain (Phaser: Rusun, Tarik; Three.js: Bajaj, Lari, Juragan, Obby, dll.) kemungkinan punya masalah regangan yang sama; menunggu keputusan pemilik.

### 2026-11-22 · Dapur Heboh selalu HD + pengaman otomatis

**Apa yang diubah:** pembatas resolusi menurut level grafis 3D (`common/gfx`) dibuang khusus Dapur (2D ringan): kanvas selalu setajam layar, maksimal 3x (panel 4K); tekstur 3x bila layar butuh lebih dari 2x. Pengaman: jika FPS di bawah 45 selama 3 detik berturut-turut (tab tersembunyi tidak dihitung), ketajaman turun satu tingkat (3 → 2,5 → 2 → 1,5), lalu diberi jeda 2 detik. Tidak pernah di bawah 1,5 (setelan lama, 1920x1080), jadi Smart TV yang browsernya 1080p tidak terpengaruh. Hanya berlaku selama game berjalan, tidak disimpan.
**Alasan:** pemilik 2026-11-22: Dapur harus HD di perangkat apa pun.
**File:** `apps/web/src/games/dapur/{textures.ts,main.tsx}`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (93 file, 1754 tes, build). `npm run docker:up` exit 0, `/health` ok. Playwright di Docker 1440x900 DPR 2: kanvas mulai 2560x1600 (HD), di Chromium headless tanpa GPU (FPS 18–28) turun sendiri ke 1920x1200 setelah permainan berjalan, tanpa error. Belum dicoba di perangkat asli.
**Berikutnya:** pemilik mencoba di laptop dan Smart TV.

### 2026-11-22 · Dapur Heboh HD dipasang ke game

**Apa yang diubah:** desain "Dapur Heboh HD" (disetujui pemilik) dipasang ke game, tetap 2D (SVG dirender sekali jadi tekstur, Phaser):
- Semua alat digambar ulang 3/4: bayangan lantai, sisi depan dengan kaki gelap, permukaan atas dengan kilap tepi. Peti kayu bahan, kompor gelap dengan wajan, wajan besar, penggorengan minyak, talenan + pisau, bak cuci + keran, rak piring, gelas, tong sampah, mesin soda, loket antar krem-oranye dengan slot putus-putus.
- Papan nama di setiap alat (KOMPOR, WAJAN, PENGGORENG, TALENAN, CUCI PIRING, PIRING, GELAS, SAMPAH, MINUMAN, LOKET ANTAR, nama bahan), font Baloo, di tepi atas meja supaya tetap terbaca di kolom samping yang bertumpuk. Teks di `strings.ts`.
- Status masak: cincin di atas alat (putih + busur hijau saat masak, centang hijau saat siap, merah + "!" + asap sebelum gosong); potong (busur oranye) dan cuci (busur biru) juga cincin. Api menjilat dari bawah wajan saat menyala, gelembung minyak di penggorengan. Lampu indikator lama dihapus.
- Bawaan koki: gelembung dengan cincin warna pemain.
- Panah penanda alat: di samping alat jika koki berdiri di sebelahnya, supaya tidak menutupi papan nama alat di atasnya.
- **Ketajaman (penyebab "pecah"):** kanvas dulu selalu 1,5x panggung, jadi di laptop retina/4K gambarnya diperbesar dan buram. Sekarang resolusi kanvas mengikuti piksel layar sungguhan (skala panggung x devicePixelRatio, ikut berubah saat layar penuh), dibatasi per level grafis `common/gfx` (rendah 1,5 = sama seperti dulu untuk Smart TV, sedang 2, tinggi 2,5). Tekstur 3x untuk layar beresolusi tinggi, 2x selain itu. Di layar 720p kanvas malah lebih kecil dari dulu (lebih ringan).
**File:** `apps/web/src/games/dapur/{art.ts,scene.ts,textures.ts,main.tsx,strings.ts}`, `apps/web/src/shared/art/dapur.ts`, `PROGRESS.md`.
**Verifikasi:** `npx tsc --noEmit -p apps/web` dan `npx biome check` lulus; `npm run check` lulus (93 file, 1754 tes, build). `npm run docker:up` exit 0, `/health` `{"ok":true}`, teks "CUCI PIRING" ada di aset `dapur-*.js` container. Dimainkan otomatis (Playwright) di Docker: 1920x1080, 1440x900 DPR 2, 1024x768 (DPR 1 dan 2): papan nama terbaca semua, api + cincin status muncul saat koki komputer memasak, tanpa error halaman. E2E `solo: Dapur Heboh` lulus. FPS di Chromium headless (render perangkat lunak) 21–32, bukan ukuran perangkat sungguhan. Belum dicoba di Smart TV/laptop asli.
**Berikutnya:** pemilik mencoba di laptop dan Smart TV. Jika ada perangkat yang tersendat, buka `?diag=1` untuk menurunkan level grafis.

### 2026-11-22 · Desain ulang Dapur Heboh HD di kanvas (belum dikodekan)

**Apa yang diubah:** papan baru "Dapur Heboh HD" di kanvas Claude Design (halaman Desain 30 game): dapur 2D sudut pandang 3/4 yang tampak 3D (meja dengan permukaan atas + sisi depan + bayangan lembut, karakter berbayang), papan nama jelas di tiap alat (KOMPOR, PENGGORENG, TALENAN, CUCI PIRING, PIRING, MINUMAN, SAMPAH, PEMADAM, LOKET ANTAR), status masak (cincin hijau, centang siap, merah + asap gosong), bawaan koki di gelembung, deretan close-up alat. Kode game belum diubah, menunggu persetujuan pemilik.
**File:** kanvas `S55SjiGKSmm9RRQmVTfyH6` (`project/Dapur-HD.dc.html`, `project/canvas.json`), `PROGRESS.md`.
**Verifikasi:** papan dirender lokal (Chromium) dan diperiksa visual sebelum dipasang. Tidak ada perubahan kode.
**Berikutnya:** jika disetujui, ganti gambar Dapur Heboh dengan sprite SVG yang dirender sekali jadi tekstur (tetap 2D, 60 fps).

### 2026-11-22 · Ular Tangga 100 kotak, Nyebrang tanpa tombol panah, garis tepi kartu dihapus

**Apa yang diubah:**
- Ular Tangga memakai papan 1–100 sebagai bawaan (`automode.ts`; papan dan batas giliran 108 sudah ada, perkiraan 6–10 menit). Tutorial Ular Tangga menyebut 100.
- Nyebrang: HP seperti Lari Terus, tanpa tombol panah (`keys: false`), seluruh layar zona usap, ketuk = maju.
- Garis warna di tepi kartu (ciri tampilan "AI", dilarang pemilik) dihapus di semua game dan HP, diganti cincin penuh: Tarik (tim), Balap Karung (papan nama), Penyusup (kartu dinding), Lari Terus (baris peringkat + hasil), Ludo (tim), Ular Tangga (pemain aktif), Rebut Wilayah (feed), Petualangan Warna (legenda), Bajaj (panel mode/sirkuit), pilihan menu HP, tampilan ketuk tim. Aturan dicatat di CLAUDE.md (Desain) dan memori.
**File:** `apps/web/src/shared/automode.ts`, `games/ular/tutorial.ts`, `games/nyebrang/views.ts`, `games/{tarik,karung,wilayah}/hud.css`, `games/penyusup/penyusup.css`, `games/lari/lari.css`, `games/ludo/ludo.css`, `games/ular/ular.css`, `games/warna/warna.css`, `games/bajaj/bajaj.css`, `controller/controller.css`, `controller/views.tsx`, `CLAUDE.md`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (1754 tes, build). Ular Tangga 100 dicek di Docker pada 1920x1080, 1680x1050, 1024x768: angka terbaca, kartu pemain aktif bercincin penuh. Nyebrang: tes unit lulus; tampilan HP tidak dicek visual (konfigurasi sama dengan Lari Terus). `npm run docker:up` exit 0.
**Berikutnya:** desain ulang Dapur Heboh (HD 2D tampak 3D, label jelas) di kanvas Claude Design, menunggu persetujuan pemilik sebelum kode.

### 2026-11-22 · Joystick mengikuti jempol (bawaan) + ukuran tombol menyesuaikan HP

**Apa yang diubah:** joystick bawaan kini "Mengikuti jempol" (alas terseret di belakang jempol setelah melewati jarak, balik arah langsung terasa), kecepatan penuh di 56 px (sebelumnya 84 px, alas tetap), tetap tidak lepas selama jempol menempel. Versi setelan Lab naik ke 4: setelan joystick lama di HP dibuang supaya semua pemain dapat bawaan baru. Ukuran tombol di pojok kanan kini mengikuti layar dan jumlah tombol (variabel di `.pad-stick-wrap.bn-N`): 1 tombol 104–150 px, 2 tombol 92–132 / 74–104 px, 3 tombol 86–120 / 66–92 px (mendatar menurut tinggi layar, tegak menurut lebar); label ikut membesar; zona joystick tegak dimulai di bawah tombol yang sebenarnya. Menggantikan blok "tombol tunggal" sebelumnya.
**Alasan:** pemilik 2026-11-22: lebih suka joystick mengikuti jempol, tombol 1 jangan kecil, 2–3 tombol diperbesar, sesuai layout HP.
**File:** `apps/web/src/shared/controls.ts`, `shared/controls.test.ts`, `controller/pad.tsx`, `controller/pad.css`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus. Dicek di app Docker (WebKit iPhone, mendatar + tegak): Bom Oper OPER ±120 px; Petualangan Warna LOMPAT ±96 px, TUKAR/ULANG ±68 px (sebelumnya 84/58), tidak bertabrakan. `npm run docker:up` exit 0, `/health` ok.
**Berikutnya:** pemilik mencoba di HP. Usulan merapikan teks di atas layar HP (baris info di samping Jeda) masih di antrean. Ular Tangga 100 kotak: menunggu keputusan.

### 2026-11-22 · Tombol aksi tunggal di HP lebih besar (OPER Bom Oper)

**Apa yang diubah:** tombol aksi yang sendirian di pojok kanan (`.pad-buttons.n-1`) kini 112–136 px (HP mendatar pendek 108–124 px, tegak 112 px), sebelumnya 84–96 px; label ikut membesar. Berlaku untuk game joystick dengan satu tombol: Bom Oper (OPER), Lantai Runtuh (DORONG), Obby (LOMPAT), Ular Arena (NGEBUT). Game dengan 2–3 tombol tidak berubah.
**Alasan:** pemilik 2026-11-22: tombol OPER terlalu kecil.
**File:** `apps/web/src/controller/pad.css`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus. Dicek di app Docker (WebKit iPhone mendatar, ronde Bom Oper berjalan): tombol OPER ±120 px, tidak menabrak joystick. `npm run docker:up` exit 0, `/health` ok.
**Berikutnya:** pemilik mencoba di HP; ukuran bisa disetel lagi.

### 2026-11-22 · Cara main: tutorial singkat di ke-30 game

**Apa yang diubah:** mesin tutorial (`shared/tutorial/{types,draw,index}.ts`), tampilan layar utama (`screen/tutorial/{TutorialOverlay,PhoneMock}.tsx`, `tutorial.css`): kartu asal-usul + 3–4 langkah beranimasi (SVG/CSS, transform/opacity saja) dengan HP mini yang menyorot kontrol (joystick, tombol, ketuk/tahan, usap, pilihan, panah, ketik, papan catur, lihat). Muncul otomatis sebelum game pertama kali dimainkan di layar itu (iframe game baru dimuat sesudahnya), tersimpan per perangkat (`prefs` `tutorials`). Selesai saat semua HP menekan "Paham!", Host menekan "Lewati cara main" (HP / OK remote), atau langkah habis. Tombol "Cara main" di halaman detail dan layar jeda (mode lihat). Protokol: `page.tutorial.ready`, pesan `understood`, perintah Host `tutorial-skip`. HP: tampilan `TutorialPhone` bergaya netral. Isi tutorial ke-30 game (`games/<id>/tutorial.ts`, ditulis 4 agen paralel + 2 contoh) dengan label tombol asli dari tiap game; semua adegan dicek visual lewat lembar kontak. e2e: helper `passTutorial` (Host melewati). Keputusan dicatat di PRD 6.5.
**Alasan:** permintaan pemilik 2026-11-22.
**File:** `apps/web/src/shared/tutorial/*` (baru), `screen/tutorial/*` (baru), `screen/{store.ts,main.tsx,strings.ts,screen.css,pages/GamePage.tsx,pages/DetailPage.tsx}`, `controller/{tutorial.tsx (baru),room.tsx,store.ts,strings.ts,controller.css}`, `packages/protocol/src/messages.ts`, `games/*/tutorial.ts` (30 baru), `controller/screenmode.ts`, `e2e/hoorah.spec.ts`, `PRD-Hoorah.md`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (93 file, 1754 tes termasuk 30 tes tutorial: jumlah langkah, panjang teks, tanpa em dash, SVG sah). Overlay dicoba di app Docker sungguhan (Chromium layar + WebKit iPhone): 16:9, 16:10, 4:3 rapi; "Paham!" menutup tutorial dan game dimuat. e2e penuh: 7/8 lulus, alur penuh gagal karena layar "Putar HP-mu" menutupi tombol tutorial di game mendatar (bug nyata) → diperbaiki (`controller/screenmode.ts`: tidak minta putar selama tutorial), alur penuh diulang: lulus (2,4 mnt). `npm run docker:up` exit 0, `/health` ok, teks baru ada di aset container.
**Berikutnya:** pemilik mencoba di perangkat sungguhan; teks/adegan tutorial bisa disetel per game.

### 2026-11-22 · Suara Kampung Siluman (pilihan pemilik: semua usulan A) + detak jantung terus berdetak

**Apa yang diubah:** suara malam pindah ke modul bersama `shared/night-sounds.ts` (dipakai mesin audio dan Lab). Kampung Siluman: malam tiba `night` (gong panjang + jangkrik), giliran Siluman `growl` jadi auman ±3 dtk, Dukun `genta` (genta 3 kali; `bell` lama tetap untuk game lain), Tabib `flute` jadi suling panjang bergema, ayam `rooster` dibuat ulang mengikuti bentuk kokok asli (suara serak banyak harmoni, 3 resonansi, luncuran nada tiap suku kata, nada bawah serak, goyangan nada, suku kata terakhir panjang ±1,6 dtk; tetap tanpa file audio), setelah ayam: `kentongan` bila ada korban, `birds` bila malam aman; akhir: `win-village` / `win-siluman`. **Detak jantung** (`heart`, lebih keras dan berat, musik diredam): mulai setelah auman, berdetak terus selama giliran Siluman sampai semua Siluman memilih (`silumanChosen` baru di logika), makin cepat menjelang waktu habis (940 → 520 ms). Lab tab Suara kini memutar suara persis seperti di game. Keputusan dicatat: tutorial (antrean 11), nama game asli boleh disebut sebagai teks.
**Alasan:** pilihan pemilik 2026-11-22.
**File:** `apps/web/src/shared/night-sounds.ts` (baru), `shared/audio.ts`, `shared/music/adaptive.ts`, `packages/sdk/src/bridge.ts`, `games/siluman/{main.tsx,logic.ts,logic.test.ts}`, `lab/{sound.tsx,strings.ts,lab.css}` (`lab/siluman-sounds.ts` dihapus, isinya pindah ke modul bersama), `CLAUDE.md`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (92 file, 1724 tes, build). `npm run docker:up` exit 0, `/health` `{"ok":true}`, suara baru ada di aset container. Suara belum dinilai pemilik di perangkat; e2e tidak dijalankan (alur layar/HP tidak berubah).
**Berikutnya:** pemilik menilai ayam baru di `/lab/` → Suara (jika masih kurang mirip: opsi file rekaman CC0, perlu izin). Lalu Gelombang 2 tutorial.

### 2026-11-22 · Kursor layar utama tidak mengganggu + usulan suara Kampung Siluman di Lab

**Apa yang diubah:**
- Kursor di layar utama (laptop/Smart TV dengan pointer) hilang setelah 2,5 dtk diam atau saat tombol/remote ditekan, muncul lagi begitu mouse bergerak; berlaku juga di dalam iframe game (`shared/cursor.ts`, dipasang di `screen/main.tsx` dan `GamePage` saat iframe dimuat).
- Beranda tidak lagi meluncur sendiri karena kursor: fokus dari hover ditandai (`focus(id, true)`, `focusFromPointer()`), dan halaman hanya meluncur untuk remote/keyboard/roda mouse/HP. Hover hanya memindah fokus jika mouse benar-benar bergerak (event mouse palsu saat halaman bergeser di bawah kursor diabaikan).
- Lab `/lab/` tab baru **Suara**: usulan suara Kampung Siluman (Malam tiba, Giliran Siluman/Dukun/Tabib, Pagi tiba, plus usulan baru: kentongan tanda bahaya, detak jantung, burung pagi, warga menang, siluman menang), masing-masing tombol "Sekarang" vs Usulan A/B. Game belum diubah, menunggu pilihan pemilik.

**Alasan:** permintaan pemilik 2026-11-22.
**File:** `apps/web/src/shared/cursor.ts` (baru), `screen/{nav.ts,nav.test.ts (baru),components.tsx,main.tsx,pages/GamePage.tsx,pages/HomePage.tsx}`, `lab/{siluman-sounds.ts (baru),sound.tsx (baru),main.tsx,strings.ts,lab.css}`, `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (92 file, 1724 tes, build). `npm run docker:up` exit 0, `/health` `{"ok":true}`, kode kursor dan tab Suara ada di aset container. e2e tidak dijalankan (hanya hover mouse yang berubah; klik tetap sama). Belum dicoba di Smart TV.
**Berikutnya:** pemilik memilih suara di `/lab/` → Suara, lalu pilihan dipindah ke `shared/audio.ts` dan dipakai Kampung Siluman.

### 2026-11-22 · Joystick lebih leluasa, Petualangan Warna tanpa tumpuk pemain

**Apa yang diubah:**
- Joystick (semua game joystick, opsi A pemilik): pangkal muncul di tempat jempol menyentuh dan diam di situ; jangkauan kenop 52 → 84 px (Lab 40–140); lingkaran selalu digambar utuh di dalam layar walau jempol mendarat di tepi (keluaran tetap dihitung dari titik sentuh asli); kenop membal balik saat dilepas. Versi setelan Lab naik ke 3: setelan joystick lama tersimpan di HP dibuang.
- Petualangan Warna: karakter tidak bisa lagi berdiri di atas karakter lain (saling tembus), penghargaan "Tiang Kokoh" dan statistik `carried` dihapus. Peta disesuaikan dengan lompatan asli (2,4 petak): Tombol Injak (balok tengah 3 → 2 petak, sebelumnya menutup jalan ke pintu), Kotak, Menara, Besar (permata dipindah ke jangkauan). Tes baru `reach.test.ts` memeriksa semua permata, pintu, tombol injak, dan tuas bisa dicapai satu karakter tanpa ditumpuk, dan memastikan batas lompatan tes cocok dengan simulasi.
- HP Petualangan Warna: kolam 4 warna di bawah dihapus (terlihat seperti tombol dan menumpuk dengan petunjuk); di main sendiri avatar HP mengikuti karakter yang sedang dikendalikan (field baru `fruit` di tampilan `pad`).

**Alasan:** permintaan pemilik 2026-11-22 (tangkapan layar level 2 dan HP).
**File:** `apps/web/src/shared/controls.ts`, `shared/controls.test.ts`, `controller/pad.tsx`, `controller/pad.css`, `controller/common.tsx`, `packages/protocol/src/messages.ts`, `apps/web/src/games/warna/{world,logic,driver,views,results,strings,levels,controller-theme}.ts`, `games/warna/{world,logic}.test.ts`, `games/warna/reach.test.ts` (baru), `PROGRESS.md`.
**Verifikasi:** `npm run check` lulus (91 file, 1723 tes, build). `npm run docker:up` exit 0, `/health` `{"ok":true}`; peta baru dan `radius:84` ada di aset container. e2e tidak dijalankan (alur layar/HP tidak berubah, hanya field opsional baru). Belum dicoba di HP sungguhan.
**Berikutnya:** pemilik mencoba rasa joystick 84 px; bisa disetel di `/lab/`. Perubahan ini belum di-commit.

### 2026-11-22 · Perbaikan gambar Kampung Siluman di beranda

**Apa yang diubah:** key art Kampung Siluman tampil sebagai gambar rusak karena SVG kampung yang disisipkan punya atribut `width`/`height` ganda (XML tidak sah). Atribut bawaan adegan dibuang dulu sebelum ukuran baru dipasang.
**Alasan:** laporan pemilik (tangkapan layar beranda).
**File:** `apps/web/src/shared/art/siluman.ts`, `PROGRESS.md`.
**Verifikasi:** semua 30 key art di-render lalu dicek `xmllint`: 30/30 sah. `npx biome check` + `npx tsc --noEmit -p apps/web` lulus. `npm run docker:up` exit 0, `/health` `{"ok":true}`. `npm run check` penuh tidak dijalankan ulang (perubahan satu baris di generator SVG).
**Berikutnya:** push ke GitHub dijalankan pemilik (Git di sesi ini tidak bisa meminta kata sandi). `docker/.env.example` sengaja tidak ikut commit karena isinya belum diperiksa.

### 2026-11-22 · Gelombang B selesai + joystick pola Roblox, beranda bertingkat, pilihan bergambar, Mode Pesta

**Apa yang diubah:** joystick pola Roblox di semua game joystick (tanpa panel; mendatar: separuh kiri + tombol bulat kanan bawah; tegak: tengah bawah + baris tombol di atas), Lari Terus tanpa tombol (usap + ketuk = lompat, lompat 0,75 dtk, tabrakan memaafkan), Rusun kembali berayun (3400 ms, 1,5%/lantai, min 2400 ms, tab Rusun di Lab), beranda bertingkat (Pas untuk kalian, baris suasana, kisi Semua game, label BARU via `wave: 3`), pilihan bergambar (`MenuOption.thumb`, `controller/thumbs/*`), **Mode Pesta** (3 game, poin 3/2/1, game terakhir ganda; fitur baru, belum dicatat di PRD), game baru **Satu Tali, Bom Oper, Seluncur Es (tampilan HP `sling`), Langkah Maut (tekanan arah juga lewat kanal andal), Juara Eja, Kampung Siluman** (view `silent`, pesan `dark`).
**Alasan:** permintaan pemilik 2026-11-22.
**File:** lihat laporan agen; utama `apps/web/src/controller/{pad,sling,menu,word,views,room,store,picker}.*`, `controller/thumbs/*`, `apps/web/src/screen/{pages/HomePage,party,homeFocus,...}`, `apps/web/src/shared/{controls,homeRows,games,automode,keyart}.ts`, `apps/web/src/shared/kotak/{rope,sim}.ts`, `apps/web/src/games/{lari,rusun,tali,bom,es,langkah,eja,siluman}/*`, `packages/protocol/src/messages.ts`, `e2e/hoorah.spec.ts`.
**Verifikasi (lanjutan, selesai):** Petualangan Warna + Hantu Tak Terlihat diselesaikan dan didaftarkan lagi (peta rahasia `radar`/`heart` di `pad`). `npm run check` → lulus (90 berkas / 1716 tes, build; 3 peringatan CSS). e2e: alur penuh semua game lulus bila dijalankan sendiri (2,3 menit) setelah tes memilih game lewat pemilih HP (+ batas waktu 10 menit, ketuk ulang tab bila daftar belum siap) dan dua perbaikan bug pemilih HP (tab kategori di layar dianggap "Semua"; laporan tab sementara dari layar diabaikan sampai layar tiba, `controller/picker.tsx`); saat seluruh suite dijalankan, 7/8 lulus dan alur penuh sempat gagal karena daftar pemilih belum siap (sudah diberi ketuk ulang, suite penuh belum diulang); tes simulasi Lantai Runtuh diberi batas 30 dtk. `npm run docker:up` → `http://192.168.0.104:1010/health` ok; Warna, Hantu, Kampung Siluman, Satu Tali ada di aset `/srv`. Tombol menu HP disembunyikan saat layar malam gelap. Mode Pesta + beranda dicatat di PRD 6.3.
**Selanjutnya / catatan:**
- Semua 30 game sudah ada. Belum ada tes e2e khusus per game baru; rasa kontrol, fisika, tempo, dan performa Smart TV perlu dicoba pemilik di perangkat sungguhan.
- Berikutnya (antrean): STUN + TURN Cloudflare (item 10).

### 2026-11-22 · Gelombang A: fondasi kontrol + audio, Rusun troli, 4 game baru (Obby, Lantai Runtuh, Penyusup, Nyebrang)

**Apa yang diubah:**
- **Fondasi kontrol:** `shared/controls.ts` (satu sumber setelan joystick/usap/getar/runner, bisa ditimpa per perangkat lewat localStorage `hoorah.controls`), `shared/haptics.ts` (Android `navigator.vibrate`; iPhone trik saklar + kedipan pengganti), **Lab Kontrol** `/lab/` (Joystick, Usap dengan pratinjau Lari Terus asli, Getar A–J + Diagnosa getar iPhone 1–4).
- **Lari Terus lebih mulus:** usap cepat dikenali, pindah jalur 0,14 dtk (ease-out), lompat lebih cepat, lompatan yang telat karena jeda dikejar tanpa loncat visual, bunyi/efek seketika, panel jeda + jenis sambungan di `/?tv=1&diag=1`.
- **Audio:** musik adaptif (`tier` per kanal, `musicIntensity`, `musicHurry`, ducking), bunyi baru (tock, weker, gong, rooster, growl, bell, flute, round, stinger-win, stinger-fall), tanpa file audio; lagu lama berbunyi sama.
- **Rusun:** lantai digeser troli lurus di rel crane, menggantung 64 px di atas puncak menara, tanpa pantulan; tingkat sulit setara.
- **Mesin dunia kotak 3D** (`shared/kotak/`: fisika murni + renderer three.js) dan **4 game baru:** Obby, Lantai Runtuh (DORONG dengan cincin jeda 3 dtk, `PadButton.cooldownMs`), Penyusup (tampilan HP baru `peek` kartu tahan-untuk-intip, bank 241 pasang ID + 250 EN), Nyebrang (pixel 2.5D, 4 map, Balapan/Bertahan).
- Katalog: Gambar Kilat dan Panjat Pinang dihapus (entri, poster, automode, tes disesuaikan). Dokumen: PRD 6.3/6.4, CLAUDE.md, DEPLOY.md (IP), status.
**Alasan:** keputusan pemilik 2026-11-22 (Gelombang 3 bergelombang, lokal dulu).
**File:** `apps/web/src/shared/{controls,haptics}.ts`, `apps/web/src/lab/*`, `apps/web/lab/index.html`, `apps/web/src/controller/{pad,peek,views,room,store,strings,themes,main}.tsx/ts/css`, `apps/web/src/shared/device.ts`, `apps/web/src/main.ts`, `apps/web/src/games/{lari,rusun}/*`, `apps/web/src/shared/music/*`, `apps/web/src/shared/audio.ts`, `packages/sdk/src/{index,bridge}.ts`, `apps/web/src/screen/{bridge,store}.ts`, `apps/web/src/shared/kotak/*`, `apps/web/src/games/{obby,runtuh,penyusup,nyebrang}/*`, `apps/web/games/{obby,runtuh,penyusup,nyebrang}/index.html`, `apps/web/src/shared/art/{obby,runtuh,kotak,penyusup,nyebrang,extra}.ts`, `apps/web/src/shared/{games,games.test,keyart,automode}.ts(x)`, `apps/web/vite.config.ts`, `packages/protocol/src/messages.ts` (+ tes), `PRD-Hoorah.md`, `CLAUDE.md`, `DEPLOY.md`.
**Verifikasi:** `npm run check` → lulus (lint, typecheck, 71 berkas / 1499 tes unit, build). `npx playwright test` → 8/8 lulus (3,8 menit). `npm run docker:up` → `http://192.168.0.104:1010/health` `{"ok":true,...}`; teks Obby/Lantai Runtuh/Penyusup/Nyebrang/Diagnosa getar ada di aset `/srv`, "Gambar Kilat" tidak ada. Hanya container Hoorah yang hidup. Tampilan game baru dicek agen lewat tangkapan layar Playwright 16:9/16:10/4:3; belum dicoba di HP sungguhan.
**Selanjutnya / catatan:**
- **Getar iPhone (iOS 27.2.1 pemilik): semua uji di Lab tidak bergetar, termasuk saklar asli yang diketuk langsung** → getar lewat web tertutup di iOS ini; iPhone memakai kedipan pengganti. Opsi "tuk" dari speaker menunggu keputusan pemilik.
- Belum ada tes e2e untuk 4 game baru. LOMPAT/DORONG lewat kanal andal (lompatan tinggi tetap). Validasi `peek` ada di logika game (server meneruskan kanal game apa adanya, cek ukuran/rate). Label katalog game sosial tertulis "Butuh 3 pemain" (bukan teks khusus "3+ pemain").
- Perlu disetel pemilik di perangkat: rasa joystick/usap (Lab), lompat Nyebrang, durasi lintasan Obby, kekuatan DORONG, batas tebakan Si Kosong 10 dtk, kartu intip di iOS.
- Alamat LAN Mac berubah ke `192.168.0.104`. Container kunai diubah ke `restart=no` agar tidak hidup sendiri.
- Gelombang berikutnya: Satu Tali, Bom Oper (memakai mesin dunia kotak), Seluncur Es, Langkah Maut, Juara Eja, Petualangan Warna, Hantu Tak Terlihat, Kampung Siluman.

### 2026-11-22 · Desain 12 game baru di kanvas Claude Design

**Apa yang diubah:** halaman baru "Desain 30 game" di kanvas desain pemilik. Isinya papan "Kenapa orang betah di Hoorah" (12 prinsip psikologi, pola sesi, orientasi kontroler, batas etis), 12 papan game baru (Satu Tali sampai Penyusup: layar utama, HP sesuai orientasi, alur babak, cara main, alasan betah), dan 3 papan referensi game lama (Lama-1, Lama-2, Lama-4; dihentikan karena pemilik memutuskan tampilan game lama tidak diubah dulu). Juara Eja dibuat ulang lebih sederhana atas permintaan pemilik.
**Alasan:** pemilik minta desain detail sebelum coding; 11 desain disetujui, Juara Eja direvisi.
**File:** `PROGRESS.md` (hanya catatan; papan desain ada di kanvas, bukan di repo).
**Verifikasi:** tidak ada kode yang berubah. Papan dicek otomatis: ukuran root, tanpa em dash, tanpa kata "TV". Tidak dirender di sini.
**Selanjutnya / catatan:** tunggu keputusan pemilik soal aturan tambahan dari agen desain (Bom Oper: 3 nyawa, Arwah Jahil, 2 bom di ronde akhir; Seluncur Es: Penjaga Ombak, poin ganda; Langkah Maut: ikut lagi babak berikutnya, pesan nyaris rekor), pocong di Kampung Malam (sengaja tidak dipakai), dan Rusun (tetap di antrean atau ditunda). Tata letak halaman kanvas belum dirapikan (publikasi tata letak ditolak izin otomatis).

### 2026-11-22 · Antrean perubahan dari diskusi pemilik dicatat

**Apa yang diubah:** bagian baru "Antrean perubahan" di atas berisi 9 hal yang ingin diubah pemilik (kode Pass di layar, pembayaran, Suwwara terganggu, joystick ala Roblox, rasa usap Lari Terus, gaya 2.5D, perbaikan Rusun, Gelombang 3 berisi 12 game baru yang disetujui pemilik sehingga katalog jadi 30, rapikan dokumen).
**Alasan:** pemilik minta "simpan dulu apa saja yang mau saya ubah"; semua masih diskusi.
**File:** `PROGRESS.md`
**Verifikasi:** hanya dokumen, tidak ada kode yang berubah.
**Selanjutnya / catatan:** tunggu keputusan pemilik per item dan kata "eksekusi".

### 2026-11-16 · Kuis Nusantara: bank soal 104 → 474, soal yang baru keluar tidak diulang

**Permintaan pemilik:** soal Kuis Nusantara masih sedikit, perbanyak.
**Apa yang diubah:**
- Bank soal dipecah per kategori: `kuis/bank/{budaya,bahasa,kuliner,alam,geografi,sejarah}.ts`, dengan bentuk dan aturan bersama di `kuis/bank/define.ts`. `questions.ts` tetap memuat 104 soal awal (`CORE`) lalu menggabungkan semuanya.
- **370 soal baru**, ditulis oleh 3 agent paralel dengan batas topik yang tegas:
  - Budaya +60, Bahasa +50, Kuliner +60, Alam +70, Geografi +70, Sejarah +60.
  - Total per kategori: Budaya 97, Geografi 84, Alam 80, Kuliner 78, Sejarah 74, Bahasa 61.
  - Fakta yang tidak pasti dicek ke web (KBBI, Kemendikbud, situs taman nasional, Wikipedia, Indonesia.travel, dan lain-lain). Yang tidak terverifikasi atau masih diperdebatkan dibuang, misalnya 1965, Serangan Umum 1 Maret, perancang lambang Garuda, Sofifi, dan perbatasan Sebatik.
  - Claude memeriksa sendiri ke-370 soal beserta jawabannya.
- **Soal tidak berulang:** layar mengingat 300 soal terakhir (`localStorage` `hoorah:kuis:recent`, pola sama dengan Kompak Gak?). `prepareQuestions` memakai soal yang belum keluar lebih dulu, baru soal lama kalau habis. Dengan 10 soal per permainan, sekitar 30 permainan berturut-turut tanpa soal ulang.
- Tes baru: tidak ada dua soal dengan teks pertanyaan sama (antar-file), dan soal baru lebih diutamakan daripada soal yang baru keluar.
**File:** `apps/web/src/games/kuis/{questions,logic,main}.ts(x)`, `apps/web/src/games/kuis/bank/*` (baru), `apps/web/src/games/kuis/logic.test.ts`.
**Verifikasi:**
- `npm run check` → lulus (1379 tes, build). Panjang soal, pilihan, dan fakta sesuai batas; 0 em dash.
- `npm run e2e` → 8/8 lulus (3,4 menit, termasuk alur lengkap dengan Kuis).
- `npm run docker:up` → `/health` ok, soal baru ada di aset container (`kuis-*.js`).
**Selanjutnya:** pemilik push; di VM `update.sh` membangun versi ini.

### 2026-11-16 · Batas memori build di VM dilonggarkan (diukur), update.sh menjalankan versi barunya sendiri

**Masalah (laporan pemilik):** `update.sh` menolak build di VM: RAM tersedia 331 MB + swap kosong 1154 MB = 1485 MB, kurang 15 MB dari batas 1500 MB. Batas itu sebelumnya perkiraan, bukan hasil ukur. Swap VM: `/swapfile` 1 GB + zram ±480 MB (dari Suwwara).
**Apa yang diubah:**
- Diukur di container Linux (node:22-trixie-slim, sama dengan Dockerfile): `npm ci` puncak 245 MB (49 dtk), build web puncak 716 MB (3 dtk di Mac; jauh lebih lama di e2-micro). Batas `update.sh` diturunkan ke **1000 MB** (puncak + ±200 MB). `HOORAH_FORCE_BUILD=1` didokumentasikan sebagai jalan paksa.
- `update.sh`: kalau `git pull` mengubah `update.sh`, versi baru langsung dijalankan (`exec`). Sebelumnya bash tetap membaca salinan lama sampai selesai, jadi perbaikan baru berlaku di run berikutnya.
- DEPLOY.md dan CLAUDE.md: angka 1,5 GB diganti hasil ukur.
**File:** `deploy/vm/update.sh`, `DEPLOY.md`, `CLAUDE.md`, `PROGRESS.md`.
**Verifikasi:** `bash -n` lulus. `update.sh` diuji di Linux (repo di `/home/fajarrizky04febriano/hoorah`): build 6e9ab21, pasang, sehat, exit 0. Image `hoorah-server:latest` milik Docker Mac tidak tersentuh.
**Selanjutnya:** pemilik push, lalu di VM `git pull` sekali dan jalankan `update.sh`. Catatan VM: `.env` saat ini ditulis satu baris dengan koma, sehingga admin tidak terbuat. Harus tiga baris terpisah.

### 2026-11-16 · Deploy: build langsung di VM seperti Suwwara, path VM, langkah firewall rinci

**Keputusan pemilik:** build di server (VM) saja, "yang pakem", seperti Suwwara. Folder di VM `/home/fajarrizky04febriano/hoorah`. Swap sudah dipasang lewat Suwwara. Minta langkah firewall GCP yang jelas.
**Apa yang diubah:**
- `deploy/vm/update.sh` ditulis ulang:
  - Urutannya: `git pull --ff-only`, `docker build --target release` di VM (tag `hoorah-server:<commit>`, dilewati kalau commit itu sudah pernah dibangun), salin `/web` ke `/srv/hoorah/web-<commit>`, pindahkan tautan, restart, rollback otomatis kalau tidak sehat.
  - **Pemeriksaan memori sebelum build:** RAM tersedia + swap kosong minimal 1,5 GB. Kalau kurang, build ditolak dengan pesan, supaya Suwwara tidak ikut mati kehabisan memori.
  - Pembersihan hanya menghapus tag versi buatan skrip ini (7 heksadesimal); image lain tidak disentuh.
- GitHub Actions: `release.yml` (membuat image) diganti `check.yml` (lint, typecheck, tes unit saja). Tidak ada lagi image di GitHub.
- `scripts/stun-check.mjs`: cek dari Mac apakah UDP 3478 di VM terbuka (`node scripts/stun-check.mjs 35.212.247.252`).
- DEPLOY.md ditulis ulang:
  - Path lengkap `/home/fajarrizky04febriano/hoorah`.
  - Swap cukup dicek, karena sudah dipasang lewat Suwwara. Swap kedua `/swapfile-hoorah` hanya dibuat kalau `update.sh` menolak build, supaya swap Suwwara tidak tertimpa.
  - Firewall `hoorah-stun` diuraikan per kolom Console, ditambah perintah Cloud Shell dan cara mengecek.
  - Peringatan jangan `sysctl --system`.
- CLAUDE.md:
  - Aturan "jangan build di VM" diganti keputusan baru, dengan syarat build hanya lewat `update.sh`.
  - Baris Deploy VM dan `.github` diperbarui.
- Komentar di `deploy/vm/compose.yaml` dan `docker/Dockerfile` diperbarui.
**File:** `deploy/vm/update.sh`, `deploy/vm/compose.yaml`, `docker/Dockerfile`, `.github/workflows/check.yml` (dulu `release.yml`), `scripts/stun-check.mjs`, `DEPLOY.md`, `CLAUDE.md`, `PROGRESS.md`.
**Verifikasi:**
- Kebutuhan memori build:
  - Build Docker (target `build`) dibatasi 700 MB tanpa swap: **gagal, exit 137** (kehabisan memori di `vite build`).
  - Dibatasi 700 MB + swap 1,5 GB: **lulus**.
  - `npm run build` di Mac: puncak RSS ±560 MB.
- `update.sh` diuji di Linux (container docker-cli, repo di `/home/fajarrizky04febriano/hoorah`):
  - Build pertama: build, salin, pasang, sehat, exit 0.
  - Commit yang sama: tidak dibangun ulang, exit 0.
  - `rollback.sh`: sehat.
  - Image `hoorah-server:latest` milik Docker Mac tidak tersentuh (sebelum perbaikan, pembersihan mencoba menghapusnya dan skrip berhenti dengan error).
- `stun-check.mjs`: ke Docker Mac (3479) "OK", ke port tertutup "TIDAK ADA JAWABAN".
- `npm run lint` → lulus (585 file), `bash -n` ketiga skrip VM → lulus.
**Selanjutnya / catatan:**
- Pemilik menjalankan DEPLOY.md di VM (langkah 2–5).
- Selama build di VM (5–15 menit pertama kali), Suwwara bisa sedikit melambat. Lakukan saat sepi.
- Package `ghcr.io/jarki0402-alt/hoorah` yang mungkin sudah terbuat dari push pertama tidak dipakai lagi. Boleh dihapus dari GitHub → Packages.

### 2026-11-16 · Siap produksi: nginx menggantikan Caddy, deploy ke VM lewat GitHub Actions, indikator admin ala Suwwara, joystick seragam

**Keputusan pemilik:** pakai nginx (bukan Caddy), jangan ganggu Suwwara di VM yang sama, push ke GitHub `jarki0402-alt/hoorah`, sertakan langkah push/pull, nginx, Cloudflare, dan firewall; indikator admin "kayak di Suwwara"; joystick game lain dibuat seperti Dapur Heboh. Pembayaran ditunda.
**Apa yang diubah:**
- **nginx:**
  - `deploy/nginx/hoorah-server.conf` berisi semua aturan Hoorah dan dipakai di Mac maupun VM: cache, gzip_static, model GLB, `/admin/` tidak di-cache dan tidak boleh di-iframe, `/ws` dan `/api` ke server, pembatas per alamat, header nosniff dan referrer, IP asli ditulis ulang di X-Forwarded-For.
  - `deploy/nginx/hoorah.fajarrizky.my.id` khusus VM: HTTPS dari certbot dan daftar IP Cloudflare untuk keadaan darurat. Semua nama diawali `hoorah_`.
  - `docker/nginx.conf` khusus Mac. Caddyfile dihapus.
  - File web dikompres saat build (`scripts/precompress.mjs`: 99 file, 9,8 MB jadi 3,8 MB).
- **Deploy:**
  - `.github/workflows/release.yml`: lint, typecheck, dan tes unit, lalu image `ghcr.io/jarki0402-alt/hoorah` (target `release` = server + file web).
  - `deploy/vm/compose.yaml`: hanya server, `127.0.0.1:8790`, UDP 3478, `mem_limit` 320 MB, `/sys` host dibaca untuk data keluar.
  - Skrip VM: `deploy/vm/update.sh` (pasang versi baru, tautan file web atomik, rollback otomatis kalau tidak sehat), `rollback.sh`, `backup.sh` (`VACUUM INTO`, simpan 14).
  - `DEPLOY.md`: langkah demi langkah.
  - CLAUDE.md diperbarui: Deploy lokal, Deploy VM, struktur folder, dan aturan 4 (file web dari VM, keputusan pemilik).
- **Docker lokal:** STUN memakai port 3479 (`VITE_STUN_PORT`) supaya Docker, `npm run dev`, dan e2e bisa jalan bersamaan. Sebelumnya port 3478 bentrok dan dua tes WebRTC e2e gagal saat Docker menyala. VM tetap memakai 3478.
- **Indikator admin** (dibuat agent, ditinjau):
  - Migrasi DB versi 2: tabel `system_samples`, `net_counter`, `net_hourly`, `usage_hourly`, `game_hourly`, `admin_events`, `meta`.
  - Tab **Server**:
    - RAM dan CPU langsung, dengan label Normal/Tinggi/Kritis.
    - Layar, HP, room, dan pemain yang sedang tersambung, jalur langsung dibanding lewat server, dan data relay per detik.
    - Data keluar VM dibanding jatah 200 GiB: bulan dipotong menurut waktu Pacific, perkiraan akhir bulan, grafik 14 hari, deteksi awan oranye Cloudflare, dan cek free tier.
    - Kartu Server, Aplikasi (dibanding target 300 MB), Database, dan Riwayat 24 jam / 7 hari / 14 hari.
  - Tab baru **Pemakaian** (tanpa nama): room, game dimainkan, peta jam ramai, dan game terpopuler.
  - Tab baru **Keamanan**: login admin dan kode Pass salah, dengan IP.
  - Pesan `status` dari layar membawa `direct` (jumlah HP yang tersambung langsung).
- **Joystick seragam:** Ular Arena, Rebut Wilayah, dan Dapur Heboh sama-sama memakai joystick mengambang. NGEBUT di Ular Arena menjadi tombol bulat besar di bawah jempol kanan (ditahan), dengan tema "biji menyala". Judul di HP sempit (320–400 px) dikecilkan supaya tidak terpotong.
**File:** `deploy/nginx/*`, `deploy/vm/*`, `docker/{Dockerfile,compose.yaml,nginx.conf}` (Caddyfile dihapus), `scripts/precompress.mjs`, `.github/workflows/release.yml`, `DEPLOY.md`, `CLAUDE.md`, `apps/web/src/shared/rtc.ts`, `apps/server/src/metrics/*` (baru), `apps/server/src/{index,rooms,db,config}.ts`, `apps/server/src/admin/{api,service}.ts`, `apps/server/src/rooms.events.test.ts`, `packages/protocol/src/{admin,messages,validate}.ts` dan tesnya, `apps/web/src/admin/*`, `apps/web/src/screen/{rtc,store}.ts`, `apps/web/src/games/arena/{views,strings,logic.test}.ts`, `apps/web/src/games/arena/controller-theme.css`, `apps/web/src/controller/pad.css`.
**Verifikasi:**
- `npm run check` → lulus (60 file tes, 1377 tes, build). Agent juga menjalankan tes dengan `TZ=UTC`, seperti di GitHub Actions: lulus.
- `npm run e2e` → 8/8 lulus **dengan Docker menyala** (3,5 menit). Sebelum port STUN Docker dipindah, 2 tes WebRTC gagal; lulus setelah dipindah.
- nginx VM: `nginx -t` di container nginx 1.28 yang memuat konfigurasi Suwwara apa adanya (termasuk HTTP/3 `reuseport`) ditambah situs Hoorah → `syntax is ok` dan `test is successful`.
- `update.sh` diuji dua versi lalu `rollback.sh`, dijalankan di Linux (container docker-cli). Tautan current/previous benar, server sehat. `backup.sh` menghasilkan SQLite valid, dan langkah pemulihan di DEPLOY.md sudah diuji (database kembali, server sehat).
- `npm run docker:up` → `/health` ok. Diuji dengan curl: gzip dan immutable untuk `assets/`, GLB `model/gltf-binary`, `/admin` dialihkan ke `/admin/` (relatif), X-Frame-Options, API 401 tanpa login, SPA fallback, `/games/dapur/` 200, nosniff. Layar dan HP masuk room lewat LAN dan lewat domain tanpa galat. Lewat domain, nginx mencatat IP asli pengunjung (bukan gateway Docker).
- Joystick dilihat di Pixel 7 dan iPhone SE: Ular Arena mendatar, Rebut Wilayah tegak, keduanya diam dan sedang digeser. Tanpa galat konsol.
**Selanjutnya / catatan:**
- Pemilik menjalankan `DEPLOY.md`: token GitHub, push, firewall UDP 3478, `.env`, `update.sh`, Cloudflare (lepas tunnel, A record abu-abu), certbot, nginx.
- `docker/.env.example` tidak ikut commit: isinya tidak bisa diperiksa Claude (aturan izin). Pemilik cek dulu, lalu commit kalau hanya contoh.
- Docker Desktop di Mac: STUN menjawab dengan alamat NAT Docker (192.168.65.1), jadi browser uji di Mac yang sama jatuh ke jalur server. HP sungguhan di Wi-Fi diharapkan tetap langsung lewat kandidat host; belum diuji di perangkat. Di VM Linux alamat pengirim tidak diganti.
- `/api/admin/stats` lama dan beberapa formatter lama masih ada tapi tidak dipakai UI.

### 2026-11-16 · Dapur Heboh: meja renggang dan sorotan meja yang tidak loncat-loncat

**Masalah (laporan pemilik):** saat koki bergeser, meja sebelah ikut terpilih. Penyebab: meja yang disorot dihitung dari pinggir meja terdekat, jadi di sambungan dua meja keduanya sama dekat dan sorotan berganti tiap geseran kecil.
**Apa yang diubah (Opsi A dari desain "Meja renggang" di canvas Dapur Heboh, disetujui pemilik):**
- **Tampilan:** setiap meja digambar 5 px lebih ramping di kiri dan kanan (`ST_INSET`), jadi lantai terlihat di antara meja. Letak, jumlah, dan tabrakan meja tidak berubah. Kompor digeser sedikit supaya tetap di dalam meja (posisi isi dan nyala ikut).
- **Aturan memilih meja (`findTarget`):** kecocokan diukur ke tengah meja (untuk loket dua ubin: tengah ubin terdekat), bukan pinggirnya. Meja yang sedang disorot dipertahankan sampai meja lain lebih cocok minimal 0,2 (`TARGET_STICK`). Selama Kerja ditahan, meja terkunci selama masih terjangkau.
- **Sorotan:** bingkai warna koki mengikuti meja yang lebih ramping, ditambah panah kecil yang bergoyang di atas meja (atau di bawahnya jika koki berdiri tepat di belakang meja baris bawah, supaya tidak menutupi koki).
- Keset pijakan (Opsi B) tidak dipasang.
**File:** `apps/web/src/games/dapur/{art.ts,scene.ts,logic.ts,logic.test.ts}`.
**Verifikasi:**
- `npx vitest run apps/web/src/games/dapur` → 59 lulus (4 tes baru: sambungan dua meja, sorotan bertahan lalu pindah, kunci saat Kerja, loket dua ubin). Tes simulasi ronde penuh asisten komputer tetap lulus.
- `npm run check` → lulus (1340 tes, build).
- `npx playwright test -g "Dapur Heboh"` → lulus. Tangkapan layar Warung Pagi, Dapur Terbelah (4:3), dan Gerobak Kembar dicek: celah terlihat, panah di tempat yang benar, tanpa galat konsol.
- `npm run docker:up` → `/health` `{"ok":true}`, kode panah baru ada di aset container (`dapur-*.js`), domain `/games/dapur/` 200.
**Selanjutnya / catatan:** rasakan di HP sungguhan; jika sorotan masih terasa terlalu lengket atau terlalu cepat pindah, angka `TARGET_STICK` (0,2) tinggal disetel.

### 2026-11-16 · Dapur Heboh (game 18), joystick mengambang, kode room satu baris, IP asli lewat Cloudflare

**Apa yang diubah:**
- **Dapur Heboh (`dapur`)**, masak kerja sama satu tim (PRD 6.3), sesuai desain yang disetujui pemilik (canvas Claude Design):
  - Tampilan 3/4 dengan Phaser 3 dan tekstur prosedural (`art.ts`, `textures.ts`, `scene.ts`), HUD Preact, simulasi murni 60 Hz di `logic.ts`.
  - 4 dapur: Warung Pagi, Dapur Terbelah, Gerobak Kembar (gerobak bergeser di Heboh), Jam Sibuk (kompor pindah di tengah ronde). 3 tingkat: Santai, Normal, Heboh.
  - Sisi Persiapan dapat ceil(n/2) pemain, sisanya Sisi Masak; Host bisa menukar dari HP. Main sendiri: 1 asisten komputer di Sisi Masak (`brain.ts`), makin cekatan setelah ronde buruk.
  - Lempar tanpa membidik ke teman terdekat di seberang. Tangan penerima penuh: barang jatuh, baju kotor (dicuci di bak). Santai: hanya ke teman bertangan kosong.
  - Resep: burger, salad, kentang goreng, nasi goreng telur, soda (mesin soda), paket burger + soda. Gosong dan kebakaran (Heboh) dengan pemadam.
  - Hasil ronde: bintang tim, penghargaan lucu, lalu podium platform (semua peringkat 1).
  - Lagu baru "Wajan Goyang", poster, tema kontroler dapur.
- **Joystick lebih enak (semua game dengan joystick):** joystick kini mengambang. Pusatnya muncul di tempat jempol pertama menyentuh panel, gerak penuh cukup 52 px (sebelumnya harus sampai tepi lingkaran 200 sampai 340 px), pusat ikut tergeser jika jempol melewati batas, zona mati 14% lalu diskalakan ulang, getar kecil per arah.
- **Protokol tampilan HP (`PadButton`):** game bisa memberi sampai 3 tombol (tap atau tahan, ikon, warna), chip "Dibawa", dan peringatan (kuning/merah) yang tampil di baris status supaya tidak menutupi joystick.
- **Kode room satu baris** di halaman gabung layar utama (`white-space: nowrap`, kolom tengah menyesuaikan).
- **Caddy:** `trusted_proxies private_ranges` + `client_ip_headers CF-Connecting-IP X-Forwarded-For`, supaya pengunjung lewat Cloudflare Tunnel tidak terbaca satu alamat yang sama (berpengaruh ke batas login, Pass, kode salah, dan layar terdekat).
**File:** `apps/web/src/games/dapur/*` (baru, termasuk 4 file tes), `apps/web/games/dapur/index.html`, `apps/web/src/shared/{games.ts,automode.ts,keyart.tsx,ui.tsx}`, `apps/web/src/shared/art/dapur.ts`, `apps/web/src/shared/music/songs/{dapur.ts,index.ts}`, `apps/web/vite.config.ts`, `apps/web/src/controller/{pad.tsx,pad.css,strings.ts,themes.ts,main.tsx}`, `packages/protocol/src/messages.ts`, `apps/web/src/screen/screen.css`, `docker/Caddyfile`, `apps/server/src/admin/auth.ts` (format saja), `e2e/hoorah.spec.ts`, PRD 6.3 dan 6.4, CLAUDE.md.
**Verifikasi:**
- `npm run check` → lulus (lint, typecheck, 57 file tes / 1336 tes, build).
- `npm run e2e` → 8/8 lulus (3,4 menit), termasuk tes baru "solo: Dapur Heboh": pilih dapur dan tingkat dari HP, asisten komputer muncul, cincin joystick tepat di titik sentuh, kenop mengikuti geseran, tombol Ambil/Kerja/Lempar tampil.
- Main sungguhan lewat Playwright (1 layar + 3 HP): keempat dapur, semua tingkat, lempar/tangkap/kena, hasil ronde → podium → Main lagi; tanpa galat konsol. Layar dicek di 16:9, 16:10, 4:3.
- `npm run docker:up` → `/health` `{"ok":true}`, `/games/dapur/` 200, teks baru ada di aset container ("Sentuh di mana saja", "Wajan Goyang", "Tanganmu penuh"), `.room-code` berisi `white-space:nowrap`, Caddyfile container berisi `trusted_proxies`. Domain `https://hoorah.fajarrizky.my.id/health` → 200.
**Selanjutnya / catatan:**
- IP asli lewat Cloudflare belum terlihat langsung di log (belum ada pengunjung sesudah deploy); konfigurasi sudah dimuat Caddy.
- Dapur Heboh: label nama bisa bertumpuk saat dua koki berdiri atas-bawah; lengkung lempar antar koki baris belakang melintasi kompor.
- Peringatan yang dipindah ke baris status belum difoto di HP sungguhan.
- Shell: sesudah restart sesi, `node` bawaan v20; jalankan perintah dengan Node 22 (`~/.nvm/versions/node/v22.21.1/bin`).

### 2026-11-16 · Kontroler Android kembali tegak, Hoorah Pass uji coba (kode bersama), dashboard admin, SQLite

**Masalah:** di HP Android, game tegak sesudah game mendatar tetap tampil mendatar. Kode hanya mengunci mendatar untuk game "Mendatar"; untuk game "Tegak" hanya melepas kunci, sehingga HP yang masih dipegang menyamping tetap mendatar. Layar "Putar HP-mu" juga hanya satu arah.
**Apa yang diubah:**
- **Orientasi HP (`controller/screenmode.ts`, `room.tsx`):**
  - Setiap game mengunci orientasinya sendiri: Mendatar ke landscape, **Tegak ke portrait** (Android layar penuh). Di luar game, layar tetap ikut cara HP dipegang.
  - Layar "Putar HP-mu" kini dua arah: "Game ini dimainkan tegak. Pegang HP berdiri." dengan pilihan "Tetap mendatar". Muncul di iPhone, dan di Android tanpa layar penuh.
  - Bug kecil diperbaiki: game yang selesai sebelum kunci terpasang kini tetap melepas kuncinya.
- **Hoorah Pass tahap uji coba** (keputusan pemilik: kode bersama, sementara; PRD 3.4.1, CLAUDE.md):
  - **Protokol (`packages/protocol/src/{pass,admin}.ts`, `messages.ts`, `validate.ts`):**
    - `hello` boleh membawa `pass`.
    - Pesan baru: `{t:'pass', code}`, `{t:'room', maxPlayers, pass}`, jawaban `{t:'pass', ok|reason}`, dan `{t:'status'}` dari layar utama (untuk dashboard).
    - Kode galat baru `pass_invalid`, `pass_expired`, `pass_busy`.
    - Tipe dan validasi API admin dipakai bersama server dan web.
  - **Server (`rooms.ts`, logika tetap murni lewat antarmuka `PassLookup`):**
    - Kode Pass membuka kursi room sampai batas Pass.
    - Batas room bersamaan per kode.
    - Batas 10 kode salah per menit per alamat.
    - Saat Pass berakhir atau dicabut, tidak ada pemain yang dikeluarkan, tetapi kursi tidak bertambah.
    - Ubahan admin (perpanjang, cabut, hapus) langsung berlaku di room yang sedang memakai Pass.
    - Pass ikut tersimpan di snapshot dan diperiksa ulang saat server dipulihkan.
  - **Database:** SQLite bawaan Node (`db.ts`, migrasi `user_version`, WAL). Tabel `admins`, `admin_sessions`, `passes`, `pass_uses`. Lokasi file: `DB_FILE`; di Docker `/data/hoorah.db` di volume yang sama dengan snapshot.
  - **Admin:**
    - **Login:** kata sandi scrypt; sesi berupa cookie httpOnly SameSite=Strict, yang disimpan di database hanya hash-nya; berlaku 7 hari. Maksimal 8 login gagal per 15 menit per alamat. Setiap permintaan yang mengubah data wajib membawa header `x-hoorah-admin: 1`.
    - **API** `/api/admin/{login,logout,me,password,passes,passes/:id,rooms,stats}`.
    - **CLI** `node server.js admin set|list|remove` (`npm run admin -w @hoorah/server -- set admin`). Kata sandi acak dicetak sekali.
    - **Seed opsional** `ADMIN_USERNAME`/`ADMIN_PASSWORD`, hanya saat belum ada admin.
  - **HP:**
    - Halaman "Room penuh" kini punya kolom "Kode Pass" + "Pakai Pass & masuk".
    - Kartu Tambah pemain/Ajak teman: "Punya kode Hoorah Pass?" membuka lembar kode.
    - Kode yang berhasil diingat sampai Pass berakhir dan dikirim otomatis saat masuk room berikutnya.
    - Teks di `controller/strings.ts`.
  - **Layar utama:**
    - Toast "Hoorah Pass aktif!" dan "Pass sudah berakhir".
    - Chip kuning "Pass sampai …" di halaman gabung.
    - Teks kursi di panel Tambah pemain.
    - Laporan `status` halaman/game ke server.
    - Teks di file baru `screen/strings.ts`.
  - **Format waktu bersama:** `shared/when.ts` ("hari ini 23.59", "besok 09.00", "Sab, 21 Nov 23.59").
- **Dashboard admin `/admin/`** (`apps/web/admin/index.html`, `apps/web/src/admin/*`, dibuat dengan bantuan agent lalu ditinjau), mobile-first:
  - **Login.**
  - **Tab Pass:** buat Pass (catatan, kode acak atau sendiri, berlaku 3 jam/1/3/7/30 hari/tanggal, maks pemain 3–16, maks room bersamaan), kartu sukses dengan "Salin pesan"/"Bagikan", filter Aktif/Habis/Dicabut/Semua, Perpanjang, Cabut/Aktifkan lagi, Hapus.
  - **Tab Room:** langsung, diperbarui setiap 5 dtk.
  - **Tab Server:** RAM terhadap target 300 MB, room, pemain, koneksi, ukuran DB.
  - **Tab Akun:** ganti kata sandi; sesi lain ikut keluar.
- **Docker/infra:**
  - `DB_FILE=/data/hoorah.db`, server dijalankan dengan `--disable-warning=ExperimentalWarning`.
  - `compose.yaml` meneruskan `ADMIN_USERNAME`/`ADMIN_PASSWORD` opsional; contoh di `docker/.env.example`.
  - Caddy: `/admin/` tanpa cache, `X-Frame-Options: DENY`, `noindex`.
  - Vite: entri `admin`.
  - Playwright: DB di memori + admin uji.

**Alasan:** permintaan pemilik: kontroler Android otomatis tegak lagi; uji coba lebih dari 2 pemain bersama teman dengan Pass dari admin yang ada masa berlakunya; database SQLite (cukup untuk satu proses, tanpa layanan tambahan; Postgres bisa menyusul lewat lapisan repository).

**File:**
- **Protokol:** `packages/protocol/src/{pass,admin,messages,validate,index,protocol.test}.ts`.
- **Server:** `apps/server/src/{db,passes,rooms,rooms.pass.test,config,index}.ts`, `apps/server/src/admin/{auth,service,api,cli,admin.test}.ts`, `apps/server/package.json`.
- **HP:** `apps/web/src/controller/{screenmode.ts,room.tsx,store.ts,pass.tsx,setup.tsx,ingame.tsx,strings.ts,controller.css}`.
- **Layar utama:** `apps/web/src/screen/{store.ts,strings.ts,components.tsx,pages/JoinPage.tsx,screen.css}`.
- **Bersama:** `apps/web/src/shared/{when,when.test}.ts`.
- **Dashboard:** `apps/web/admin/index.html`, `apps/web/src/admin/*` (20 file termasuk `format.test.ts`, `logic.test.ts`).
- **Konfigurasi:** `apps/web/vite.config.ts`, `docker/{Dockerfile,compose.yaml,Caddyfile,.env.example}`, `playwright.config.ts`.
- **Tes dan dokumen:** `e2e/hoorah.spec.ts`, `PRD-Hoorah.md`, `CLAUDE.md`.

**Verifikasi:**
- `npm run check` → lulus (Biome 537 file, 53 file tes / 1.278 tes, build web + server sukses, `server.js` 62,7 kB).
  - Setelah itu ada dua perubahan kecil: pesan galat CLI diterjemahkan, dan pesan `status`. Untuk keduanya, tes server/protokol/admin dijalankan lagi: 90 lulus, typecheck + Biome lulus.
- **`npm run e2e`:**
  - Putaran 1: 6 tes, 5 lulus, 1 gagal. "Alur penuh" macet di Rusun karena tawaran "Layar penuh" menutupi tombol. Penyebab: saya mengubah `store.ts` saat e2e berjalan, Vite me-reload halaman HP, sehingga "Nanti saja" hilang.
  - Putaran 2 dan 3, tanpa perubahan kode di tengah: **7/7 lulus**.
  - Langkah baru 1: sesudah Bajaj Rush yang mendatar, Jago Masak menampilkan "Game ini dimainkan tegak." sampai HP diputar.
  - Langkah baru 2: tes Pass. Pass dibuat lewat API admin; HP ketiga ditolak "Room penuh"; kode salah → "Kode Pass tidak berlaku"; kode benar (diketik huruf kecil dengan tanda minus) → masuk; layar utama menampilkan chip Pass dan "3 / 4"; dashboard di HP login, Pass terlihat, tab Room menampilkan "Menunggu pemain".
- **Uji asap:**
  - API admin lewat server sungguhan: 401 tanpa login, 403 tanpa header, 409 kode ganda, 413 body besar, cabut/hapus/logout sesuai.
  - CLI dari bundle produksi: `admin list`/`set` jalan, username tidak valid ditolak.
- **`npm run docker:up`:**
  - `/health` → `{"ok":true,...}`.
  - `/admin/` 200 dengan `X-Frame-Options: DENY`; `/api/admin/me` tanpa login 401.
  - Teks baru ada di aset container ("Punya kode Hoorah Pass", "Game ini dimainkan tegak", "Kosongkan untuk kode acak").
  - `hoorah.db` ada di `/data`.
  - Admin `admin` dibuat lewat CLI. Login, `me`, `stats`, dan logout lewat Caddy berhasil.
  - RAM server di Docker 53 MB.
- **Tampilan:**
  - Layar utama 16:9 (e2e 1920×1080), 4:3 (1024×768), dan 16:10 (1440×900): chip Pass dan toast rapi.
  - HP: Galaxy S9+/Pixel 7/iPhone 15 di e2e, dashboard 360/390 px dan laptop 1366×768 (agent).
- **Tidak diverifikasi:** kunci orientasi tegak di HP Android sungguhan (emulator tidak meniru kunci orientasi); salin/bagikan di dashboard lewat HTTP biasa memakai cadangan textarea, dan "Bagikan" baru muncul di HTTPS.

**Selanjutnya / catatan:**
- Pemilik mencoba di HP Android sungguhan: main Tarik Tambang lalu game tegak.
- Buat Pass di `http://192.168.0.102:1010/admin/` (user `admin`, kata sandi dicetak sekali saat dibuat; ganti di tab Akun).
- Teman dari rumah masing-masing butuh deploy ke VM + HTTPS (wajib izin). Saat itu, cookie admin otomatis `Secure` di balik HTTPS.
- Masalah tampilan lama (bukan dari perubahan ini): kode room di halaman gabung terpecah dua baris pada lebar 1440 dan 1920.
- Setelah sesi dimulai ulang, `node` di PATH shell bawaan menunjuk v20.11.1 (`/usr/local/bin/node`). Proyek butuh Node ≥ 22 (`node:sqlite`, Vite 8); pakai Node 22 dari nvm.

### 2026-11-14 · Game 3D patah-patah di Smart TV: profil grafis bersama, mode Ringan, halaman diagnosa

**Masalah:** pemilik menguji di Polytron Google TV 43" (browser bukan Chrome): semua game 3D patah-patah, game 2D lancar. Penyebab: TV hanya dikenali dari user agent, padahal browser Google TV melapor sebagai Android WebView/desktop biasa, jadi TV mendapat setelan laptop (sekitar 1920×1080, MSAA, material PBR + pantulan, bayangan asli, model detail). Penurun kualitas otomatis juga terlalu lambat dan tidak bisa mengganti MSAA/material/model di tengah game.
**Apa yang diubah:**
- **Profil grafis bersama** `games/common/gfx.ts`: level `high`/`medium`/`low` dari (1) pilihan manual, (2) uji GPU singkat sekali per browser (shader mirip material game, 1280×720, maks 2,5 dtk; terukur Apple M1 0,32 ms per lapis = Tinggi, tanpa GPU 10,5 ms = Ringan), (3) nama GPU + user agent (Android tanpa layar sentuh = TV), (4) level yang pernah gagal dipertahankan game (`noteSlow`, game berikutnya mulai satu level di bawahnya). TV paling tinggi Sedang. `FrameGovernor` (median per detik, dua detik lambat = turun satu anak tangga, frame panjang sampai 2 dtk tetap dihitung) dan `FramePacer` (kunci 30 fps rata). Layar utama menjalankan uji GPU diam-diam 2,5 dtk setelah dibuka.
- **Halaman diagnosa `/?diag=1`** (bisa dipakai dengan remote TV): level + alasannya, hasil uji GPU, nama chip grafis, dikenali sebagai TV atau tidak, ukuran layar/DPR, refresh, WebGL, CPU/RAM, user agent; tombol Otomatis/Tinggi/Sedang/Ringan, Uji ulang, Atur ulang.
- **Keempat game 3D** (dikerjakan 3 agent paralel) memakai profil itu sebelum renderer dibuat; penurun kualitas lama diganti satu tangga: bayangan turun/mati → resolusi turun 0,15 per langkah sampai batas (Tinggi 0,75, Sedang 0,65, Ringan 0,5) → kunci 30 fps → `noteSlow`. Penilaian hanya saat permainan berjalan (bukan saat loading/intro/hitung mundur/jeda).
  - **Ringan (TV):** tanpa MSAA, 960×540 (batas 640×360), tanpa shadow map (bayangan bulat/kontak + AO panggang), tanpa peta pantulan, material Lambert/Phong/cahaya dipanggang, model teringan, jarak pandang lebih pendek, partikel lebih sedikit. HUD tidak berubah.
  - **Bajaj Rush:** Lambert semua, kota kasar mulai 63 m, kabut 300 m, penonton dan lalu lintas setengah, layar terbagi 3–4 dipangkas lagi 25%.
  - **Lari Terus:** jalur ringan yang sudah ada + kabut 330 m, partikel dan garis kecepatan lebih sedikit; pengukur fps tidak lagi berhenti di 10.
  - **Jago Masak:** cahaya toon dapur dipanggang ke warna verteks (tanpa lampu saat jalan), bayangan bulat di bawah alat masak, butir nasi lebih ringan; di semua level dapur dipecah agar bisa di-cull dan shadow map set tetap hanya digambar saat menu berganti.
  - **Juragan Nusantara:** papan hanya digambar ulang saat ada yang bergerak (di semua level; gerakan diam 30 fps), bayangan bulat, cetakan papan 1024; mode demo `?demo=N` untuk pengukuran.
  - **Tinggi:** tampilan laptop sama seperti sebelumnya (poster Lari/Juragan identik piksel; Bajaj/Masak beda < 0,06% piksel, setara derau antar-render).
**File:** `apps/web/src/games/common/{gfx,gfx.test}.ts`, `apps/web/src/diag/{main.tsx,strings.ts,diag.css}`, `apps/web/src/main.ts`, `apps/web/src/screen/main.tsx`, `apps/web/src/games/bajaj/{quality,quality.test,look,scene,kart3d,raceview,driver,city}.ts`, `apps/web/src/games/bajaj/main.tsx`, `apps/web/src/games/lari/{scene,fx,world,driver}.ts`, `apps/web/src/games/lari/main.tsx`, `apps/web/src/games/masak/scene/{quality,quality.test,light,blobs,view,kit,kitchen,fx,props,nasgor}.ts`, `apps/web/src/games/masak/{driver.ts,main.tsx}`, `apps/web/src/games/juragan/scene/{quality,quality.test,view,pieces,textures}.ts`, `apps/web/src/games/juragan/{main.tsx,driver.ts,strings.ts}`, `e2e/hoorah.spec.ts`, `CLAUDE.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 502 file, 48 file tes / 1.225 tes, build sukses).
- `npm run e2e` → 6/6 lulus (tes baru: halaman diagnosa, uji GPU, pilihan manual tersimpan, navigasi panah).
- `npm run docker:up` → `/health` `{"ok":true}`, `/?diag=1` 200, kode baru ada di aset container.
- Uji asap Docker, "TV" (UA Android WebView tanpa layar sentuh, 960×540 DPR 2, tanpa GPU): diagnosa "Ringan · tanpa GPU", keempat game mulai di level Ringan, tanpa error. "Laptop" (GPU M1): "Tinggi · hasil uji GPU", keempat game Tinggi, 60 fps, tanpa error.
- Ukuran agent (tanpa GPU, 1280×720, mesin sedang sibuk): Juragan 1,5 → sekitar 22 fps; Jago Masak 1 pemain 1,2–2,4 → 16–31 fps (8 pemain 0,6–1,4 → 4–11); Bajaj 1 pemain sekitar 1 → 4–8 fps; Lari sekitar 0,8 → 5,7 fps. Tanpa GPU membebani segitiga jauh lebih berat daripada GPU TV sungguhan, jadi angka di TV belum diketahui.
**Berikutnya:** pemilik membuka `http://192.168.0.102:1010/?diag=1` di TV lalu memotret hasilnya, kemudian mencoba keempat game 3D. Jika masih patah-patah: kurangi geometri kota Bajaj/Lari di level Ringan, atau pilih "Ringan" manual di halaman diagnosa.

### 2026-11-14 · Bengkel aset 3D (GLB buatan sendiri) + percontohan Lari Terus

**Apa yang diubah:**
- **Bengkel aset `tools/assets/`** (keputusan pemilik: GLB boleh, dibuat lewat skrip di repo): model organik dari medan jarak (SDF) → surface nets → relaksasi → decimation yang menjaga batas warna, normal halus; bentuk keras (kotak tumpul, lathe, tabung, ekstrusi); detail wajah menempel badan; AO dipanggang per verteks; rig 16 tulang + 10 klip animasi; LOD otomatis; penulis GLB terkuantisasi (dibaca GLTFLoader bawaan three). Hasil deterministik (byte sama setiap build). Bangun ulang: `npx tsx tools/assets/lari/build.ts [runners|props|city]` (sekitar 55 dtk), menulis GLB + `asset-manifest.ts`.
- **Paket model Lari Terus** di `apps/web/public/models/lari/` (URL berversi hash `?v=`): `runners.glb` (8 maskot buah, badan = buah, sepatu/gelang/ikat kepala warna pemain, 11–13 rb segitiga + versi ringan 4–5 rb), `props.glb` (rintangan, koin, perabot atap, masing-masing dengan versi ringan), `city.glb` (parapet, jendela, tepi celah, kabel lampu, papan reklame, awan). Total 5,79 MB, lewat jaringan 2,87 MB (zstd).
- **Game Lari Terus:** pelari pakai model berkerangka dengan animasi lari/lompat/merunduk/tersandung/jatuh/panjat/menang yang berbaur; kota dari kumpulan instans tetap (tanpa membuat geometri saat lari), model ringan di atas 50 m; semua shader dikompilasi sebelum game siap (hilang patah 200 ms+ di tengah lari); tingkat Smart TV pakai material Lambert, model teringan, resolusi bisa turun ke 0,7. Logika, aturan, jalur, HUD, hasil tidak berubah. Poster `keyart/lari.jpg` dibuat ulang. Mode tinjau `?showroom=run|idle|air|slide|...`.
- **Caddy:** `.glb` diberi `Content-Type: model/gltf-binary` dan ikut dikompresi (zstd/gzip); URL berversi `/models/*?v=` di-cache permanen.
- **Pemeriksaan:** tes bengkel aset ikut `npm test` (`tools/*/test/**`), cek tipe `tools/assets` ikut `npm run typecheck`.
**File:** `tools/assets/{README.md,tsconfig.json,vitest.config.ts}`, `tools/assets/src/{ao,color,decal,foliage,gltf,lod,mesh,noise,normals,organic,polygonize,rig,sdf,shapes,simplify}.ts`, `tools/assets/test/{geometry,rig}.test.ts`, `tools/assets/lari/{build,city,kit,props,runners}.ts`, `apps/web/src/games/lari/{assets,assets.test,asset-manifest,models,runner3d,world,field,materials,scene,strings}.ts`, `apps/web/src/games/lari/main.tsx`, `apps/web/public/models/lari/{runners,props,city}.glb`, `apps/web/public/keyart/lari.jpg`, `docker/Caddyfile`, `vitest.config.ts`, `package.json`
**Verifikasi:**
- `npm run check` → lulus (Biome 489 file, 44 file tes / 1.192 tes termasuk 15 tes bengkel aset, build sukses).
- `npm run e2e` → 5/5 lulus (alur penuh layar + iPhone WebKit + Android, main sendiri Ludo, WebRTC Chrome dan Safari, layar terdekat + poster + Tambah pemain).
- `npm run docker:up` → `/health` `{"ok":true}`; GLB 200 dengan `zstd`, `model/gltf-binary`, cache permanen.
- Uji asap Docker (layar Chromium GPU + HP Pixel 7) di 1920×1080, 1440×900, 1024×768: kode tampil "235 986", HP bergabung lewat kartu layar terdekat, panel Tambah pemain menampilkan kode sama, poster = kartu disorot, Lari dimuat 1,6–1,9 dtk, 18 usapan diterima, HP `data-link=direct`, tanpa error halaman. fps headless 60 / 53 / 48 (bukan ukuran perangkat sungguhan).
- Ukuran: pelari tingkat atas 59,8 fps di 1080p dengan 8 pelari; tingkat TV 59,2 fps; GL perangkat lunak (proxy perangkat lemah) 4 fps (sebelumnya < 1 fps).
**Berikutnya:** pemilik menilai hasil 3D di perangkat sungguhan (laptop, HP, Smart TV). Jika disetujui, pipeline yang sama untuk Bajaj Rush (sekalian perbaiki terowongan Jalur Puncak: depan tertutup, sisi kanan bolong), Jago Masak, Juragan. Sisa: `clothUv`/`CLOTH_CELLS` di `lari/textures.ts` tidak terpakai (hapus perlu izin); `shared/art/lari.ts` (SVG cadangan) masih desain lama tapi tidak tampil.

### 2026-11-14 · Kode 6 angka, layar terdekat di Wi-Fi yang sama, "+ Tambah pemain", poster beranda mengikuti kartu

**Apa yang diubah:**
- **Kode room 6 angka** (keputusan pemilik, mengganti 4 huruf): `ROOM_CODE_ALPHABET` = 0–9, panjang 6, `formatRoomCode` → "482 917". Layar utama: kode berkelompok di layar gabung, panel undangan, dan chip "Kode" (dulu "Room"). HP: 6 kotak (jeda di tengah), `inputMode="numeric"`, teks baru di `controller/strings.ts`, baris status "Kode 482 917". Server: maks 20 kode salah per menit per alamat (lalu `rate_limited`), room dari snapshot berformat lama dilewati.
- **Layar terdekat:** server mencatat jaringan layar utama (`apps/server/src/network.ts`: IPv4 publik persis, IPv4 lokal per /24, IPv6 per /64, loopback). `GET /api/nearby` (batas 1/dtk per IP, `no-store`) mengembalikan maks 3 room di jaringan yang sama yang layarnya online, aktif ≤ 30 menit, dan belum penuh, dengan nama + buah pemain. Halaman kode di HP menampilkan "Layar Hoorah di Wi-Fi ini" (diperbarui tiap 5 dtk), satu ketukan → isi nama. Proxy `/api` di Vite dan Caddy. Tipe `NearbyRoom` di protokol. Pembatas laju IP dipindah ke `limiter.ts` (dipakai STUN dan endpoint ini).
- **"+ Tambah pemain":** chip kuning di bilah atas beranda (bisa dipilih remote) membuka panel QR + kode di atas beranda; panel undangan dipindah ke `screen/components.tsx` (dipakai beranda dan menu jeda); fokus beranda kembali setelah panel ditutup.
- **Poster besar mengikuti kartu yang disorot:** begitu kartu fokus (bingkai putih), poster, judul, deskripsi, dan label berganti ke game itu; rotasi otomatis berhenti dan titik indikator disembunyikan; "Main sekarang" membuka game yang tampil; ganti tab mengembalikan rotasi.
**File:** `packages/protocol/src/{constants,validate,messages,protocol.test}.ts`, `apps/server/src/{rooms,rooms.test,index,network,network.test,limiter,stun,stun.test}.ts`, `apps/web/src/screen/{components.tsx,screen.css}`, `apps/web/src/screen/pages/{HomePage,JoinPage,GamePage}.tsx`, `apps/web/src/controller/{setup,common,ingame}.tsx`, `apps/web/src/controller/{strings.ts,controller.css}`, `apps/web/src/sim/main.tsx`, `apps/web/vite.config.ts`, `docker/Caddyfile`, `e2e/hoorah.spec.ts`, `CLAUDE.md`, `PRD-Hoorah.md`, `PROGRESS.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 462 file, 41 file tes / 1.173 tes, build sukses).
- Tes baru: kode 6 angka + format, jaringan (`networkKey`), room terdekat hanya untuk jaringan sama dan tidak saat penuh, batas tebakan kode, e2e "nearby screen, banner follows the focused card, add-player panel" lulus (HP tanpa kode bergabung lewat kartu layar terdekat; judul poster = judul kartu yang disorot; panel Tambah pemain menampilkan kode berformat dan tertutup dengan OK dari HP).
- Docker: dibangun bersama percontohan 3D Lari Terus (lihat entri di atas): `npm run e2e` 5/5 lulus, `/health` ok, uji asap kode/layar terdekat/Tambah pemain/poster lulus di 16:9, 16:10, 4:3.
**Berikutnya:** uji di HP sungguhan (keyboard angka, kartu layar terdekat di Wi-Fi rumah).

### 2026-11-14 · WebRTC satu Wi-Fi + STUN, joystick, Rebut Wilayah gerak bebas, Lari satu usapan = satu jalur, Juragan upgrade/rebut, tanpa pilihan durasi

**Apa yang diubah:** (sebagian dikerjakan paralel oleh agent, tiap agent di foldernya sendiri; integrasi, protokol, HP, server oleh lead)
- **WebRTC (keputusan pemilik):** HP ↔ layar utama di Wi-Fi yang sama tersambung langsung (DataChannel `in` tanpa urutan/tanpa kirim ulang untuk frame input, `ctl` berurutan untuk pesan relay). Kenalan lewat relay channel baru `r` (`RtcSignal`, SDP lengkap tanpa trickle). `Net` membungkus pesan p/g dalam amplop bernomor per penerima (`shared/linkseq.ts`) sehingga dua jalur tidak pernah menukar urutan; relay ke 'all' dipecah per pemain. Salinan frame input lewat server dibuang selama frame langsung masih segar. Cadangan otomatis ke relay (gagal 3 dtk / detak jantung hilang 3,5 dtk), coba lagi dengan jeda 2/5/15/30/60 dtk. Kode: `shared/{rtc,linkseq,net}.ts`, `screen/rtc.ts`, `controller/rtc.ts`. Kait khusus mode pengembangan (`__hoorahNet`, `__hoorahRtc`) untuk tes.
- **STUN bawaan** di proses server (`apps/server/src/stun.ts`, UDP `STUN_PORT` default 3478, 0 = mati): hanya Binding, jawaban 32 byte, batas 20/dtk per IP. Klien memakai `stun:<host halaman>:3478` (bisa diganti `VITE_RTC_ICE`). Docker: port `3478/udp`. Tanpa TURN. Opsi uji `RELAY_DELAY_MS` meniru server jauh.
- **Joystick:** frame biner op 2 (`STICK_OP`, x/y int8, `packStick`/`unpackStick`), maks 30 Hz, hanya saat berubah, diulang 250 ms selama ditahan, (0,0) saat dilepas; server menerima op 1 dan 2. Tampilan HP `pad` mode `stick` (lingkaran + kenop, zona mati 0,15, getar halus per 1/8 putaran, tombol aksi opsional).
- **Usapan:** satu gerakan jari hanya mengirim satu arah yang sama sekali (penyebab loncat dua jalur).
- **Ular Arena:** kepala menuju arah joystick dengan batas belok, NGEBUT terpisah (`arena/input.ts`).
- **Rebut Wilayah dirombak:** gerak bebas 360° (60 Hz, belok maks 5,6 rad/s), raster 240×135 sampai 336×189 untuk pengurungan (flood fill), tampilan wilayah halus lewat WebGL blur+ambang (`ground.ts`, cadangan kanvas 2D), jejak berupa pita melengkung, tabrakan jarak ke segmen (`trail.ts`), rumah bangkit bulat, lawan komputer ditulis ulang (lobus elips, pulang lewat jalur aman, kabur, berburu jejak).
- **Lari Terus:** satu masukan = satu jalur, perpindahan halus 0,2 dtk, antre maks 2, usapan berlawanan membatalkan, dinding pinggir = dorongan kecil + getar, miring badan maks ~11°, keadilan tabrakan tetap (`judgedX`).
- **Juragan Nusantara:** beli = Rumah berwarna pemilik (mercusuar/menara di transportasi); upgrade saat mendarat di kota sendiri Rumah → Toko → Gedung → Hotel (biaya 50/75/100% harga, sewa ×1/3/7/15, satu pulau ×2); Rebut kota lawan 2× nilai setelah bayar sewa (Hotel dan transportasi kebal); berakhir setelah putaran (HUD "PUTARAN n/N", banner putaran terakhir); kartu Kabar 15 (baru: "Bantuan UMKM", "Renovasi Gotong Royong" dengan pilihan kota di HP); tombol Sorak!/Huuu~ di layar tunggu; penghargaan "Penakluk"; poster `public/keyart/juragan.jpg` dibuat ulang. Maksimal tetap 6 pemain.
- **Tanpa pilihan durasi:** `GameInfo.duration/modes/defaultMode` dihapus; `shared/automode.ts` `autoRounds(gameId, pemain)` menentukan panjang per game (mis. Kuis 10/8/6 soal, Juragan 14/12/10 putaran, Lari solo Sprint, ramai Bertahan); halaman detail hanya tombol "Main"; menit diganti label suasana (Heboh, Santai, Adu Otak, Ramai-ramai) di beranda, detail, dan daftar game HP.
- **Reaksi umum:** `message` view mendapat `reactions?: boolean` (tombol Sorak!/Huuu~ ke reaksi platform).
- Tes simulasi Rebut Wilayah diberi batas waktu 30 dtk dan ambang kecepatan 4 ms/frame (sebelumnya gagal karena batas 5 dtk saat seluruh tes berjalan paralel).
**File:** `packages/protocol/src/{input,messages,validate,protocol.test}.ts`, `apps/server/src/{stun,stun.test,index,config,rooms}.ts`, `apps/web/src/shared/{net,rtc,linkseq,linkseq.test,automode,automode.test,games,games.test}.ts`, `apps/web/src/screen/{rtc,store}.ts`, `apps/web/src/screen/pages/{DetailPage,HomePage}.tsx`, `apps/web/src/screen/screen.css`, `apps/web/src/controller/{rtc,store,strings}.ts`, `apps/web/src/controller/{pad,views,picker}.tsx`, `apps/web/src/controller/{pad,controller}.css`, `apps/web/src/games/{arena,wilayah,lari,juragan}/**`, `apps/web/src/shared/art/wilayah.ts`, `apps/web/public/keyart/juragan.jpg`, `docker/{compose.yaml,Dockerfile}`, `e2e/hoorah.spec.ts`, `PRD-Hoorah.md`, `CLAUDE.md`, `PROGRESS.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 459 file, 40 file tes / 1.166 tes, build sukses). Tidak ada em dash.
- `npm run e2e` → 3/3 lulus, lalu dua tes WebRTC diperluas jadi matriks perangkat dan lulus: layar Chrome + HP Android (Pixel 7) dan iPhone (WebKit) bersamaan (keduanya langsung; iPhone diputus paksa → remote tetap jalan lewat relay → tersambung lagi; Android tidak terganggu), dan layar Safari (Mac/iPad) + HP Android (Galaxy S9+).
- Pengukuran jeda dengan `RELAY_DELAY_MS=100` (meniru Oregon): tekan tombol → layar menerima, median 25 ketukan: **langsung 1,5 ms**, lewat relay 103,5 ms (Chrome Android dan iPhone WebKit sama). Putus paksa: 10/10 ketukan tetap sampai lewat relay, jalur langsung kembali sendiri.
- STUN: permintaan Binding sungguhan ke server dijawab 0x0101 dengan alamat terpetakan yang benar.
- `npm run docker:up` → sukses, `/health` ok, `stun_listening 3478`. Uji asap Docker (1920×1080 + HP dengan input joystick/usap/tombol): Ular Arena, Rebut Wilayah, Lari Terus, Juragan, Sambung Kata jalan tanpa error halaman; semua HP `data-link=direct`.
- Laporan agent: Juragan 75 tes + simulasi 300 permainan (Toko 2,1 · Gedung 0,35 · Hotel 0,05 per permainan, tanpa kebangkrutan beruntun); Rebut Wilayah 42 tes, 60 fps di 1920×1080 dan 1024×768, 57–60 fps dengan 8 HP; Arena+Lari 76 tes.
**Daftar deploy (jangan lupa):** buka **UDP 3478** di firewall VM untuk STUN (wajib minta izin pemilik dulu).
**Berikutnya:** uji di perangkat sungguhan (HP Android kelas menengah, iPhone Safari, Smart TV, beberapa router rumah) untuk WebRTC dan joystick; Gedung/Hotel di Juragan masih jarang (opsi: upgrade di Gajian/Ngopi Dulu atau biaya lebih murah, menunggu keputusan); Firefox belum diuji (browser Playwright untuk Firefox belum dipasang).

### 2026-11-14 · Desain: alur dari domain dibuka + 5 layout beranda (dasar beranda sekarang)

**Apa yang diubah:** pemilik lebih suka beranda sekarang, jadi desain disusun ulang di kanvas (versi 48) dengan beranda sekarang sebagai dasar:
- Baris "Alur dari domain dibuka sampai Juara Pesta": layar gabung (QR + Mulai), beranda, roda Acak!, Pesta dimulai (susunan 5 game), Klasemen pesta antargame, Juara Pesta Malam Ini.
- Baris "5 layout beranda": 1 Gabungan (saran: Mode Pesta jadi slide pertama poster besar, kartu Acak! paling depan), 2 Pita Pesta, 3 Dua pintu, 4 Pesta penuh, 5 Rak; dengan catatan perbandingan.
- Komponen bersama: bilah atas, kartu game (label suasana), kartu Acak!, gambar kolase Mode Pesta.
- Baris beranda versi awal diberi label "pembanding, tidak dipakai".
**File:** kanvas https://claude.ai/artifact/S55SjiGKSmm9RRQmVTfyH6 (versi 48), `PROGRESS.md`. Tidak ada kode aplikasi yang berubah.
**Verifikasi:** tidak diverifikasi (desain; menunggu pilihan pemilik).
**Berikutnya:** pemilik memilih layout, lalu diterapkan bersama paket A–D.

### 2026-11-14 · Desain beranda baru (D4) di kanvas Claude Design

**Apa yang diubah:** tiga artboard baru di kanvas desain (baris "Beranda baru · tinggal main", di bawah Remote final): `TV-Beranda-Pesta` (MAIN! = Mode Pesta sebagai fokus utama, kartu Acak! dengan roda, 3 rekomendasi berlabel suasana tanpa menit, avatar pemain di bilah atas), `TV-Beranda-Semua` (keadaan setelah digulir: semua game dengan tab kategori dan jumlahnya), `TV-Beranda-Acak` (roda berhenti, kartu "Terpilih" dengan Main sekarang / Putar lagi), plus catatan alasan desain dan peta navigasi remote. Poster memakai poster asli 16 game dari aplikasi (diunggah sebagai aset kanvas).
**Alasan:** permintaan pemilik: lihat desain beranda baru dulu sebelum dieksekusi.
**File:** kanvas https://claude.ai/artifact/S55SjiGKSmm9RRQmVTfyH6 (versi 47), `PROGRESS.md`. Tidak ada kode aplikasi yang berubah.
**Verifikasi:** tidak diverifikasi (desain; menunggu tinjauan pemilik).
**Berikutnya:** pemilik meninjau; setelah disetujui, beranda diterapkan bersama paket A–D.

### 2026-11-14 · Gelombang 2: Ular Arena, Rebut Wilayah, Lari Terus, Sambung Kata, Juragan Nusantara

**Apa yang diubah:** lima game baru dikerjakan paralel (satu agent per game, masing-masing hanya di foldernya sendiri), lalu diintegrasikan.
- **Ular Arena** (`arena`, Phaser): ular berkepala buah di taman malam berlampu; belok ditahan, NGEBUT 150→270 membakar panjang (minimum 12); kepala kena badan lawan, adu kepala, atau pagar = tumbang, pecah jadi biji besar 60%, hidup lagi 3 dtk + kebal 2 dtk; arena menyesuaikan jumlah ular dan rasio layar; podium + 5 penghargaan; 4 ular komputer saat solo; 60 fps dengan 8 ular.
- **Rebut Wilayah** (`wilayah`, Phaser): lapangan 80×45 sampai 112×63 sesuai jumlah pemain, gerak per petak yang digambar mulus, belokan diantre (maks 2); jejak pulang = wilayah + area terkurung (termasuk milik lawan); jejak dipotong / jejak sendiri / adu kepala di luar = tumbang, wilayah jadi netral, hidup lagi 3 dtk + kebal 2 dtk. Keputusan desain agent: tepi lapangan membelokkan, bukan menumbangkan (menunggu konfirmasi pemilik). 3–5 lawan komputer saat solo.
- **Lari Terus** (`lari`, Three.js HD): atap kota 3 jalur saat senja (PBR, normal/roughness map, ACES, bayangan lembut, kabut, festoon), pelari buah dengan animasi lari/lompat/merunduk/tersandung; rintangan dijamin selalu menyisakan jalur; kecepatan 8,5→21 m/s; toleransi jeda (input dihitung pada waktu ditekan, maaf tabrakan 0,22 dtk); mode Sprint 90 dtk dan Bertahan; 4 pelari komputer saat solo; 60 fps di 1080p dengan 8 pelari; poster `public/keyart/lari.jpg`.
- **Sambung Kata** (`kata`, Preact DOM): tema buku tulis; kata harus diawali suku kata terakhir kata sebelumnya; salah/dipakai/waktu habis = −1 nyawa dan pemain berikut dapat suku kata baru; ganti suku kata otomatis bila tersisa < 3 kata ("buntu"); 15 dtk turun 1 dtk per putaran sampai 7 dtk; 4.560 kata disusun sendiri; pemecah suku kata berbasis aturan (86 kasus uji); 3 lawan komputer saat solo.
- **Juragan Nusantara** (`juragan`, Three.js HD): papan 24 petak (14 kota dalam 6 pulau, Pelabuhan, Bandara, 2 Kabar, 2 pajak, sudut Gajian / Pos Tilang / Ngopi Dulu / Razia!), modal Rp 1,5 jt, gaji Rp 200 rb, satu pulau penuh = sewa ganda + boleh bangun Warung/Toko/Hotel merata, 13 kartu Kabar orisinal, jual otomatis ke bank setengah harga lalu bangkrut, batas 15/25 menit lalu kekayaan terbesar menang, keputusan HP berbatas waktu dengan pilihan otomatis; meja jati, bidak buah melompat, dadu 3D, bangunan, koin terbang; 2 lawan komputer saat solo; poster `public/keyart/juragan.jpg`.
- Integrasi: poster JPG Lari dan Juragan didaftarkan di `keyart.tsx`; durasi Juragan "15–25 menit"; tabel lawan komputer PRD 6.4; judul "Penghargaan malam ini" di halaman hasil hanya tampil bila ada penghargaan; ekspektasi e2e tab Papan ditambah Juragan Nusantara.
**File:** `apps/web/src/games/{arena,wilayah,lari,kata,juragan}/**`, `apps/web/games/{arena,wilayah,lari,kata,juragan}/index.html`, `apps/web/src/shared/art/{arena,wilayah,lari,kata,juragan}.ts`, `apps/web/src/shared/music/songs/{arena,wilayah,lari,kata,juragan}.ts`, `apps/web/public/keyart/{lari,juragan}.jpg`, `apps/web/src/shared/{keyart.tsx,games.ts}`, `apps/web/src/screen/pages/ResultsPage.tsx`, `e2e/hoorah.spec.ts`, `PRD-Hoorah.md`, `PROGRESS.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 446 file, 36 file tes / 1.098 tes, build sukses). Tidak ada em dash di kode; tempo lagu semua unik (arena 137, wilayah 133, lari 143, kata 92, juragan 107).
- `npm run e2e` → alur lengkap lulus; tes solo awalnya gagal karena tab Papan kini juga berisi Juragan Nusantara, ekspektasi diperbarui lalu lulus.
- `npm run docker:up` → sukses, `/health` di `:1010` `ok`; `/games/<id>/` kelima game dan kedua poster JPG menjawab 200.
- Uji asap di Docker `:1010` (layar 1920×1080 + satu HP, solo, dengan input HP): kelima game termuat dan berjalan tanpa error halaman; HP menampilkan `pad` setir/d-pad/usap, `word`, dan pesan Juragan sesuai game. Tangkapan layar utama dicek.
- Laporan agent: uji langsung tiap game di port sendiri pada 1920×1080, 1512×945, 1024×768 dan HP; Ular Arena juga 8 HP; Juragan dan Lari diukur sekitar 60 fps (Chromium headless, Metal).
**Berikutnya:** uji di HP dan Smart TV sungguhan (terutama Lari Terus dan Juragan untuk performa 3D); konfirmasi pemilik soal tepi lapangan Rebut Wilayah; opsional: pindahkan `GameClock` yang terduplikasi ke `games/common/`, tampilan `countdown` HP hanya memuat 4 avatar lawan.

### 2026-11-14 · Perbaikan kontroler Tarik Tambang + kerangka gelombang 2 (tampilan HP `pad` dan `word`)

**Apa yang diubah:**
- **Bug Tarik Tambang (HP berdenyut saat diketuk cepat):** `fit.ts` mengukur ulang layar setiap kali isi HP berubah, termasuk teks "+1" yang muncul dan hilang di setiap ketukan; "+1" bisa melewati tepi bidang ketuk sehingga seluruh tampilan dipadatkan dan diskalakan lalu kembali lagi. Selain itu baris "… unggul" dan lencana KOMBO muncul-hilang sehingga tinggi panel info berubah dan tombol TARIK! (yang ukurannya mengikuti sisa ruang) ikut bergeser. Perbaikan: efek sesaat ditandai `data-fx` dan diabaikan oleh MutationObserver `fit.ts`; `.tap-pad` memotong dekorasinya sendiri (`overflow: hidden`); baris "unggul" dan lencana KOMBO selalu memegang tempatnya.
- **Gelombang 2 (lima game baru):** id `arena`, `wilayah`, `lari`, `kata`, `juragan` didaftarkan di katalog (`games.ts`), poster SVG, musik, tema HP, entri Vite, dan halaman game (berkas sementara yang diganti oleh pengerjaan tiap game). PRD 6.3 dan CLAUDE.md diperbarui.
- **Protokol:** tampilan HP baru `pad` (mode `steer`, `dpad`, `swipe`; bit `PAD_LEFT/RIGHT/UP/DOWN/ACTION` di frame biner) dan `word` (papan ketik huruf sendiri, awalan terkunci, nyawa, batas waktu, `turn` untuk mengosongkan input). Store HP: `tapWith(bits)` mengirim satu frame berisi arah bersama kenaikan `taps`.
- **HP:** `controller/pad.tsx` + `pad.css` (setir: dua sisi ditahan, jempol boleh bergeser antarsisi, tombol aksi ditahan; d-pad besar di zona jempol; usap: arah terkirim begitu jari menempuh 34 px tanpa menunggu diangkat, ketuk = aksi, tombol panah cadangan), `controller/word.tsx` + `word.css` (QWERTY besar, tahan Hapus untuk mengosongkan, keyboard fisik juga bisa, kirim terkunci sampai giliran berikut atau 2,5 detik). Teks di `controller/strings.ts`.
**File:** `apps/web/src/controller/{fit.ts,views.tsx,controller.css,store.ts,room.tsx,strings.ts,pad.tsx,pad.css,word.tsx,word.css,themes.ts,main.tsx}`, `packages/protocol/src/messages.ts`, `apps/web/src/shared/{games.ts,games.test.ts,keyart.tsx}`, `apps/web/src/shared/art/{arena,wilayah,lari,kata,juragan}.ts`, `apps/web/src/shared/music/songs/{index,arena,wilayah,lari,kata,juragan}.ts`, `apps/web/src/games/{arena,wilayah,lari,kata,juragan}/`, `apps/web/games/{arena,wilayah,lari,kata,juragan}/index.html`, `apps/web/vite.config.ts`, `PRD-Hoorah.md`, `CLAUDE.md`, `PROGRESS.md`
**Verifikasi:**
- `npx tsc --noEmit -p apps/web` lulus; `npx biome check` lulus; `npx vitest run` → 25 file / 821 tes lulus (sebelum pengerjaan game dimulai).
- Tarik Tambang di Docker `:1010`, HP Pixel 7 mendatar, 80 ketukan cepat: posisi dan ukuran tombol, bidang ketuk, dan panel info identik di semua sampel (sebelumnya tombol 179–201 px dan seluruh tampilan bergeser ±9 px).
- Tampilan `pad`/`word` diuji di dev server terpisah dengan tampilan disuntikkan ke store HP: frame d-pad (atas=4, kiri=1, kanan=2, bawah=8), usap (atas, kiri) dan ketuk (16) terkirim benar; `word` mengirim `action('word','kuda')` dari awalan "ku" + "DA". Tangkapan layar tegak dan mendatar dicek.
**Berikutnya:** lima game dikerjakan paralel; integrasi, `npm run check`, e2e, dan Docker setelah semuanya selesai.

### 2026-11-14 · Remote Host ditata ulang: d-pad di bawah, tombol Menu dihapus

**Apa yang diubah:** (disetujui pemilik, menggantikan desain "Remote final")
- Kartu Host: avatar + nama di kiri, tombol kuning "Pilih game"/"Ganti game" versi kecil di kanan. Tulisan petunjuk (`hintJoin` … `hintGame`) dihapus.
- Tombol **Menu dihapus**: remote d-pad hanya tampil di luar game, sedangkan layar utama hanya menanggapi "menu" saat game berjalan (menu jeda dibuka lewat pil jeda di HP), jadi tombol itu tidak berfungsi.
- Kembali, Beranda, Getar, Keluar menjadi satu baris ringkas 4 kolom dengan bentuk dan ukuran ikon yang sama; titik nyala Getar di pojok kanan atas tombol.
- D-pad pindah ke bawah (zona jempol, PRD 4.3) dan sedikit lebih besar (sel maks 96 px, sebelumnya 88). Landscape: info + tombol di kiri, d-pad di kanan (tetap di tengah vertikal).
**File:** `apps/web/src/controller/room.tsx`, `apps/web/src/controller/strings.ts`, `apps/web/src/controller/controller.css`, `PROGRESS.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 328 file, 25 file tes / 806 tes, build sukses).
- `npm run e2e` → 2/2 lulus.
- `npm run docker:up` → sukses, `/health` di `:1010` `ok`.
- Tangkapan layar remote dari `:1010` di Pixel 7 (portrait dan landscape) dan iPhone SE: tata letak sesuai, nama panjang terpotong "…", label keempat tombol sejajar.
**Berikutnya:** uji di HP sungguhan (Android kelas menengah dan iOS Safari).

### 2026-11-14 · Tombol suara dan layar penuh bisa dipilih dengan remote HP

**Apa yang diubah:**
- Tombol suara dan layar penuh di pojok kanan atas (halaman gabung dan Beranda) ikut navigasi panah + OK (id fokus `sound`, `fullscreen`, cincin fokus sama dengan tombol lain). Halaman gabung: baris atas = suara, layar penuh; panah bawah ke "Mulai". Beranda: keduanya di ujung kanan baris tab.
- Aksi dipusatkan di `store.ts` (`pressSound`, `pressFullscreen`, `startFullscreen`, `runTopBar`, `TOP_BAR_IDS`), dipakai oleh klik mouse maupun remote.
  - Suara: bisu/nyala langsung dari HP. Jika browser belum mengizinkan suara dan perintah datang dari HP, layar menampilkan toast "Klik layar ini sekali untuk menyalakan suara".
  - Layar penuh: keluar langsung dari HP (tidak butuh gesture). Masuk dari HP tidak diizinkan browser, jadi layar menampilkan toast "Klik layar ini sekali untuk layar penuh" dan masuk pada klik/tombol berikutnya. Toast yang sama muncul saat "Mulai" ditekan dari HP.
- `enterFullscreen`/`toggleFullscreen` sekarang mengembalikan `true` bila harus menunggu gesture; keluar layar penuh juga membatalkan permintaan yang tertunda.
- Toast di halaman gabung: toast tanpa pemain (balasan perintah Host) sekarang tampil; toast kedatangan pemain tetap disembunyikan di sana.
**Alasan:** permintaan pemilik: remote HP juga bisa memakai tombol layar penuh dan musik. Keputusan diskusi: tidak memakai mode kiosk; layar penuh tetap butuh satu klik di layar utama (batasan browser).
**File:** `apps/web/src/screen/fullscreen.ts`, `apps/web/src/screen/store.ts`, `apps/web/src/screen/components.tsx`, `apps/web/src/screen/pages/JoinPage.tsx`, `apps/web/src/screen/pages/HomePage.tsx`, `PROGRESS.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 328 file, 25 file tes / 806 tes, build sukses).
- `npm run e2e` → 2/2 lulus.
- `npm run docker:up` → sukses, `/health` di `:1010` `ok`.
- Skrip Playwright ke `:1010` (HP Pixel 7 sebagai Host, aturan gesture browser disimulasikan): gabung → Atas → suara, Kanan → layar penuh, OK → toast tampil, belum layar penuh; satu klik di layar → layar penuh; OK dari HP → keluar layar penuh; Bawah + OK ("Mulai") → Beranda + toast; Beranda: Atas sampai baris tab, Kanan ke ujung → layar penuh, Kiri → suara, OK → bisu, OK → nyala. Tangkapan layar cincin fokus di tombol suara sudah dicek.
**Berikutnya:** uji di laptop dan Smart TV sungguhan. Catatan: kursor mouse yang diam di atas deretan kartu ikut memfokuskan kartu saat halaman berganti (perilaku hover lama, terlihat saat uji otomatis).

### 2026-11-14 · "Mulai" dari remote HP, cincin kuning Pilih game dihapus, bilah petunjuk bawah layar dihapus

**Apa yang diubah:**
- **Layar penuh saat "Mulai" ditekan dari remote HP:** browser hanya memberi layar penuh di dalam klik/tombol pada perangkat itu sendiri; perintah dari HP lewat jaringan selalu ditolak. Sekarang `enterFullscreen()` memeriksa `navigator.userActivation.isActive`: jika ada gesture langsung masuk layar penuh, jika tidak (dari HP) permintaannya disimpan dan dipenuhi pada klik/sentuhan/tombol berikutnya di layar utama (Esc dan F dikecualikan). Layar tetap langsung ke beranda. Suara: berbunyi langsung jika browser sudah mengizinkan halaman ini, jika belum menyala pada sentuhan pertama yang sama (listener `firstInput` yang sudah ada). Sekalian: `webkitRequestFullscreen` lama yang tidak mengembalikan promise tidak lagi melempar error.
- **Remote HP:** cincin kuning berdenyut (`is-new`) di tombol "Pilih game" dihapus beserta flag `pickerSeen` dan CSS `pick-glow`.
- **Layar utama:** bilah petunjuk bawah (OK Pilih · Gerak · Kembali · "Pakai panah dan Enter…") dihapus dari Beranda, Detail, dan Hasil (komponen `HostHint`, CSS `.keyhints`/`.keycap`). Deretan game di Beranda turun 24 px (desain) sehingga jarak bawah 48 px, sama dengan margin samping.
**Alasan:** permintaan pemilik: "Mulai" dari laptop maupun remote harus layar penuh dan memutar lagu; tanpa cincin kuning di remote; layar benar-benar penuh tanpa bilah petunjuk.
**File:** `apps/web/src/screen/fullscreen.ts`, `apps/web/src/screen/components.tsx`, `apps/web/src/screen/pages/{HomePage,DetailPage,ResultsPage}.tsx`, `apps/web/src/screen/screen.css`, `apps/web/src/controller/room.tsx`, `apps/web/src/controller/controller.css`, `PROGRESS.md`
**Verifikasi:**
- `npm run check` → lulus (Biome 328 file, 25 file tes / 806 tes, build sukses).
- `npm run e2e` → 2/2 lulus (dijalankan setelah perubahan remote dan setelah penghapusan bilah).
- `npm run docker:up` → sukses, `/health` di `:1010` `ok`.
- Skrip Playwright ke `:1010` dengan aturan gesture browser disimulasikan (Playwright headless selalu melaporkan `isActive=true`, jadi `userActivation` dan penolakan `requestFullscreen` di-stub): OK dari remote HP → beranda, belum layar penuh, tanpa percobaan yang ditolak; klik pertama di layar → layar penuh. Klik "Mulai" langsung di layar: layar penuh di Chromium dan WebKit. Tombol "Pilih game" di HP: `animation: none`, tanpa kelas `is-new`.
- Tangkapan layar Beranda di 1920×1080, 1512×945, 1024×768: bilah bawah tidak ada, deretan game utuh.
**Berikutnya:** uji di laptop dan Smart TV sungguhan dengan remote HP. Jika layar penuh tanpa sentuhan sama sekali diperlukan, opsinya: pasang Hoorah sebagai aplikasi (PWA, `display: fullscreen`) atau jalankan browser dalam mode kiosk.

### 2026-11-14 · Alur kerja SDLC dicatat di CLAUDE.md

**Apa yang diubah:** bagian baru "Alur kerja setiap perubahan (SDLC)" di `CLAUDE.md`: urutan wajib pahami → ubah → cek per file → `npm run check`/e2e → `npm run docker:up` + `/health` → catat di PROGRESS → lapor → commit hanya jika diminta, plus catatan deploy VM.
**Alasan:** permintaan pemilik agar langkah Docker dan proses lain tetap diingat di setiap sesi baru, setelah langkah Docker sempat terlewat.
**File:** `CLAUDE.md`, `PROGRESS.md`
**Verifikasi:** tidak diverifikasi (hanya dokumen).
**Berikutnya:** tidak ada.

### 2026-11-14 · Tombol "Mulai" di halaman gabung layar utama

**Apa yang diubah:** label tombol "Mulai: layar penuh" / "Lanjut ke beranda" diganti jadi "Mulai" saja (ikon play). Perilakunya sama: satu klik/Enter menyalakan audio (musik menu langsung berputar), masuk layar penuh bila browser mendukung, lalu ke beranda. Detail teknis tidak perlu ditampilkan ke pemain.
**File:** `apps/web/src/screen/pages/JoinPage.tsx`, `PROGRESS.md`
**Verifikasi:**
- `npx tsc --noEmit -p apps/web` lulus; `npx biome check` pada file lulus. Tidak ada tes e2e yang memakai label lama.
- `npm run check` → lulus (Biome 328 file, 25 file tes / 806 tes, build sukses).
- `npm run docker:up` → sukses, `/health` di `:1010` `ok`. Label lama ("Mulai: layar penuh", "Lanjut ke beranda") tidak ada lagi di aset build container `web`.
**Berikutnya:** chip "Klik untuk suara" dan "Layar penuh" di header tetap ada sebagai cadangan (mis. setelah keluar layar penuh pakai Esc).

### 2026-11-14 · Aturan hemat token untuk Claude Code

**Apa yang diubah:** `.claude/settings.json` (daftar `permissions.deny` untuk file berat/sensitif: lockfile, build, `.env*`, svg, map, log), perintah `/fast` dan `/plan-arch` di `.claude/commands/`, dan bagian aturan hemat token + kualitas kode di awal `CLAUDE.md`. Isi CLAUDE.md lama tetap dipertahankan (tidak ditimpa).
**File:** `.claude/settings.json`, `.claude/commands/fast.md`, `.claude/commands/plan-arch.md`, `CLAUDE.md`, `PROGRESS.md`
**Verifikasi:** tidak diverifikasi (hanya konfigurasi dan dokumen, tidak ada kode).
**Berikutnya:** aturan "verifikasi per file" berlaku untuk iterasi; `npm run check` penuh tetap dijalankan sebelum pekerjaan dicatat selesai (aturan 7).

### 2026-11-14 · Tab HP dan layar utama sinkron, menu jeda HP dirapikan, layar jeda baru di layar utama

**Apa yang diubah:**
- **Tab game sinkron dua arah:**
  - Tab di beranda layar utama (Pas untuk kalian, Papan, Lomba, Kuis, Aksi) sekarang berfungsi dan bisa dipilih dengan remote atau keyboard (baris paling atas).
  - Saat Host mengetuk tab di daftar Pilih game di HP, baris game di layar utama ikut tersaring. Kalau layar sedang di detail atau hasil, layar utama otomatis kembali ke beranda.
  - Tab yang dipilih di layar utama juga muncul di HP.
  - Aturan isi tiap tab ada di satu fungsi bersama `gamesForTab` (`shared/games.ts`), jadi HP dan layar selalu menampilkan game yang sama. Layar utama tetap menampilkan game "segera hadir" di tab kategorinya.
  - Protokol baru: pesan `{ k: 'tab', tab }`, dan pesan `page` membawa `tab`.
- **Menu jeda di HP:**
  - Tambah pemain, Ulang dari awal, dan Keluar game kini satu baris rata masing-masing (ikon + label). Sebelumnya "Ulang dari awal" terpotong dua baris dan tidak sejajar di HP mendatar yang kecil.
  - Semua tombol tetap 3D (bayangan bawah), dengan jarak yang memperhitungkan bayangan itu: 12–16 px, 10 px di HP sempit.
  - Lanjutkan diberi jarak ekstra di bawahnya.
  - Keterangan Suara dipendekkan menjadi "efek suara di layar utama".
- **Layar jeda di layar utama:**
  - Daftar menu diganti layar bersih: logo Hoorah, "Dijeda", nama game, dan "Rina bisa melanjutkan dari HP".
  - Remote dan keyboard tetap bisa melanjutkan dengan OK atau Kembali.
  - Saat Host mengubah musik atau suara dari HP, layar utama menampilkan toast "Musik dimatikan" dan sejenisnya.

**Alasan:** Permintaan pemilik:
- tab di HP harus ikut menyaring layar utama;
- menu jeda HP harus rapi, muat, dan tidak bertumpuk, dengan tombol tetap 3D;
- layar jeda di laptop tanpa daftar, cukup logo.

**File:**
- **Protokol:** `packages/protocol/src/messages.ts`
- **Katalog:** `apps/web/src/shared/games.ts`, ditambah `games.test.ts` (baru)
- **Layar utama:** `apps/web/src/screen/{store.ts,screen.css,pages/HomePage.tsx,pages/GamePage.tsx}`
- **HP:** `apps/web/src/controller/{picker.tsx,store.ts,ingame.tsx,controller.css}`
- **Tes e2e:** `e2e/hoorah.spec.ts`

**Verifikasi:**
- `npm run lint`: 0 error (327 file).
- `npm run typecheck`: lulus.
- `npm test`: 806 lulus (25 file; 4 tes baru untuk tab).
- `npm run e2e`: 2 lulus (2,8 menit).
  - Langkah d-pad di beranda kini mencari game berdasarkan judul, karena urutan baris mengikuti tab dan game terakhir dimainkan.
  - Tes main sendiri memeriksa bahwa tab Papan di HP membuat layar utama menampilkan Ular Tangga, Congklak, Ludo, Catur.
  - Pemeriksaan jeda memakai "Dijeda" dan toast musik.
- Skrip Playwright tambahan untuk menu jeda Host dan pemain:
  - Ukuran: 375×667, 667×375, 393×659, 734×343, 863×360, 568×320, termasuk kondisi Tambah pemain dan dialog konfirmasi.
  - Semua ukuran: layar muat tanpa penyusutan, 0 tombol bertumpuk, 0 tombol keluar layar.
  - Tangkapan layar sudah diperiksa.
- `npm run docker:up`: sukses, `/health` di `:1010` `ok`.

**Berikutnya:** uji di HP Android dan Smart TV sungguhan, terutama layar penuh dan putar otomatis.

### 2026-11-14 · Remote Host baru (d-pad + Pilih game), layar penuh, game mendatar terkunci mendatar

**Apa yang diubah:**
- **Remote Host (desain "Remote final" di canvas Claude Design, disetujui pemilik):**
  - Baris status dengan badge HOST di tengah.
  - Kartu nama Host dengan petunjuk.
  - Tombol kuning **Pilih game**: diberi cincin sampai pertama kali dibuka, dan menjadi **Ganti game** di halaman hasil.
  - D-pad dalam lingkaran.
  - Kembali · **Beranda** · Menu, dengan Getar dan Keluar diselipkan di bawahnya seperti susunan bata.
  - Saat mendatar, d-pad di kanan.
- **Daftar Pilih game (`controller/picker.tsx`, dimuat saat dibutuhkan):**
  - Tab "Pas untuk kalian" (cocok dengan jumlah pemain, yang terakhir dimainkan paling atas) dan kategori Papan, Lomba, Kuis, Aksi (field baru `category` di katalog).
  - Poster asli tiap game. Game yang sedang disorot di layar utama ditandai "DI LAYAR".
  - Ketuk game: layar utama membuka detailnya, lalu daftar menutup sendiri.
  - Saat mendatar, game ditampilkan dalam kisi 3 kolom.
- **Satu layar tetap:** halaman HP tidak bisa digeser atau digulir. Satu-satunya yang bisa digulir adalah daftar game (kelas `scroll-y`).
- **Protokol:**
  - Tombol nav baru `home`.
  - Pesan baru `{ k: 'open', game }`.
  - Pesan `page` kini membawa `recent` (game terakhir dimainkan). Di beranda, `gameId` berisi kartu yang sedang disorot.
  - Layar utama menyimpan daftar game terakhir dimainkan di perangkatnya.
- **Layar penuh dan orientasi (`controller/screenmode.ts`):**
  - Android: tombol **Masuk** sekaligus menyalakan layar penuh. Kalau layar penuh lepas (pindah aplikasi, Back, refresh), muncul tawaran "Main layar penuh" dengan pilihan "Nanti saja", yang berlaku sampai tab ditutup.
  - Game "Mendatar" (Tarik Tambang, Bajaj Rush) mengunci HP ke mendatar selama game, lalu dilepas saat keluar.
  - iPhone (tanpa layar penuh dan tanpa kunci orientasi): muncul layar **"Putar HP-mu"** sampai HP diputar, dengan pilihan "Tetap tegak".
  - Remote Host tetap mengikuti cara HP dipegang.
- **Lain-lain:**
  - Ikon baru: home, grid, close, undo, dpad, rotate.
  - Teks remote baru di `controller/strings.ts`.
  - Tab hiasan di beranda layar utama memakai nama kategori yang sama dengan HP.
  - Panah d-pad berbentuk chevron.

**Alasan:**
- Pemilik memilih gabungan format A (d-pad) dan E (pilih langsung) dari 5 usulan, dengan d-pad sebagai default.
- Kontroler harus terkunci satu layar.
- Game mendatar harus otomatis mendatar.

**File:**
- **Protokol:** `packages/protocol/src/messages.ts`.
- **Katalog dan ikon:** `apps/web/src/shared/{games.ts,ui.tsx}`.
- **Layar utama:** `apps/web/src/screen/{store.ts,pages/HomePage.tsx}`.
- **HP:** `apps/web/src/controller/{room.tsx,common.tsx,store.ts,setup.tsx,main.tsx,controller.css}`, ditambah file baru `apps/web/src/controller/{picker.tsx,screenmode.ts,strings.ts}`.
- **Tes:** `e2e/hoorah.spec.ts`.

**Verifikasi:**
- `npm run lint`: 0 error (326 file).
- `npm run typecheck`: lulus.
- `npm test`: 802 lulus.
- `npm run build -w @hoorah/web`: sukses; daftar game jadi chunk terpisah (`picker-*.js`, 1,1 kB gzip).
- `npm run e2e`: 2 lulus (2,9 menit).
  - Alur penuh: Tarik Tambang dan Bajaj Rush kini memeriksa layar "Putar HP-mu", lalu HP tes diputar ke mendatar.
  - Main sendiri Ludo kini membuka game lewat Pilih game, tab Papan.
  - Dua run awal gagal karena tesnya: (1) tawaran layar penuh setelah reload Android tidak ditutup, sehingga tes macet; (2) kursor mouse tes yang diam men-hover tombol mode di layar detail. Tesnya diperbaiki. Kode aplikasi juga diubah: "Nanti saja" tidak lagi muncul ulang di setiap game.
- Skrip Playwright tambahan (iPhone 15 tegak, Pixel 7 mendatar), tangkapan layar sudah diperiksa:
  - Remote tegak dan mendatar, daftar game tegak dan mendatar.
  - Daftar menggulir sementara halaman tetap: `scrollTop` daftar 200, halaman 0.
  - Ketuk Congklak di HP membuka detail di layar utama, dan Beranda kembali ke beranda.
  - Layar Putar HP-mu tampil dan terbaca di atas tema Tarik.
- `npm run docker:up`: sukses, `/health` di `:1010` `ok`.

**Masalah tersisa / berikutnya:**
- Layar penuh dan kunci mendatar belum diuji di HP Android sungguhan. Emulator tidak meniru keduanya, jadi wajib dicoba di HP asli.
- Saat Host mengetuk tab kategori di HP, layar utama belum ikut memfilter baris game. Tab di layar utama masih hiasan.
- Pengguna mouse di layar utama: hover tetap memindah fokus, seperti sebelumnya.

### 2026-11-14 · Port server Hoorah pindah dari 8787 ke 8790

**Apa yang diubah:** Port default server WebSocket Hoorah diganti dari 8787 ke 8790: server, proxy `/ws` dan `/health` di Vite, Dockerfile (ENV, EXPOSE, healthcheck), Caddyfile. Komentar port e2e (8797) disesuaikan.
**Alasan:** Proyek lain milik pemilik (Suwwara, lebih dulu dibuat) memakai `127.0.0.1:8787`; selama container-nya jalan, `npm run dev` Hoorah tidak bisa membuat room. Keputusan pemilik: Hoorah yang mengalah.
**File:** `apps/server/src/config.ts`, `apps/web/vite.config.ts`, `docker/Dockerfile`, `docker/Caddyfile`, `playwright.config.ts`
**Verifikasi:**
- `npm run typecheck`: lulus.
- `npm run dev`: server mendengar di 8790, `/health` lewat proxy Vite menjawab `ok` walau container Suwwara jalan.
- `npm run docker:up`: server sehat, `/health` di `:1010` `ok`.
- `npx playwright test -g solo`: lulus.
**Catatan:** Saat deploy ke VM nanti, firewall/proxy memakai port 8790 (atau tetap lewat Caddy di 80/443).

### 2026-11-14 · Main sendiri: lawan komputer otomatis + rekor pribadi

**Apa yang diubah:**
- **Keputusan pemilik (PRD 6.4, CLAUDE.md):** semua game bisa dimainkan 1 orang, kecuali Kompak Gak? dan Gambar Kilat.
  - Saat 1 orang main, lawan komputer muncul otomatis: tanpa tombol, tanpa pengaturan, tampil seperti pemain biasa (nama + buah, tanpa label BOT).
  - Saat 2 orang atau lebih, tidak ada lawan komputer.
  - Tingkat kesulitan menyesuaikan diri diam-diam per game.
- **Modul bersama `games/common/`:**
  - `cpu.ts`: id negatif, nama karakter di `cpu-strings.ts`, buah/warna yang tidak dipakai, skill 0..1 per game di localStorage layar utama (turun setelah kalah, naik setelah menang), `thinkMs`, `pickWithSlips`, `wobble`.
  - `records.ts`: rekor pribadi.
  - `store.ts`: localStorage aman.
- **Protokol/SDK/layar:**
  - `GameResult.cpuPlayers` supaya halaman hasil menampilkan lawan dengan nama dan buah.
  - `ControllerView.guests` supaya HP bisa menggambar avatar lawan komputer (`PlayerAvatar` mencari di sini kalau id bukan pemain room).
  - Halaman hasil tanpa mahkota dan angka "1" saat main sendiri.
- **`minPlayers` jadi 1:** Tarik Tambang, Ular Tangga, Congklak, Makan Kerupuk, Balap Karung, Ludo, Catur.
- **Per game:**
  - **Tarik Tambang:** 1 lawan, 4,5–8,5 ketuk/dtk sesuai skill, naik-turun, lelah, tarikan super di skill tinggi, di bawah batas anti auto-klik.
  - **Balap Karung:** 3 lawan (skill +0,12 / sama / −0,12), mengetuk mengikuti irama 98 bpm dengan meleset sesuai skill.
  - **Ular Tangga:** 1 lawan, melempar dadu sendiri, adu ketuk duel kilat sesuai skill. Lencana kartu "BOT" (sepatu bot) diganti "SEPATU" supaya tidak terbaca sebagai label komputer.
  - **Ludo:** 1 lawan di pojok seberang, memilih bidak dengan urutan prioritas (makan > pulang > keluar kandang > petak aman > kabur > maju), kadang salah pilih.
  - **Congklak:** 1 lawan, menimbang tiap lubang dengan simulasi aturan asli, melihat 1–3 langkah ke depan sesuai skill.
  - **Catur:** 1 lawan, mesin alpha-beta kecil di atas `chess.ts`, kedalaman 1–3 sesuai skill, dibatasi 120 ms/40 ribu node supaya layar tidak macet. Jamnya ikut berjalan. Warna pemain bergantian tiap game.
  - **Makan Kerupuk, Kuis, Rusun, Jago Masak:** mode kejar rekor. Muncul "Rekor pertama tercatat", "Rekor baru! X (sebelumnya Y)", atau "Rekor: X, kurang Y lagi" di layar game, HP, dan halaman hasil. Rekor dipisah per mode (Kilat/Normal).
    - Skor solo Makan Kerupuk: 100 per gigitan, +50 per gigitan PAS, +50 per detik tersisa.
    - Skor solo Rusun: menara tertinggi.
- **HP putus di tengah game (multipemain):** otak lawan yang sama mengambil alih kursi itu (giliran: setelah 1,5–3 dtk; ketuk: skill sedang) sampai HP tersambung lagi.
  - Berlaku di Tarik, Karung, Ular, Ludo, Congklak, Catur.
  - Makan Kerupuk tidak macet: jalurnya berhenti, ronde tetap selesai.
- **Tes:**
  - `vite.config.ts`: port server di balik proxy `/ws` bisa diatur (`HOORAH_SERVER_PORT`).
  - Playwright menjalankan server e2e di port 8797 supaya tidak bentrok dengan apa pun di 8787.
  - Tes e2e baru: main sendiri Ludo dengan 1 HP.

**Alasan:** Permintaan pemilik: orang yang membuka Hoorah sendirian harus bisa langsung main tanpa mengatur apa pun.

**File:**
- **Modul bersama (baru):** `apps/web/src/games/common/{cpu.ts,cpu-strings.ts,records.ts,store.ts,cpu.test.ts}`.
- **Otak lawan per game (baru):** `apps/web/src/games/{tarik,karung,ular,ludo,congklak}/brain{.ts,.test.ts}`, `apps/web/src/games/catur/engine{.ts,.test.ts}`.
- **Game yang diubah:** driver/logic/views/strings/hud/css/tes di folder `tarik`, `karung`, `ular`, `ludo`, `congklak`, `catur`, `kerupuk`, `kuis`, `rusun`, `masak`.
- **Bersama dan konfigurasi:**
  - `packages/protocol/src/messages.ts`
  - `packages/sdk/src/bridge.ts`
  - `apps/web/src/controller/common.tsx`
  - `apps/web/src/screen/pages/ResultsPage.tsx`
  - `apps/web/src/shared/games.ts`
  - `apps/web/vite.config.ts`
  - `playwright.config.ts`
  - `e2e/hoorah.spec.ts`
- **Dokumen:** `PRD-Hoorah.md`, `CLAUDE.md`.

**Verifikasi:**
- `npm run lint`: 0 error (323 file).
- `npm run typecheck`: lulus.
- `npm test`: 802 tes lulus (24 file).
- `npm run e2e`: 2 tes lulus (2,9 menit): alur penuh 12 game dan main sendiri Ludo (lawan bernama karakter, tanpa teks BOT/CPU, giliran kembali ke pemain 3 kali).
- **Skrip Playwright per game (iPhone/Pixel), dengan tangkapan layar yang sudah diperiksa:**
  - Solo penuh di 10 game; lawan tampil di podium dengan buahnya.
  - Ambil alih saat HP putus dan pulih saat tersambung lagi: Tarik, Karung, Ular, Ludo, Congklak, Catur.
  - Rekor: tiap game dimainkan dua kali berturut-turut.
- Pencarian em dash: 0.
- `npm run docker:up`: sukses, halaman game menjawab 200 di `:1010`.

**Masalah tersisa / berikutnya:**
- Belum dicoba di HP dan Smart TV sungguhan. Waktu pikir mesin catur di Smart TV lambat belum diukur (dibatasi waktu, jadi main lebih dangkal, bukan macet).
- Kalau satu-satunya pemain putus saat main sendiri, tidak ada pengambilalihan (sengaja, supaya layar tidak main melawan dirinya sendiri).
- Penghargaan yang didapat selama diambil alih tetap tercatat untuk pemilik kursi.
- Catur Rame (tim) saat seluruh tim putus hanya diuji unit, belum langsung. Mode Normal (3 ronde) game rekor hanya diuji unit.
- Bajaj Rush Grand Prix tetap mengisi grid dengan pembalap komputer walau 2+ orang (rancangan v2); menunggu keputusan pemilik.
- Lingkungan: container `suwwara-backend-1` (proyek lain) memakai `127.0.0.1:8787`, sehingga `npm run dev` lokal tidak bisa membuat room selama container itu jalan. Docker Hoorah di `:1010` tidak terpengaruh.

### 2026-11-13 · Gelombang 1 game baru: Ular Tangga, Congklak, Makan Kerupuk, Balap Karung, Kompak Gak?, Ludo, Catur

**Apa yang diubah:**
- **Target katalog 30 game** dicatat di PRD 6.3 dan CLAUDE.md (keputusan pemilik). Gelombang 1 berisi 7 game baru; katalog sekarang 12 game jalan + 2 "segera hadir".
- **Sambungan bersama:** `GameId` + entri katalog (teks Indonesia, tanpa em dash), urutan beranda, input Vite + `apps/web/games/<id>/index.html`, registri lagu, poster (`keyart.tsx`), tema HP per game (`games/<id>/controller-theme.{ts,css}`, didaftarkan di `controller/themes.ts` dan diimpor di `controller/main.tsx`).
- **7 game** (masing-masing: `logic.ts` murni + tes, tampilan layar utama yang pas di 16:9/16:10/4:3, lagu orisinal, poster, tema HP):
  - **Ular Tangga** (2–6): papan 50/100 kotak, kotak kejutan (dek 9 kartu), duel kilat adu ketuk 5 detik, mantul, batas putaran. Preact + SVG.
  - **Congklak** (2, atau 3–8 beregu): 7 lubang + lumbung, jalan terus, tembak, jalan lagi, 1 atau 3 babak. Preact + SVG.
  - **Makan Kerupuk** (2–8): tombol GIGIT dengan ayunan per pemain (dinilai dari cap waktu HP), tersedak saat meleset, 3 ronde. Phaser.
  - **Balap Karung** (2–8): ketuk mengikuti irama 98 bpm (dinilai dari cap waktu HP), lompatan super, tersandung kalau asal cepat, foto finis. Phaser.
  - **Kompak Gak?** (2–16): 164 pertanyaan orisinal; poin bila sama dengan mayoritas; berdua mode "sehati" + persen kompak.
  - **Ludo** (2–4, 5–8 beregu): aturan Indonesia (6 keluar, 6 lempar lagi, tiga kali 6 hangus, makan, kotak aman, harus pas). Preact + SVG.
  - **Catur** (2 dengan jam catur; 3–8 Catur Rame dengan voting tim): mesin aturan sendiri tanpa library (perft cocok sampai kedalaman 4), tampilan HP baru `chess` (papan mini, langkah sah ditandai, promosi, menyerah).
- **Protokol/HP:** view `chess` baru (`messages.ts`, `controller/chess.{tsx,css}`, `views.tsx`, `viewKey` di `room.tsx`); `SwingIndicator.label` opsional supaya teks "Posisi crane" milik Rusun tidak muncul di game lain; pemain baru mendapat buah acak (bukan selalu semangka).
- **e2e:** alur penuh sekarang juga membuka 7 game baru dari beranda, memainkan satu langkah di HP, lalu keluar lewat menu jeda.

**Alasan:** Pemilik menargetkan 30 game untuk MVP dan meminta game sederhana dikerjakan dulu, termasuk ide pemilik sendiri (Ular Tangga, Ludo, Catur).

**File:** `apps/web/src/games/{ular,congklak,kerupuk,karung,kompak,ludo,catur}/**` (baru), `apps/web/games/{…}/index.html` (baru), `apps/web/src/shared/art/{…}.ts` (baru), `apps/web/src/shared/music/songs/{…}.ts` (baru) + `songs/index.ts`, `apps/web/src/shared/{games.ts,keyart.tsx}`, `apps/web/vite.config.ts`, `apps/web/src/controller/{themes.ts,main.tsx,views.tsx,room.tsx,store.ts,chess.tsx,chess.css}`, `packages/protocol/src/{messages.ts,protocol.test.ts}`, `e2e/hoorah.spec.ts`, `PRD-Hoorah.md`, `CLAUDE.md`

**Verifikasi:**
- `npm run lint` → 0 error (306 file). `npm run typecheck` → lulus. `npm test` → 713 tes lulus (17 file).
- `npm run e2e` → lulus (2,4 menit; 12 game). Run pertama gagal di langkah Catur karena cek tes yang salah tulis (gabung locator dari dua HP); diperbaiki, run kedua lulus.
- Tiap game juga dimainkan sampai selesai lewat skrip Playwright dengan iPhone 15 (WebKit) + Pixel 7 (Chromium), layar 1920×1080 dan 1024×768, 2 sampai 8 pemain; tangkapan layar diperiksa.
- Pencarian em dash di `apps/`, `packages/`, `e2e/` → 0.
- `npm run docker:up` → sukses; semua halaman game baru menjawab 200 di `:1010`.

**Masalah tersisa / berikutnya:**
- Belum dicoba di HP dan Smart TV sungguhan.
- Ular Tangga mode Normal dengan 6 pemain bisa sampai ±11 menit (Kilat ±3–6,5 menit).
- Mode 3 babak Congklak dan 3 balapan Balap Karung belum sempat terekam utuh dalam satu run langsung (dev server ter-reload oleh agen lain), tapi dicakup tes unit.
- Di Makan Kerupuk, kerupuk sesaat menutupi wajah pemain (disengaja, di depan mulut).
- Tampilan `tap` masih menulis "ketuk/dtk" langsung di kode HP; tombol `button` selalu mengirim aksi `drop`.
- Berikutnya: rancangan Juragan Nusantara (properti orisinal) untuk disetujui pemilik, lalu gelombang 2.

### 2026-11-13 · Aturan: tanpa em dash di aplikasi

**Apa yang diubah:** Aturan baru di CLAUDE.md bagian 8: em dash (—) dilarang di aplikasi (teks pemain, string, komentar kode); tanda pisah pendek (–) hanya untuk rentang angka. Pemeriksaan: teks pemain sudah bersih; 9 em dash di komentar baris 2 file lagu diganti titik dua.

**Alasan:** Permintaan pemilik.

**File:** `CLAUDE.md`, `apps/web/src/shared/music/songs/{kuis,menu,bajaj,bajaj-arena,bajaj-puncak,bajaj-pantai,rusun,masak,tarik}.ts`

**Verifikasi:** `grep` em dash di `apps/`, `packages/`, `e2e/`, `docker/` → 0. Perubahan hanya di komentar, jadi lint/tes tidak dijalankan ulang.

**Berikutnya:** Pemilik memilih paket game cepat pertama (papan / 17-an / sosial).

### 2026-11-13 — HP: penyesuai otomatis supaya tidak pernah terpotong di HP mana pun

**Apa yang diubah:**
- **Penyesuai otomatis (`controller/fit.ts`):** HP sungguhan kehilangan ruang ke notch, garis home, sudut membulat, dan bilah browser yang tidak ada di emulator, sehingga layar yang "pas" di tes masih terpotong di HP pemilik. Setiap kali layar berganti, HP diputar, atau bilah browser/keyboard muncul, tampilan diukur:
  1. Muat → biarkan.
  2. Tidak muat → `html.fit-compact` merapatkan jarak, padding, dan tinggi tombol.
  3. Masih tidak muat → seluruh layar diperkecil proporsional (`--fit-s`, minimal 0,55) sampai pas. Memakai `transform`, jadi perhitungan sentuhan (setir, pedal) tetap benar.
  - Saat ada ruang lagi, ukuran kembali normal.
- **Halaman terkunci:** semua seretan satu jari di halaman diblokir (kecuali di kolom isian), jadi halaman tidak bisa bergeser atau memantul. Sentuhan kontrol tetap jalan lewat pointer event.
- **Label pemilik warna** di menu warna Bajaj dipotong dengan "…" bila nama panjang. Sebelumnya meluber keluar kotak.

**Alasan:** Laporan pemilik: kontroler sudah satu layar tapi masih terpotong; harus menyesuaikan di HP jenis apa pun, tetap satu layar, tidak bergerak, tombol lebih ringkas dan muat.

**File:** `apps/web/src/controller/{fit.ts (baru), main.tsx, controller.css}`

**Verifikasi:**
- Skrip `harsh.mjs`: alur sungguhan (layar utama + Host WebKit + pemain Chromium) melewati 24 layar, yaitu isi nama, tombol Host, lobi, Kuis, menu pemain, menu Host + undangan + konfirmasi, Tarik, Rusun, menu mode/sirkuit/warna Bajaj + setir, dan Masak.
  - Ukuran sengaja dibuat sempit untuk meniru notch dan bilah: Host 320×480 + pemain 560×280, serta Host 375×560 + pemain 640×300.
  - Hasil: 48/48 OK; tidak ada tombol atau judul yang keluar layar; scrollY 0.
- `npm run lint` → 0 error.
- `npm run typecheck` → lulus.
- `npm test` → 304 lulus.
- `npx playwright test` → lulus.
- `npm run docker:up` → sukses.

**Selanjutnya / catatan:** Perlu dicoba di HP pemilik. Bila layar sangat sempit, tampilan bisa diperkecil sampai 55%.

### 2026-11-13 — HP: tombol Getar/Keluar jadi pil, zoom ketuk-dua-kali dimatikan

**Apa yang diubah:**
- **Tombol Getar/Keluar:** "Getar: nyala" dan "Keluar" di bawah layar tombol Host dan lobi bukan lagi teks tautan, melainkan tombol pil yang senada dengan Kembali/Menu.
  - Getar: ikon getar dan titik hijau saat nyala (`role="switch"`).
  - Keluar: ikon keluar dan teks merah lembut.
- **Zoom ketuk-dua-kali:** penjaga tambahan di HP.
  - Ketukan kedua dalam 350 ms dibatalkan default-nya (zoom); kolom isian dikecualikan. `dblclick` juga diblokir.
  - Tombol game tetap menerima setiap ketukan karena memakai `pointerdown`. Tombol menu yang memakai `click` mengabaikan ketukan kedua yang terlalu cepat, sehingga juga mencegah aksi dobel.

**Alasan:** Permintaan pemilik: tombol bawah dibuat pil agar rapi; matikan double-tap zoom di kontroler.

**File:** `apps/web/src/controller/{room.tsx, main.tsx, controller.css}`, `apps/web/src/shared/ui.tsx` (ikon `vibrate`)

**Verifikasi:**
- `npm run lint` → 0 error.
- `npm run typecheck` → lulus.
- `npm test` → 304 lulus.
- `npx playwright test` → lulus.
- Skrip `padfit.mjs`: layar Host dan lobi tetap pas tanpa scroll di 320×568, 568×320, 360×640, dan 640×360.
- `npm run docker:up` → sukses.

**Selanjutnya / catatan:** Zoom ketuk-dua-kali perlu dicoba di iPhone sungguhan.

### 2026-11-13 — Layar utama benar-benar penuh (beranda + semua game di layar lebar)

**Apa yang diubah:**
- **Beranda:**
  - Baris kartu menembus sampai tepi kiri. Sebelumnya terpotong di margin 48px saat bergeser; laporan pemilik: "kirinya gak full".
  - Gambar hero menutupi seluruh area atas di rasio apa pun (`object-fit: cover`, mencapai tepi kanan, tumbuh ke bawah).
  - Bayangan bawah memakai piksel tetap, jadi layar tinggi tidak lagi menutupi gambar dengan pita gelap.
- **Shell:** lebar panggung dipas tepat dengan layar (dibulatkan, ditaruh di kiri atas). Sebelumnya lebih sepecahan piksel dan muncul garis 1px di tepi pada 21:9.
- **Semua game (agen):**
  - `mountStage` kini menumbuhkan panggung ke lebar juga, bukan hanya tinggi. Sebelumnya layar yang lebih lebar dari 16:9 mendapat pita samping, misalnya 18px pada 1512×830 dan 320px pada 21:9.
  - Kuis: latar panggung dibuat seukuran panggung; isi inti tetap di tengah.
  - Tarik dan Rusun: sayap kiri/kanan (penonton, kota) tanpa sambungan; kamera tetap di tengah. Sekalian diperbaiki: posisi teks melayang di Tarik dan lapisan HUD dunia di Rusun pada layar yang lebih tinggi.
  - Bajaj: layar terbagi, menu, garasi, dan hasil memakai lebar asli; batas FOV horizontal 104°; batas piksel backing supaya fps tetap.
  - Masak: stasiun dan shot hero memakai lebar penuh.
- **HP non-Host saat jeda:** banner "Game dijeda oleh …" yang menutupi pil dihapus. Pil sendiri kini bertuliskan "Dijeda oleh Rina" dan tetap membuka menu pribadi.
- **Kode tak terpakai:** `kuisStageSvg` dihapus.

**Alasan:** Permintaan pemilik: saat layar penuh di laptop harus benar-benar penuh, tanpa celah di kiri.

**File:**
- `apps/web/src/screen/{main.tsx, screen.css, pages/HomePage.tsx}`
- `apps/web/src/games/common/stage.ts`
- `apps/web/src/games/kuis/{backdrop.ts (baru), tv.tsx, main.tsx, kuis.css}`
- `apps/web/src/games/tarik/{wings.ts (baru), textures.ts, scene.ts, main.tsx, hud.tsx}`
- `apps/web/src/games/rusun/{wings.ts (baru), textures.ts, scene.ts, main.tsx, hud.tsx, driver.ts, rusun.css}`
- `apps/web/src/games/bajaj/{main.tsx, driver.ts, scene.ts, hud.tsx, bajaj.css, logic.test.ts}`
- `apps/web/src/games/masak/{layout.ts, scene/view.ts, main.tsx, logic.test.ts}`
- `apps/web/src/controller/{ingame.tsx, room.tsx, controller.css}`
- `apps/web/src/shared/art/kuis.ts`

**Verifikasi:**
- `npm run lint` → 0 error.
- `npm run typecheck` → lulus.
- `npm test` → 304 lulus.
- `npx playwright test` → lulus.
- Probe tepi di 7 ukuran (2560×1080, 1920×960, 1512×830, 1920×1080, 1512×945, 1024×768, 1280×720): pita samping 0 di semua game. Diulang di Docker `:1010` untuk 1512×830 dan 2560×1080.
- Beranda difoto di 1141×1050, 1280×720, 1920×960, 2560×1080.
- fps tetap sekitar 60; Bajaj 4 layar di 21:9 57 fps.
- `npm run docker:up` → sukses.

**Selanjutnya / catatan:**
- Lebih lebar dari 32:9, Tarik dan Rusun menampilkan warna langit polos di ujung.
- Bajaj tetap di resolusi backing yang lebih rendah setelah kembali dari 21:9 ke 16:9.

### 2026-11-13 — Kontroler HP pas satu layar, tanpa scroll (tegak dan mendatar)

**Apa yang diubah:**
- **Tinggi pas layar:** setiap layar kontroler kini setinggi layar yang terlihat (`100dvh`; browser lama memakai `innerHeight` lewat `main.tsx`). `html`/`body` tidak bisa di-scroll lagi.
- **Ukuran lentur:** jarak, judul, avatar, tombol, kotak kode, dan d-pad mengecil di layar pendek dengan `clamp()` berbasis tinggi layar. Batas minimum tetap dijaga:
  - tombol game 64 px;
  - jawaban kuis 72 px;
  - tombol menu 48 px.
- **Tombol besar mengikuti ruang:** JATUHKAN (Rusun), TARIK! (Tarik), d-pad Host, dan benda masak (talenan, cobek, wajan, daun, panci) memakai container query (dengan cadangan `vh`), jadi mengisi ruang tersisa tanpa meluber.
- **HP mendatar (tinggi ≤ 540 px):** layar dibagi dua kolom:
  - Kuis: soal di kiri, 4 jawaban 2×2 di kanan.
  - Rusun: info di kiri, JATUHKAN di kanan.
  - Pesan/hasil: teks di kiri, angka dan tombol di kanan.
  - Menu pra-game: daftar atau 8 warna di kanan.
  - Lainnya: nama + buah, lobi, d-pad Host di kiri, dan gerakan masak.
- **Menu dalam game:** `overflow-y: auto` di menu Host dibuang. Kini semuanya muat: tombol Selesai ada di samping kode room, dan ubin serta sakelar mengecil.
- **Pil menu:** area sentuhnya 48 px tanpa mengubah tampilan. Di HP mendatar pil sedikit lebih ramping.
- **Keyboard:** meta viewport mendapat `interactive-widget=resizes-visual`. Setelah keyboard ditutup, halaman dikembalikan ke posisi atas.
- **Dipendekkan di layar sangat kecil:**
  - catatan "Reaksimu muncul di layar utama" disembunyikan bila tinggi ≤ 640 px;
  - kalimat "Game tetap berjalan…" di menu pemain disembunyikan bila mendatar dengan tinggi ≤ 360 px;
  - baris kedua opsi menu dipotong satu baris (…) di HP mendatar.
- Nama kelas, peran, dan label yang dipakai e2e tidak berubah. Handler input, `viewKey`, penjaga zoom, dan aturan `touch-action` juga tetap.

**Alasan:** Permintaan pemilik: kontroler harus pas satu layar dan tidak bisa di-scroll ke bawah, di semua ukuran HP, baik tegak maupun mendatar.

**File:**
- `apps/web/src/controller/{controller.css, setup.tsx, room.tsx, views.tsx, motion.tsx, menu.tsx, ingame.tsx, main.tsx}`
- `apps/web/index.html`

**Verifikasi:**
- `npx tsc -p apps/web --noEmit` → 0 error.
- `npx biome check apps/web/src/controller` → bersih.
- `npx vitest run` → 304 lulus.
- Harness sementara (sudah dihapus) + Playwright WebKit/Chromium: 33 tampilan × 18 ukuran (iPhone SE 1/3, iPhone 15, iPhone 15 Pro Max, Moto G4, Galaxy S9+, Pixel 7, 740×360, 667×375; tegak dan mendatar).
  - Sebelum: banyak yang meluber. Contoh: iPhone SE mendatar hanya 8/33 muat, Galaxy S9+ mendatar 4/33.
  - Sesudah: 594/594 muat (tinggi dan lebar alami ≤ layar), tidak ada elemen penting terpotong, dan semua ukuran minimum terpenuhi.
- Uji nyata: layar utama Chromium 1920×1080 (GPU), Host iPhone SE (WebKit), dan pemain Galaxy S9+ (Chromium). Lobi, d-pad Host, soal Kuis, menu pemain, menu Host, Tambah pemain, konfirmasi keluar, dan Tarik (tegak lalu mendatar) → semua pas, `scrollY` 0, tanpa error.
- `npx playwright test` tidak dijalankan di sini (port dipakai). Pemilik/agen lain yang menjalankan.

**Selanjutnya / catatan:**
- Perlu dicoba di HP sungguhan, terutama iOS Safari dengan keyboard terbuka di halaman nama.
- Banner "Game dijeda oleh … (Host)" di HP pemain masih menutupi pil selama jeda (perilaku lama).

### 2026-11-13 — Menu dalam game: pil di tengah atas (Host & pemain)

**Apa yang diubah:**
- **Pil:** pita "Kamu Host · Jeda" diganti tombol pil di tengah atas HP (tegak dan mendatar). Warnanya mengikuti tema game, menjauhi notch, dan aman dari kedua jempol.
- **Pil Host:** game di layar utama dijeda, lalu menu Host terbuka di HP:
  - Lanjutkan.
  - Tambah pemain: QR besar + kode room di layar utama; info kursi atau Hoorah Pass bila penuh.
  - Ulang dari awal (konfirmasi).
  - Keluar game (konfirmasi).
  - Pengaturan: Musik dan Suara di layar utama, Getar di HP ini.
- **Pil pemain lain:** membuka menu pribadi tanpa menjeda game (Lanjut main, Ajak teman dengan kode room, Getar, Keluar dari room).
- **Layar utama:** menu jeda mencerminkan opsi yang sama dan tetap bisa dipakai dengan remote atau keyboard. Pengaturan musik dan suara disimpan.
- **Protokol:** pesan `{k:'host', cmd}` (`HOST_COMMANDS`, hanya diterima dari Host). Pesan `page` membawa `music`, `sound`, `invite`, dan `seats`.
- **Audio:** `setMusicOn()` mematikan musik tanpa mematikan efek suara.

**Alasan:** Permintaan pemilik: tombol jeda di tengah atas berbentuk pil yang membuka pilihan (tambah pemain, keluar game, pengaturan).

**File:**
- `packages/protocol/src/messages.ts`
- `apps/web/src/controller/{ingame.tsx (baru), room.tsx, store.ts, controller.css}`
- `apps/web/src/shared/{audio.ts, ui.tsx}`
- `apps/web/src/screen/{store.ts, pages/GamePage.tsx, screen.css}`
- `e2e/hoorah.spec.ts`

**Verifikasi:**
- `npm run lint` → 0 error.
- `npm test` → 302 lulus.
- `npx playwright test` → lulus. Tes kini mencakup:
  - menu pemain non-Host;
  - jeda lewat pil;
  - Tambah pemain (QR muncul di layar utama, lalu ditutup);
  - sakelar Musik mengubah layar utama;
  - keluar game lewat konfirmasi di HP, untuk kelima game.

**Selanjutnya / catatan:** Pemain yang masuk di tengah game ikut sesuai aturan tiap game (sebagian menunggu game berikutnya).

### 2026-11-13 — Kontroler HP: tidak lagi berkedip dan tidak zoom sendiri

**Apa yang diubah:**
- **Kedip:** setiap pesan tampilan dari game membuat seluruh tampilan HP dipasang ulang (kunci = nomor versi), dan `.ctrl` punya animasi fade-in 0,25 detik.
  - Contoh: Tarik Tambang mengirim kecepatan ketuk dan jam hingga 4×/detik, jadi layar HP memudar lalu muncul lagi berkali-kali per detik. Avatar dimuat ulang dan confetti di layar hasil bisa terputar ulang.
  - Sekarang `viewKey()` di `room.tsx` memakai identitas layar per jenis tampilan (soal, giliran, ronde, langkah, judul menu). Tampilan hanya dipasang ulang bila layarnya benar-benar berganti. Pembaruan angka cukup memperbarui isi.
  - Jam di label ronde Tarik sengaja tidak dihitung sebagai identitas.
  - Menu mengikuti pilihan yang dikirim game.
  - Sinyal `viewVersion` yang tidak terpakai dihapus.
- **Zoom:**
  - `text-size-adjust: 100%`: Safari iOS tidak lagi memperbesar teks saat HP diputar mendatar.
  - `touch-action: pan-x pan-y` untuk semua elemen (lewat `:where(*)`, jadi kontrol dengan `touch-action: none` tetap menang). Ini menutup zoom cubit dan ketuk-dua-kali, termasuk di dalam area yang bisa di-scroll. Sebelumnya `manipulation` masih membolehkan cubitan.
  - Penjaga iOS: event `gesturestart/change/end` diblokir, dan `touchmove` dengan dua jari atau lebih di luar kontrol juga diblokir (pointer event tetap jalan, jadi dua jempol di setir dan pedal aman). Bila halaman tetap ter-zoom, skala dikembalikan ke 1×.

**Alasan:** Laporan pemilik: kontroler di HP kadang zoom sendiri dan kadang berkedip.

**File:** `apps/web/src/controller/{room.tsx,menu.tsx,main.tsx,store.ts,controller.css}`

**Verifikasi:**
- Skrip `flicker.mjs` (layar Chromium + iPhone 15 WebKit + Pixel 7 Chromium) menghitung pemasangan ulang `.ctrl` dan animasi fade-in:

  | Kondisi | Build lama | Sesudah (dev dan Docker `:1010`) |
  | --- | --- | --- |
  | 10 detik mengetuk cepat di Tarik Tambang | iPhone 27×, Android 16× | 0× |
  | Kuis | — | 1× (wajar: dari pilihan jawaban ke "jawaban terkunci") |

- Skala layar tetap 1 setelah ketuk-dua-kali.
- `touch-action` terhitung `pan-x pan-y` di semua elemen.
- `npm run lint` → 0 error.
- `npm run typecheck` → lulus.
- `npm test` → 302 lulus.
- `npx playwright test` → lulus (5 game).
- `npm run docker:up` → sukses.

**Selanjutnya / catatan:** Belum diuji di HP sungguhan. Zoom aksesibilitas Android ("paksa aktifkan zoom") tidak bisa dimatikan dari halaman web.

### 2026-11-13 — Bajaj Rush v2: pedal, item lempar, menu sebelum balapan, 4 mode, 3 sirkuit + arena

**Apa yang diubah:**
- **Kontrol (permintaan pemilik: "terlalu ngepot", "terlalu sensitif"):**
  - Ngepot/drift dihapus seluruhnya.
  - HP kini punya setir kiri/kanan, pedal GAS dan REM, dan tombol ITEM.
  - Gas tidak lagi otomatis. REM mengerem, lalu mundur pelan saat berhenti.
  - Setir naik bertahap 0,25 detik; laju belok 1,9 rad/s saat pelan, turun ke 0,85 rad/s di kecepatan puncak.
  - Cengkeraman ban kuat (slip < 4°), jadi bajaj hanya tergelincir saat terkena item.
- **Item lempar:**
  - Durian dilempar ke depan, atau ke belakang bila REM ditahan saat ITEM ditekan.
  - Petasan mengejar lawan tepat di depan.
  - Item lain: Tumpahan Oli, Turbo Kopi, Helm Baja, Klakson Telolet.
- **Sebelum balapan:**
  1. Host memilih mode, lalu sirkuit (layar utama memutar pratinjau 3D sirkuit).
  2. Tiap pemain memilih warna bajaj di garasi, lalu menekan "Siap". Ada siap otomatis sekitar 30 detik.
  - Setelah balapan: "Main lagi", "Ganti mode", atau "Selesai".
- **Mode:**
  - Grand Prix: CPU mengisi sampai 6 bajaj.
  - Duel 1 lawan 1: tanpa CPU pengisi; satu pemain melawan 1 CPU.
  - Arena Tempur: 3 nyawa berupa lampu, 3 menit, CPU mengisi sampai 4.
  - Lawan Waktu: lawan tampil transparan, putaran tercepat menang.
- **Sirkuit:** Lingkar Kota, Pesisir Pantai (dermaga, mercusuar), Jalur Puncak (kebun teh, kabut), dan arena Lapangan. Tiap sirkuit memutar lagunya sendiri.
- **Fondasi bersama:**
  - Protokol: `DRIVE_GAS`/`DRIVE_BRAKE` menggantikan `DRIVE_DRIFT`; ikon item `durian`/`firecracker`; tampilan HP baru `menu`.
  - HP: setir + pedal di `motion.tsx` (jempol bisa bergeser antara GAS dan REM; REM menang), tampilan menu di `menu.tsx`.
  - Teks katalog Bajaj diperbarui.
- **Perbaikan integrasi:**
  - Opsi menu yang terkunci di HP non-Host dibuat solid, karena sebelumnya latar tema tembus.
  - Lint di efek suara baru `audio.ts` dirapikan; `snare()`/`hat()` lama yang tak terpakai dihapus.
  - Wiper kaca depan bajaj tadinya melintang di wajah pengemudi; sekarang diparkir di bawah kaca. Poster dirender ulang.
  - Lampu rem dan nyala turbo kini tersambung ke keadaan bajaj (`raceview.ts` → `pose()`).

**Alasan:** Masukan pemilik setelah mencoba v1: hapus ngepot, buat seperti balap kart (lempar item ke lawan, injak pedal), setir terlalu sensitif, dan jangan langsung masuk lomba (pilih map, mode 1 lawan 1, dll.). Pemilik memilih tetap Three.js dan keempat mode.

**File:**
- `packages/protocol/src/messages.ts`
- `apps/web/src/controller/{motion.tsx,menu.tsx (baru),views.tsx,controller.css}`
- `apps/web/src/shared/{ui.tsx,games.ts,audio.ts}`
- `apps/web/src/games/bajaj/`:
  - diubah: `logic.ts`, `ai.ts`, `results.ts`, `strings.ts`, `fx.ts`, `track.ts`, `city.ts`, `views.ts`, `driver.ts`, `hud.tsx`, `bajaj.css`, `main.tsx`, `scene.ts`, `logic.test.ts`
  - baru: `raceview.ts`, `showroom.ts`, `flyover.ts`, `tracks.ts`, `arena.ts`, `maps/{types,kit,pantai,puncak,lapangan,index}.ts`
- `e2e/hoorah.spec.ts` (alur Bajaj lewat menu, lalu tahan GAS)
- `PRD-Hoorah.md` (Game 4, tema HP per game, musik per game)

**Verifikasi:**
- `npm run lint` → 0 error (182 file).
- `npm run typecheck` → lulus.
- `npm test` → 302 tes lulus (60 Bajaj).
- `npx playwright test` → lulus (1,3 menit): 5 game, layar Chromium + iPhone WebKit + Android Chromium; Bajaj lewat menu mode → sirkuit Pantai → warna → Siap → GAS.
- Agen menjalankan alur nyata semua mode (2 dan 4 HP; 16:9, 16:10, 4:3); errors: none.
- `npm run docker:up` → build sukses. Alur penuh Grand Prix Puncak 2 HP di `:1010` (1512×945) dari menu sampai podium → errors: none.

**Selanjutnya / catatan:**
- Belum diuji di HP sungguhan, laptop lemah, dan browser Smart TV.
- Pemain yang keluar room tampil sebagai "Pemain" tanpa avatar di podium shell.

### 2026-11-13 — Bajaj Rush: tampilan 3D PBR (bajaj bulat & mengilap, kota, bayangan)

**Apa yang diubah:**
- **Rendering:** material PBR, ACES Filmic, pantulan langit prosedural (hanya pada cat, krom, kaca, fasad jendela, air), matahari hangat + cahaya langit, bayangan lembut asli per layar.
- **Bajaj dimodel ulang:** bodi melengkung mengilap (clearcoat), kanopi kanvas, atap berlipat, kaca depan melengkung, krom, ban berpola tapak, lampu menyala.
- **Pengemudi buah:** lebih halus dan mengilap.
- **Kit kota:** tepi bangunan membulat, jendela berbingkai, tenda melengkung, pohon bergumpal, lampu berlengan lengkung, kendaraan membulat.
- **Modul baru `look.ts`:** pustaka material, langit per peta, bayangan, dan tingkat kualitas otomatis (bayangan turun lebih dulu sebelum resolusi; Smart TV mulai dari tingkat rendah).
- **Optimasi Lingkar Kota:**
  - bayangan semua layar digambar lebih dulu;
  - LOD kota dan bajaj;
  - pantulan hanya pada material mengilap;
  - penonton/lalu lintas tidak digambar di layar yang tidak melihatnya.
- **Poster baru.**

**Alasan:** Masukan pemilik: game harus terlihat benar-benar 3D, tidak kotak-kotak, bulat dan mengilap.

**File:** `apps/web/src/games/bajaj/{look.ts (baru), kart3d.ts, fruit3d.ts, buildings.ts, props.ts, geo.ts, textures.ts, scene.ts, city.ts}`, `apps/web/public/keyart/bajaj.jpg`

**Verifikasi:**
- Diperiksa agen: `npx tsc -p apps/web` lulus; `npx biome check apps/web/src/games/bajaj` bersih; `npx vitest run apps/web/src/games/bajaj` 60 tes lulus.
- Playwright manual (M1, 1920×1080, kualitas tertinggi):
  - Lingkar Kota 1, 2, dan 4 layar stabil 60 fps; sebelumnya 4 layar 30–42 fps.
  - Pantai/Puncak/Arena dengan 4 layar: 60 fps.
- Pemeriksaan akhir ada di entri di atas.

**Selanjutnya / catatan:**
- Belum diuji di laptop lemah, Smart TV, dan HP.
- Memori verteks naik dari 35 ke 57 MB.
- Kaca toko di blok kota tidak memantulkan langit.
- Kit peta lain masih memakai kotak tajam (`boxBevel = 0`).

### 2026-11-13 — Musik: lagu orisinal sendiri untuk setiap game

**Apa yang diubah:**
- Mesin musik baru di `apps/web/src/shared/music/`, tetap tanpa file audio (semua disintesis Web Audio):
  - `theory.ts`: nada, akor, voicing, derajat. `score.ts`: format partitur (pola per 16-an, seksi, fill, transpos) dan kompilernya.
  - `synth.ts`: instrumen. ADSR, osilator berfilter, FM 2-operator (e-piano, vibrafon, marimba, lyra, steel pan, gong), Karplus–Strong (ukulele cak/cuk, kacapi, clav, cello pizzicato), kendang Jawa dan Sunda, perkusi noise (snare dengan roll/flam, clap, shaker, tamborin, woodblock, simbal), suling/flute bernapas, brass, angklung bergetar.
  - `player.ts`: penjadwal look-ahead 0,3 detik, crossfade ±0,6 detik, reverb bersama (ConvolverNode, impuls dibuat sendiri), delay per lagu, dan `renderSong()` untuk render offline. `presets.ts`: instrumen siap pakai.
  - `songs/*.ts`: 9 lagu, masing-masing 28–36 birama dengan intro, seksi A/B/A2, bridge/break, dan fill.
- Lagu per track (judul hanya di kode):
  - `menu`: lounge bossa (94 bpm).
  - `kuis`: funk acara kuis (118).
  - `tarik`: drumband 17-an (128).
  - `rusun`: marimba pelog, jenaka dan sedikit tegang (104).
  - `bajaj`: dangdut koplo (140).
  - `bajaj-pantai`: tropis steel pan (130).
  - `bajaj-puncak`: angklung dan kacapi bernuansa Sunda (134).
  - `bajaj-arena`: laga (150).
  - `masak`: swing keroncong (112).
- `audio.ts` kini hanya mendelegasikan `music()` ke player. Tipe `Track` bertambah `bajaj-pantai`, `bajaj-puncak`, `bajaj-arena`. Id yang tidak dikenal = hening tanpa error. Sfx, `unlock()`/`onReady`, dan mute tidak berubah.
- Mode ringan (tanpa reverb/delay) otomatis untuk browser Smart TV (`looksLikeTv()`) dan perangkat ≤ 2 core.
- Semua lagu diseimbangkan ke −18 LUFS sebelum bus musik (lama: −16 s.d. −19). Puncak ≤ −1 dBFS. Level bus tidak diubah.

**Alasan:** Permintaan pemilik: "setiap game lagunya beda2". Sebelumnya semua track hanya loop 2 birama dengan oskilator yang sama.
**Ditemukan saat mengukur:** Chromium tidak melepas node yang sudah selesai tapi masih tersambung. Voice dengan 2 osilator membuat biaya render terus naik (20 detik: 997 ms vs 184 ms). Kini setiap voice diputus sambungannya saat selesai (`onended`).
**File:** `apps/web/src/shared/music/{theory,score,synth,presets,player}.ts`, `apps/web/src/shared/music/songs/{index,menu,kuis,tarik,rusun,bajaj,bajaj-pantai,bajaj-puncak,bajaj-arena,masak}.ts`, `apps/web/src/shared/music/music.test.ts`, `apps/web/src/shared/audio.ts` (hanya bagian musik dan pembuatan bus)

**Verifikasi:**
- `npx tsc -p apps/web` → lulus.
- `npx vitest run` → 302 tes lulus, termasuk 46 tes musik (parser, akor/voicing, derajat, kompilasi semua lagu, rentang nada, Karplus–Strong).
- `npx biome check apps/web/src/shared/music` → bersih.
- Render offline Chromium, 60 detik, terbaik dari 3, di mesin yang sedang sibuk:
  - lagu baru 1,4–2,2 detik; mode ringan 0,66–1,5 detik; mesin lama 0,13–0,33 detik.
  - 44–121 node per detik; 0 nada terbuang.
- Cek langsung di `http://localhost:5173/?tv` (Chromium):
  - semua 9 track berbunyi, crossfade dan `music(null)` memudar, id tak dikenal hening;
  - mute dan sfx tetap jalan; 0 error konsol.

**Selanjutnya / catatan:**
- Bajaj Rush masih selalu memanggil `game.music('bajaj')`. Untuk lagu per sirkuit, game perlu memanggil `bajaj-pantai`, `bajaj-puncak`, atau `bajaj-arena` sesuai sirkuit.
- Belum didengar di Smart TV/laptop lemah sungguhan.
- `audio.ts`: helper `snare()`/`hat()` kini tidak dipakai (peringatan Biome), dibiarkan karena agen lain sedang menambah sfx.

### 2026-11-13 — Kontroler HP ikut tema game (bukan lagi "remote AC")

**Apa yang diubah:**
- Selama game berjalan (dan di layar hasil di dalam game), HP memakai dunia game itu: latar ilustrasi, palet, bahan tombol, dan pita Host. Lobi, pengaturan, dan pad Host (termasuk saat jeda) tetap gaya Hoorah netral.
- **Kuis Nusantara:** panggung kuis. Dinding batik kawung teal, tirai dan valance merah, lantai panggung bergaris kuning. Soal tampil di papan LED dengan bingkai lampu bohlam seperti di layar utama.
- **Rusun:** langit biru, jib dan tiang crane kuning, penggaris lantai, siluet kota. Saat giliranmu, layar berbingkai pita hazard. JATUHKAN jadi tombol jamur kuning di atas pelat dasar bergaris hazard. Lintasan crane digambar sebagai jib.
- **Tarik Tambang:** lapangan 17-an dengan bendera merah putih, bukit, pagar, dan tanah. Tombol TARIK! memakai warna tim dan menjadi penanda tengah tali. Tali melintang di atas genangan lumpur dan garis tengah. Skor tampil di papan kayu.
- **Bajaj Rush:** langit siang dengan ruko dan gedung, kerb merah putih, dan aspal. Pita Host bertepi garis finis kotak-kotak.
  - Setir: panel dasbor dengan roda kemudi yang ikut berputar saat ditekan; panah ada di pegangan jam 9 dan jam 3.
  - Pedal: REM dan GAS dari karet bergerigi berbingkai baja. GAS memakai warna bajaj pemain dan geriginya menyala saat ditekan.
  - Slot item: putus-putus saat kosong, kuning saat ada item.
  - Pemilih warna menampilkan bajaj kecil di setiap warna.
- **Jago Masak:** dinding krem, ubin teal, dan meja kayu. Bantalan gerakan menyesuaikan langkah:
  - pisau: talenan;
  - ulek: cobek batu berisi sambal;
  - tabur: piring berbibir oranye;
  - aduk: wajan besi bergagang kayu;
  - usap: daun pisang (atau piring saji untuk sendok);
  - tahan: wajan dengan api kompor saat ditekan (atau mangkuk bumbu kacang).
- Cara kerja: `useControllerTheme(gameId)` memasang `data-game` di `<html>` dan menggambar satu SVG pemandangan seukuran layar (digambar ulang hanya saat bentuk layar berubah, mis. diputar). Warna dan bahan lewat token CSS per game. Game tanpa tema otomatis tetap netral.
- Status tekan tanpa transisi (muncul di frame yang sama). Ini juga berlaku untuk tombol besar, jawaban, dan d-pad.
- Teks kecil diberi pelat atau diletakkan di area latar yang polos supaya kontras tetap tinggi. Tidak ada violet, blur, `backdrop-filter`, atau animasi besar.

**Alasan:** permintaan pemilik: kontroler harus selaras dengan game, jangan terasa "tempelan kayak remote AC". Sesuai PRD 4.3 "Tema per game".

**File:** `apps/web/src/controller/themes.ts` (baru), `apps/web/src/controller/controller.css`, `apps/web/src/controller/views.tsx`, `apps/web/src/controller/motion.tsx`, `apps/web/src/controller/common.tsx`, `apps/web/src/controller/room.tsx` (hanya pemasangan tema + pita Host)

**Verifikasi:**
- `npx biome check apps/web/src/controller` → lulus (0 error, 0 peringatan).
- `npx tsc -p apps/web --noEmit` → 0 error di luar `src/games/bajaj/` (error di sana dari pengerjaan ulang Bajaj Rush yang sedang berjalan).
- `npx vitest run` → 196 tes lulus. 1 suite gagal: `games/bajaj/logic.test.ts` (`getTrack is not a function`), juga dari pengerjaan ulang Bajaj.
- Harness sementara (semua jenis tampilan × 5 tema, sudah dihapus) difoto dengan Playwright di iPhone 15 (WebKit) dan Pixel 7 (Chromium), tegak dan mendatar, termasuk status tekan.
- Skrip Playwright di aplikasi sungguhan (layar utama + iPhone Host + Pixel): kelima game memasang tema yang benar. Saat jeda, pad Host netral sementara HP lain tetap bertema. Setelah keluar dari game, tema hilang.
- `npx playwright test` tidak dijalankan karena port dipakai dev server.

**Selanjutnya / catatan:**
- Uji di HP Android kelas menengah sungguhan dan di luar ruangan.
- `e2e/hoorah.spec.ts` masih menyebut `.drive-drift`, yang sudah tidak ada sejak kontrol bajaj dibangun ulang.
- Untuk game baru: tambah entri di `THEMES` (`themes.ts`) dan blok token `html[data-game='<id>']` di `controller.css`.

### 2026-11-13 — Bajaj Rush & Jago Masak: dua game 3D baru

**Apa yang diubah:**
- **Bajaj Rush (balap 3D):**
  - Sirkuit kota "Lingkar Kota" ±1 km: S di jalan pasar, bundaran tugu, flyover, dan U-turn.
  - Gas otomatis. HP untuk setir kiri/kanan, NGEPOT (lepas untuk turbo 3 tingkat), dan item dari kardus: Turbo Kopi, Tumpahan Oli, Klakson Telolet, Helm Baja.
  - Lawan CPU mengisi slot kosong sampai 6 pembalap; CPU juga mengambil alih bajaj pemain yang terputus.
  - Tata letak layar: 1 pemain penuh, 2 atas-bawah, 3–4 empat bagian, 5–8 satu kamera siaran.
  - Penghargaan: Putaran Kilat, Raja Ngepot, Jago Usil, Tukang Salip, Sopir Rapi.
- **Jago Masak (masak 3D):**
  - Tuan rumah Chef Mangga. 3 hidangan × 6 langkah (Nasi Goreng, Sate Ayam, Martabak Manis) dengan gerakan ketuk, putar, usap, dan tahan di HP.
  - Nilai per langkah Sempurna/Bagus/Lumayan/Gagal, bonus beruntun, 1–3 bintang per hidangan. Piring akhir menunjukkan hasil sebenarnya (telur gosong, saus tumpah, dll.).
  - Penghargaan: Bintang Dapur, Pisau Tercepat, Anti Gosong, Jago Aduk, Tangan Emas.
- **Kesamaan kedua game:**
  - Three.js 0.186, model prosedural tanpa file aset, logika murni dengan tes.
  - Jeda membekukan waktu, pemain bisa masuk lagi, resolusi turun otomatis bila fps rendah.
  - Teks pemain di `strings.ts`. Poster 1280×720 di `public/keyart/`.
- **Fondasi bersama:**
  - Protokol: tampilan HP `drive` dan `gesture`, plus konstanta `DRIVE_*` dan `GESTURE_HOLD`.
  - HP: `motion.tsx` (setir, tombol tahan, cincin aduk, area usap) dan `common.tsx`. `setHeld()` mengirim tombol yang ditahan.
  - Suara: efek mesin, drift, telolet, potong, desis, aduk, dll., plus lagu `bajaj` dan `masak`.
  - Katalog: urutan beranda bajaj, masak, tarik, kuis, rusun. Baris kartu bergeser mengikuti fokus. Poster dipakai di kartu.
- **Perbaikan saat integrasi:**
  - HP tidak lagi membuat ulang tampilan `drive`/`gesture` di setiap pembaruan (`viewKey` di `room.tsx`). Sebelumnya setiap perubahan posisi/progres melepas setir yang sedang ditahan dan memutus gerakan aduk/usap. Jalan pintas di driver Masak dihapus, jadi bar progres HP kini jalan di semua langkah.
  - `setPointerCapture` dibungkus try/catch (melempar error bila jari sudah terangkat).
  - Hitung mundur Bajaj di mode 3–4 pemain kini tampil per bagian layar, tidak menutupi HUD di tengah.
  - Katalog Bajaj: durasi "± 3 menit" (hasil simulasi), "Cara main" menyebut helm baja.
  - e2e: Chromium dijalankan dengan GPU, karena tanpa GPU fps WebGL jatuh di bawah batas dan jam game sengaja melambat. Alur e2e kini memainkan 5 game.
  - Teks skrip `dev`/`docker:up`: "PC/laptop/tablet/Smart TV".

**Alasan:** Permintaan pemilik: game bajaj bergaya balap kart dan game masak bergaya dapur, aset 3D, detail. Nama, karakter, item, dan tampilan semuanya orisinal.
**File:**
- Game: `apps/web/src/games/bajaj/**` (20 file), `apps/web/src/games/masak/**` (23 file), `apps/web/games/{bajaj,masak}/index.html`, `apps/web/public/keyart/{bajaj,masak}.jpg`
- HP: `apps/web/src/controller/{motion.tsx,common.tsx,views.tsx,room.tsx,store.ts,controller.css}`
- Bersama: `apps/web/src/shared/{games.ts,keyart.tsx,ui.tsx,audio.ts,art/extra.ts}`
- Layar & protokol: `apps/web/src/screen/{pages/HomePage.tsx,screen.css}`, `packages/protocol/src/messages.ts`
- Konfigurasi & tes: `apps/web/vite.config.ts`, `apps/web/package.json` (`three`, `@types/three`), `e2e/hoorah.spec.ts`, `scripts/{dev,docker-up}.mjs`

**Verifikasi:**
- `npm run lint` → 0 error (152 file).
- `npm run typecheck` → lulus.
- `npm test` → 229 tes lulus (termasuk 33 Bajaj, 36 Masak).
- `npx playwright test` → lulus (52 detik). Alur penuh 5 game dengan layar Chromium 1920×1080, iPhone 15 WebKit, dan Pixel 7 Chromium; 0 error konsol.
- `npm run docker:up` → build sukses. Kedua game dimuat dari `:1010` di 1512×945 (16:10) dan 1024×768 (4:3) tanpa error; poster terlayani (200).
- fps (M1, 1920×1080): Bajaj 57–60 untuk 1–8 pemain; Masak ±60 untuk 1–8 stasiun.

**Selanjutnya / catatan:**
- Belum diuji di laptop dengan GPU lemah atau browser Smart TV. Bajaj 4 pemain ±415 draw call; game melambat bila fps < ~10.
- Bajaj: pemain yang tidak menyetir akan menempel di dinding tikungan pertama sampai ditarik balik (5,5 detik).
- Masak: dengan 3+ stasiun, makanan tidak membuat bayangan.
- Mode pratinjau dev (`?demo=`, `?poster=1`, `&cam=`) masih ada dan tidak tersambung ke shell.
- Teks "LEPAS SAAT PAS"/"TAHAN" di `motion.tsx` masih ditulis langsung di komponen; perlu dipindah ke file string.

### 2026-11-13 — Istilah: "layar utama", bukan "TV"

**Apa yang diubah:**
- CLAUDE.md mendapat aturan baru di bagian Komunikasi. Perangkat konsol disebut "layar utama" atau "layar", karena berjalan di PC, laptop, tablet, dan Smart TV. Kata "TV" hanya dipakai bila memang membahas Smart TV. Desain dan pengujian wajib mencakup rasio 16:9, 16:10, dan 4:3.
- Bagian lain CLAUDE.md (deskripsi proyek, tabel peran, stack, struktur, perintah) juga disesuaikan.
- Sekitar 20 teks pemain diganti dari "TV" ke "layar"/"layar utama":
  - HP: kode room, lobi, jeda, terputus, reaksi.
  - Katalog: Cara main Kuis, tips Rusun, Jago Masak.
  - Teks Kuis dan Rusun, serta simulator.
  - "Minta pemilik TV membuka Hoorah Pass" menjadi "Minta Pemilik Room ...", sesuai istilah terkunci.
- Kedua agen yang sedang membangun Bajaj Rush dan Jago Masak diberi aturan yang sama.
- PRD: sebutan umum "TV" diganti "layar utama", dan tablet ditambahkan ke daftar perangkat. Sebutan yang memang khusus Smart TV (overscan, remote, browser Tizen/webOS, silau) tetap.

**Alasan:** Permintaan pemilik: layar utama bukan hanya TV, melainkan semua perangkat.
**File:** `CLAUDE.md`, `PRD-Hoorah.md`, `apps/web/src/shared/games.ts`, `apps/web/src/controller/{room.tsx,setup.tsx,views.tsx}`, `apps/web/src/games/kuis/strings.ts`, `apps/web/src/games/rusun/{strings.ts,logic.test.ts}`, `apps/web/src/sim/main.tsx`
**Verifikasi:** `npx biome check` (folder yang diubah) → 0 error; `npx tsc -p apps/web` → tanpa error di luar folder game baru yang sedang dibangun; `npx vitest run` (protocol, server, kuis, rusun, tarik) → 160 lulus.
**Selanjutnya / catatan:** Komentar kode berbahasa Inggris tetap memakai "screen".

### 2026-11-13 — Rusun: crane bandul, jatuh lurus, roboh realistis; layar penuh tanpa pita

**Apa yang diubah:**
- **Rusun v2 (agen):** angin dan goyangan menara dihapus. Ayunan stabil: periode 3 detik, 2% lebih cepat per lantai, minimal 2 detik. Meter KESEIMBANGAN (Aman/Waspada/Bahaya) dari titik berat geometris. HP hanya menampilkan tombol JATUHKAN.
- **Crane jadi bandul:** troli diam di tengah, tali tergantung dari satu titik, lantai berayun kiri-kanan (amplitudo 200 px, tali ±38°, lantai miring 0,35× sudut tali).
- **Jatuh lurus dan pas:** lantai dilepas tepat di posisi yang terlihat di TV saat tombol diterima, jatuh lurus (340 ms), lalu mendarat di situ. Dua hal lama dihapus: pemunduran ke waktu tekan HP (maks 300 ms) yang membuat lantai loncat ke samping, dan tarikan PAS ±8 px ke tengah. PAS tetap dinilai dalam ±8 px.
- **Roboh realistis:** grup lantai miring di sudut penopang, lepas di 36°, jatuh dengan putaran yang melambat (maks 62°), sudutnya menyentuh jalan, lalu rebah ke sisi titik beratnya: datar, atau menyamping untuk tumpukan tinggi. Lantai tidak menembus menara (tergelincir di sisi luarnya). Sebelumnya grup berputar sampai 100° dan berdiri tegak seperti tiang.
- **Layar penuh tanpa pita:** stage TV mengikuti bentuk layar (16:10, 4:3, ultrawide). Beranda dan detail menyebarkan ruang ekstra. Stage game bertambah tinggi di layar yang lebih tinggi dari 16:9: Rusun dan Tarik menampilkan langit tambahan di atas, dan canvas Phaser diubah ukurannya saat masuk/keluar layar penuh.
- **Teks:** deskripsi dan Cara main Rusun tidak lagi menyebut "goyangan".

**Alasan:** Masukan pemilik: ayunan terlalu cepat dan bergoyang, roboh terlihat meledak, tali harus dari satu titik, lantai loncat ke samping saat dijatuhkan, layar penuh terpotong atas-bawah.
**File:** `apps/web/src/games/rusun/{logic.ts,logic.test.ts,scene.ts,main.tsx,rusun.css,driver.ts,hud.tsx,views.ts,strings.ts}`, `apps/web/src/games/tarik/{main.tsx,scene.ts,hud.css}`, `apps/web/src/games/common/stage.ts`, `apps/web/src/screen/{main.tsx,screen.css}`, `apps/web/src/shared/games.ts`, `e2e/hoorah.spec.ts` (format)
**Verifikasi:**
- `npx biome check .` → 0 error; `npm run typecheck` → lulus; `npx vitest run` → 160 tes lulus (36 di Rusun).
- `npx playwright test` → lulus (TV Chrome, iPhone WebKit, Android Chrome, ketiga game).
- Screenshot Playwright dicek di 1512×945 (16:10), 1024×768 (iPad 4:3), dan 1920×1080: bandul, jatuh lurus, meleset tergelincir lalu rebah, roboh rebah datar, beranda/detail/Tarik/Kuis penuh tanpa pita.
- `npm run docker:up` → server healthy; satu giliran Rusun dites langsung ke `http://192.168.0.102:1010`, tanpa error.

**Selanjutnya / catatan:**
- Tanpa pemunduran waktu, jeda jaringan menggeser titik lepas. Di Wi-Fi lokal (±20–40 ms) geserannya ±8–17 px. Lewat VM Oregon (RTT 170–220 ms) bisa ±80 px. Ukur latensi sungguhan sebelum Rusun dimainkan lewat VM.
- Di layar ultrawide (lebih lebar dari 16:9), game masih memakai pita samping.

### 2026-11-13 — Layar penuh, suara otomatis, kartu tanpa kotak, gerakan dikurangi

**Apa yang diubah:**
- **Layar penuh:** tombol di layar awal ("Mulai: layar penuh" + chip "Layar penuh"), ikon di bilah atas beranda, dan tombol F di keyboard/remote.
- **Suara otomatis:** musik dicoba diputar saat halaman dibuka. Kalau browser memblokir, interaksi pertama apa pun (klik, sentuh, tombol remote) langsung menyalakannya. Ikon suara bertuliskan "Klik untuk suara" saat masih terkunci, dan klik pertama tidak lagi membisukan.
- **Kartu game:** saat dipilih hanya gambarnya yang membesar dengan cincin; tidak ada kotak di sekitar judul. Lebar kartu 224 px supaya kelimanya muat dalam batas tepi.
- **Gerakan dikurangi:** tombol + tidak lagi naik-turun, cincin fokus diam (tidak berdenyut), avatar lobi HP tidak memantul, mahkota dan sinar hasil hanya animasi sekali muncul.
- **Notifikasi "bergabung" dari layar awal** tidak diulang di beranda.

**Alasan:** Masukan pemilik setelah mencoba di laptop.
**File:** `apps/web/src/shared/audio.ts`, `apps/web/src/screen/{fullscreen.ts,main.tsx,store.ts,components.tsx,screen.css,pages/JoinPage.tsx,pages/HomePage.tsx}`, `apps/web/src/shared/{ui.tsx,base.css}`, `apps/web/src/controller/{controller.css,views.tsx}`
**Verifikasi:**
- `biome` → 0 error; `tsc` → lulus; 163 tes unit lulus.
- `npx playwright test` → lulus (TV Chrome, iPhone WebKit, Android Chrome).
- Screenshot di ukuran 1680×960 diperiksa; layar penuh dan pembukaan suara terkonfirmasi lewat klik tombol Mulai.
- Docker dibangun ulang dan health OK.

**Selanjutnya / catatan:** Suara tanpa interaksi sama sekali tidak mungkin di browser standar (aturan autoplay). Yang bisa dilakukan hanya membuat interaksi pertama apa pun langsung menyalakannya.

### 2026-11-13 — MVP lengkap: platform + 3 game, jalan di Docker (port 1010)

**Apa yang diubah:** Membangun seluruh aplikasi dari nol (M0–M6).
- **Repo:** npm workspaces, TypeScript strict, Biome, Vitest, Playwright, git lokal (belum ada commit).
- **`packages/protocol`:** tipe pesan, validasi ketat, frame biner ketukan 11 byte, sinkronisasi jam, kode room 4 huruf.
- **`packages/sdk`:** API game (`connect`, `setView`, `end`, `sfx`, `music`) lewat postMessage.
- **`apps/server`:** uWebSockets.js, logika room murni yang teruji (Host, batas pemain, slot ditahan 120 detik, Host pindah otomatis, snapshot ke file saat restart, rate limit).
- **`apps/web`:**
  - Satu alamat untuk semua perangkat (`src/main.ts` mendeteksi HP sebagai kontroler; laptop, TV, dan tablet sebagai layar utama; link QR selalu jadi kontroler; peran bisa ditukar manual).
  - Aplikasi TV: Gabung (QR), Beranda, Detail, Game (iframe), Jeda, Hasil dengan podium, penghargaan, dan "Main lagi" otomatis, plus notifikasi dan reaksi.
  - Aplikasi HP: kode, nama dan buah, lobi, D-pad Host, 7 jenis tampilan kontroler, reconnect otomatis, proteksi tombol back.
  - Audio sintesis Web Audio, confetti, ilustrasi SVG dari desain, simulator `/sim/`.
- **Game:**
  - Kuis Nusantara: Preact, 104 soal.
  - Tarik Tambang: Phaser, ketukan biner, tarikan super.
  - Rusun: Phaser, crane berayun, fisika sederhana; lantai meleset tidak langsung roboh.
- **Docker:** build multi-tahap, base Debian 13 (glibc 2.38 dibutuhkan uWS), Caddy dengan blok `handle` agar `/ws` tidak tertimpa `try_files`, port default 1010, IP LAN otomatis di QR.
- **Perbaikan dari tes:**
  - Peta fokus TV yang terhapus saat Jeda (disposer sekarang hanya melepas miliknya sendiri).
  - Tombol Jeda Host menutupi jawaban (dipindah ke strip atas).
  - Cincin super Tarik tidak pas dengan garis putih.
  - Toast menutupi QR.
  - Lencana kartu menutupi logo.

**Alasan:** Permintaan pemilik: aplikasi siap dicoba di perangkat sungguhan lewat Docker.
**File:** `apps/*`, `packages/*`, `docker/*`, `e2e/*`, `scripts/*`, konfigurasi root; PRD dan CLAUDE.md diselaraskan (stack final, satu URL, port 1010).
**Verifikasi:**
- `npm run lint` → 0 error.
- `npm run typecheck` → lulus.
- `npm test` → 163 tes lulus.
- `npm run build` → sukses (kontroler HP ±26 KB gzip, TV ±40 KB, Phaser 319 KB khusus TV).
- `npx playwright test` → 1 skenario lengkap lulus: TV Chrome 1080p + iPhone 15 (WebKit) + Pixel 7 (Chrome), termasuk QR, ketik kode, HP ketiga ditolak (room penuh), reload lalu masuk lagi, navigasi Host, 3 game dimainkan, jeda, keluar, tanpa error konsol.
- Deteksi perangkat dicek: iPad dan tablet Android jadi layar utama.
- Docker: `server` healthy, ketiga game diuji lewat `http://192.168.0.102:1010` tanpa error.
- Belum diuji di HP fisik dan Smart TV fisik.

**Selanjutnya / catatan:**
- Pemilik menguji di iPhone sungguhan.
- 104 soal kuis perlu dicek kebenaran faktanya.
- Getar tidak ada di iPhone (keterbatasan Safari); Wake Lock butuh HTTPS.
- Region server dan WebRTC masih ditunda.

### 2026-11-12 — Ilustrasi Rusun dibuat jauh lebih detail

**Apa yang diubah:** Komponen baru `RusunScene` (adegan 1280×720 yang bisa diskalakan) dipakai di key art Rusun, layar permainan, dan momen roboh. Detail baru: lantai dengan sisi bayangan, kusen, kilau kaca, tirai, krepyak, balkon berpagar dengan pot tanaman, jemuran baju, AC, pipa talang, penghuni buah di jendela; lantai dasar berupa warung dengan terpal dan rolling door; latar gunung berapi berasap, awan berbayang, gedung kota, pohon kelapa, atap genteng, gerobak bakso, jalan; crane dengan rangka, pemberat, kait, dua tali, dan dua tukang berhelm di lantai yang diayun.
**Alasan:** Masukan pemilik: gambar Rusun masih terlalu sederhana; minta tingkat detail setara game komersial tanpa meniru gaya AirConsole.
**File:** `design/RusunScene.dc.html` (baru), `design/Rusun-TV.dc.html`, `design/KeyArt.dc.html`, `design/canvas.json`
**Verifikasi:** tidak diverifikasi secara visual oleh Claude; menunggu review pemilik.
**Selanjutnya / catatan:** Jika gaya ini disetujui, key art Tarik Tambang dan Kuis bisa dinaikkan ke tingkat detail yang sama.

### 2026-11-12 — Game ketiga "Rusun" ditambahkan ke MVP

**Apa yang diubah:** Desain game baru **Rusun** (susun lantai rumah susun dengan crane berayun; lantai makin kecil ke atas; yang merobohkan kalah): key art, layar TV saat bermain, momen roboh, dan 3 layar HP (giliranmu, menunggu dengan reaksi Sorak/Huuu, kalah dengan tombol "Minta revans"). Rusun ditambahkan di Beranda dan layar Gabung. PRD: daftar game Fase 1 diperbarui menjadi Kuis Nusantara, Tarik Tambang, Rusun; Bajaj Rush, Gambar Kilat, dan Panjat Pinang ditunda ke Fase 2.
**Alasan:** Usulan pemilik. Mekanik genre susun-menara diadaptasi dengan nama, tema, dan aset orisinal.
**File:** `design/Rusun-TV.dc.html`, `design/Rusun-Roboh.dc.html`, `design/Rusun-HP.dc.html`, `design/KeyArt.dc.html`, `design/TV-Home.dc.html`, `design/TV-Join.dc.html`, `design/canvas.json`, `PRD-Hoorah.md`
**Verifikasi:** tidak diverifikasi secara visual oleh Claude; menunggu review pemilik.
**Selanjutnya / catatan:** Dengan 3 game, Fase 1 diperkirakan 2–3 minggu lebih lama untuk pengembang tunggal. Timing tombol JATUHKAN harus memakai cap waktu dari HP agar adil.

### 2026-11-12 — Istilah "VIP" diganti "Host"

**Apa yang diubah:** Peran pengendali (dulu "VIP") sekarang bernama **Host**. Supaya tidak bentrok: layar TV/laptop disebut **Screen / Layar utama** (tidak lagi "Host"), dan orang yang membuka layar serta membeli Hoorah Pass disebut **Pemilik Room**. Host adalah peran gratis, bukan status berbayar.
**Alasan:** Keputusan pemilik; "VIP" terkesan berbayar.
**File:** `PRD-Hoorah.md` (glosarium, alur, requirement, KPI), `design/*.dc.html`, `design/canvas.json`
**Verifikasi:** pencarian teks: tidak ada sisa "VIP" di PRD dan desain.
**Selanjutnya / catatan:** Salinan PRD di claude.ai belum diperbarui; `PRD-Hoorah.md` lokal yang jadi acuan. Nama method SDK `getMasterControllerDeviceId` tetap, bisa diganti `getHostDeviceId` saat SDK ditulis.

### 2026-11-12 — Desain v2: key art, arena game, prinsip psikologi

**Apa yang diubah:** Komponen baru `KeyArt` (ilustrasi 5 game: Tarik Tambang lomba 17-an dengan 2 karakter menarik tali, panggung Kuis Nusantara, Bajaj Rush, Gambar Kilat, Panjat Pinang). Beranda dirombak (hero full-bleed, baris "Pas untuk 2 pemain"), layar Gabung lebih ramai (langkah berikon, etalase game), Detail bergaya halaman toko, Kuis jadi panggung acara kuis (layar soal dan jawaban satu komponen), arena Tarik Tambang dengan HUD siaran olahraga, layar Hasil dengan penghargaan untuk semua pemain dan "Main lagi" otomatis, kontroler HP Kuis/Tarik dengan tombol 3D, kombo, dan beruntun. Catatan prinsip UX ditaruh di kanvas.
**Alasan:** Masukan pemilik: tampilan v1 terlalu dasar; harus siap rilis, menarik, dan membuat betah.
**File:** `design/*.dc.html` (baru: `KeyArt.dc.html`), `design/canvas.json`
**Verifikasi:** tidak diverifikasi secara visual oleh Claude; menunggu review pemilik.
**Selanjutnya / catatan:** HP-Gabung dan HP-Status belum dipoles ulang ke gaya v2.

### 2026-11-12 — Desain UI & game MVP (Claude Design)

**Apa yang diubah:** Membuat kanvas desain lengkap: logo dan brand, komponen avatar buah, 6 layar TV (Gabung, Beranda, Detail, Memuat, Hasil, Menu jeda/toast/upsell), 6 layar HP (alur gabung, VIP, putus koneksi, room penuh), game Kuis Nusantara (TV soal, TV jawaban, 3 layar HP), dan Tarik Tambang (TV permainan, 2 layar HP mendatar). Masukan pemilik yang sudah diterapkan: tanpa violet, tidak bergaya "AI", tampilan ringkas, avatar buah Nusantara yang lucu, tanpa ikon khusus buta warna untuk sekarang.
**Alasan:** Desain disepakati sebelum mulai coding.
**File:** `design/*.dc.html`, `design/canvas.json` (salinan sumber); kanvas online https://claude.ai/artifact/S55SjiGKSmm9RRQmVTfyH6
**Verifikasi:** tidak diverifikasi secara visual oleh Claude; menunggu review pemilik.
**Selanjutnya / catatan:** PRD bab 4.1 masih menyebut Electric Violet dan ikon bentuk buta warna; perlu diselaraskan dengan desain ini.

### 2026-11-12 — CLAUDE.md dan PROGRESS.md dibuat

**Apa yang diubah:** Membuat `CLAUDE.md` (aturan kerja, batasan server, aturan teknis) dan `PROGRESS.md` (log pengerjaan ini).
**Alasan:** Permintaan pemilik proyek agar setiap perubahan tercatat dan ada aturan yang konsisten untuk setiap sesi kerja.
**File:** `CLAUDE.md`, `PROGRESS.md`
**Verifikasi:** tidak diperlukan (hanya dokumen).
**Selanjutnya / catatan:** Bagian "Perintah" di `CLAUDE.md` diisi setelah stack disetujui.

### 2026-11-12 — Keputusan produk dikunci di PRD

**Apa yang diubah:** Memperbarui PRD: batas pemain gratis jadi 2, fokus pasar Indonesia (region server kedua di Indonesia, Singapura dihapus), bagi hasil developer dihapus, mode anak tidak dibuat, domain ditunda. Bab 7.3 diubah menjadi tabel keputusan dan pertanyaan yang masih terbuka.
**Alasan:** Keputusan pemilik proyek.
**File:** `PRD-Hoorah.md` (ekspor dari doc claude.ai, diagram diganti Mermaid)
**Verifikasi:** dicek dengan pencarian teks bahwa tidak ada sisa "Singapura" dan "3 pemain".
**Selanjutnya / catatan:** PRD masih menyebut server Jakarta untuk relay; perlu diselaraskan setelah diskusi server Oregon selesai.

### 2026-11-12 — PRD awal dibuat

**Apa yang diubah:** Menyusun PRD lengkap (visi, user flow, functional requirements, UI/UX, arsitektur, KPI, roadmap, risiko).
**Alasan:** Acuan kerja proyek.
**File:** `PRD-Hoorah.md`
**Verifikasi:** tidak diperlukan (hanya dokumen).
**Selanjutnya / catatan:** —
