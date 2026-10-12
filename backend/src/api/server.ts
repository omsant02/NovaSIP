import "dotenv/config";
import http from "node:http";
import { runAgentCycle } from "../agent/agent.js";
import {
  getBook,
  getProfile,
  isAddress,
  readDecisions,
  saveProfile,
  withUser,
} from "../agent/state.js";
import { getHubPosition } from "../chain/vault.js";

const PORT = Number(process.env.API_PORT ?? 8787);
const KEEPER_MIN = Number(process.env.KEEPER_INTERVAL_MIN ?? 60);
const DEMO_USER = (process.env.WALLET_A ?? "").toLowerCase();
const TIERS = ["conservative", "balanced", "aggressive"];

type LastRun = { time: string; summary?: string; error?: string };
const running = new Set<string>();
const lastRun = new Map<string, LastRun>();

async function cycle(user: string) {
  if (running.has(user)) return { skipped: true };
  running.add(user);
  try {
    const summary = await withUser(user, () => runAgentCycle());
    lastRun.set(user, { time: new Date().toISOString(), summary });
    return { summary };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    lastRun.set(user, { time: new Date().toISOString(), error });
    return { error };
  } finally {
    running.delete(user);
  }
}

// bigint-safe JSON
const toJson = (data: unknown) =>
  JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(toJson(body));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function getState(user: string) {
  const [book, profile, decisions] = await withUser(user, async () => [
    await getBook(),
    await getProfile(),
    await readDecisions(20),
  ] as const);
  let hub: unknown = null;
  try {
    hub = await getHubPosition(user as `0x${string}`);
  } catch (e) {
    hub = { error: e instanceof Error ? e.message : String(e) };
  }
  return {
    user,
    book,
    profile,
    hub,
    decisions,
    running: running.has(user),
    lastRun: lastRun.get(user) ?? null,
    keeperIntervalMin: KEEPER_MIN,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const user = (url.searchParams.get("user") ?? DEMO_USER).toLowerCase();
    if (path.startsWith("/api/") && !isAddress(user)) {
      return send(res, 400, { error: "invalid or missing user address" });
    }

    if (req.method === "GET" && path === "/api/state") return send(res, 200, await getState(user));

    if (req.method === "GET" && path === "/api/decisions") {
      return send(res, 200, await withUser(user, () => readDecisions(50)));
    }

    if (req.method === "GET" && path === "/api/profile") {
      return send(res, 200, await withUser(user, () => getProfile()));
    }

    if (req.method === "POST" && path === "/api/profile") {
      const body = await readBody(req);
      const patch: Record<string, unknown> = {};
      if (typeof body.goalName === "string") patch.goalName = body.goalName.trim().slice(0, 60);
      if (typeof body.targetUsd === "number" && body.targetUsd > 0) patch.targetUsd = body.targetUsd;
      if ("goalDate" in body && (body.goalDate === null || typeof body.goalDate === "string")) {
        patch.goalDate = body.goalDate;
      }
      if (TIERS.includes(body.tier)) patch.tier = body.tier;
      const profile = await withUser(user, () => saveProfile(patch as any));
      return send(res, 200, profile);
    }

    if (req.method === "POST" && path === "/api/run") return send(res, 200, await cycle(user));

    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

// Keeper: periodic review for the demo user. Set KEEPER_INTERVAL_MIN=0 to disable.
if (KEEPER_MIN > 0) {
  setInterval(() => {
    console.log("Keeper: running scheduled cycle");
    void cycle(DEMO_USER);
  }, KEEPER_MIN * 60_000);
}