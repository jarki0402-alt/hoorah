/**
 * Admin users from the command line (no sign-up page on purpose):
 *
 *   node server.js admin set <username>     create, or reset the password
 *   node server.js admin list
 *   node server.js admin remove <username>
 *
 * `set` takes the password from ADMIN_PASSWORD, else from piped stdin, else generates a strong one
 * and prints it once. Docker: `docker compose -f docker/compose.yaml exec server node server.js admin list`.
 * Local: `npm run admin -w @hoorah/server -- set admin`.
 */
import { randomBytes } from 'node:crypto';
import type { AdminAuth } from './auth';

interface Out {
  log(line: string): void;
  error(line: string): void;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

/** Returns the process exit code. */
export async function runAdminCli(args: string[], auth: AdminAuth, out: Out = console): Promise<number> {
  const [command, username] = args;
  try {
    if (command === 'list') {
      const users = auth.list();
      if (users.length === 0) out.log('Belum ada admin. Buat dengan: admin set <username>');
      for (const u of users) out.log(`${u.username}\tdibuat ${new Date(u.createdAt).toISOString()}`);
      return 0;
    }
    if (command === 'set' && username) {
      let password = process.env.ADMIN_PASSWORD ?? '';
      let generated = false;
      if (!password && !process.stdin.isTTY) password = await readStdin();
      if (!password) {
        password = randomBytes(12).toString('base64url');
        generated = true;
      }
      const result = await auth.setUser(username, password, Date.now());
      out.log(`Admin "${username}" ${result === 'created' ? 'dibuat' : 'diperbarui'}.`);
      if (generated) out.log(`Kata sandi: ${password}  (simpan sekarang, tidak ditampilkan lagi)`);
      return 0;
    }
    if (command === 'remove' && username) {
      const ok = auth.removeUser(username);
      out.log(ok ? `Admin "${username}" dihapus.` : `Admin "${username}" tidak ada.`);
      return ok ? 0 : 1;
    }
  } catch (err) {
    out.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  out.error('Pakai: admin set <username> | admin list | admin remove <username>');
  return 2;
}
