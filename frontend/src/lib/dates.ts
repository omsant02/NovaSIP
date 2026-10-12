export function monthsUntil(date: string | null, now = new Date()): number {
  if (!date) return 0;
  const d = new Date(date);
  const months =
    (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(0, months);
}