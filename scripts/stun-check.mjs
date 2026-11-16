#!/usr/bin/env node
// Asks a Hoorah server's built-in STUN responder for this machine's address, to check from outside that the
// UDP port is open (GCP firewall rule, DEPLOY.md section 3).
//   node scripts/stun-check.mjs hoorah.fajarrizky.my.id        (port 3478)
//   node scripts/stun-check.mjs 192.168.0.102 3479              (the laptop's Docker stack)
import { randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';

const host = process.argv[2];
const port = Number(process.argv[3] ?? 3478);
if (!host) {
  console.error('Pakai: node scripts/stun-check.mjs <host> [port]');
  process.exit(1);
}

const COOKIE = Buffer.from([0x21, 0x12, 0xa4, 0x42]);
const request = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), COOKIE, randomBytes(12)]);
const socket = createSocket('udp4');

const timer = setTimeout(() => {
  console.log(`TIDAK ADA JAWABAN dari ${host}:${port} (UDP). Cek aturan firewall dan server Hoorah.`);
  socket.close();
  process.exitCode = 1;
}, 4000);

socket.on('message', (msg) => {
  // XOR-MAPPED-ADDRESS (0x0020), IPv4.
  for (let i = 20; i + 4 <= msg.length; ) {
    const type = msg.readUInt16BE(i);
    const len = msg.readUInt16BE(i + 2);
    if (type === 0x0020 && msg[i + 5] === 0x01) {
      const mappedPort = msg.readUInt16BE(i + 6) ^ 0x2112;
      const ip = [0, 1, 2, 3].map((k) => msg[i + 8 + k] ^ COOKIE[k]).join('.');
      console.log(`OK: STUN di ${host}:${port} menjawab. Alamatmu menurut server: ${ip}:${mappedPort}`);
      break;
    }
    i += 4 + len + ((4 - (len % 4)) % 4);
  }
  clearTimeout(timer);
  socket.close();
});

socket.send(request, port, host);
