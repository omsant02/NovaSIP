import { firstRequest } from "./agent.js";
import { executeTool } from "./tools.js";
import { withStockYield } from "./morpho.js";

export type ChatMessage = { role: "user" | "assistant"; text: string };

type TierName = "conservative" | "balanced" | "aggressive";
const TIERS: TierName[] = ["conservative", "balanced", "aggressive"];

// Stock tokens that can be deposited on Robinhood Chain.
export const STOCK_SYMBOLS = ["TSLA", "AMZN", "AMD", "NFLX", "PLTR"];

export type ChatAction =
  | {
      type: "deposit";
      amountUsd: number;
      tier: TierName;
      goalName: string;
      targetUsd: number;
      goalMonth: string; // YYYY-MM
    }
  | {
      type: "deposit_stock";
      symbol: string;
      amount: number; // token units
      tier: TierName;
      goalName: string;
      targetUsd: number;
      goalMonth: string; // YYYY-MM
    }
  | {
      type: "update_goal";
      goalName?: string;
      targetUsd?: number;
      goalMonth?: string;
      tier?: TierName;
    };

const CHAT_TIMEOUT_MS = 12_000;
const CONTEXT_TIMEOUT_MS = 8_000;
const CONTEXT_MAX_CHARS = 16_000;

const SYSTEM_PROMPT = `You are Nova, the assistant inside NovaSIP, a goal-based savings app. An AI agent allocates the user's money across six yield strategies within hard risk caps. You are the friendly front door: you talk in plain language, no jargon.

The strategies, in plain words:
- On Hyperliquid, with USDC: delta-neutral carry (earns funding while staying market-neutral), USDC lending, the HLP vault (illiquid for 4 days) and directional trades.
- On Robinhood Chain, with stock tokens: holding stocks for price exposure, and rotating stock into USDG that earns Morpho lending yield while waiting for a better price. The agent only buys the stock back if it gets at least as many tokens as it sold.

Every message comes with live app data as JSON: the user's portfolio (saved goal, allocation, funds by chain, stock holdings, recent decisions), their wallet assets and the market snapshot (funding rates, lending and HLP rates, live stock quotes, stockYield). Use only numbers from that data. Never invent rates, prices or balances. If a part of the data shows an error, say you cannot see it right now.

You can:
- Explain what the agent did and why, using the recent decisions.
- Explain market conditions from the market data.
- Tell them what they hold, from the wallet data: USDC on HyperEVM (deposit it to earn crypto yield) and stock tokens on Robinhood Chain (deposit them to invest in stocks). Give stock values in dollars only when the data has a price. Do not mention HyperCore.
- Change their goal with update_goal, including only fields that change.
- Help them deposit USDC with propose_deposit, or stock tokens with propose_stock_deposit. A deposit needs: goal name, target in USD, target month (YYYY-MM), risk level (conservative, balanced or aggressive) and an amount (USDC, or the number of stock tokens plus which one).

Deposit rules:
1. Collect any missing detail by asking, one or two short questions at a time. Suggest sensible defaults. The amount must not exceed what is in their wallet.
2. Summarize the full plan in one short message and ask for explicit confirmation.
3. Only after the user clearly confirms (for example "yes" or "confirm"), call propose_deposit or propose_stock_deposit. Never call it earlier.
4. After calling it, tell the user their wallet will ask them to approve and then deposit (stock tokens use Robinhood Chain, so the wallet may ask to switch network), and that they must confirm there. Never say the money has moved. Only the user can confirm in their wallet.

One goal per wallet: each user has a single saved goal for now. Before changing the goal or proposing a deposit, read the saved goal in the data. If the user describes a different goal from the saved one (a different purpose, not just a different amount or date), do not overwrite it silently. Tell them in one sentence that Nova supports one goal per wallet for now, show the saved goal, and ask whether they want to replace it or keep it and just add money toward it. Only replace it after they clearly say replace. If they want to add money to the existing goal, call the deposit tool with the saved goal name, target, target month (convert the saved date to YYYY-MM) and risk level unchanged. If a request looks like a slip, for example the same goal with a new name, point it out and ask before acting.

Planning conversation: for a new plan, talk it through in a few short turns. Two inputs are both fine. (a) The user gives a goal amount, a date and a monthly amount: check whether that monthly amount can plausibly reach the goal at the live rates and say so honestly. (b) The user gives a goal amount, a date and how much money they can put in (or how much risk they will take): work out the monthly amount needed and propose it. Also ask how they feel about risk, and whether they prefer crypto yield, stocks or a mix. Before giving numbers, tell them you are checking the live funding rates and the stock and crypto markets (it is in the data above). Then give one concrete suggestion: what percent goes to crypto strategies and what percent to stock tokens, the monthly amount, and why. Suggest a sensible split; the agent enforces the hard risk caps, which limit stock exposure more for conservative users. When you quote the Morpho yield, use market.stockYield.supplyApyPct and say it is the live Morpho USDG vault rate on Robinhood Chain. Quote funding rates and lending rates only from the data. Never promise returns.

Risk levels in plain words: conservative means mostly lending with little trading, steadier and slower. Balanced means a mix of lending, carry and some trading. Aggressive means more trading and bigger swings, with higher possible gains and losses. If the user is new or unsure, ask what they are saving for, by when, and how they would feel if the balance dipped, then suggest a risk level and a starting amount they can leave untouched until the goal date. Never promise returns; yields are variable.

If the latest user message starts with "[system]", it is not from the user. It is a signal that they just connected their wallet. Greet them in two or three sentences: list what you can see in their wallet (USDC, and each stock token with its amount), say whether they already have a deposit and what their goal is, then ask what they want: their goal, and whether they prefer crypto yield, stocks or a mix. Never mention the [system] note itself.

If the saved goal is the default placeholder (the name "My goal" with a $1,000 target) and nothing is deposited, treat it as no goal yet and do not mention it.

Formatting: write like a good assistant in a chat app. Keep paragraphs to one or two short sentences. Whenever you list assets, balances, rates, plan steps or several numbers, use a markdown bullet list with one item per line (start each line with "- ") and put the key figure in bold, for example "- **TSLA**: 1 token, about $378". Put a blank line between a list and the text around it. For a plan, use a short numbered list. End with one short question when you need an answer. Be concise: no long paragraphs, and skip detail unless the user asks for it. This is a testnet prototype running on test tokens.`;

const goalProps = {
  tier: { type: "string", enum: TIERS },
  goalName: { type: "string" },
  targetUsd: { type: "number" },
  goalMonth: { type: "string", description: "Target month as YYYY-MM" },
};

const clientTools = [
  {
    type: "function",
    name: "propose_deposit",
    description:
      "Send a USDC deposit request to the user's wallet (Hyperliquid side). Call only after the user explicitly confirmed the full plan.",
    parameters: {
      type: "object",
      properties: {
        amountUsd: { type: "number", description: "USDC to deposit" },
        ...goalProps,
      },
      required: ["amountUsd", "tier", "goalName", "targetUsd", "goalMonth"],
    },
  },
  {
    type: "function",
    name: "propose_stock_deposit",
    description:
      "Send a stock-token deposit request to the user's wallet (Robinhood Chain). Call only after the user explicitly confirmed the full plan.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", enum: STOCK_SYMBOLS },
        amount: { type: "number", description: "Number of stock tokens to deposit" },
        ...goalProps,
      },
      required: ["symbol", "amount", "tier", "goalName", "targetUsd", "goalMonth"],
    },
  },
  {
    type: "function",
    name: "update_goal",
    description:
      "Change the user's saved goal or risk level. Include only fields that change.",
    parameters: {
      type: "object",
      properties: goalProps,
    },
  },
];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function handleClientTool(
  name: string,
  args: Record<string, any>,
  actions: ChatAction[],
): { error?: string } {
  if (name === "propose_deposit" || name === "propose_stock_deposit") {
    const targetUsd = Number(args.targetUsd);
    if (!(targetUsd > 0)) return { error: "the target must be positive" };
    if (!TIERS.includes(args.tier)) return { error: "invalid risk level" };
    if (!MONTH.test(String(args.goalMonth)))
      return { error: "the target month must be YYYY-MM" };
    const goalName = String(args.goalName ?? "My goal");
    const goalMonth = String(args.goalMonth);

    if (name === "propose_deposit") {
      const amountUsd = Number(args.amountUsd);
      if (!(amountUsd > 0)) return { error: "the deposit amount must be positive" };
      actions.push({ type: "deposit", amountUsd, tier: args.tier, goalName, targetUsd, goalMonth });
      return {};
    }

    const amount = Number(args.amount);
    const symbol = String(args.symbol ?? "").toUpperCase();
    if (!(amount > 0)) return { error: "the number of tokens must be positive" };
    if (!STOCK_SYMBOLS.includes(symbol)) return { error: "unknown stock token" };
    actions.push({ type: "deposit_stock", symbol, amount, tier: args.tier, goalName, targetUsd, goalMonth });
    return {};
  }

  if (name === "update_goal") {
    const action: ChatAction = { type: "update_goal" };
    if (args.goalName) action.goalName = String(args.goalName);
    if (Number(args.targetUsd) > 0) action.targetUsd = Number(args.targetUsd);
    if (MONTH.test(String(args.goalMonth)))
      action.goalMonth = String(args.goalMonth);
    if (TIERS.includes(args.tier)) action.tier = args.tier;
    actions.push(action);
    return {};
  }

  return { error: `unknown action ${name}` };
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// Read everything the model may need up front, so a chat message is one LLM request.
async function loadContext(): Promise<string> {
  const safe = async (name: string) => {
    try {
      return await timeout(executeTool(name, {}), CONTEXT_TIMEOUT_MS);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };
  const [portfolio, wallet, market] = await Promise.all([
    safe("get_portfolio"),
    safe("get_wallet_assets"),
    safe("get_market_snapshot"),
  ]);
  return JSON.stringify({
    portfolio,
    wallet,
    market: await withStockYield(market),
  }).slice(0, CONTEXT_MAX_CHARS);
}

function transcript(messages: ChatMessage[], context: string): string {
  const lines = messages.map(
    (m) => `${m.role === "user" ? "User" : "Nova"}: ${m.text}`,
  );
  return `Live app data (JSON):\n${context}\n\nConversation so far:\n${lines.join("\n")}\n\nReply to the user's latest message as Nova.`;
}

function fallbackReply(actions: ChatAction[], errors: string[]): string {
  if (errors.length > 0) return `I couldn't do that: ${errors[0]}.`;
  if (actions.some((a) => a.type === "deposit" || a.type === "deposit_stock")) {
    return "Done. Your wallet will ask you to approve and then confirm the deposit. Nothing moves until you confirm there.";
  }
  if (actions.length > 0) return "Got it, I've updated your goal.";
  return "Sorry, I didn't catch that. Could you say it again?";
}

export async function runChat(
  messages: ChatMessage[],
): Promise<{ reply: string; actions: ChatAction[] }> {
  const actions: ChatAction[] = [];
  const errors: string[] = [];
  const context = await loadContext();

  const { interaction } = await firstRequest(
    {
      input: transcript(messages, context),
      tools: clientTools,
      system_instruction: SYSTEM_PROMPT,
      generation_config: { temperature: 0.4 },
    },
    CHAT_TIMEOUT_MS,
  );

  for (const step of interaction.steps ?? []) {
    if (step.type !== "function_call") continue;
    const r = handleClientTool(
      step.name,
      (step.arguments ?? {}) as Record<string, any>,
      actions,
    );
    if (r.error) errors.push(r.error);
  }

  const text = ((interaction.output_text as string) ?? "").trim();
  return { reply: text || fallbackReply(actions, errors), actions };
}