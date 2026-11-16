# PROGRESS — Hoorah

Catatan pengerjaan proyek. Entri terbaru di paling atas. Setiap perubahan kode, konfigurasi, atau infrastruktur wajib dicatat di sini (lihat `CLAUDE.md`).

## Status saat ini

- **Fase:** Fase 1 (MVP) selesai dibangun, menunggu uji di perangkat sungguhan oleh pemilik.
- **Jalan di:** Docker lokal (nginx), `http://192.168.0.102:1010`, dan sementara `https://hoorah.fajarrizky.my.id` lewat Cloudflare Tunnel dari Mac sampai VM dipasang.
- **Game:** 18 game jalan (Bajaj Rush, Jago Masak, Tarik Tambang, Kuis Nusantara, Rusun, Ular Tangga, Congklak, Makan Kerupuk, Balap Karung, Kompak Gak?, Ludo, Catur, Ular Arena, Rebut Wilayah, Lari Terus, Sambung Kata, Juragan Nusantara, Dapur Heboh), semua bisa main sendiri kecuali Kompak Gak?.
- **Hoorah Pass (uji coba):** kode Pass bersama dari dashboard admin `http://192.168.0.102:1010/admin/`, disimpan di SQLite (`/data/hoorah.db` di Docker).
- **Infrastruktur cloud:** VM e2-micro Google Cloud (Oregon) dipakai bersama Suwwara. Deploy Hoorah siap (`DEPLOY.md`, **build di VM** lewat `deploy/vm/update.sh`, folder `/home/fajarrizky04febriano/hoorah`); langkah VM dijalankan pemilik.
- **Kode:** GitHub `jarki0402-alt/hoorah` (publik), branch `main`.

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
