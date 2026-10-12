"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { runNova, saveProfile } from "@/lib/api";
import { sendChat, type ChatAction, type ChatMessage } from "@/lib/chat";
import { useDeposit } from "@/lib/useDeposit";

type UiMessage = ChatMessage & { hidden?: boolean };

const GREETING_SIGNAL =
  "[system] The user just connected their wallet. Greet them now.";
const FALLBACK_GREETING =
  "Hi, I'm Nova. I can read your wallet, manage your savings goal and explain every move I make. What are you saving for?";

const toDate = (month?: string) => (month ? `${month}-01` : undefined);

export function useChat() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const deposit = useDeposit();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const greetedFor = useRef<string | null>(null);
  const store = useRef<UiMessage[]>([]);

  const push = useCallback((m: UiMessage) => {
    store.current = [...store.current, m];
    setMessages(store.current);
  }, []);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["nova-state"] });
    queryClient.invalidateQueries({ queryKey: ["rh-status"] });
  }, [queryClient]);

  // live status while the wallet popups are open
  useEffect(() => {
    if (deposit.step === "switching")
      push({
        role: "assistant",
        text: "Switch the network in your wallet to continue...",
      });
    if (deposit.step === "approving")
      push({
        role: "assistant",
        text: "Approve the spend in your wallet...",
      });
    if (deposit.step === "depositing")
      push({
        role: "assistant",
        text: "Now confirm the transaction in your wallet.",
      });
    if (deposit.step === "error" && deposit.error)
      push({ role: "assistant", text: `Wallet error: ${deposit.error}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposit.step]);

  const handleActions = async (actions: ChatAction[]) => {
    if (!address) return;
    for (const a of actions) {
      await saveProfile(address, {
        goalName: a.goalName,
        targetUsd: a.targetUsd,
        goalDate: toDate(a.goalMonth),
        tier: a.tier,
      });
      refresh();
      if (a.type === "update_goal") continue;

      const ok =
        a.type === "deposit"
          ? await deposit.run(a.amountUsd, a.tier)
          : await deposit.runStock(a.symbol, a.amount, a.tier);
      refresh();
      if (!ok) {
        push({
          role: "assistant",
          text: "The deposit didn't go through, so nothing moved. Tell me when you want to try again.",
        });
        continue;
      }
      push({
        role: "assistant",
        text: "Deposit confirmed. I'm putting it to work now, give me a moment.",
      });
      const r = await runNova(address);
      push({
        role: "assistant",
        text:
          r.summary ??
          (r.error
            ? `I couldn't finish deploying: ${r.error}`
            : "A review is already running."),
      });
      refresh();
    }
  };

  const send = async (text: string, hidden = false) => {
    if (!address) return;
    push({ role: "user", text, hidden });
    setBusy(true);
    try {
      const history = store.current.map(({ role, text }) => ({ role, text }));
      const { reply, actions } = await sendChat(address, history);
      if (reply) push({ role: "assistant", text: reply });
      await handleActions(actions);
    } catch {
      push({
        role: "assistant",
        text: hidden
          ? FALLBACK_GREETING
          : "I couldn't reach my brain just now. Please try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (!address) return;
    push({
      role: "assistant",
      text: "Reviewing your portfolio against the live market...",
    });
    setBusy(true);
    try {
      const r = await runNova(address);
      push({
        role: "assistant",
        text:
          r.summary ??
          (r.error
            ? `I couldn't finish the review: ${r.error}`
            : "A review is already running."),
      });
      refresh();
    } catch {
      push({
        role: "assistant",
        text: "I couldn't reach the backend for the review.",
      });
    } finally {
      setBusy(false);
    }
  };

  // greet once per connected wallet; reset when it disconnects or changes
  useEffect(() => {
    if (!address) {
      greetedFor.current = null;
      store.current = [];
      setMessages([]);
      return;
    }
    if (greetedFor.current === address) return;
    greetedFor.current = address;
    store.current = [];
    setMessages([]);
    void send(GREETING_SIGNAL, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return { messages: messages.filter((m) => !m.hidden), busy, send, review };
}