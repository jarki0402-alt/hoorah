# PLAN — Hoorah

Catatan serah terima antarsesi (dibuat 2026-11-23 sebelum chat dibersihkan). Baca bersama `CLAUDE.md`, `PROGRESS.md` (Log + Antrean), dan `PRD-Hoorah.md`. Kalau isi file ini bertentangan dengan PRD, PRD yang benar.

## 1. Keadaan sekarang

- 30 game sudah ada dan jalan di Docker lokal: `http://192.168.0.104:1010` (alamat LAN Mac, bisa berubah).
- Semua pekerjaan sejak commit `18d6481` **belum di-commit** (±136 file berubah). Commit + push menunggu pemilik bilang "update besar".
- Deploy VM ditunda: pekerjaan lokal dulu sampai masalah build di VM (beban ke Suwwara) dibahas.
- Pemeriksaan terakhir (2026-11-22): `npm run check` lulus (94 file, 1858 tes, build), `npm run e2e` 9/9 lulus, `npm run docker:up` + `/health` ok.
- Vitest butuh Node 22: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` (Node 20 bawaan gagal).
- Hanya container Hoorah yang boleh hidup di Mac (Suwwara, es-migrasi-lab, kunai dibiarkan mati).

## 2. Sudah selesai (sejak commit terakhir, semua 2026-11-22)

Rincian lengkap per entri ada di `PROGRESS.md` → Log.

| Area | Yang berubah |
| --- | --- |
| Petualangan Warna | Kontrol baru (lompat tetap 2,5 petak, tahan = lompat ulang, setengah kanan HP = LOMPAT), kabel tuas ke pintu, petunjuk 2 tahap, papan bantu diam-diam, Host bisa Lewati setelah 3 menit, Hutan 1–30 + Gua 1–6, pilih dunia/level di HP Host, peta perjalanan, 3 bintang, latar hidup (paralaks, daun, sinar, kunang-kunang) |
| Ludo | Tanpa tim. 2–4 pemain papan klasik, 5–8 pemain papan segi 5 sampai segi 8, 8 warna |
| Pindah Host | "Ganti Host" di HP Host, target Terima/Tolak dalam 30 dtk, toast di layar utama |
| Beranda | Satu layar: hero game terfokus, Mode Pesta + Acak game, satu baris rak, grid 5×2 bergeser per baris |
| Dapur Heboh | Gaya HD 3/4, papan nama alat, cincin status masak, kanvas setajam layar asli (`deviceScale()`), pengaman FPS |
| Ular Tangga | Papan 1–100 bawaan |
| Nyebrang | HP tanpa tombol panah, seluruh layar zona usap, ketuk = maju |
| Desain | Garis warna di tepi kartu dihapus di semua game dan HP, diganti cincin penuh |
| Joystick | Mengikuti jempol (bawaan), penuh di 56 px, tombol pojok kanan mengikuti ukuran HP, tombol aksi tunggal 112–136 px |
| Tutorial | "Cara main" di ke-30 game (kartu asal-usul + 3–4 langkah animasi + HP mini, tombol Paham!) |
| Suara | Kampung Siluman: pilihan pemilik A semua (`shared/night-sounds.ts`), detak jantung terus |
| Layar utama | Kursor hilang setelah 2,5 dtk diam; Beranda tidak meluncur sendiri karena hover |
| Gelombang 3 | 12 game baru (Gelombang A + B), mesin dunia kotak 3D `shared/kotak/`, Lab Kontrol `/lab/`, musik adaptif, Rusun troli lalu kembali berayun |

## 3. Akan dikerjakan (sudah dibahas, menunggu "eksekusi")

1. **Ketajaman game kanvas di layar besar.** Penyebabnya sama dengan Dapur: game di iframe di dalam `.tv-stage` yang diperbesar CSS transform, jadi kanvas terlalu kecil lalu diregangkan. Perbaikannya: pakai `deviceScale()` dari `apps/web/src/games/common/stage.ts` (skala panggung × devicePixelRatio) dengan batas per level grafis.
   - Phaser (9): arena, hantu, karung, kerupuk, nyebrang, rusun, tarik, warna, wilayah.
   - Three.js (10): bajaj, bom, es, juragan, langkah, lari, masak, obby, runtuh, tali. Batas `kMax` per tier ada di `bajaj/quality.ts` (`startRatio`; high 1,5, medium 1,25, low 0,75), dan mesin `shared/kotak/` dipakai bersama sebagian game.
   - Cek di 1920×1080 DPR 1, 1512×982 DPR 2, dan Smart TV (performa).
2. **Petualangan Warna lanjutan** (setelah pemilik mencoba Hutan): Gua 7–30, lalu Gurun, Salju, Awan (masing-masing 30 level, sekarang "Segera hadir").
3. **Commit sudah dibuat 2026-11-23, push dilakukan pemilik.** `docker/.env.example` sengaja tidak ikut (pemilik periksa isinya dulu, lalu commit sendiri).
4. **Build image di GitHub Actions + GHCR** (pemilik condong setuju 2026-11-23, menunggu "eksekusi"; membalik keputusan 2026-11-16 build di VM). VM cukup `docker pull`.
5. **STUN + TURN Cloudflare** (lihat bab 3a), kode menunggu "eksekusi".

## 3a. Rancangan produksi yang dibahas 2026-11-23 (ditahan, belum masuk PRD)

Pemilik minta harga "di-keep dulu". Belum keputusan final; tulis ke PRD 3.4 hanya setelah pemilik setuju.

- **Nama:** "Hoorah" dirasa kurang. Calon dengan .com belum terdaftar (cek RDAP 2026-11-23): Tawaria (rekomendasi), Mabaria, Sorakria. Cek PDKI kelas 9/41 dan harga registrar dulu.
- **Gratis:** 2 pemain (terkunci), 8 game tetap (Kuis, Tarik, Rusun, Ular Tangga, Congklak, Catur, Kompak Gak?, Bajaj Rush) + 1 Game Minggu Ini + Petualangan Warna Hutan 1–5. Tanpa batas 60 menit dan tanpa iklan saat rilis.
- **Pass:** milik akun Google (login di HP), dipasang ke 1 layar utama (menyelesaikan Antrean 1), pindah layar maks 1x per 6 jam. Prabayar tanpa potong otomatis, waktu mulai saat dipasang, beli lagi = waktu ditambah, tanpa biaya admin. Kata: "Beli Pass", "Tambah waktu", bukan "langganan".
- **Harga tetap:** Pass 1 Hari Rp19.000, Pass 30 Hari Rp29.000 (Paling hemat), Pass 1 Tahun Rp199.000. Tanpa paket mingguan. Naik 1 Hari → 30 Hari bayar selisih dalam 24 jam (30 hari dihitung dari mulai 1 Hari).
- **Bonus Perintis (1.000 pembeli pertama):** 1 Hari beli 1 gratis 1 (tiket 30 hari), 30 Hari +14 hari, 1 Tahun +2 bulan, lencana + avatar Perintis. Harga tidak dinaikkan setelahnya.
- **Gratis 1 hari:** login Google saat butuh (pemain ke-3 / game terkunci), 1x per akun dan per layar. **Ajak Teman:** teman dapat 1 hari, pengajak +7 hari jika teman membeli. **Pass Acara** Rp99–249 rb manual via WhatsApp.
- **Pembayaran:** hanya QRIS dinamis Midtrans, tampil besar di layar utama (QR join disembunyikan), tautan cadangan "Tampilkan di HP". Notifikasi idempoten + cek status ke API.
- **Update tanpa ganggu pemain:** server terima protokol N dan N-1 (sekarang versi beda = ditolak, `rooms.ts` cek `PROTOCOL_VERSION`), file web per versi, reload hanya di lobi/beranda, deploy jam sepi, migrasi DB hanya menambah, saklar per game di admin.
- **Lainnya:** Litestream SQLite → R2, Cloudflare Pages untuk file web (perlu izin, membalik keputusan nginx), pemantauan `/health` + Sentry, legal (NIB, PSE Komdigi, kebijakan privasi/refund, merek DJKI, cek IGRS).

## 4. Belum terealisasi

### Dari Antrean di `PROGRESS.md`

| No | Item | Status |
| --- | --- | --- |
| 1 | Kode Pass dimasukkan di layar, bukan di HP | Belum. Cara mengetik di Smart TV belum diputuskan. Ubah PRD 3.4.1 dulu |
| 2 | Pembayaran (Google login, Midtrans, iklan) | Belum, setelah uji coba Pass |
| 3 | Suwwara kurang mulus sejak Hoorah di VM | Belum diukur. Pilihan A/B/C di Antrean. Wajib izin sebelum menyentuh VM |
| 4 | Joystick ala Roblox | Sebagian: Lab Kontrol, joystick mengikuti jempol, pola Roblox, zona lompat Warna sudah ada. Penyetelan di HP sungguhan oleh pemilik |
| 5 | Lari Terus kurang enak | Sebagian: usap cepat, pindah jalur 0,14 dtk, lompat dikejar. Belum disetel bersama pemilik di perangkat |
| 6 | Gaya 2.5D | Baru Dapur Heboh dan Nyebrang. Game lain belum ditentukan |
| 9 | Rapikan dokumen dan infrastruktur | Sebagian: IP VM di DEPLOY.md sudah. Status masih menyebut Cloudflare Tunnel, `docker/.env.example` belum di-commit, IP VM masih ephemeral (IP statis bisa berbiaya, tanya dulu) |
| 10 | STUN + TURN Cloudflare | Belum. Ditunda ke "update besar". Pemilik membuat TURN key di dashboard Cloudflare dan menulisnya sendiri ke `docker/.env` |

Item 7 (Rusun), 8 (Gelombang 3), dan 11 (tutorial) sudah selesai.

### Catatan yang tersisa

- Petualangan Warna:
  - urutan kerja sama (siapa menahan tombol mana) belum dicek mesin;
  - aturan "maks 3 lompatan berbahaya berturut-turut" belum ditegakkan, belum ada pemecah otomatis;
  - belum dicek di 16:10, 4:3, dan HP sungguhan.
- Ludo: tema HP masih 4 warna klasik (hiasan). Host tidak bisa memilih jumlah bidak (otomatis 2).
- Nama pemain kembar diizinkan (server tidak mengecek keunikan). Belum diputuskan perlu atau tidak.
- Suara ayam baru Kampung Siluman menunggu penilaian pemilik di `/lab/` → Suara.
- Getar iPhone (iOS 27.2.1) tertutup lewat web; iPhone memakai kedipan pengganti. Opsi bunyi "tuk" dari speaker belum diputuskan.
- Belum ada tes e2e khusus per game baru Gelombang 3. Rasa kontrol, tempo, dan performa Smart TV belum dicoba pemilik.
- Label katalog game sosial tertulis "Butuh 3 pemain", bukan "3+ pemain".
- Teks di atas layar HP (baris info di samping Jeda) masih bisa dirapikan.

## 5. Skema yang sudah diterapkan

### Pindah Host

- HP → server: `hostOffer {id}`, `hostOfferCancel`, `hostReply {accept}`.
- Server → semua: `hostOffer {from,to}`, `hostOfferEnd {from,to,result}`, `hostChanged {id,from}`.
- Aturan server (`apps/server/src/rooms.ts`, tes `rooms.hostoffer.test.ts`): maks 1 permintaan per room, hanya Host aktif yang boleh menawarkan, hanya target yang boleh menjawab, kedaluwarsa `LIMITS.hostOfferMs` = 30 dtk, batal jika Host berganti atau salah satu keluar.
- HP: `controller/hostoffer.tsx`, tombol di pad Host dan menu jeda. e2e: `e2e/host-offer.spec.ts`.

### Ludo papan segi-N

- 2–4 pemain: papan klasik 15×15 (56 langkah).
- 5–8 pemain: segi-N, petak per sisi 5→11, 6→9, 7→7, 8→7 (53–60 langkah pulang).
- Jalur rumah 5 petak dari petak tengah sisi. Petak start = tengah + 2. Bintang aman = start + round(8L/13).
- Warna: merah, hijau, kuning, biru, merah muda, tosca, oranye, cokelat. Kode: `games/ludo/{logic,geometry,board-art,colors}.ts`.

### Petualangan Warna

- Fisika langkah tetap di `world.ts` (TUNE): lompat tetap 2,5 petak, coyote 0,15 dtk, buffer 0,20 dtk, kontrol udara +50%, lari penuh di atas 25% joystick, geser sudut atap, naik tepi 0,3 petak.
- Peta berupa teks 32×18 petak (`maps-hutan.ts`, `maps-gua.ts`), palet per dunia di `palette.ts`, daftar level di `levels.ts`.
- `reach.test.ts` memastikan semua permata, pintu, dan tombol terjangkau dengan lompatan asli.
- Warna pemain: slot berlipat untuk 2 pemain (A, C, E, G = merah; B, D, F, H = biru). Gerbang warna dipasangkan untuk 3–4 warna.
- HP: opsi pad `jumpZone` (opt-in, hanya game ini; setengah kanan = LOMPAT) di `controller/pad.tsx` + `pad.css`, ikon `hint`/`skip` dan `pulse` di `packages/protocol/src/messages.ts`.
- Kemajuan disimpan di browser layar utama: `hoorah.warna.progress.v2`. Gerak latar dikurangi jika FPS < 45 selama 3 dtk.

### Beranda

- `screen/pages/HomePage.tsx` + `home.css`: hero, tombol cepat, rak (Pas untuk kalian, Heboh, Adu Otak, Ramai-ramai, Santai, Semua), grid 5×2.
- Navigasi remote/keyboard: `screen/homeFocus.ts` (id tab `shelf-<section>`). Data rak: `shared/homeRows.ts` (`catalogByCategory`).

### Ketajaman kanvas

- `deviceScale()` di `games/common/stage.ts` membaca skala `.tv-stage` × devicePixelRatio. Baru dipakai Dapur (`dapur/textures.ts`): maksimal 3×, turun bertahap 3 → 2,5 → 2 → 1,5 jika FPS < 45 selama 3 dtk.

### Fondasi lain (lihat Log untuk rinci)

- Kontrol: `shared/controls.ts` (setelan joystick/usap/getar, timpa lewat localStorage `hoorah.controls`, versi setelan 4), `shared/haptics.ts`, Lab `/lab/`.
- Tutorial: `shared/tutorial/*`, `screen/tutorial/*`, `controller/tutorial.tsx`, isi per game di `games/*/tutorial.ts`. Batas tes: teks langkah maks 80 karakter, asal-usul maks 140, tanpa em dash.
- Musik adaptif `shared/music/*`, suara malam `shared/night-sounds.ts`, semua Web Audio tanpa file.
- Mesin dunia kotak 3D `shared/kotak/` (fisika murni + renderer three.js).
- WebRTC DataChannel di Wi-Fi sama + STUN di proses server (lihat `CLAUDE.md`).

## 6. Aturan kerja yang tetap berlaku

- Diskusi dulu. Kode baru dikerjakan setelah pemilik bilang "eksekusi".
- Setiap perubahan: `npm run check` → `npm run e2e` (jika alur/protokol/server berubah) → `npm run docker:up` + `/health` → entri di `PROGRESS.md` → lapor dalam Bahasa Indonesia.
- Commit/push hanya jika diminta. VM, firewall, dan layanan berbayar wajib izin. Repo publik: jangan commit rahasia atau `.env`.
- Sebut "layar utama", bukan "TV". Tanpa em dash. Tanpa violet, gaya "AI", atau garis warna di tepi kartu.
