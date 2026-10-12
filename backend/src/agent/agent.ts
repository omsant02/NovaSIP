import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { executeTool, toolDeclarations } from "./tools.js";
import { withStockYield } from "./morpho.js";

// Comma-separated keys. Each key should belong to its own AI Studio project (quota is per project).
const keys = (process.env.GEMINI_API_KEYS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (keys.length === 0)
  throw new Error("GEMINI_API_KEYS missing in backend/.env");
const clients = keys.map((apiKey) => new GoogleGenAI({ apiKey }));

const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TURNS = 8;
const REQUEST_TIMEOUT_MS = 25_000;
const SHORT_COOLDOWN_MS = 60_000;
const LONG_COOLDOWN_MS = 10 * 60_000;

const SYSTEM_PROMPT = `You are NovaSIP's portfolio agent. You manage a user's goal-based savings plan by allocating their deposited funds across six strategies on two chains.

Hyperliquid (funds the user deposited as USDC):
- carry: delta-neutral carry on Hyperliquid; earns funding. Compare its annualized funding with lending.
- lending: USDC lending on Hyperliquid (portfolio margin); variable APY, liquid.
- hlp: Hyperliquidity Provider vault; illiquid, 4-day lockup, so it can only grow, never shrink.
- directional: only when the range signal says "deep-discount" and the user's tier allows it.

Robinhood Chain (funds the user deposited as stock tokens such as TSLA, AMZN, AMD, NFLX, PLTR):
- stocks: stock tokens held for price exposure over the long term.
- robinhood: stock sold into USDG and lent on Morpho while waiting for a better entry. Its yield is stockYield.supplyApyPct from get_market_snapshot (the real Morpho USDG vault rate). The vault buys the stock back only if it gets at least as many tokens as it sold; if the price stays above the sale price the funds keep earning the Morpho rate in USDG.
You decide this stock by stock with the rotate map in propose_allocation: for every stock the user holds, the percent (0 to 100) of that holding that should sit in USDG. Use each stock's rangePct from get_market_snapshot (0 = 52-week low, 100 = 52-week high), plus changePct, and cite the numbers:
- rangePct of 80 or more (near the high): rotate 100, sell it into USDG.
- rangePct from 65 to 80 (upper consolidation): rotate about 50.
- rangePct from 30 to 65 (consolidation): hold, rotate 0.
- rangePct below 30 (near the low): hold, rotate 0; if part of it is currently in USDG, set it back to 0 so it is bought back.
Prefer long-term holding and do not change a stock's rotation for small moves. Always include every stock the user holds in rotate. get_portfolio shows how much of each is already in USDG (rotatedPct).

Hyperliquid strategies can only use funds on Hyperliquid and Robinhood strategies can only use stock tokens on Robinhood Chain. get_portfolio returns fundsByChain with each share; if a chain has no funds, give its strategies 0 and skip rotate. Anything not allocated stays as idle cash.
get_portfolio also returns the user's goal, your memory notes and your last decisions. Use them: work toward the goal, and do not change the allocation without a concrete reason compared with your last decision.

Each cycle:
1. Call get_portfolio, get_market_snapshot and get_wallet_assets. get_wallet_assets shows what the user holds outside the vaults (USDC and stock tokens). If they hold meaningful assets that are not deposited, add one sentence to your reasoning suggesting a deposit; you cannot move their funds yourself.
2. Decide the Hyperliquid percentages and the rotate map. Respect the tier caps, the per-cycle move limit, the funds on each chain, and that the total is at most 100.
3. Call propose_allocation exactly with your target, the rotate map and a short plain-language reasoning for the user that names each stock's decision.
4. If it is rejected, read the reasons, fix the allocation and propose again (at most 2 retries).
5. If nothing should change, propose the current allocation so the decision is logged as a hold.
Only use numbers returned by the tools. Never invent rates or prices. On the first deployment (isInitialDeployment is true), build a diversified allocation within the caps; the per-cycle move limit does not apply to it, so do not cite it as a reason for holding cash.
When finished, reply with a two or three sentence summary for the user.`;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function isRetryable(e: unknown) {
  return /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|500|408|timeout|timed out|ECONNRESET|unusable|fetch failed/i.test(
    errMsg(e),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reject if a request takes longer than ms, so a hung call cannot freeze a cycle.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`request timed out after ${ms / 1000}s`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Failover memory: key x model pairs that just failed are skipped until their cooldown ends.
const cooldownUntil = new Map<string, number>();
const pairId = (k: number, model: string) => `${k}:${model}`;
const onCooldown = (k: number, model: string) =>
  (cooldownUntil.get(pairId(k, model)) ?? 0) > Date.now();
function markFailed(k: number, model: string, e: unknown) {
  const ms = isRetryable(e) ? SHORT_COOLDOWN_MS : LONG_COOLDOWN_MS;
  cooldownUntil.set(pairId(k, model), Date.now() + ms);
}

export type Pin = { client: any; model: string; k: number };

const HEDGE_MS = 4_000;
let lastGood: string | null = null; // the key x model pair that last answered

// First request of a cycle. Starts with the pair that last worked; if it has not
// answered within HEDGE_MS, the next pair is started in parallel and the first
// answer wins. Slow or failing pairs go on cooldown.
export async function firstRequest(
  params: Record<string, unknown>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<{ interaction: any; pin: Pin }> {
  const models = [
    PRIMARY_MODEL,
    ...FALLBACKS.filter((m) => m !== PRIMARY_MODEL),
  ];
  const all: Array<[number, string]> = [];
  for (const model of models)
    for (let k = 0; k < clients.length; k++) all.push([k, model]);

  let pairs = all.filter(([k, m]) => !onCooldown(k, m));
  if (pairs.length === 0) pairs = all; // everything cooling down: try anyway
  pairs.sort(
    (a, b) =>
      Number(pairId(b[0], b[1]) === lastGood) -
      Number(pairId(a[0], a[1]) === lastGood),
  );

  return new Promise((resolve, reject) => {
    let started = 0;
    let failed = 0;
    let done = false;
    let lastError: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const startNext = () => {
      if (done || started >= pairs.length) return;
      clearTimeout(timer);
      const [k, model] = pairs[started++];
      const t0 = Date.now();
      withTimeout(
        (clients[k] as any).interactions.create({ ...params, model }),
        timeoutMs,
      )
        .then((interaction) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          lastGood = pairId(k, model);
          console.log(`key#${k + 1} ${model} ok in ${Date.now() - t0}ms`);
          resolve({ interaction, pin: { client: clients[k], model, k } });
        })
        .catch((e) => {
          lastError = e;
          markFailed(k, model, e);
          console.log(
            `key#${k + 1} ${model} failed: ${errMsg(e).slice(0, 100)}`,
          );
          failed++;
          if (done) return;
          if (failed >= pairs.length) {
            done = true;
            clearTimeout(timer);
            reject(lastError);
          } else {
            startNext();
          }
        });
      timer = setTimeout(startNext, HEDGE_MS);
    };
    startNext();
  });
}

// Later turns must stay on the same key and model: the conversation state lives in that project.
export async function followUp(
  params: Record<string, unknown>,
  pin: Pin,
): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await withTimeout(
        pin.client.interactions.create({ ...params, model: pin.model }),
        REQUEST_TIMEOUT_MS,
      );
    } catch (e) {
      lastError = e;
      console.log(
        `follow-up key#${pin.k + 1} ${pin.model} attempt ${attempt + 1} failed: ${errMsg(e).slice(0, 100)}`,
      );
      if (!isRetryable(e)) break;
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
    }
  }
  markFailed(pin.k, pin.model, lastError);
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
          if (step.name === "get_market_snapshot")
            result = await withStockYield(result);
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