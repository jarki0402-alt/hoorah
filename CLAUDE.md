# CLAUDE.md — Hoorah

Panduan wajib untuk Claude (dan siapa pun) yang bekerja di repo ini. Baca seluruh file ini dan `PROGRESS.md` di awal setiap sesi.

# Token Efficiency Rules (Input & Output)
- ZERO FLUFF: Skip all greetings, intros, apologies, and summaries. Output only code and critical technical points.
- TARGETED READS: Never read a full file >150 lines at once. Always use `rg -n` or `grep -n` first to find exact line numbers, then read only the necessary line range.
- NO DUPLICATE READS: Never re-read a file that is already in the current conversation context.
- QUIET BASH: Always append quiet flags to CLI commands (`-q`, `--silent`, `--no-pager`, `--tb=short`) and limit potentially long outputs with `| head -n 40` or `| tail -n 40`.
- SURGICAL EDITS: Modify only the exact lines required. Never rewrite or reformat untouched parts of a file.

# Uncompromised Platform Code Quality Rules
- FULL PRODUCTION CODE: Never reduce code quality to save tokens. Never use lazy placeholders like `// TODO` or `// rest of code here` inside logic that needs implementation.
- CLEAN ARCHITECTURE: Strictly follow the project's existing architecture and separation of concerns (Controller/Handler -> Service/UseCase -> Repository/Model).
- BALANCED MODULARITY: Keep functions modular and single-purpose. Do not dump everything into one giant file, and do not create unrequested wrapper files or speculative abstractions.
- STRICT TYPING & SAFETY: Enforce strict types (no implicit `any`), validate inputs, and handle edge-case errors properly.
- TARGETED VERIFICATION: Verify changes by running lint/typecheck/tests only on the modified file, not the entire test suite.

## Tentang proyek

- **Hoorah** adalah platform game party berbasis browser. **Layar utama bisa perangkat apa pun**: PC, laptop, tablet, atau Smart TV. Layar utama jadi konsol, HP pemain jadi kontroler lewat scan QR, tanpa install.
- Acuan produk: [PRD-Hoorah.md](PRD-Hoorah.md). Jika kode dan PRD bertentangan, PRD yang benar, kecuali pemilik proyek memutuskan lain. Keputusan baru dicatat di PRD dan `PROGRESS.md`.
- Dikerjakan dan dikelola **sendirian oleh pemilik proyek**. Pilih solusi yang sederhana dan murah dirawat oleh satu orang, bukan yang "enterprise".

## Keputusan yang sudah terkunci

| Topik | Keputusan |
| --- | --- |
| Pasar | Indonesia saja |
| Batas pemain gratis | 2 pemain; Hoorah Pass 16 pemain |
| Bagi hasil developer | Tidak ada |
| Mode anak | Tidak dibuat |
| Domain | Ditunda; placeholder `hoorah.gg` |
| Server awal | Google Cloud Always Free, VM e2-micro di Oregon (`us-west1`), sudah dibuat dan **dipakai bersama Suwwara** (aplikasi lain milik pemilik; jatah gratis hanya 1 e2-micro per akun billing). Hoorah dibatasi 320 MB RAM di sana dan tidak boleh mengubah apa pun milik Suwwara. Cara deploy: `DEPLOY.md`. |
| Peran pengendali | **Host** (gratis, pemain pertama). Perangkat konsol (PC/laptop/tablet/Smart TV) = **Layar utama** (kode: `screen`). Pembeli Pass = **Pemilik Room**. |
| Game MVP | Target **30 game** (daftar dan gelombang di PRD bab 6.3). Sudah ada: Kuis Nusantara, Tarik Tambang, Rusun, Bajaj Rush (balap 3D), Jago Masak (masak 3D). Gelombang 1: Ular Tangga, Congklak, Makan Kerupuk, Balap Karung, Kompak Gak?, Ludo, Catur. Gelombang 2 (katalog tidak harus bertema Indonesia): Ular Arena, Rebut Wilayah, Lari Terus (3D), Sambung Kata, Juragan Nusantara (properti orisinal, 3D). Gambar Kilat, Panjat Pinang = "segera hadir". Tambahan 2026-11-16: Dapur Heboh (masak kerja sama satu tim, tampilan 3/4, lempar bahan; PRD 6.3). |
| Main sendiri | Semua game bisa dimainkan 1 orang (kecuali Kompak Gak?, Gambar Kilat). Lawan komputer otomatis hanya saat 1 orang, tampil seperti pemain biasa tanpa label BOT, tingkat menyesuaikan diri diam-diam. Detail di PRD 6.4 |
| Room code | **6 angka** (keputusan pemilik 2026-11-14), ditampilkan "482 917", label "Kode". HP: keyboard angka. Server: maks 20 kode salah per menit per alamat. HP di Wi-Fi yang sama ditawari layar terdekat (`GET /api/nearby`, alamat publik sama). |
| Bahasa aplikasi | Bahasa Indonesia saja (MVP) |
| Desain | Tanpa violet, tanpa gaya "AI" (blob, gradien berlebihan), ringkas, avatar buah Nusantara. Sumber: `design/` |
| Hoorah Pass (uji coba) | **Sementara** (keputusan pemilik 2026-11-16): kode Pass bersama dibuat pemilik di `/admin/`, ada waktu berakhir, bisa dipakai di perangkat mana pun, tanpa akun/pembayaran. Ditinjau ulang setelah uji coba. Detail PRD 3.4.1 |
| Database | SQLite bawaan Node (`node:sqlite`), satu file (`DB_FILE`, Docker `/data/hoorah.db`) untuk admin dan Pass. Room tetap di memori. Postgres baru dipertimbangkan jika server lebih dari satu proses atau ada pembayaran otomatis |

Region produksi (Oregon vs Jakarta) belum final. Tanyakan sebelum mengubah.

WebRTC (keputusan pemilik, 2026-11-14): HP dan layar utama di Wi-Fi yang sama tersambung langsung lewat WebRTC DataChannel (`in` tanpa urutan/tanpa kirim ulang untuk frame input, `ctl` berurutan untuk pesan relay bernomor). Kenalan lewat relay channel `r`. STUN bawaan di proses server (UDP 3478, wajib dibuka di firewall VM saat deploy, minta izin). Tanpa TURN: relay server tetap jalur cadangan otomatis. Kode: `apps/web/src/shared/{rtc,linkseq,net}.ts`, `apps/web/src/{screen,controller}/rtc.ts`, `apps/server/src/stun.ts`.

## Stack & struktur

| Bagian | Teknologi |
| --- | --- |
| Bahasa | TypeScript `strict` di semua bagian (npm workspaces) |
| Server | Node 22 + uWebSockets.js (`apps/server`), room di memori + snapshot ke file saat restart, SQLite untuk admin + Hoorah Pass, API admin `/api/admin/*` |
| Web | Vite 8 + Preact 10 + @preact/signals, satu app banyak halaman (`apps/web`) |
| Game | Kuis: Preact DOM. Rusun & Tarik: Phaser 3.90 + HUD Preact. Bajaj Rush, Jago Masak, Lari Terus, Juragan: Three.js 0.186 + HUD Preact. Aset 3D (keputusan pemilik 2026-11-14): boleh file GLB yang **dibuat sendiri lewat skrip di repo** (`tools/assets/`, tetap orisinal), dimuat hanya di layar utama; sebelumnya semua model dibangun prosedural saat runtime. Semua di iframe, bicara lewat `@hoorah/sdk` |
| Protokol | `packages/protocol`: JSON untuk kontrol, frame biner 11 byte untuk ketukan |
| Audio | Disintesis Web Audio (`apps/web/src/shared/audio.ts`), diputar di layar utama, tanpa file audio |
| Tes | Vitest (unit), Playwright (e2e: layar utama Chromium, iPhone WebKit, Android Chromium) |
| Lint/format | Biome |
| Deploy lokal | Docker Compose: `server` (Node) + `web` (nginx: file statis + proxy `/ws` dan `/api`). Aturan nginx sama persis dengan VM: `deploy/nginx/hoorah-server.conf` (keputusan pemilik 2026-11-16: nginx, bukan Caddy) |
| Deploy VM | `git push` (GitHub Actions hanya cek: lint, typecheck, tes unit) → di VM `/home/fajarrizky04febriano/hoorah/deploy/vm/update.sh`: `git pull` + **build image di VM** (keputusan pemilik 2026-11-16, seperti Suwwara; butuh RAM tersedia + swap kosong ±1 GB, swap milik Suwwara dipakai bersama) + pasang + rollback otomatis. nginx VM (milik Suwwara) ditambah situs `hoorah.fajarrizky.my.id`, DNS Cloudflare awan abu-abu. Repo GitHub `jarki0402-alt/hoorah` **publik** |

```
apps/server/        server WebSocket (rooms.ts = logika murni, index.ts = lapisan uWS, db.ts + passes.ts = SQLite, admin/ = API + CLI admin)
apps/web/           index.html (satu alamat; src/main.ts memilih peran) · games/<id>/ (game) · sim/ (simulator) · admin/ (dashboard)
  src/controller/   aplikasi HP
  src/screen/       aplikasi layar utama (store, nav, bridge iframe, pages)
  src/games/<id>/   kuis · rusun · tarik (logic.ts murni + tes, renderer terpisah)
  src/shared/       net, audio, confetti, art (SVG generator), ui, games (katalog)
packages/protocol/  tipe pesan, validasi, frame biner, sinkronisasi jam
packages/sdk/       API game (connect, setView, end, sfx, music)
docker/             Dockerfile (target server, web, release), compose.yaml, nginx.conf (Docker lokal)
deploy/             nginx/ (aturan bersama + situs VM), vm/ (compose VM, update/rollback/backup)
.github/workflows/  check.yml (lint, typecheck, tes unit di setiap push)
e2e/                tes Playwright end-to-end
```

## Alur kerja setiap perubahan (SDLC)

Wajib diikuti untuk **setiap** perubahan kode, konfigurasi, atau infrastruktur, sekecil apa pun (termasuk ganti satu label). Pekerjaan **belum selesai** sebelum langkah 5 lulus dan langkah 6 tercatat.

1. **Pahami dulu.** Baca `PROGRESS.md` (Status saat ini + beberapa entri teratas) dan bagian PRD yang relevan. Cari kode dengan `rg -n` sebelum membaca file.
2. **Ubah seperlunya.** Ikuti arsitektur yang ada (logika murni di `logic.ts`/`rooms.ts`, renderer dan lapisan jaringan terpisah). Teks pemain dalam Bahasa Indonesia, tanpa em dash.
3. **Cek per file** selama iterasi: `npx tsc --noEmit -p <workspace>` dan `npx biome check <file>`. Tambah atau perbarui tes Vitest jika logika berubah, lalu jalankan tes file itu (`npx vitest run <file>`).
4. **Cek penuh sebelum selesai:** `npm run check` (lint + typecheck + tes unit + build). Jalankan `npm run e2e` jika alur layar utama/HP, protokol, atau server berubah. Jika teks UI diubah, cari dulu tes e2e yang memakai teks lama (`rg -n "<teks lama>" e2e`).
5. **Jalankan di Docker (wajib, jangan lupa):** `npm run docker:up`. Ini yang dipakai pemilik untuk mencoba di perangkat sungguhan.
   - Cek `curl -s http://<IP-LAN>:1010/health` → `{"ok":true,...}`.
   - Pastikan perubahan benar-benar masuk build (mis. cari teks baru/lama di aset container: `docker compose -f docker/compose.yaml exec -T web grep -rl "<teks>" /srv`), atau buka halaman terkait di `:1010`.
   - Untuk perubahan tampilan: uji rasio 16:9, 16:10, dan 4:3 di layar utama, serta ukuran HP.
   - Log: `npm run docker:logs`. Berhenti: `npm run docker:down`.
6. **Catat di `PROGRESS.md`** (aturan 1 di bawah): entri paling atas di "Log", bagian Verifikasi menyebut hasil `npm run check`/tes dan hasil `npm run docker:up` + `/health`. Perbarui "Status saat ini" jika fase/jumlah game/alamat berubah.
7. **Lapor ke pemilik** dalam Bahasa Indonesia: apa yang berubah, hasil verifikasi apa adanya (termasuk yang gagal atau dilewati), dan alamat untuk mencoba (`http://<IP-LAN>:1010`).
8. **Commit hanya jika diminta.** Pesan commit dalam Bahasa Inggris.

**Deploy ke VM Google Cloud**: langkahnya di `DEPLOY.md` dan dijalankan oleh pemilik. Claude tetap wajib minta izin sebelum menyentuh VM (aturan 3). Image dibangun di VM oleh `update.sh`.

## Aturan kerja

### 1. Catat setiap perubahan kode di PROGRESS.md

Setiap kali mengubah kode, konfigurasi, atau infrastruktur, tambahkan satu entri di **paling atas** bagian "Log" di `PROGRESS.md` dengan format di file tersebut. Entri wajib berisi:

- tanggal dan judul singkat,
- apa yang diubah dan alasannya,
- daftar file yang berubah,
- cara verifikasi dan hasilnya (perintah yang dijalankan + lulus/gagal). Jika tes tidak dijalankan, tulis "tidak diverifikasi" beserta alasannya. Jangan pernah mengklaim lulus tanpa menjalankannya.
- langkah berikutnya atau masalah yang tersisa.

Perubahan yang hanya mengedit dokumen (PRD, CLAUDE.md) juga dicatat, cukup singkat.

### 2. Komunikasi

- Bahasa komunikasi dengan pemilik proyek: **Bahasa Indonesia**.
- **Sebut "layar utama" atau "layar", jangan "TV".** Layar utama berjalan di semua perangkat (PC, laptop, tablet, Smart TV), jadi jangan menyebutnya TV saja, baik di teks pemain, dokumen, maupun komunikasi dengan pemilik proyek. Kata "TV" hanya dipakai saat memang membahas Smart TV secara khusus (mis. kompatibilitas browser Smart TV). Desain dan pengujian juga wajib mencakup semua perangkat itu, termasuk rasio layar 16:9, 16:10, dan 4:3.
- Kode, nama variabel, nama event/API, pesan commit: **Bahasa Inggris**.
- Teks yang dilihat pemain: Bahasa Indonesia, ditaruh di file string/i18n, bukan di-hardcode di komponen.

### 3. Tindakan yang wajib minta izin dulu

- Apa pun yang menyentuh VM Google Cloud: `ssh`, `gcloud`, deploy, mengubah firewall, restart service.
- Memakai layanan berbayar, atau apa pun yang bisa keluar dari batas Always Free (upgrade tipe VM, IP statis tambahan, region lain, load balancer, Cloud SQL, dll.).
- `git commit`, `git push`, membuat repo remote. Commit hanya jika diminta.
- Menghapus file, menghapus data, atau mengubah keputusan yang sudah terkunci.
- Menambah dependency besar (> 100 KB gzip di sisi Controller) atau framework baru.

### 4. Batasan server (e2-micro Always Free)

- (Berlaku saat deploy ke VM. Docker lokal dijalankan tanpa batas CPU/RAM.)
- RAM 1 GB, CPU shared (sekitar 0,25 vCPU berkelanjutan), disk 30 GB standard. Proses server Hoorah ditargetkan memakai < 300 MB RAM.
- **Build di VM** (keputusan pemilik 2026-11-16, menggantikan aturan lama "jangan build di VM"): hanya lewat `deploy/vm/update.sh`, yang menolak build kalau RAM tersedia + swap kosong < 1000 MB (diukur: `npm ci` puncak ±245 MB, build web ±716 MB, berurutan; 700 MB tanpa swap = mati kehabisan memori). Jangan menjalankan build lain di VM di luar skrip itu.
- Data keluar gratis: 200 GiB/bulan di network tier Standard, dibagi dengan Suwwara. Keputusan pemilik 2026-11-16: halaman web dan aset game dilayani nginx di VM (file sudah dikompres saat build, `scripts/precompress.mjs`) dan dipantau di admin (Data keluar VM). Pindah ke CDN kalau pemakaian melewati ±50% jatah. DNS wajib awan abu-abu: lewat proxy Cloudflare, data keluar ditagih dan koneksi dari Indonesia lebih lambat.
- Satu proses, state Room di memori. Jangan menambah Redis/PostgreSQL di VM ini tanpa persetujuan.
- Oregon jauh dari Indonesia (perkiraan RTT 170–220 ms dari Jakarta). Jangan membuat game yang butuh presisi waktu tinggi bergantung pada relay ini. Ukur latensi sungguhan sebelum menyimpulkan.

### 5. Aturan teknis real-time

- Input di jalur cepat memakai **frame biner** (format di PRD bab 5.2), bukan JSON. JSON hanya untuk pesan kontrol (join, layout, state).
- Joystick/sensor di-throttle maks 30 Hz dan hanya dikirim jika berubah; tombol dikirim seketika.
- Server yang mengisi `from` di setiap pesan; jangan pernah percaya Device ID yang dikirim klien.
- Semua batas (ukuran pesan, rate limit, jumlah pemain) divalidasi di server, bukan hanya di klien.
- Reconnect memakai Session Token; input lossy yang tertunda dibuang, tidak di-replay.

### 6. Aturan Controller (HP)

- Sensor gerak, Wake Lock, dan Service Worker butuh HTTPS. Tes lokal di Wi-Fi cukup HTTP karena 3 game MVP hanya memakai tombol; game yang memakai sensor wajib diuji lewat HTTPS.
- Pakai `pointerdown`/`touchstart`, bukan `click`, untuk tombol game. Feedback visual lokal dalam 1 frame.
- Wajib: `touch-action: none` di area kontroler, `overscroll-behavior: none`, cegah zoom, seleksi teks, dan menu long-press; tangani tombol Back dengan dialog konfirmasi.
- Ukuran target sentuh dan thumb-zone mengikuti PRD bab 4.3. Uji di Android kelas menengah dan iOS Safari.

### 7. Kualitas kode

- TypeScript `strict`. Tidak ada `any` tanpa komentar alasannya.
- Kode protokol yang dipakai bersama server dan klien ditaruh di satu package bersama, tidak disalin.
- Setiap perubahan harus lolos typecheck, lint, dan tes yang ada sebelum dicatat selesai.
- Rahasia (token, kunci API, kredensial GCP) tidak boleh masuk repo. Pakai `.env` yang masuk `.gitignore`, dan sediakan `.env.example`.

### 8. Konten dan merek

- Semua game, nama, aset, dan identitas visual harus orisinal. Jangan menyalin kode, aset, teks, atau branding produk lain (termasuk AirConsole) maupun game yang sudah ada.
- **Dilarang memakai em dash (—) di aplikasi**: teks pemain (layar utama dan HP), file string, nama lagu/game, maupun komentar kode. Ganti dengan koma, titik dua, titik, atau kalimat baru. Tanda pisah pendek (–) hanya untuk rentang angka, mis. "2–16 pemain".

## Perintah

| Tujuan | Perintah |
| --- | --- |
| Pasang dependency | `npm install` |
| Jalankan dev (server + web, IP LAN otomatis di QR) | `npm run dev` lalu buka `http://<IP>:5173` di perangkat mana pun |
| Simulator 1 layar utama + beberapa HP | buka `/sim/` |
| Uji dengan lebih dari 2 pemain | `MAX_PLAYERS=8 npm run dev` |
| Lint + format | `npm run lint` / `npm run format` |
| Cek tipe | `npm run typecheck` |
| Tes unit | `npm test` |
| Tes end-to-end | `npm run e2e` (sekali saja: `npx playwright install chromium webkit`) |
| Semua pemeriksaan + build | `npm run check` |
| Docker (mirip produksi) | `npm run docker:up` → `http://<IP>:1010`, berhenti: `npm run docker:down` |
| Deploy ke VM / push GitHub | Lihat `DEPLOY.md` (push, firewall, Cloudflare, nginx, update, rollback, cadangan) |
| Diagnosa grafis perangkat (level game 3D, uji GPU, pilih manual) | buka `http://<IP>:1010/?diag=1` di perangkat itu; game 3D bisa dipaksa dengan `?gfx=low\|medium\|high` |
| Dashboard admin (Pass, room, server) | buka `/admin/`. Buat/reset admin: lokal `npm run admin -w @hoorah/server -- set admin`, Docker `docker compose -f docker/compose.yaml exec server node server.js admin set admin` (kata sandi acak dicetak sekali) |
