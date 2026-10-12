export function usd(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}