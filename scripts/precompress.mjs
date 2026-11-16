#!/usr/bin/env node
// Writes a .gz next to every compressible file of the web build, so nginx (gzip_static) sends it as is and the
// VM's small CPU never compresses the same file twice. Usage: node scripts/precompress.mjs apps/web/dist
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { constants, gzipSync } from 'node:zlib';

const EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.json',
  '.webmanifest',
  '.txt',
  '.wasm',
  '.glb',
]);
const MIN_BYTES = 1024;
/** Only kept when it saves at least this share; already-dense files are served as they are. */
const MAX_RATIO = 0.9;

const root = process.argv[2];
if (!root) {
  console.error('Usage: node scripts/precompress.mjs <dir>');
  process.exit(1);
}

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

let count = 0;
let before = 0;
let after = 0;
for (const path of files(root)) {
  if (!EXTENSIONS.has(extname(path)) || statSync(path).size < MIN_BYTES) continue;
  const raw = readFileSync(path);
  const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
  if (gz.length > raw.length * MAX_RATIO) continue;
  writeFileSync(`${path}.gz`, gz);
  count++;
  before += raw.length;
  after += gz.length;
}
const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`precompress: ${count} files, ${mb(before)} MB -> ${mb(after)} MB gzip`);
