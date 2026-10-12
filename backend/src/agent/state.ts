import { promises as fs } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import { STRATEGIES, type Allocation, type Tier } from "./guardrails.js";

const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR.replace(/\/?$/, "/")
  : fileURLToPath(new URL("../../data/", import.meta.url));
const USERS_DIR = DATA_DIR + "users/";
const LEGACY_BOOK = DATA_DIR + "book.json";
const LEGACY_LOG = DATA_DIR + "decisions.json";

// The "book": the user's current split across strategies, in percent of deployable funds.
export type Book = {
  tier: Tier;
  totalUsd: number;
  allocation: Allocation;
  updatedAt: string;
};

export type ActionRecord = {
  name: string;
  args: unknown;
  result: unknown;
  simulated: boolean; // true for any mocked step
  error?: string;
};

export type Decision = {
  time: string;
  tier: Tier;
  from: Allocation;
  to: Allocation;
  approved: boolean;
  reasons: string[];
  reasoning: string;
  actions: ActionRecord[];
};

export type Profile = {
  goalName: string;
  targetUsd: number;
  goalDate: string | null; // ISO date, e.g. 2027-06-01
  tier: Tier;
  notes: string[]; // rolling memory notes (last 10)
};

// Per-user ledger for the Robinhood Chain side. Amounts are token base units as strings.
export type RhLedger = {
  synced: Record<string, string>; // token -> units already mirrored into the hub books
  rotated: Record<string, string>; // token -> units this user has rotated into USDG
};

type UserFile = {
  profile: Profile;
  book: Book;
  decisions: Decision[];
  rh?: RhLedger;
};

const EMPTY: Allocation = {
  carry: 0,
  lending: 0,
  hlp: 0,
  directional: 0,
  stocks: 0,
  robinhood: 0,
};
const ADDRESS = /^0x[0-9a-f]{40}$/;

export function isAddress(s: string) {
  return ADDRESS.test(s.toLowerCase());
}

// Which user the current cycle / request belongs to.
const userContext = new AsyncLocalStorage<string>();

export function withUser<T>(user: string, fn: () => Promise<T>): Promise<T> {
  return userContext.run(user.toLowerCase(), fn);
}

export function currentUser(): string {
  const u = (userContext.getStore() ?? process.env.WALLET_A ?? "").toLowerCase();
  if (!ADDRESS.test(u)) throw new Error("No valid user address (use withUser or set WALLET_A)");
  return u;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeUser(user: string, data: UserFile) {
  await fs.mkdir(USERS_DIR, { recursive: true });
  await fs.writeFile(USERS_DIR + user + ".json", JSON.stringify(data, null, 2));
}

async function loadUser(user: string): Promise<UserFile> {
  const existing = await readJson<UserFile | null>(USERS_DIR + user + ".json", null);
  if (existing) {
    // Files written before a strategy existed have no key for it.
    for (const s of STRATEGIES) existing.book.allocation[s] ??= 0;
    return existing;
  }

  const fresh: UserFile = {
    profile: { goalName: "My goal", targetUsd: 1000, goalDate: null, tier: "balanced", notes: [] },
    book: {
      tier: "balanced",
      totalUsd: 1000,
      allocation: { ...EMPTY },
      updatedAt: new Date().toISOString(),
    },
    decisions: [],
    rh: { synced: {}, rotated: {} },
  };

  // One-time migration of the earlier single-user files into the demo wallet's file.
  if (user === (process.env.WALLET_A ?? "").toLowerCase()) {
    fresh.book = await readJson<Book>(LEGACY_BOOK, fresh.book);
    for (const s of STRATEGIES) fresh.book.allocation[s] ??= 0;
    fresh.decisions = await readJson<Decision[]>(LEGACY_LOG, []);
    fresh.profile.tier = fresh.book.tier;
  }

  await writeUser(user, fresh);
  return fresh;
}

// ---- book ----
export async function getBook(): Promise<Book> {
  return (await loadUser(currentUser())).book;
}

export async function saveBook(book: Book) {
  const user = currentUser();
  const f = await loadUser(user);
  f.book = { ...book, updatedAt: new Date().toISOString() };
  await writeUser(user, f);
}

// ---- Robinhood ledger ----
export async function getRhLedger(): Promise<RhLedger> {
  const f = await loadUser(currentUser());
  return f.rh ?? { synced: {}, rotated: {} };
}

export async function saveRhLedger(ledger: RhLedger) {
  const user = currentUser();
  const f = await loadUser(user);
  f.rh = ledger;
  await writeUser(user, f);
}

// ---- decision log ----
export async function appendDecision(d: Decision) {
  const user = currentUser();
  const f = await loadUser(user);
  f.decisions.push(d);
  await writeUser(user, f);
}

export async function readDecisions(limit = 50): Promise<Decision[]> {
  const f = await loadUser(currentUser());
  return f.decisions.slice(-limit).reverse(); // newest first
}

// ---- profile and memory notes ----
export async function getProfile(): Promise<Profile> {
  return (await loadUser(currentUser())).profile;
}

export async function saveProfile(patch: Partial<Omit<Profile, "notes">>) {
  const user = currentUser();
  const f = await loadUser(user);
  f.profile = { ...f.profile, ...patch };
  if (patch.tier) f.book.tier = patch.tier;
  await writeUser(user, f);
  return f.profile;
}

export async function addNote(text: string) {
  const user = currentUser();
  const f = await loadUser(user);
  f.profile.notes = [...f.profile.notes, `${new Date().toISOString().slice(0, 10)}: ${text}`].slice(-10);
  await writeUser(user, f);
}