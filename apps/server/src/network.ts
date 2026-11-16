/**
 * "Same Wi-Fi" for the nearby-screen hint: phones and the main screen behind one router reach the
 * server from the same public address. Public IPv4 must match exactly; IPv6 matches on the /64
 * home prefix; private IPv4 (local testing, Docker on the LAN) matches on the /24 subnet;
 * loopback is one machine. Unknown input gives '' (never matches).
 */
export function networkKey(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1' || ip.startsWith('127.')) return 'loopback';
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    if ([a, b, c, Number(v4[4])].some((n) => n > 255)) return '';
    const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    return isPrivate ? `v4net:${a}.${b}.${c}` : `v4:${ip}`;
  }
  if (ip.includes(':')) {
    const parts = expandV6(ip);
    return parts ? `v6:${parts.slice(0, 4).join(':')}` : '';
  }
  return '';
}

function expandV6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const all = [...head, ...Array<string>(Math.max(0, fill)).fill('0'), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => h.replace(/^0+(?=.)/, ''));
}
