import { runAgentCycle } from "../agent/agent.js";
import { readDecisions } from "../agent/state.js";

async function main() {
  console.log("Running one agent cycle...\n");
  const summary = await runAgentCycle();
  console.log("Agent summary:\n", summary);

  console.log("\nLatest decision:");
  console.log(JSON.stringify((await readDecisions(1))[0], null, 2));
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});