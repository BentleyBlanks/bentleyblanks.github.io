// Compact number formatting for the HUD (1.2K, 3.4M, …).
const UNITS = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac'];

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return Number.isInteger(n) ? String(n) : n.toFixed(1);
  let u = 0;
  while (n >= 1000 && u < UNITS.length - 1) {
    n /= 1000;
    u++;
  }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)}${UNITS[u]}`;
}
