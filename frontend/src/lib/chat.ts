import { API_URL, type Tier } from "@/lib/api";
import type { StockSymbol } from "@/lib/contracts";

export type ChatMessage = { role: "user" | "assistant"; text: string };

export type ChatAction =
  | {
      type: "deposit";
      amountUsd: number;
      tier: Tier;
      goalName: string;
      targetUsd: number;
      goalMonth: string;
    }
  | {
      type: "deposit_stock";
      symbol: StockSymbol;
      amount: number;
      tier: Tier;
      goalName: string;
      targetUsd: number;
      goalMonth: string;
    }
  | {
      type: "update_goal";
      goalName?: string;
      targetUsd?: number;
      goalMonth?: string;
      tier?: Tier;
    }
  | { type: "withdraw" }
  | { type: "withdraw_stock"; symbol: StockSymbol };

export async function sendChat(
  user: string,
  messages: ChatMessage[],
): Promise<{ reply: string; actions: ChatAction[] }> {
  const res = await fetch(`${API_URL}/api/chat?user=${user}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`Chat failed (${res.status})`);
  return res.json();
}