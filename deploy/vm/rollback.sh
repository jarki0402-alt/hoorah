#!/usr/bin/env bash
# Swaps back to the version that ran before the last ./update.sh (server image and web files together).
# Running it twice returns to the newer version.
set -euo pipefail
cd "$(dirname "$0")"

WEB_ROOT="${HOORAH_WEB_ROOT:-/srv/hoorah}"

docker image inspect hoorah-server:previous >/dev/null 2>&1 && [ -L "$WEB_ROOT/previous" ] || {
  echo "Tidak ada versi sebelumnya untuk dipulihkan."
  exit 1
}

current_dir="$(readlink "$WEB_ROOT/current")"
previous_dir="$(readlink "$WEB_ROOT/previous")"

docker tag hoorah-server:current hoorah-server:swap
docker tag hoorah-server:previous hoorah-server:current
docker tag hoorah-server:swap hoorah-server:previous
docker rmi hoorah-server:swap >/dev/null

ln -sfn "$previous_dir" "$WEB_ROOT/current.new"
mv -Tf "$WEB_ROOT/current.new" "$WEB_ROOT/current"
ln -sfn "$current_dir" "$WEB_ROOT/previous"

docker compose up -d server

for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:8790/health >/dev/null 2>&1; then
    echo "Kembali ke $previous_dir. Server sehat."
    exit 0
  fi
  sleep 2
done
echo "Server belum sehat setelah rollback. Lihat: docker compose logs --tail 60 server"
exit 1
