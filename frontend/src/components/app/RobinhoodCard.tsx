"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import type { RhStatus, RhToken } from "@/lib/api";
import { money } from "@/lib/allocation";
import { STOCK_TOKENS, type StockSymbol } from "@/lib/contracts";
import { unwindStock } from "@/lib/unwind";
import { useDeposit } from "@/lib/useDeposit";

function rotatedPct(t: RhToken): number {
  return t.valueUsd > 0 ? (t.rotatedUsd / t.valueUsd) * 100 : 0;
}

function stateLabel(t: RhToken): string {
  const pct = rotatedPct(t);
  if (pct >= 99) return "Sold into USDG, earning on Morpho";
  if (pct >= 1) return `${Math.round(pct)}% in USDG, the rest held`;
  return "Held for price exposure";
}

function StockRow({
  token,
  onClaim,
  claiming,
  onWithdraw,
  withdrawing,
}: {
  token: RhToken;
  onClaim: (symbol: StockSymbol) => void;
  claiming: boolean;
  onWithdraw: (token: RhToken) => void;
  withdrawing: boolean;
}) {
  const pct = Math.min(100, Math.max(0, rotatedPct(token)));
  const canClaim = token.yieldClaimable > 0 && token.symbol in STOCK_TOKENS;

  return (
    <li className="grid gap-2 py-4">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-lg font-semibold">
          {token.symbol}
        </span>
        <span className="text-sm text-muted tabular-nums">
          {token.units.toFixed(3)} tokens
          {token.priceUsd != null && ` at ${money(token.priceUsd)}`}
        </span>
        <span className="ml-auto tabular-nums">{money(token.valueUsd)}</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-periwinkle"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-dim">{stateLabel(token)}</span>
        {token.morphoUsd > 0 && (
          <span className="text-periwinkle tabular-nums">
            {money(token.morphoUsd)} on Morpho
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {canClaim && (
            <button
              type="button"
              disabled={claiming || withdrawing}
              onClick={() => onClaim(token.symbol as StockSymbol)}
              className="rounded-full border border-mint/40 px-3 py-1 text-mint hover:bg-mint/10 disabled:opacity-50"
            >
              {claiming
                ? "Claiming..."
                : `Claim ${token.yieldClaimable.toFixed(4)} ${token.symbol} (${money(token.yieldClaimableUsd)})`}
            </button>
          )}
          <button
            type="button"
            disabled={claiming || withdrawing}
            onClick={() => onWithdraw(token)}
            className="rounded-full border border-line-strong px-3 py-1 text-muted hover:bg-field hover:text-starlight disabled:opacity-50"
          >
            {withdrawing ? "Withdrawing..." : "Withdraw all"}
          </button>
        </div>
      </div>
    </li>
  );
}

export function RobinhoodCard({ status }: { status: RhStatus }) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { claim, withdrawStock, error, reset } = useDeposit();
  const [claimingSymbol, setClaimingSymbol] = useState<string | null>(null);
  const [withdrawingSymbol, setWithdrawingSymbol] = useState<string | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["rh-status"] });
    queryClient.invalidateQueries({ queryKey: ["nova-state"] });
  };

  const onClaim = async (symbol: StockSymbol) => {
    setClaimingSymbol(symbol);
    await claim(symbol);
    setClaimingSymbol(null);
    refresh();
  };

  const onWithdraw = async (t: RhToken) => {
    if (!address || !(t.symbol in STOCK_TOKENS)) return;
    const symbol = t.symbol as StockSymbol;
    setWithdrawingSymbol(symbol);
    reset();
    try {
      if (t.rotatedUsd > 0) {
        setNote(`Bringing ${symbol} back from USDG first...`);
        await unwindStock(address, symbol);
      }
      setNote("Confirm the withdrawal in your wallet...");
      const ok = await withdrawStock(symbol, t.units);
      setNote(ok ? `${symbol} is back in your wallet.` : null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setWithdrawingSymbol(null);
      refresh();
    }
  };

  const tokens = status.tokens.filter((t) => t.units > 0);

  return (
    <section className="rounded-2xl border border-line bg-field p-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-semibold">
          Stocks on Robinhood Chain
        </h2>
        {status.morphoApyPct != null && (
          <span className="text-sm text-periwinkle">
            Morpho USDG rate {status.morphoApyPct.toFixed(2)}%
          </span>
        )}
        <span className="ml-auto text-sm text-muted tabular-nums">
          {money(status.heldUsd)} held · {money(status.rotatedUsd)} in USDG
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Nova decides per stock, from where its price sits in the 52-week range:
        expensive stocks are sold into USDG to earn on Morpho, cheap ones are
        held. It only buys back if it gets at least as many tokens as it sold.
      </p>
      <ul className="mt-2 divide-y divide-line">
        {tokens.map((t) => (
          <StockRow
            key={t.symbol}
            token={t}
            onClaim={onClaim}
            claiming={claimingSymbol === t.symbol}
            onWithdraw={onWithdraw}
            withdrawing={withdrawingSymbol === t.symbol}
          />
        ))}
      </ul>
      {(error ?? note) && (
        <p className="mt-3 text-sm text-muted">{error ?? note}</p>
      )}
    </section>
  );
}