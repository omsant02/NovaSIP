import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { executeTool, toolDeclarations } from "./tools.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY missing in backend/.env");

const ai = new GoogleGenAI({ apiKey });

const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "";
const MAX_TURNS = 8;

const SYSTEM_PROMPT = `You are NovaSIP's portfolio agent. You manage a user's goal-based savings plan by allocating their deployable funds across five strategies:
- carry: delta-neutral ETH carry on Hyperliquid (earns funding; compare its annualized funding to lending).
- lending: HyperCore USDC lending (variable APY, liquid).
- hlp: Hyperliquidity Provider vault (illiquid, 4-day lockup, so it can only grow, never shrink).
- directional: only when the range signal says "deep-discount" and the user's tier allows it.
- robinhood: Robinhood Chain stock-token lending (simulated, uncorrelated to crypto funding).
Anything not allocated stays as idle cash.

Each cycle:
1. Call get_portfolio, then get_market_snapshot.
2. Decide a target allocation (percent per strategy). Respect the tier caps, the per-cycle move limit, and that the total is at most 100.
3. Call propose_allocation exactly with your target and a short plain-language reasoning for the user.
4. If it is rejected, read the reasons, fix the allocation and propose again (at most 2 retries).
5. If nothing should change, propose the current allocation so the decision is logged as a hold.
Only use numbers returned by the tools. Never invent rates. On the first deployment (isInitialDeployment is true), build a diversified allocation within the caps; the per-cycle move limit does not apply to it, so do not cite it as a reason for holding cash.
When finished, reply with a two or three sentence summary for the user.`;

function isRetryable(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|500|408|timeout|ECONNRESET/i.test(
    msg,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry transient errors with exponential backoff + jitter; fall back to a second model if configured.
async function createWithRetry(params: Record<string, unknown>): Promise<any> {
  const models = [
    PRIMARY_MODEL,
    ...(FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL
      ? [FALLBACK_MODEL]
      : []),
  ];
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await (ai as any).interactions.create({ ...params, model });
      } catch (e) {
        lastError = e;
        if (!isRetryable(e)) break; // non-transient: try the next model
        await sleep(1000 * 2 ** attempt + Math.random() * 500);
      }
    }
  }
  throw lastError;
}

export async function runAgentCycle() {
  let input: unknown = "Run a review cycle for the user's portfolio now.";
  let previousId: string | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const interaction = await createWithRetry({
      input,
      tools: toolDeclarations,
      system_instruction: SYSTEM_PROMPT,
      generation_config: { temperature: 0.3 },
      ...(previousId ? { previous_interaction_id: previousId } : {}),
    });

    const results: unknown[] = [];
    for (const step of interaction.steps ?? []) {
      if (step.type === "function_call") {
        let result: unknown;
        try {
          result = await executeTool(
            step.name,
            (step.arguments ?? {}) as Record<string, unknown>,
          );
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        results.push({
          type: "function_result",
          name: step.name,
          call_id: step.id,
          result: [{ type: "text", text: JSON.stringify(result) }],
        });
      }
    }

    if (results.length === 0) return interaction.output_text as string;

    input = results;
    previousId = interaction.id;
  }
  return "Stopped: reached the maximum number of turns.";
}
