import "dotenv/config";
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Experiment: withdraw with amount "0", which Hyperliquid may treat as "everything supplied".
const wallet = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const transport = new HttpTransport({ isTestnet: process.env.HL_TESTNET === "true" });
const exchange = new ExchangeClient({ transport, wallet });

const amount = process.argv[2] ?? "0";
console.log(
  JSON.stringify(
    await exchange.borrowLend({ operation: "withdraw", token: 0, amount }),
    null,
    2,
  ),
);