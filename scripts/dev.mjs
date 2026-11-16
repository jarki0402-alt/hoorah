#!/usr/bin/env node
// Starts the game server and the web dev server together, with the laptop's LAN address
// baked into the QR code so phones on the same Wi-Fi can join.
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
    }
  }
  return 'localhost';
}

const ip = lanAddress();
const origin = `http://${ip}:5173`;
const env = { ...process.env, VITE_PUBLIC_ORIGIN: origin, FORCE_COLOR: '1' };

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@hoorah/server'], { stdio: 'inherit', env }),
  spawn('npm', ['run', 'dev', '-w', '@hoorah/web'], { stdio: 'inherit', env }),
];

console.log(`
  Hoorah dev
  ─────────────────────────────────────────────
  Buka di semua perangkat : ${origin}
  (PC/laptop/tablet/Smart TV otomatis jadi layar utama, HP otomatis jadi kontroler)
  Simulator               : ${origin}/sim/
  ─────────────────────────────────────────────
`);

const stop = () => {
  for (const p of procs) p.kill('SIGINT');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
