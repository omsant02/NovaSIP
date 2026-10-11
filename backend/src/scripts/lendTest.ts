import "dotenv/config";
import { ExchangeClient, InfoClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
if (account.address.toLowerCase() !== process.env.WALLET_B!.toLowerCase()) {
  throw new Error("Signer is not wallet B");
}

const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const exchange = new ExchangeClient({ transport, wallet: account });
const info = new InfoClient({ transport });

const operation = (process.argv[2] ?? "supply") as "supply" | "withdraw";
const amount = process.argv[3] ?? "10";
const USDC_TOKEN = 0;

async function main() {
  console.log(`${operation} ${amount} USDC as ${account.address}`);
  try {
    const res = await exchange.borrowLend({ operation, token: USDC_TOKEN, amount });
    console.log("Result:", JSON.stringify(res));
  } catch (e) {
    console.log("Failed:", e instanceof Error ? e.message : e);
  }
  const state = await info.borrowLendUserState({ user: account.address });
  console.log("State:", JSON.stringify(state, null, 2));
}

main();