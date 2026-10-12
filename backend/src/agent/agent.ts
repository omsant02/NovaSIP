import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { executeTool, toolDeclarations } from "./tools.js";

// Comma-separated keys. Each key should belong to its own AI Studio project (quota is per project).
const keys = (process.env.GEMINI_API_KEYS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (keys.length === 0) throw new Error("GEMINI_API_KEYS missing in backend/.env");
const clients = keys.map((apiKey) => new GoogleGenAI({ apiKey }));

const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TURNS = 8;

const SYSTEM_PROMPT = `You are NovaSIP's portfolio agent. You manage a user's goal-based savings plan by allocating their deployable funds across five strategies:
- carry: delta-neutral ETH carry on Hyperliquid (earns funding; compare its annualized funding to lending).
- lending: HyperCore USDC lending (variable APY, liquid).
- hlp: Hyperliquidity Provider vault (illiquid, 4-day lockup, so it can only grow, never shrink).
- directional: only when the range signal says "deep-discount" and the user's tier allows it.
- robinhood: Robinhood Chain stock-token lending (simulated, uncorrelated to crypto funding).
Anything not allocated stays as idle cash.
get_portfolio also returns the user's goal, your memory notes and your last decisions. Use them: work toward the goal, and do not change the allocation without a concrete reason compared with your last decision.

Each cycle:
1. Call get_portfolio, get_market_snapshot and get_wallet_assets. get_wallet_assets shows what the user holds outside the vault (USDC, stock tokens, HyperCore balances). If they hold meaningful assets that are not deposited, add one sentence to your reasoning suggesting a deposit; you cannot move their funds yourself.
2. Decide a target allocation (percent per strategy). Respect the tier caps, the per-cycle move limit, and that the total is at most 100.
3. Call propose_allocation exactly with your target and a short plain-language reasoning for the user.
4. If it is rejected, read the reasons, fix the allocation and propose again (at most 2 retries).
5. If nothing should change, propose the current allocation so the decision is logged as a hold.
Only use numbers returned by the tools. Never invent rates. On the first deployment (isInitialDeployment is true), build a diversified allocation within the caps; the per-cycle move limit does not apply to it, so do not cite it as a reason for holding cash.
When finished, reply with a two or three sentence summary for the user.`;

function isRetryable(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|500|408|timeout|ECONNRESET/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pin = { client: any; model: string };

// First request of a cycle: try every model x key until one works.
async function firstRequest(
  params: Record<string, unknown>,
): Promise<{ interaction: any; pin: Pin }> {
  const models = [PRIMARY_MODEL, ...FALLBACKS.filter((m) => m !== PRIMARY_MODEL)];
  let lastError: unknown;
  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      for (let k = 0; k < clients.length; k++) {
        try {
          const interaction = await (clients[k] as any).interactions.create({
            ...params,
            model,
          });
          return { interaction, pin: { client: clients[k], model } };
        } catch (e) {
          lastError = e;
          console.log(
            `key#${k + 1} ${model} failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`,
          );
        }
      }
    }
    await sleep(1500 + Math.random() * 500);
  }
  throw lastError;
}

// Later turns must stay on the same key and model: the conversation state lives in that project.
async function followUp(params: Record<string, unknown>, pin: Pin): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await pin.client.interactions.create({ ...params, model: pin.model });
    } catch (e) {
      lastError = e;
      if (!isRetryable(e)) break;
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
    }
  }
  throw lastError;
}

export async function runAgentCycle() {
  let input: unknown = "Run a review cycle for the user's portfolio now.";
  let previousId: string | undefined;
  let pin: Pin | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const params = {
      input,
      tools: toolDeclarations,
      system_instruction: SYSTEM_PROMPT,
      generation_config: { temperature: 0.3 },
      ...(previousId ? { previous_interaction_id: previousId } : {}),
    };

    let interaction: any;
    if (!pin) {
      const r = await firstRequest(params);
      interaction = r.interaction;
      pin = r.pin;
    } else {
      interaction = await followUp(params, pin);
    }

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