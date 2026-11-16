# syntax=docker/dockerfile:1

# ---------- build: install once, build web + server ----------
FROM node:22-trixie-slim AS build
# git is needed for the uWebSockets.js GitHub dependency.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/sdk/package.json packages/sdk/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
ARG PUBLIC_ORIGIN=""
ENV VITE_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
# Port phones use for the server's STUN (3478 on the VM; the laptop's Docker uses 3479, see compose.yaml).
ARG STUN_PORT=3478
ENV VITE_STUN_PORT=${STUN_PORT}
RUN npm run build && node scripts/precompress.mjs apps/web/dist

# ---------- server runtime: just the bundle + the native WebSocket module ----------
FROM node:22-trixie-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8790 SNAPSHOT_FILE=/data/rooms.json DB_FILE=/data/hoorah.db
WORKDIR /app
COPY --from=build /app/apps/server/dist/server.js ./server.js
COPY --from=build /app/node_modules/uWebSockets.js ./node_modules/uWebSockets.js
RUN echo '{"type":"module"}' > package.json && mkdir -p /data && chown node:node /data
USER node
EXPOSE 8790 3478/udp
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:8790/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# node:sqlite (admins, Hoorah Pass) is stable enough for us but still labelled experimental in Node 22.
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]

# ---------- release (the VM): the server plus the web files, one versioned image ----------
# Built by GitHub Actions (.github/workflows/release.yml). deploy/vm/update.sh runs the server from it and copies
# /web out for the VM's own nginx (deploy/nginx/).
FROM server AS release
COPY --from=build /app/apps/web/dist /web

# ---------- web (the laptop): nginx with the same rules as the VM ----------
FROM nginx:1.28-alpine AS web
COPY deploy/nginx/hoorah-server.conf /etc/nginx/hoorah/hoorah-server.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80
