import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Allocation, Tier } from "./guardrails.js";

const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const BOOK_FILE = DATA_DIR + "book.json";
const LOG_FILE = DATA_DIR + "decisions.json";

// The "book": the user's current split across strategies, in percent of deployable funds.
export type Book = {
  tier: Tier;
  totalUsd: number; // deployable funds in the demo
  allocation: Allocation;
  updatedAt: string;
};

export type ActionRecord = {
  name: string;
  args: unknown;
  result: unknown;
  simulated: boolean; // true for the Robinhood leg and any other mocked step
  error?: string;
};

export type Decision = {
  time: string;
  tier: Tier;
  from: Allocation;
  to: Allocation;
  approved: boolean;
  reasons: string[]; // guardrail rejections, if any
  reasoning: string; // the agent's explanation shown on the dashboard
  actions: ActionRecord[];
};

const EMPTY: Allocation = { carry: 0, lending: 0, hlp: 0, directional: 0, robinhood: 0 };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function getBook(): Promise<Book> {
  return readJson<Book>(BOOK_FILE, {
    tier: "balanced",
    totalUsd: 1000,
    allocation: { ...EMPTY },
    updatedAt: new Date().toISOString(),
  });
}

export async function saveBook(book: Book) {
  await writeJson(BOOK_FILE, { ...book, updatedAt: new Date().toISOString() });
}

export async function appendDecision(d: Decision) {
  const all = await readJson<Decision[]>(LOG_FILE, []);
  all.push(d);
  await writeJson(LOG_FILE, all);
}

export async function readDecisions(limit = 50): Promise<Decision[]> {
  const all = await readJson<Decision[]>(LOG_FILE, []);
  return all.slice(-limit).reverse(); // newest first
}