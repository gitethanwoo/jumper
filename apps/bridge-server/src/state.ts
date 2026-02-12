import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Chat, Project } from "./types.js";

type TokenRecord = {
  token: string;
  deviceName: string;
  createdAt: string;
};

type PersistedState = {
  projects: Project[];
  chats: Chat[];
};

const STATE_DIR = path.join(os.homedir(), ".cc-bridge");
const TOKENS_PATH = path.join(STATE_DIR, "tokens.json");
const STATE_PATH = path.join(STATE_DIR, "state.json");

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

export async function loadTokens(): Promise<TokenRecord[]> {
  await ensureStateDir();
  if (!existsSync(TOKENS_PATH)) return [];
  const raw = await fs.readFile(TOKENS_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("tokens.json must be an array");
  return parsed as TokenRecord[];
}

export async function saveTokens(tokens: TokenRecord[]): Promise<void> {
  await ensureStateDir();
  await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2) + "\n", "utf8");
}

export async function loadState(): Promise<PersistedState> {
  await ensureStateDir();
  if (!existsSync(STATE_PATH)) return { projects: [], chats: [] };
  const raw = await fs.readFile(STATE_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("state.json must be an object");
  const o = parsed as { projects?: unknown; chats?: unknown };
  if (!Array.isArray(o.projects) || !Array.isArray(o.chats)) {
    throw new Error("state.json must have projects[] and chats[]");
  }
  return { projects: o.projects as Project[], chats: o.chats as Chat[] };
}

export async function saveState(state: PersistedState): Promise<void> {
  await ensureStateDir();
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function tokenRecord(token: string, deviceName: string): TokenRecord {
  return { token, deviceName, createdAt: nowIso() };
}
