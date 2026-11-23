# DEPLOY.md: Hoorah ke VM Google Cloud (bersama Suwwara)

Panduan langkah demi langkah. **Mac** = perintah di laptop, di folder proyek. **VM** = perintah lewat SSH di VM Google Cloud, sebagai pengguna `fajarrizky04febriano` (bukan root; jangan tambahkan `sudo` kecuali tertulis).

**Alur:** Mac `git push` → GitHub memeriksa kode lalu **membangun image** (`ghcr.io/jarki0402-alt/hoorah:sha-<commit>`, ±5–10 menit) → VM `/home/fajarrizky04febriano/hoorah/deploy/vm/update.sh` menarik kode, **mengambil image yang sudah jadi** (tidak membangun apa pun di VM, keputusan pemilik 2026-11-23), memasang file web, dan me-restart server Hoorah.

- Folder Hoorah di VM: `/home/fajarrizky04febriano/hoorah`. File web untuk nginx: `/srv/hoorah` (di luar folder home, karena nginx tidak boleh membaca isi `/home`).
- nginx di VM (milik Suwwara) hanya **ditambah** satu situs `hoorah.fajarrizky.my.id`. File Suwwara tidak diubah, dan nginx cukup di-*reload*, jadi Suwwara tidak putus.
- VM tidak membangun image, jadi tidak ada lonjakan memori dan Suwwara tidak melambat saat update. Build darurat di VM (hanya kalau GitHub bermasalah, `HOORAH_BUILD_LOCAL=1`) tetap butuh RAM tersedia + swap kosong minimal 1000 MB (langkah 2b).
- Server Hoorah dibatasi 320 MB RAM saat berjalan (`deploy/vm/compose.yaml`).

```
HP & layar ──► hoorah.fajarrizky.my.id (DNS Cloudflare, awan ABU-ABU)
                 │
                 ▼  VM e2-micro Oregon (bersama Suwwara)
   nginx :443 (Let's Encrypt) ── file web: /srv/hoorah/current
                              └─► server Hoorah 127.0.0.1:8790 (Docker; WebSocket, API admin, SQLite)
   UDP 3478 (STUN: jalur langsung HP ↔ layar di Wi-Fi yang sama)
```

| File di repo | Tempatnya di VM |
| --- | --- |
| `deploy/nginx/hoorah-server.conf` | `/etc/nginx/snippets/hoorah-server.conf` |
| `deploy/nginx/hoorah.fajarrizky.my.id` | `/etc/nginx/sites-enabled/hoorah.fajarrizky.my.id` |
| `deploy/vm/update.sh`, `rollback.sh`, `backup.sh`, `compose.yaml` | dipakai langsung dari `/home/fajarrizky04febriano/hoorah/deploy/vm/` |
| `deploy/vm/.env` (tidak masuk git) | dibuat sendiri di langkah 4 |

---

## 1. Git di Mac (akun GitHub `jarki0402-alt`)

Repo: https://github.com/jarki0402-alt/hoorah (**publik**: jangan pernah commit kata sandi atau `.env`).

### Sekali saja
1. Token: GitHub (masuk sebagai **jarki0402-alt**) → foto profil → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. Repository access: *Only select repositories* → `hoorah`. Permissions: **Contents: Read and write**, **Workflows: Read and write**. Salin tokennya.
2. **Mac**:
```bash
cd ~/Documents/vibe/game
git remote add origin https://jarki0402-alt@github.com/jarki0402-alt/hoorah.git   # sudah ada? lewati
git config user.name "jarki0402-alt"
git config user.email "jarki0402-alt@users.noreply.github.com"
```
Saat pertama `git push`, password diisi **token** (Keychain macOS menyimpannya untuk akun ini saja).

### Setiap ada perubahan
**Mac**
```bash
git status
git add -A
git commit -m "Short English description of the change"
git push origin main
```
Opsional: https://github.com/jarki0402-alt/hoorah/actions, workflow **Check** hijau berarti lint, typecheck, dan tes unit lulus. Kalau merah, jangan update VM dulu.

---

## 2. Persiapan VM (sekali)

Masuk VM: Google Cloud Console → **Compute Engine** → **VM instances** → tombol **SSH** di baris VM.

### 2a. Cek kondisi
**VM**
```bash
whoami                          # fajarrizky04febriano
free -h                         # RAM dan swap
swapon --show                   # kosong = belum ada swap
df -h /                         # sisa disk minimal ±5 GB (image + cache build + swap)
docker compose version
nginx -v
```

### 2b. Swap (sudah dipasang saat menyiapkan Suwwara)
Build butuh RAM tersedia + swap kosong minimal 1000 MB. Swap dari Suwwara dipakai bersama, **jangan buat `/swapfile` baru** (bisa menimpa milik Suwwara).

**VM**
```bash
swapon --show                   # harus ada baris swap (mis. /swapfile)
free -h                         # kolom "available" (Mem) + "free" (Swap) minimal ±1 GB
grep -c swap /etc/fstab         # ≥ 1: swap tetap aktif setelah VM restart
```
`update.sh` memeriksa angka ini sendiri sebelum build dan berhenti dengan pesan jelas kalau kurang. Hanya kalau itu terjadi, tambah swap **kedua** dengan nama sendiri (tidak menyentuh milik Suwwara):
```bash
sudo fallocate -l 1G /swapfile-hoorah && sudo chmod 600 /swapfile-hoorah
sudo mkswap /swapfile-hoorah && sudo swapon /swapfile-hoorah
echo '/swapfile-hoorah none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```
**Jangan** menjalankan `sudo sysctl --system`: itu menerapkan ulang setelan bawaan Google yang mematikan internet semua container, termasuk Suwwara (DEPLOY.md Suwwara §14).

---

## 3. Firewall Google Cloud: buka UDP 3478

Port 80 dan 443 sudah terbuka untuk Suwwara. Hoorah hanya butuh **UDP 3478** (STUN, supaya HP dan layar di Wi-Fi yang sama bisa tersambung langsung tanpa lewat server).

### Lewat Console (klik)
1. Buka https://console.cloud.google.com, pastikan project yang dipilih (kiri atas) adalah project VM Suwwara.
2. Cek nama jaringan VM: menu ☰ → **Compute Engine** → **VM instances** → klik nama VM → bagian **Network interfaces** → kolom **Network** (biasanya `default`).
3. Menu ☰ → **VPC network** → **Firewall** (atau ketik "Firewall" di kotak pencarian atas).
4. Klik **+ CREATE FIREWALL RULE** di atas.
5. Isi:

| Kolom | Isi |
| --- | --- |
| Name | `hoorah-stun` |
| Description | `Hoorah STUN (WebRTC)` |
| Logs | Off |
| Network | nama jaringan dari langkah 2 (biasanya `default`) |
| Priority | `1000` |
| Direction of traffic | **Ingress** |
| Action on match | **Allow** |
| Targets | **All instances in the network** |
| Source filter | **IPv4 ranges** |
| Source IPv4 ranges | `0.0.0.0/0` |
| Second source filter | None |
| Protocols and ports | **Specified protocols and ports** → centang **UDP** → isi `3478` (TCP jangan dicentang) |

6. Klik **CREATE**. Tunggu beberapa detik sampai `hoorah-stun` muncul di daftar dengan status aktif.

### Atau lewat Cloud Shell
Klik ikon **>_** (Activate Cloud Shell) di kanan atas Console, lalu:
```bash
gcloud compute firewall-rules create hoorah-stun --network=default --direction=INGRESS \
  --action=ALLOW --rules=udp:3478 --source-ranges=0.0.0.0/0 --description="Hoorah STUN (WebRTC)"
```

### Yang TIDAK boleh dibuka
Jangan buat aturan untuk `tcp:8790` atau `tcp:1010`: server Hoorah hanya didengar nginx di VM itu sendiri. Di daftar Firewall, cukup pastikan ada aturan yang mengizinkan **tcp:80** dan **tcp:443** (milik Suwwara, biasanya `default-allow-http` dan `default-allow-https`).

### Cek dari Mac (setelah langkah 4 selesai, server Hoorah harus sudah jalan)
```bash
cd ~/Documents/vibe/game
node scripts/stun-check.mjs 35.212.156.209          # OK: STUN di ...:3478 menjawab ...
```
`TIDAK ADA JAWABAN` berarti aturan belum aktif, nama jaringannya salah, atau server Hoorah belum jalan.

Pastikan juga VM di **Network tier: Standard** (Compute Engine → VM → Network interfaces): jatah gratis data keluar 200 GiB/bulan hanya berlaku di Standard.

---

## 4. Ambil kode dan jalankan Hoorah di VM (sekali)

**VM**
```bash
cd /home/fajarrizky04febriano
git clone https://github.com/jarki0402-alt/hoorah.git
sudo mkdir -p /srv/hoorah && sudo chown fajarrizky04febriano /srv/hoorah
nano /home/fajarrizky04febriano/hoorah/deploy/vm/.env
```
Isi `.env` (tanpa spasi di sekitar `=`, tanpa tanda kutip):
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=isi-sandi-kuat-minimal-10-karakter
MAX_PLAYERS=2
```
Simpan: `Ctrl+O`, `Enter`, `Ctrl+X`. Admin hanya dibuat saat server **pertama kali** menyala (langkah 8 untuk membuat/reset sesudahnya).

Ambil image dan jalankan (pastikan build commit terakhir di tab **Actions** GitHub sudah hijau, dan package sudah Public, lihat 6a):
```bash
/home/fajarrizky04febriano/hoorah/deploy/vm/update.sh
curl -s http://127.0.0.1:8790/health          # {"ok":true,...}
```
Kalau image belum ada (GitHub masih membangun), `update.sh` menunggu sampai 15 menit sambil mengecek tiap 20 detik.

---

## 5. Cloudflare + sertifikat + nginx (berurutan, saat tidak ada yang sedang main)

Selama 5b–5d (±5 menit), `hoorah.fajarrizky.my.id` belum bisa dibuka.

### 5a. Lepas Hoorah dari Cloudflare Tunnel di Mac
Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → tunnel di Mac → **Configure** → **Public Hostname** → hapus baris `hoorah.fajarrizky.my.id`.

### 5b. DNS ke VM, awan abu-abu
Cloudflare → domain `fajarrizky.my.id` → **DNS** → **Records**:
1. Hapus record `hoorah` yang lama (CNAME ke `...cfargotunnel.com`).
2. **Add record**: Type **A**, Name `hoorah`, IPv4 `35.212.156.209`, Proxy status **DNS only** (awan **abu-abu**), TTL Auto → **Save**.

Kenapa abu-abu: lewat proxy Cloudflare, dari ISP Indonesia tiap permintaan ±0,4–0,9 detik (langsung ±0,19 detik), dan data yang lewat proxy ditagih Google (diukur saat memindahkan Suwwara).

**Mac** (tunggu 1–2 menit): `dig +short hoorah.fajarrizky.my.id` → `35.212.156.209`.

### 5c. Sertifikat HTTPS
**VM**
```bash
sudo certbot certonly --nginx -d hoorah.fajarrizky.my.id
sudo certbot certificates            # hoorah.fajarrizky.my.id muncul, VALID 89 days
```
`certonly` tidak mengubah file nginx mana pun. Perpanjangan otomatis memakai jadwal certbot yang sudah ada untuk Suwwara.

### 5d. Pasang situs Hoorah di nginx
**VM**
```bash
cd /home/fajarrizky04febriano/hoorah
sudo cp deploy/nginx/hoorah-server.conf /etc/nginx/snippets/hoorah-server.conf
sudo cp deploy/nginx/hoorah.fajarrizky.my.id /etc/nginx/sites-enabled/hoorah.fajarrizky.my.id
sudo nginx -t
```
Harus `syntax is ok` dan `test is successful`. **Kalau tidak**, batalkan (Suwwara aman karena belum di-reload) dan kirim pesan error-nya:
```bash
sudo rm /etc/nginx/sites-enabled/hoorah.fajarrizky.my.id /etc/nginx/snippets/hoorah-server.conf
```
Kalau sukses:
```bash
sudo systemctl reload nginx
```

### 5e. Periksa
**Mac**
```bash
curl -s https://hoorah.fajarrizky.my.id/health                                # {"ok":true,...}
curl -sI https://hoorah.fajarrizky.my.id/ | grep -i server                     # server: nginx
curl -s -o /dev/null -w "%{http_code}\n" https://suwwara.fajarrizky.my.id/    # Suwwara tetap 200
node scripts/stun-check.mjs hoorah.fajarrizky.my.id                           # OK: STUN ... menjawab
```
Lalu buka `https://hoorah.fajarrizky.my.id` di laptop (layar utama) dan scan QR dari HP: sekali lewat Wi-Fi yang sama, sekali lewat data seluler. Dashboard: `https://hoorah.fajarrizky.my.id/admin/`.

---

## 6. Update rutin

### 6a. Sekali saja: package image dibuat Public
Setelah push pertama yang membangun image (job `image` di tab **Actions** hijau): GitHub → foto profil → **Your profile** → tab **Packages** → `hoorah` → **Package settings** (kanan bawah) → **Danger Zone: Change visibility** → **Public** → ketik `hoorah` → konfirmasi. Image tidak berisi rahasia (`.env` tidak ikut), dan repo-nya memang publik. Tanpa ini VM tidak bisa mengambil image tanpa login.

### 6b. Setiap update
1. **Mac**: `git add -A && git commit -m "..." && git push origin main`
2. **GitHub**: tab **Actions** → run terbaru, tunggu job `check` dan `image` hijau (±5–10 menit). Boleh langsung lanjut ke langkah 3: `update.sh` menunggu sendiri.
3. **VM**:
```bash
/home/fajarrizky04febriano/hoorah/deploy/vm/update.sh
```
`update.sh` menjalankan `git pull`, mengambil image commit itu dari GitHub (menunggu kalau belum selesai dibangun) dan menandainya `hoorah-server:<commit>`, menyalin file web ke `/srv/hoorah/web-<commit>`, memindahkan tautan `current`, lalu me-restart server. Kalau server baru tidak sehat dalam ±1 menit, versi sebelumnya otomatis dipulihkan. Pemain di room tidak dikeluarkan (room disimpan sebelum restart dan dipulihkan sesudahnya).

4. **Hanya kalau `git pull` menampilkan perubahan di `deploy/nginx/`**: ulangi 5d (`cp` dua file → `sudo nginx -t` → `sudo systemctl reload nginx`).

Hanya image versi sekarang dan sebelumnya yang disimpan; sisanya dibersihkan otomatis. Kalau pernah build darurat di VM, cache build-nya bisa dibersihkan saat disk di atas ±80% (`df -h /`): `docker builder prune -f --filter until=720h`.

## 7. Kembali ke versi sebelumnya
**VM**
```bash
/home/fajarrizky04febriano/hoorah/deploy/vm/rollback.sh
```
Server dan file web kembali bersama ke versi sebelum update terakhir. Dijalankan dua kali = kembali ke versi baru.

## 8. Admin
```bash
cd /home/fajarrizky04febriano/hoorah/deploy/vm
docker compose exec server node server.js admin set admin       # buat/reset, sandi acak dicetak sekali
docker compose exec server node server.js admin list
```

## 9. Cadangan database (admin, kode Pass, statistik)
**VM**
```bash
/home/fajarrizky04febriano/hoorah/deploy/vm/backup.sh      # uji sekali: "Tersimpan: /home/fajarrizky04febriano/hoorah-backups/..."
crontab -e                                                # tambahkan baris di bawah, simpan
```
```
30 3 * * * /home/fajarrizky04febriano/hoorah/deploy/vm/backup.sh >> /home/fajarrizky04febriano/hoorah-backups/backup.log 2>&1
```
14 cadangan terbaru disimpan di `/home/fajarrizky04febriano/hoorah-backups`. Salin sesekali ke luar VM (tombol **⚙ → Download file** di jendela SSH Google Cloud, isi path file `.db.gz`).

Pulihkan (mengganti data sekarang):
```bash
cd /home/fajarrizky04febriano/hoorah/deploy/vm
gunzip -c /home/fajarrizky04febriano/hoorah-backups/hoorah-TANGGAL.db.gz > /tmp/hoorah.db && chmod 644 /tmp/hoorah.db
docker compose stop server
docker compose run --rm --no-deps -v /tmp/hoorah.db:/restore.db:ro --entrypoint sh server \
  -c 'cp /restore.db /data/hoorah.db && rm -f /data/hoorah.db-wal /data/hoorah.db-shm'
docker compose up -d server && rm /tmp/hoorah.db
```

## 10. Memantau
- Dashboard admin → **Server**: RAM dan CPU VM (Suwwara ikut terhitung), memori Hoorah dibanding batas, disk, dan **Data keluar VM** dibanding jatah gratis 200 GiB/bulan (dibagi dengan Suwwara).
- Log: `cd /home/fajarrizky04febriano/hoorah/deploy/vm && docker compose logs --tail 100 server`
- RAM per container: `docker stats --no-stream`

## Darurat (diserang)
Cloudflare → DNS → record `hoorah` jadi awan **oranye**, lalu Security → **Under Attack Mode**. nginx Hoorah sudah membaca IP asli dari Cloudflare. Kembalikan ke abu-abu setelah aman (selama oranye, data keluar ditagih dan koneksi dari Indonesia lebih lambat).

## Masalah umum
| Gejala | Penyebab / tindakan |
| --- | --- |
| `update.sh`: "GitHub menolak: package hoorah masih Private" | Langkah 6a: jadikan package Public, ulangi |
| `update.sh`: "Image ... belum ada setelah 15 menit" | Build GitHub gagal atau belum jalan: buka tab **Actions**, lihat job `image`. Perbaiki di Mac, push lagi |
| `update.sh`: "Memori kurang untuk build" (hanya build darurat `HOORAH_BUILD_LOCAL=1`) | Tunggu Suwwara sepi lalu ulangi, atau tambah swap kedua (langkah 2b). Paksa (risiko kehabisan memori): `HOORAH_BUILD_LOCAL=1 HOORAH_FORCE_BUILD=1 /home/fajarrizky04febriano/hoorah/deploy/vm/update.sh` |
| Build darurat berhenti dengan `killed`, `exit code 137`, atau `signal: killed` | Kehabisan memori: cek `free -h` (swap aktif?), tutup yang tidak perlu, jalankan lagi |
| `update.sh`: "Folder /srv/hoorah belum ada" | `sudo mkdir -p /srv/hoorah && sudo chown fajarrizky04febriano /srv/hoorah` |
| `update.sh`: `git pull` gagal ("not possible to fast-forward") | Ada perubahan lokal di VM: `cd /home/fajarrizky04febriano/hoorah && git status`, kembalikan dengan `git checkout -- <file>` (file `.env` aman, tidak dilacak git) |
| `update.sh`: server tidak sehat, otomatis rollback | Baca log yang dicetak; biasanya `.env` salah ketik. Perbaiki, jalankan lagi |
| `permission denied ... docker.sock` | Pengguna belum di grup docker: `sudo usermod -aG docker fajarrizky04febriano`, keluar lalu masuk SSH lagi |
| `sudo nginx -t` gagal | Hapus dua file Hoorah (5d), kirim pesan error-nya. Suwwara tidak terpengaruh selama belum di-reload |
| `certbot`: "Timeout during connect" / "unauthorized" | DNS belum ke VM atau awan masih oranye: `dig +short`, tunggu 2 menit, ulangi |
| Domain Hoorah memakai sertifikat Suwwara (nama tidak cocok) | Situs Hoorah belum dipasang/di-reload (5d) |
| `stun-check`: TIDAK ADA JAWABAN / HP selalu lewat server | Aturan `hoorah-stun` (langkah 3) belum ada, jaringan salah, atau server Hoorah mati |
| Suwwara melambat | Update tidak membangun apa pun lagi di VM. Kalau terus: `docker stats --no-stream`, kirim angkanya; batas Hoorah ada di `deploy/vm/compose.yaml` (`mem_limit`) |
