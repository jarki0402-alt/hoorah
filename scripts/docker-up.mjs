#!/usr/bin/env node
// Builds and starts the Docker stack with the laptop's LAN address baked into the QR code.
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
  }
  return 'localhost';
}

const port = process.env.WEB_PORT ?? '1010';
const origin = process.env.PUBLIC_ORIGIN ?? `http://${lanAddress()}:${port}`;
const res = spawnSync('docker', ['compose', '-f', 'docker/compose.yaml', 'up', '--build', '-d'], {
  stdio: 'inherit',
  env: { ...process.env, PUBLIC_ORIGIN: origin, WEB_PORT: port },
});
if (res.status === 0) {
  console.log(`
  Hoorah (Docker) berjalan
  ─────────────────────────────────────────────
  Buka di semua perangkat : ${origin}
  (PC/laptop/tablet/Smart TV otomatis jadi layar utama, HP otomatis jadi kontroler)
  Simulator               : ${origin}/sim/
  Berhenti                : npm run docker:down
  ─────────────────────────────────────────────
`);
}
process.exit(res.status ?? 1);
