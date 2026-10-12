import { API_URL } from "@/lib/api";
import type { StockSymbol } from "@/lib/contracts";

/** Ask the backend to bring a rotated stock back from USDG so it can be withdrawn. */
export async function unwindStock(user: string, symbol: StockSymbol) {
  const res = await fetch(`${API_URL}/api/unwind?user=${user}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Unwind failed (${res.status})`);
  return data;
}