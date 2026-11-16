# DEPLOY.md: Hoorah ke VM Google Cloud (bersama Suwwara)

Panduan langkah demi langkah. Perintah bertanda **Mac** dijalankan di laptop, di folder proyek. Perintah bertanda **VM** dijalankan lewat SSH di VM Google Cloud.

**Alur:** Mac `git push` → GitHub Actions memeriksa kode lalu membuat image (`ghcr.io/jarki0402-alt/hoorah`) → VM `git pull` + `./deploy/vm/update.sh` (ambil image, pasang file web, restart server Hoorah).

- Tidak ada build di VM: RAM 1 GB dipakai bersama Suwwara.
- nginx di VM (milik Suwwara) hanya **ditambah** satu situs untuk `hoorah.fajarrizky.my.id`. File Suwwara tidak diubah, dan nginx cukup di-*reload* (bukan restart), jadi koneksi Suwwara tidak putus.
- Hoorah di VM dibatasi maksimal 320 MB RAM (`deploy/vm/compose.yaml`).

```
HP & layar ──► hoorah.fajarrizky.my.id (DNS Cloudflare, awan ABU-ABU)
                 │
                 ▼  VM e2-micro Oregon (bersama Suwwara)
   nginx :443 (Let's Encrypt) ── file web: /srv/hoorah/current
                              └─► server Hoorah 127.0.0.1:8790 (Docker; WebSocket, API admin, SQLite)
   UDP 3478 (STUN: jalur langsung HP ↔ layar di Wi-Fi yang sama)
```

File yang terlibat:

| File di repo | Tempatnya di VM |
| --- | --- |
| `deploy/nginx/hoorah-server.conf` | `/etc/nginx/snippets/hoorah-server.conf` |
| `deploy/nginx/hoorah.fajarrizky.my.id` | `/etc/nginx/sites-enabled/hoorah.fajarrizky.my.id` |
| `deploy/vm/compose.yaml`, `update.sh`, `rollback.sh`, `backup.sh` | dipakai langsung dari `~/hoorah/deploy/vm/` |
| `deploy/vm/.env` (tidak masuk git) | dibuat sendiri di langkah 4 |

---

## 1. Git: push dari Mac (akun GitHub `jarki0402-alt`)

Repo: https://github.com/jarki0402-alt/hoorah (**publik**: siapa pun bisa membaca isinya, jadi jangan pernah commit kata sandi atau `.env`).

### 1a. Sekali saja: token GitHub

1. Masuk GitHub sebagai **jarki0402-alt** → foto profil → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Isi: nama `hoorah-mac`, masa berlaku sesukamu, **Repository access**: *Only select repositories* → `hoorah`.
3. **Permissions** → Repository permissions: **Contents: Read and write**, **Workflows: Read and write** (wajib, karena repo berisi `.github/workflows`).
4. **Generate token**, salin (hanya tampil sekali).

### 1b. Sekali saja: sambungkan folder ke repo

**Mac**
```bash
cd ~/Documents/vibe/game
git remote add origin https://jarki0402-alt@github.com/jarki0402-alt/hoorah.git
git config user.name "jarki0402-alt"
git config user.email "jarki0402-alt@users.noreply.github.com"
```
Nama pengguna di alamat remote (`jarki0402-alt@`) membuat Keychain macOS menyimpan token khusus akun ini, jadi tidak bentrok dengan akun GitHub lain di laptop. Email `noreply` menjaga email pribadi tidak tampil di riwayat commit repo publik.

Kalau `origin` sudah ada dengan alamat lain: `git remote set-url origin https://jarki0402-alt@github.com/jarki0402-alt/hoorah.git`.

### 1c. Setiap kali ada perubahan

**Mac**
```bash
git status                      # lihat apa yang berubah
git add -A
git commit -m "Short English description of the change"
git push origin main            # pertama kali: diminta password → tempel TOKEN dari 1a (bukan password GitHub)
```
Lalu buka https://github.com/jarki0402-alt/hoorah/actions: tunggu workflow **Release** hijau (±5–8 menit). Kalau merah, klik untuk melihat langkah yang gagal; VM tidak perlu disentuh selama belum hijau.

Ambil perubahan dari GitHub ke Mac (kalau pernah mengedit di tempat lain): `git pull origin main`.

---

## 2. Sebelum mulai di VM (2 menit)

Masuk VM: Google Cloud Console → **Compute Engine** → **VM instances** → tombol **SSH** di baris VM (atau `gcloud compute ssh NAMA_VM --zone ZONA_VM` dari Mac).

**VM**
```bash
free -h                         # catat RAM "available"; Hoorah memakai sampai 320 MB
df -h /                         # sisa disk minimal ±2 GB
docker compose version          # Docker Compose v2 (sudah ada untuk Suwwara)
nginx -v                        # nginx yang melayani Suwwara
docker stats --no-stream        # pemakaian RAM tiap container Suwwara
```
Kalau RAM *available* di bawah ±350 MB, berhenti dulu dan kabari: Hoorah bisa membuat Suwwara kekurangan memori.

---

## 3. Google Cloud: firewall

Port 80/443 sudah terbuka untuk Suwwara. Hoorah hanya butuh **UDP 3478** (STUN).

**Console:** **VPC network** → **Firewall** → **Create firewall rule**:

| Kolom | Isi |
| --- | --- |
| Name | `hoorah-stun` |
| Network | `default` (jaringan VM) |
| Direction | Ingress |
| Action on match | Allow |
| Targets | All instances in the network |
| Source IPv4 ranges | `0.0.0.0/0` |
| Protocols and ports | Specified → **UDP** → `3478` |

Atau dari Cloud Shell:
```bash
gcloud compute firewall-rules create hoorah-stun --network=default --direction=INGRESS \
  --action=ALLOW --rules=udp:3478 --source-ranges=0.0.0.0/0
```
Jangan membuka `tcp:8790` atau `tcp:1010`: server Hoorah hanya didengar nginx di VM itu sendiri. Pastikan juga VM tetap di **Network tier: Standard** (Compute Engine → VM → Network interfaces), karena jatah gratis data keluar 200 GiB/bulan hanya berlaku di Standard.

---

## 4. VM: ambil kode dan siapkan Hoorah (sekali)

**VM**
```bash
git clone https://github.com/jarki0402-alt/hoorah.git ~/hoorah
sudo mkdir -p /srv/hoorah && sudo chown "$USER" /srv/hoorah
nano ~/hoorah/deploy/vm/.env
```
Isi `.env` (tanpa spasi di sekitar `=`, tanpa tanda kutip):
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=isi-sandi-kuat-minimal-10-karakter
MAX_PLAYERS=2
```
Simpan: `Ctrl+O`, `Enter`, `Ctrl+X`. Admin hanya dibuat saat server **pertama kali** menyala; mengubah baris ini setelahnya tidak membuat admin baru (lihat langkah 8).

### Image dari GitHub bisa diambil tanpa login?

Setelah workflow pertama hijau (langkah 1c), coba:
```bash
docker pull ghcr.io/jarki0402-alt/hoorah:latest
```
- Berhasil: lanjut.
- `unauthorized` / `denied`: di GitHub buka profil → **Packages** → **hoorah** → **Package settings** → **Change visibility** → **Public**. (Isinya sama dengan kode di repo publik; tidak ada rahasia di dalam image.)

### Jalankan Hoorah

**VM**
```bash
cd ~/hoorah/deploy/vm
./update.sh
curl -s http://127.0.0.1:8790/health          # {"ok":true,...}
```
Sampai di sini Hoorah sudah jalan di VM, tetapi belum bisa dibuka dari luar (DNS dan nginx belum diarahkan).

---

## 5. Cloudflare + sertifikat + nginx (lakukan berurutan, saat tidak ada yang sedang main)

Selama langkah 5b sampai 5d (±5 menit), `hoorah.fajarrizky.my.id` belum bisa dibuka.

### 5a. Lepas Hoorah dari Cloudflare Tunnel di Mac

Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → tunnel yang di Mac → **Configure** → **Public Hostname** → hapus baris `hoorah.fajarrizky.my.id`.
(Docker Hoorah di Mac tetap bisa dipakai lewat Wi-Fi: `http://IP-LAN:1010`.)

### 5b. DNS: arahkan ke VM, awan abu-abu

Cloudflare → domain `fajarrizky.my.id` → **DNS** → **Records**:
1. Hapus record `hoorah` yang lama (biasanya CNAME ke `...cfargotunnel.com`).
2. **Add record**: Type **A**, Name `hoorah`, IPv4 `35.212.247.252` (IP VM yang sama dengan Suwwara), Proxy status **DNS only** (awan **abu-abu**), TTL Auto. **Save**.

Kenapa abu-abu: lewat proxy Cloudflare, dari ISP Indonesia tiap permintaan ±0,4–0,9 detik (langsung ±0,19 detik), dan data yang lewat proxy tidak masuk jatah gratis Google sehingga ditagih (diukur saat memindahkan Suwwara, DEPLOY.md Suwwara §13).

Cek dari **Mac** (tunggu 1–2 menit):
```bash
dig +short hoorah.fajarrizky.my.id            # harus 35.212.247.252
```

### 5c. Sertifikat HTTPS

**VM**
```bash
sudo certbot certonly --nginx -d hoorah.fajarrizky.my.id
sudo certbot certificates                       # hoorah.fajarrizky.my.id muncul, VALID 89 days
```
`certonly` hanya mengambil sertifikat, tanpa mengubah file nginx mana pun. Perpanjangan otomatis memakai jadwal certbot yang sudah ada untuk Suwwara.

### 5d. Pasang situs Hoorah di nginx

**VM**
```bash
cd ~/hoorah
sudo cp deploy/nginx/hoorah-server.conf /etc/nginx/snippets/hoorah-server.conf
sudo cp deploy/nginx/hoorah.fajarrizky.my.id /etc/nginx/sites-enabled/hoorah.fajarrizky.my.id
sudo nginx -t
```
Harus tertulis `syntax is ok` dan `test is successful`. **Kalau tidak**, batalkan (Suwwara tetap aman karena nginx belum di-reload):
```bash
sudo rm /etc/nginx/sites-enabled/hoorah.fajarrizky.my.id /etc/nginx/snippets/hoorah-server.conf
```
lalu kirim pesan error-nya ke saya. Kalau sukses:
```bash
sudo systemctl reload nginx
```

### 5e. Periksa

Dari **Mac**:
```bash
curl -s https://hoorah.fajarrizky.my.id/health                     # {"ok":true,...}
curl -sI https://hoorah.fajarrizky.my.id/ | grep -i server          # server: nginx (bukan cloudflare)
curl -s -o /dev/null -w "%{http_code}\n" https://suwwara.fajarrizky.my.id/   # Suwwara tetap 200
```
Lalu buka `https://hoorah.fajarrizky.my.id` di laptop (jadi layar utama) dan scan QR dari HP: sekali lewat Wi-Fi yang sama, sekali lewat data seluler. Buka `https://hoorah.fajarrizky.my.id/admin/` dan masuk dengan admin dari langkah 4.

---

## 6. Update rutin

1. **Mac**: `git add -A && git commit -m "..." && git push origin main`, tunggu **Release** hijau di tab Actions.
2. **VM**:
```bash
cd ~/hoorah && git pull
./deploy/vm/update.sh
```
`update.sh` mengambil image terbaru, menyalin file web ke `/srv/hoorah/web-<commit>`, memindahkan tautan `current`, lalu me-restart server Hoorah. Kalau server baru tidak sehat dalam ±1 menit, versi sebelumnya otomatis dipulihkan. Pemain di room tidak dikeluarkan: room disimpan sebelum restart dan dipulihkan sesudahnya.

3. **Hanya kalau `git pull` menampilkan perubahan di `deploy/nginx/`**: ulangi 5d (`cp` dua file → `sudo nginx -t` → `sudo systemctl reload nginx`).

Memasang versi tertentu: `./deploy/vm/update.sh sha-1a2b3c4` (daftar tag: GitHub → Packages → hoorah).

## 7. Kembali ke versi sebelumnya

**VM**
```bash
~/hoorah/deploy/vm/rollback.sh
```
Server dan file web kembali bersama ke versi sebelum `update.sh` terakhir. Dijalankan dua kali = kembali ke versi baru.

## 8. Admin

- Buat atau reset admin (sandi acak dicetak sekali):
```bash
cd ~/hoorah/deploy/vm && docker compose exec server node server.js admin set admin
```
- Daftar admin: `docker compose exec server node server.js admin list`

## 9. Cadangan database (admin, kode Pass, statistik)

**VM**
```bash
~/hoorah/deploy/vm/backup.sh                    # uji sekali: "Tersimpan: ~/hoorah-backups/hoorah-....db.gz"
crontab -e                                      # tambahkan baris di bawah, simpan
```
```
30 3 * * * $HOME/hoorah/deploy/vm/backup.sh >> $HOME/hoorah-backups/backup.log 2>&1
```
14 cadangan terbaru disimpan. Salin sesekali ke luar VM (cadangan yang hanya ada di VM ikut hilang bersama VM):
```bash
# dari Mac
gcloud compute scp NAMA_VM:~/hoorah-backups/hoorah-TANGGAL.db.gz . --zone ZONA_VM
```
Pulihkan (mengganti data sekarang):
```bash
cd ~/hoorah/deploy/vm
gunzip -c ~/hoorah-backups/hoorah-TANGGAL.db.gz > /tmp/hoorah.db && chmod 644 /tmp/hoorah.db
docker compose stop server
docker compose run --rm --no-deps -v /tmp/hoorah.db:/restore.db:ro --entrypoint sh server \
  -c 'cp /restore.db /data/hoorah.db && rm -f /data/hoorah.db-wal /data/hoorah.db-shm'
docker compose up -d server && rm /tmp/hoorah.db
```

## 10. Memantau

- Dashboard admin → **Server**: RAM dan CPU VM (Suwwara ikut terhitung), memori Hoorah dibanding batas, disk, dan **Data keluar VM** dibanding jatah gratis 200 GiB/bulan (dibagi dengan Suwwara).
- Log: `cd ~/hoorah/deploy/vm && docker compose logs --tail 100 server`
- Pemakaian RAM: `docker stats --no-stream`

## Darurat (diserang)

Sama seperti Suwwara: Cloudflare → DNS → record `hoorah` jadi awan **oranye**, lalu Security → **Under Attack Mode**. Konfigurasi nginx Hoorah sudah membaca IP asli dari Cloudflare, jadi tidak perlu diubah. Kembalikan ke abu-abu setelah aman (selama oranye, data keluar ditagih dan koneksi dari Indonesia lebih lambat).

## Masalah umum

| Gejala | Penyebab / tindakan |
| --- | --- |
| `docker pull` ditolak (`unauthorized`) | Package GitHub masih privat: langkah 4, "Change visibility → Public" |
| `update.sh`: "Folder /srv/hoorah belum ada" | `sudo mkdir -p /srv/hoorah && sudo chown "$USER" /srv/hoorah` |
| `update.sh`: server tidak sehat, otomatis rollback | Baca log yang dicetak; biasanya `.env` salah ketik. Perbaiki, jalankan lagi |
| `sudo nginx -t` gagal | Hapus dua file Hoorah (5d), kirim pesan error-nya. Suwwara tidak terpengaruh selama belum di-reload |
| `certbot`: "Timeout during connect" atau "unauthorized" | DNS belum mengarah ke VM atau awan masih oranye: cek `dig +short`, tunggu 2 menit, ulangi |
| Halaman Hoorah memakai sertifikat Suwwara (peringatan nama tidak cocok) | Situs Hoorah belum dipasang/di-reload (5d) |
| HP di Wi-Fi yang sama tidak tersambung langsung (selalu lewat server) | UDP 3478 belum dibuka (langkah 3) |
| Push ditolak `refusing to allow ... workflow` | Token belum punya izin **Workflows: Read and write** (1a) |
| Push ditolak `403` / meminta login terus | Token salah atau milik akun lain: buat ulang (1a); hapus yang tersimpan lewat Keychain Access → cari `github.com` dengan akun `jarki0402-alt` |
| Suwwara melambat setelah Hoorah naik | `docker stats --no-stream`; kabari angka RAM-nya. Batas Hoorah bisa diturunkan di `deploy/vm/compose.yaml` (`mem_limit`) |
