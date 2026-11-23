#!/usr/bin/env bash
# Updates Hoorah on this VM: git pull (scripts and config), then pulls the image GitHub Actions built for that same
# commit (ghcr.io/jarki0402-alt/hoorah:sha-<commit>, .github/workflows/check.yml), copies its web files next to the
# previous version for nginx and restarts the server. Nothing is built here, so Suwwara is not slowed down
# (owner decision 2026-11-23). If the new server is not healthy within a minute, the previous version comes back
# by itself. Suwwara is never touched.
#
#   ./deploy/vm/update.sh        pull the newest code from GitHub, pull its image, switch
#
# Right after a push the image may still be building: the script waits for it (HOORAH_IMAGE_WAIT seconds, default
# 900). Emergency only (GitHub down): HOORAH_BUILD_LOCAL=1 builds on the VM as before, which needs RAM available
# + free swap of at least 1000 MB (measured 2026-11-16: `npm ci` ~245 MB, web build ~716 MB) and refuses otherwise;
# HOORAH_FORCE_BUILD=1 skips that check.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO/deploy/vm"

WEB_ROOT="${HOORAH_WEB_ROOT:-/srv/hoorah}"
IMAGE_REPO="${HOORAH_IMAGE_REPO:-ghcr.io/jarki0402-alt/hoorah}"
IMAGE_WAIT="${HOORAH_IMAGE_WAIT:-900}"
NEED_KB=$((1000 * 1024))

say() { printf '\n==> %s\n' "$*"; }

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -m 3 http://127.0.0.1:8790/health >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

[ -d "$WEB_ROOT" ] && [ -w "$WEB_ROOT" ] || {
  echo "Folder $WEB_ROOT belum ada atau tidak bisa ditulis. Jalankan: sudo mkdir -p $WEB_ROOT && sudo chown \$USER $WEB_ROOT"
  exit 1
}

if [ "${HOORAH_NO_PULL:-}" != "1" ]; then
  say "Mengambil kode terbaru dari GitHub"
  self="$REPO/deploy/vm/update.sh"
  before="$(md5sum "$self")"
  git -C "$REPO" pull --ff-only
  # bash keeps reading the old copy of a script that git just replaced: start the new one instead.
  if [ "$(md5sum "$self")" != "$before" ]; then
    say "Skrip update ikut berubah, menjalankan versi barunya"
    exec env HOORAH_NO_PULL=1 "$self" "$@"
  fi
fi
REV="$(git -C "$REPO" rev-parse --short=7 HEAD)"
IMAGE="hoorah-server:$REV"

build_local() {
  avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  swap_kb="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"
  if [ "$((avail_kb + swap_kb))" -lt "$NEED_KB" ] && [ "${HOORAH_FORCE_BUILD:-}" != "1" ]; then
    echo "Memori kurang untuk build: RAM tersedia $((avail_kb / 1024)) MB + swap kosong $((swap_kb / 1024)) MB,"
    echo "butuh minimal $((NEED_KB / 1024)) MB. Tunggu Suwwara sepi lalu ulangi, atau tambah swap (DEPLOY.md bagian 2b)."
    echo "Tetap build (risiko kehabisan memori): HOORAH_BUILD_LOCAL=1 HOORAH_FORCE_BUILD=1 $0"
    exit 1
  fi
  say "Membangun versi $REV di VM (darurat; 5-15 menit, Suwwara bisa sedikit lebih lambat)"
  docker build -f "$REPO/docker/Dockerfile" --target release \
    --label "org.opencontainers.image.revision=$(git -C "$REPO" rev-parse HEAD)" \
    -t "$IMAGE" "$REPO"
}

# Waits until GitHub Actions has published the image of this commit, then pulls it and tags it locally.
pull_image() {
  local remote="$IMAGE_REPO:sha-$REV" waited=0
  say "Mengambil image versi $REV dari GitHub ($remote)"
  local out
  until out="$(docker pull -q "$remote" 2>&1)"; do
    if grep -qiE 'denied|unauthorized' <<<"$out"; then
      echo "GitHub menolak: package hoorah masih Private."
      echo "Buka GitHub > Packages > hoorah > Package settings > Change visibility > Public, lalu ulangi."
      exit 1
    fi
    if [ "$waited" -ge "$IMAGE_WAIT" ]; then
      echo "Pesan terakhir dari docker: $out"
      echo "Image $remote belum ada setelah $((IMAGE_WAIT / 60)) menit."
      echo "Cek tab Actions di GitHub: build commit $REV harus hijau. Kalau gagal, perbaiki lalu push lagi."
      echo "Kalau package masih Private: GitHub > Packages > hoorah > Package settings > Change visibility > Public."
      echo "Darurat (GitHub bermasalah), build di VM: HOORAH_BUILD_LOCAL=1 $0"
      exit 1
    fi
    [ "$waited" -eq 0 ] && echo "Belum tersedia, mungkin GitHub masih membangun. Menunggu (cek ulang tiap 20 detik)..."
    sleep 20
    waited=$((waited + 20))
  done
  docker tag "$remote" "$IMAGE"
  # Only the local per-commit tag is kept; the image itself stays because that tag still points at it.
  docker image rm "$remote" >/dev/null
}

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  say "Versi $REV sudah ada di VM, langsung dipasang"
elif [ "${HOORAH_BUILD_LOCAL:-}" = "1" ]; then
  build_local
else
  pull_image
fi

DIR="web-$REV"
if [ ! -d "$WEB_ROOT/$DIR" ]; then
  say "Menyalin file web ke $WEB_ROOT/$DIR"
  tmp="$(docker create "$IMAGE")"
  rm -rf "$WEB_ROOT/$DIR.tmp"
  if ! docker cp "$tmp:/web" "$WEB_ROOT/$DIR.tmp"; then
    docker rm -f "$tmp" >/dev/null
    exit 1
  fi
  docker rm -f "$tmp" >/dev/null
  mv "$WEB_ROOT/$DIR.tmp" "$WEB_ROOT/$DIR"
fi

say "Mengingat versi yang sedang jalan (untuk rollback)"
if docker image inspect hoorah-server:current >/dev/null 2>&1; then
  docker tag hoorah-server:current hoorah-server:previous
fi
if [ -L "$WEB_ROOT/current" ]; then
  ln -sfn "$(readlink "$WEB_ROOT/current")" "$WEB_ROOT/previous"
fi

say "Memasang versi $REV"
docker tag "$IMAGE" hoorah-server:current
# A new link renamed over the old one: nginx never sees a moment without files.
ln -sfn "$DIR" "$WEB_ROOT/current.new"
mv -Tf "$WEB_ROOT/current.new" "$WEB_ROOT/current"
docker compose up -d server

say "Menunggu server sehat"
if ! healthy; then
  echo "Server versi $REV tidak sehat. Log terakhir:"
  docker compose logs --tail 40 server || true
  if docker image inspect hoorah-server:previous >/dev/null 2>&1 && [ -L "$WEB_ROOT/previous" ]; then
    say "Kembali ke versi sebelumnya"
    ./rollback.sh
  fi
  exit 1
fi

say "Membersihkan versi lama (yang sedang jalan dan sebelumnya disimpan)"
keep_current="$(readlink "$WEB_ROOT/current")"
keep_previous="$(readlink "$WEB_ROOT/previous" 2>/dev/null || true)"
for old in "$WEB_ROOT"/web-*; do
  [ -d "$old" ] || continue
  name="$(basename "$old")"
  [ "$name" = "$keep_current" ] || [ "$name" = "$keep_previous" ] || rm -rf "$old"
done
current_id="$(docker image inspect -f '{{.Id}}' hoorah-server:current)"
previous_id="$(docker image inspect -f '{{.Id}}' hoorah-server:previous 2>/dev/null || true)"
# Only the per-commit tags this script made (7 hex digits); anything else named hoorah-server is left alone.
for tag in $(docker image ls hoorah-server --format '{{.Tag}}'); do
  [[ "$tag" =~ ^[0-9a-f]{7}$ ]] || continue
  id="$(docker image inspect -f '{{.Id}}' "hoorah-server:$tag")"
  if [ "$id" != "$current_id" ] && [ "$id" != "$previous_id" ]; then
    docker rmi "hoorah-server:$tag" >/dev/null || echo "(versi lama $tag belum bisa dihapus, dilewati)"
  fi
done
# Only untagged leftovers (old pulled layers). The build cache of an emergency local build is left alone.
docker image prune -f >/dev/null

echo
echo "Hoorah versi $REV berjalan. Cek: curl -s https://hoorah.fajarrizky.my.id/health"
