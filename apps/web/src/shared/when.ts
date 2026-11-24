/**
 * Short Indonesian end times for the Hoorah Pass ("hari ini 23.59", "besok 09.00",
 * "Sab, 21 Nov 23.59") in the device's local time. Built by hand instead of Intl so old Smart TV
 * browsers print the same thing.
 */
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;

const two = (n: number): string => String(n).padStart(2, '0');

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatUntil(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const time = `${two(d.getHours())}.${two(d.getMinutes())}`;
  const days = Math.round((dayStart(d) - dayStart(new Date(now))) / 86_400_000);
  if (days === 0) return `hari ini ${time}`;
  if (days === 1) return `besok ${time}`;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
}

/** Time left as a clock, "23:41:05" (hours may pass 24: "47:59:59"); never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${two(h)}:${two(m)}:${two(total % 60)}`;
}

/** Under this much time left a Pass shows a live countdown instead of its end time. */
export const COUNTDOWN_UNDER_MS = 48 * 3_600_000;
