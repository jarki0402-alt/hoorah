#!/usr/bin/env bash
# Puts a Hoorah build on the VM: pulls the image GitHub Actions built, copies its web files next to the previous
# version, switches nginx's link and restarts the server. If the new server is not healthy within a minute, the
# previous version comes back by itself. Suwwara is never touched.
#
#   ./update.sh            newest build (tag "latest")
#   ./update.sh sha-1a2b3c4   a specific build (tags are listed on GitHub: Packages -> hoorah)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE_REPO="${HOORAH_IMAGE_REPO:-ghcr.io/jarki0402-alt/hoorah}"
WEB_ROOT="${HOORAH_WEB_ROOT:-/srv/hoorah}"
TAG="${1:-latest}"
IMAGE="$IMAGE_REPO:$TAG"

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
  say "Mengambil $IMAGE"
  docker pull "$IMAGE"
fi

REV="$(docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE" 2>/dev/null | cut -c1-7)"
[ -n "$REV" ] || REV="$(date +%Y%m%d%H%M%S)"
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
docker image prune -f >/dev/null

echo
echo "Hoorah versi $REV berjalan. Cek: curl -s https://hoorah.fajarrizky.my.id/health"
