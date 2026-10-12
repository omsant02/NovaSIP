import "dotenv/config";
import http from "node:http";
import { runAgentCycle } from "../agent/agent.js";
import { getBook, readDecisions } from "../agent/state.js";
import { getHubPosition } from "../chain/vault.js";

const PORT = Number(process.env.API_PORT ?? 8787);
const KEEPER_MIN = Number(process.env.KEEPER_INTERVAL_MIN ?? 60);
const DEMO_USER = process.env.WALLET_A as `0x${string}`;

let running = false;
let lastRun: { time: string; summary?: string; error?: string } | null = null;

async function cycle() {
  if (running) return { skipped: true };
  running = true;
  try {
    const summary = await runAgentCycle();
    lastRun = { time: new Date().toISOString(), summary };
    return { summary };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    lastRun = { time: new Date().toISOString(), error };
    return { error };
  } finally {
    running = false;
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

async function getState() {
  const book = await getBook();
  const decisions = await readDecisions(20);
  let hub: unknown = null;
  try {
    hub = await getHubPosition(DEMO_USER);
  } catch (e) {
    hub = { error: e instanceof Error ? e.message : String(e) };
  }
  return { book, hub, decisions, running, lastRun, keeperIntervalMin: KEEPER_MIN };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const path = (req.url ?? "").split("?")[0];

    if (req.method === "GET" && path === "/api/state") return send(res, 200, await getState());
    if (req.method === "GET" && path === "/api/decisions")
      return send(res, 200, await readDecisions(50));
    if (req.method === "POST" && path === "/api/run") return send(res, 200, await cycle());

    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

// Keeper: periodic review
setInterval(() => {
  console.log("Keeper: running scheduled cycle");
  void cycle();
}, KEEPER_MIN * 60_000);