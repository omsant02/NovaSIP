import "dotenv/config";
import { ExchangeClient, InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
if (account.address.toLowerCase() !== process.env.WALLET_B!.toLowerCase()) {
  throw new Error("Signer is not wallet B");
}

const HLP = "0xa15099a30bbf2e68942d6f4c43d70d04faeab0a0";
const USD_RAW = 10_000_000; // 10 USDC, assuming 6-decimal raw units (docs say so; SDK unverified)

const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const exchange = new ExchangeClient({ transport, wallet: account });
const info = new InfoClient({ transport });

async function main() {
  console.log(`Depositing ${USD_RAW / 1e6} USDC into HLP as ${account.address}`);
  try {
    const res = await exchange.vaultTransfer({
      vaultAddress: HLP,
      isDeposit: true,
      usd: USD_RAW,
    });
    console.log("Result:", JSON.stringify(res));
  } catch (e) {
    console.log("Failed:", e instanceof Error ? e.message : e);
  }
  const eq = await info.userVaultEquities({ user: account.address });
  console.log("Vault equities:", JSON.stringify(eq, null, 2));
}

main();