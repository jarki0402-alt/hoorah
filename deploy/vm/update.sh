#!/usr/bin/env bash
# Builds Hoorah on this VM from the repo it lives in (like Suwwara) and switches to it: git pull, docker build,
# web files copied next to the previous version for nginx, server restarted. If the new server is not healthy
# within a minute, the previous version comes back by itself. Suwwara is never touched.
#
#   ./deploy/vm/update.sh        pull the newest code from GitHub, build, switch
#
# The build needs ~1.5 GB of memory at its peak (RAM + swap). The VM has 1 GB shared with Suwwara, so a swap file
# is required (DEPLOY.md section 2b); the check below refuses to build without enough room rather than let the
# kernel kill processes (Suwwara's included) mid-build.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO/deploy/vm"

WEB_ROOT="${HOORAH_WEB_ROOT:-/srv/hoorah}"
NEED_KB=$((1500 * 1024))

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
  git -C "$REPO" pull --ff-only
fi
REV="$(git -C "$REPO" rev-parse --short=7 HEAD)"
IMAGE="hoorah-server:$REV"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  swap_kb="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"
  if [ "$((avail_kb + swap_kb))" -lt "$NEED_KB" ] && [ "${HOORAH_FORCE_BUILD:-}" != "1" ]; then
    echo "Memori kurang untuk build: RAM tersedia $((avail_kb / 1024)) MB + swap kosong $((swap_kb / 1024)) MB,"
    echo "butuh minimal $((NEED_KB / 1024)) MB. Pasang swap dulu (DEPLOY.md bagian 2b), lalu jalankan lagi."
    exit 1
  fi
  say "Membangun versi $REV (5-15 menit di e2-micro; Suwwara bisa sedikit lebih lambat selama build)"
  docker build -f "$REPO/docker/Dockerfile" --target release \
    --label "org.opencontainers.image.revision=$(git -C "$REPO" rev-parse HEAD)" \
    -t "$IMAGE" "$REPO"
else
  say "Versi $REV sudah pernah dibangun, langsung dipasang"
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
# Only untagged leftovers; the build cache stays so the next build reuses `npm ci` (see DEPLOY.md, update rutin).
docker image prune -f >/dev/null

echo
echo "Hoorah versi $REV berjalan. Cek: curl -s https://hoorah.fajarrizky.my.id/health"
