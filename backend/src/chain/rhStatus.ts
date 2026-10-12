import type { Address } from "viem";
import { getRhRotation, getRhSurplus, getRhYieldOwed } from "./vault.js";
import { fromUnits, getHoldings } from "./robinhood.js";
import { getStockYield } from "../agent/morpho.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Everything the dashboard needs for the Robinhood Chain side of one user's funds.
// Call inside withUser (the rotated amounts come from the user's ledger).
export async function getRhStatus(user: Address) {
  const [{ holdings, totalUsd, heldUsd, rotatedUsd }, stockYield] = await Promise.all([
    getHoldings(user),
    getStockYield(),
  ]);

  const tokens = await Promise.all(
    holdings.map(async (h) => {
      const [rot, owed, surplus] = await Promise.all([
        getRhRotation(h.token),
        getRhYieldOwed(user, h.token),
        getRhSurplus(h.token),
      ]);
      const p = h.priceUsd ?? 0;
      const claimable = fromUnits(owed, h.decimals);
      return {
        symbol: h.symbol,
        token: h.token as string,
        units: fromUnits(h.units, h.decimals),
        priceUsd: h.priceUsd,
        valueUsd: round2(h.valueUsd),
        heldUsd: round2(h.heldUsd),
        rotatedUsd: round2(h.rotatedUsd),
        usdgIdle: round2(Number(rot.usdgIdle) / 1e6),
        morphoUsd: round2(Number(rot.parkedAssets) / 1e6),
        yieldClaimable: claimable,
        yieldClaimableUsd: round2(claimable * p),
        pendingGainUnits: fromUnits(surplus, h.decimals),
      };
    }),
  );

  const visible = tokens.filter((t) => t.units > 0 || t.yieldClaimable > 0);
  return {
    totalUsd: round2(totalUsd),
    heldUsd: round2(heldUsd),
    rotatedUsd: round2(rotatedUsd),
    morphoUsd: round2(visible.reduce((a, t) => a + t.morphoUsd, 0)),
    claimableUsd: round2(visible.reduce((a, t) => a + t.yieldClaimableUsd, 0)),
    morphoApyPct: stockYield.supplyApyPct,
    morphoVaults: stockYield.vaults,
    tokens: visible,
  };
}