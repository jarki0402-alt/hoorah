import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const page = (p: string) => resolve(import.meta.dirname, p);
/** Game server port behind the `/ws` proxy (e2e runs its own server on another port). */
const serverPort = process.env.HOORAH_SERVER_PORT ?? '8790';

/**
 * The build's version for reports and error logs: `HOORAH_VERSION` (Docker build arg) or
 * `GITHUB_SHA`, else the git short commit, else 'dev'.
 */
function appVersion(): string {
  const env = process.env.HOORAH_VERSION || process.env.GITHUB_SHA;
  if (env && /^[A-Za-z0-9._-]+$/.test(env)) return env.slice(0, 12);
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: import.meta.dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
      '/health': { target: `http://127.0.0.1:${serverPort}` },
      '/api': { target: `http://127.0.0.1:${serverPort}` },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
    },
  },
  build: {
    // Old Smart TV browsers and iOS 14+ Safari.
    target: ['es2019', 'chrome80', 'safari14'],
    cssTarget: ['chrome80', 'safari14'],
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        app: page('index.html'),
        bajaj: page('games/bajaj/index.html'),
        arena: page('games/arena/index.html'),
        catur: page('games/catur/index.html'),
        congklak: page('games/congklak/index.html'),
        dapur: page('games/dapur/index.html'),
        obby: page('games/obby/index.html'),
        tali: page('games/tali/index.html'),
        bom: page('games/bom/index.html'),
        runtuh: page('games/runtuh/index.html'),
        es: page('games/es/index.html'),
        langkah: page('games/langkah/index.html'),
        karung: page('games/karung/index.html'),
        kerupuk: page('games/kerupuk/index.html'),
        juragan: page('games/juragan/index.html'),
        kata: page('games/kata/index.html'),
        kompak: page('games/kompak/index.html'),
        kuis: page('games/kuis/index.html'),
        lari: page('games/lari/index.html'),
        ludo: page('games/ludo/index.html'),
        nyebrang: page('games/nyebrang/index.html'),
        penyusup: page('games/penyusup/index.html'),
        eja: page('games/eja/index.html'),
        siluman: page('games/siluman/index.html'),
        warna: page('games/warna/index.html'),
        hantu: page('games/hantu/index.html'),
        masak: page('games/masak/index.html'),
        rusun: page('games/rusun/index.html'),
        tarik: page('games/tarik/index.html'),
        ular: page('games/ular/index.html'),
        wilayah: page('games/wilayah/index.html'),
        sim: page('sim/index.html'),
        admin: page('admin/index.html'),
        lab: page('lab/index.html'),
      },
    },
  },
});
