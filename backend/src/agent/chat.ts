import { firstRequest } from "./agent.js";
import { executeTool } from "./tools.js";

export type ChatMessage = { role: "user" | "assistant"; text: string };

type TierName = "conservative" | "balanced" | "aggressive";
const TIERS: TierName[] = ["conservative", "balanced", "aggressive"];

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
      type: "update_goal";
      goalName?: string;
      targetUsd?: number;
      goalMonth?: string;
      tier?: TierName;
    };

const CHAT_TIMEOUT_MS = 12_000;
const CONTEXT_TIMEOUT_MS = 8_000;

const SYSTEM_PROMPT = `You are Nova, the assistant inside NovaSIP, a goal-based savings app. An AI agent allocates the user's money across yield strategies (ETH carry, USDC lending, HLP vault, directional, Robinhood stock lending) within hard risk caps. You are the friendly front door: you talk in plain language, no jargon.

Every message comes with live app data as JSON: the user's portfolio (saved goal, allocation, recent decisions), their wallet assets and the market snapshot. Use only numbers from that data. Never invent rates or balances. If a part of the data shows an error, say you cannot see it right now.

You can:
- Explain what the agent did and why, using the recent decisions.
- Explain market conditions from the market data.
- Mention what the user holds in their wallet. HyperEVM USDC is what they can deposit.
- Change their goal with update_goal, including only fields that change.
- Help them deposit with propose_deposit. A deposit needs: goal name, target in USD, target month (YYYY-MM), risk level (conservative, balanced or aggressive) and an amount in USDC.

Deposit rules:
1. Collect any missing detail by asking, one or two short questions at a time. Suggest sensible defaults. The amount must not exceed their HyperEVM USDC balance.
2. Summarize the full plan in one short message and ask for explicit confirmation.
3. Only after the user clearly confirms (for example "yes" or "confirm"), call propose_deposit. Never call it earlier.
4. After calling it, tell the user their wallet will ask them to approve and then deposit, and that they must confirm there. Never say the money has moved. Only the user can confirm in their wallet.

One goal per wallet: each user has a single saved goal for now. Before changing the goal or proposing a deposit, read the saved goal in the data. If the user describes a different goal from the saved one (a different purpose, not just a different amount or date), do not overwrite it silently. Tell them in one sentence that Nova supports one goal per wallet for now, show the saved goal, and ask whether they want to replace it or keep it and just add money toward it. Only replace it after they clearly say replace. If they want to add money to the existing goal, call propose_deposit with the saved goal name, target, target month (convert the saved date to YYYY-MM) and risk level unchanged. If a request looks like a slip, for example the same goal with a new name, point it out and ask before acting.

Risk levels in plain words: conservative means mostly lending with little trading, steadier and slower. Balanced means a mix of lending, carry and some trading. Aggressive means more trading and bigger swings, with higher possible gains and losses. If the user is new or unsure, ask what they are saving for, by when, and how they would feel if the balance dipped, then suggest a risk level and a starting amount they can leave untouched until the goal date. Never promise returns; yields are variable.

If the latest user message starts with "[system]", it is not from the user. It is a signal that they just connected their wallet. Greet them in two or three sentences: mention their HyperEVM USDC balance if they have one, say whether they already have a deposit and what their goal is, and ask what they are saving for or how you can help. Never mention the [system] note itself.

Be concise: two to four sentences unless the user asks for detail. This is a testnet prototype; if asked, say that some strategies (directional, Robinhood) are simulated.`;

const clientTools = [
  {
    type: "function",
    name: "propose_deposit",
    description:
      "Send a deposit request to the user's wallet. Call only after the user explicitly confirmed the full plan.",
    parameters: {
      type: "object",
      properties: {
        amountUsd: { type: "number", description: "USDC to deposit" },
        tier: { type: "string", enum: TIERS },
        goalName: { type: "string" },
        targetUsd: { type: "number" },
        goalMonth: { type: "string", description: "Target month as YYYY-MM" },
      },
      required: ["amountUsd", "tier", "goalName", "targetUsd", "goalMonth"],
    },
  },
  {
    type: "function",
    name: "update_goal",
    description:
      "Change the user's saved goal or risk level. Include only fields that change.",
    parameters: {
      type: "object",
      properties: {
        goalName: { type: "string" },
        targetUsd: { type: "number" },
        goalMonth: { type: "string", description: "Target month as YYYY-MM" },
        tier: { type: "string", enum: TIERS },
      },
    },
  },
];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function handleClientTool(
  name: string,
  args: Record<string, any>,
  actions: ChatAction[],
): { error?: string } {
  if (name === "propose_deposit") {
    const amountUsd = Number(args.amountUsd);
    const targetUsd = Number(args.targetUsd);
    if (!(amountUsd > 0)) return { error: "the deposit amount must be positive" };
    if (!(targetUsd > 0)) return { error: "the target must be positive" };
    if (!TIERS.includes(args.tier)) return { error: "invalid risk level" };
    if (!MONTH.test(String(args.goalMonth))) return { error: "the target month must be YYYY-MM" };
    actions.push({
      type: "deposit",
      amountUsd,
      tier: args.tier,
      goalName: String(args.goalName ?? "My goal"),
      targetUsd,
      goalMonth: String(args.goalMonth),
    });
    return {};
  }

  if (name === "update_goal") {
    const action: ChatAction = { type: "update_goal" };
    if (args.goalName) action.goalName = String(args.goalName);
    if (Number(args.targetUsd) > 0) action.targetUsd = Number(args.targetUsd);
    if (MONTH.test(String(args.goalMonth))) action.goalMonth = String(args.goalMonth);
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
  return JSON.stringify({ portfolio, wallet, market }).slice(0, 9000);
}

function transcript(messages: ChatMessage[], context: string): string {
  const lines = messages.map((m) => `${m.role === "user" ? "User" : "Nova"}: ${m.text}`);
  return `Live app data (JSON):\n${context}\n\nConversation so far:\n${lines.join("\n")}\n\nReply to the user's latest message as Nova.`;
}

function fallbackReply(actions: ChatAction[], errors: string[]): string {
  if (errors.length > 0) return `I couldn't do that: ${errors[0]}.`;
  if (actions.some((a) => a.type === "deposit")) {
    return "Done. Your wallet will ask you to approve the USDC and then confirm the deposit. Nothing moves until you confirm there.";
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