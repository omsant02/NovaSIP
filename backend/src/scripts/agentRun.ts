import { runAgentCycle } from "../agent/agent.js";
import { readDecisions, withUser } from "../agent/state.js";

const user = process.env.WALLET_A ?? "";

async function main() {
  console.log("Running one agent cycle...\n");
  const summary = await withUser(user, () => runAgentCycle());
  console.log("Agent summary:\n", summary);

  console.log("\nLatest decision:");
  const latest = await withUser(user, () => readDecisions(1));
  console.log(JSON.stringify(latest[0], null, 2));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});