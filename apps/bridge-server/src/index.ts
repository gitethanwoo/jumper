import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import QRCode from "qrcode";
import { WebSocketServer, type WebSocket } from "ws";

import { RelayClient } from "./relay-client.js";
import { loadRelaySession, nowIso, loadState, saveRelaySession, saveState } from "./state.js";
import type {
  ChatAttachment,
  ClientToServer,
  KeyboardConversationContext,
  KeyboardConversationEntry,
  KeyboardRespondRequest,
  KeyboardRespondSuccess,
  ServerToClient,
} from "./types.js";

type State = Awaited<ReturnType<typeof loadState>>;

const PORT = Number(process.env.PORT ?? "8787");
const HOST = process.env.HOST ?? "0.0.0.0";
const RELAY_URL = process.env.RELAY_URL;
const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT ?? path.join(os.homedir(), "dev", "jumper-projects");
const CLAUDE_HISTORY_PATH = path.join(os.homedir(), ".claude", "history.jsonl");
const CLAUDE_PROJECTS_PATH = path.join(os.homedir(), ".claude", "projects");

type ChatHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type UploadImageBody = {
  chatId: string;
  fileName: string;
  mimeType: string;
  base64: string;
};

type KeyboardRunOutcome =
  | {
      ok: true;
      reply: string;
      durationMs: number;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      durationMs: number;
    };

const KEYBOARD_TIMEOUT_MS = 20_000;
const MAX_SELECTED_TEXT_CHARS = 2_000;
const MAX_CONTEXT_SIDE_CHARS = 1_000;
const MAX_CONVERSATION_ENTRY_CHARS = 600;
const MAX_CONVERSATION_ENTRIES = 12;

function slugify(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!s) throw new Error("Invalid project name");
  return s;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function expandHomePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  if (trimmed.startsWith("~\\")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function normalizeProjectPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error("Project path cannot be empty");

  const expanded = expandHomePath(trimmed);
  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded);
  }

  // Relative paths from mobile are ambiguous; anchor them to the user's home directory.
  return path.resolve(os.homedir(), expanded);
}

async function normalizeStateProjectPaths(state: State): Promise<State> {
  const normalizedProjects = state.projects.map((project) => {
    const normalizedPath = normalizeProjectPath(project.path);
    if (normalizedPath === project.path) return project;
    return { ...project, path: normalizedPath };
  });

  const changed = normalizedProjects.some((project, index) => project !== state.projects[index]);
  if (!changed) return state;

  const next = { ...state, projects: normalizedProjects };
  await saveState(next);
  return next;
}

function extractJsonStringField(line: string, field: string): string | null {
  const match = line.match(new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`));
  const value = match?.[1];
  if (!value) return null;
  return value;
}

function extractJsonNumberField(line: string, field: string): number | null {
  const match = line.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`));
  const raw = match?.[1];
  if (!raw) return null;
  return Number(raw);
}

function parentDirectory(input: string): string | null {
  const parent = path.dirname(input);
  if (parent === input) return null;
  return parent;
}

async function recentProjectsFromClaudeHistory(limit = 300): Promise<string[]> {
  if (!existsSync(CLAUDE_HISTORY_PATH)) return [];

  const raw = await fs.readFile(CLAUDE_HISTORY_PATH, "utf8");
  const lines = raw.split("\n");
  const projects: string[] = [];
  const seen = new Set<string>();

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (projects.length >= limit) break;
    const line = lines[i]?.trim();
    if (!line) continue;
    const project = extractJsonStringField(line, "project");
    if (!project) continue;
    const normalized = normalizeProjectPath(project);
    if (!existsSync(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    projects.push(normalized);
  }
  return projects;
}

function rankWorkspaceRoots(
  projectPaths: string[]
): Array<{ path: string; count: number; firstSeenRank: number }> {
  const counts = new Map<string, { count: number; firstSeenRank: number }>();

  projectPaths.forEach((projectPath, rank) => {
    const parent = parentDirectory(projectPath);
    if (!parent) return;
    const existing = counts.get(parent);
    if (!existing) {
      counts.set(parent, { count: 1, firstSeenRank: rank });
      return;
    }
    counts.set(parent, { count: existing.count + 1, firstSeenRank: existing.firstSeenRank });
  });

  return Array.from(counts.entries())
    .map(([candidatePath, candidate]) => ({ path: candidatePath, ...candidate }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.firstSeenRank - b.firstSeenRank;
    });
}

async function mostRecentProjectFromClaudeSessions(): Promise<string | null> {
  if (!existsSync(CLAUDE_PROJECTS_PATH)) return null;

  const projectDirs = await fs.readdir(CLAUDE_PROJECTS_PATH, { withFileTypes: true });
  let latestSessionFile: string | null = null;
  let latestMtimeMs = -1;

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;
    const projectDirPath = path.join(CLAUDE_PROJECTS_PATH, projectDir.name);
    const entries = await fs.readdir(projectDirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".jsonl")) continue;
      const filePath = path.join(projectDirPath, entry.name);
      const stats = await fs.stat(filePath);
      if (stats.mtimeMs <= latestMtimeMs) continue;
      latestMtimeMs = stats.mtimeMs;
      latestSessionFile = filePath;
    }
  }

  if (!latestSessionFile) return null;
  const raw = await fs.readFile(latestSessionFile, "utf8");
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cwd = extractJsonStringField(trimmed, "cwd");
    if (!cwd) continue;
    const normalized = normalizeProjectPath(cwd);
    if (!existsSync(normalized)) continue;
    return normalized;
  }
  return null;
}

async function inferDefaultFolderBrowsePath(): Promise<string> {
  const recentHistoryProjects = await recentProjectsFromClaudeHistory();
  const rankedRoots = rankWorkspaceRoots(recentHistoryProjects);
  const likelyHistoryRoot = rankedRoots[0]?.path ?? null;
  if (likelyHistoryRoot && existsSync(likelyHistoryRoot)) return likelyHistoryRoot;

  const fromHistory = recentHistoryProjects[0];
  if (fromHistory) {
    const parent = parentDirectory(fromHistory);
    if (parent && existsSync(parent)) return parent;
    return fromHistory;
  }

  const fromSessions = await mostRecentProjectFromClaudeSessions();
  if (fromSessions) {
    const parent = parentDirectory(fromSessions);
    if (parent && existsSync(parent)) return parent;
    return fromSessions;
  }

  return os.homedir();
}

async function inferSuggestedFolderRoots(max = 3): Promise<string[]> {
  const recentHistoryProjects = await recentProjectsFromClaudeHistory();
  const rankedRoots = rankWorkspaceRoots(recentHistoryProjects).map((entry) => entry.path);
  const suggestions: string[] = [...rankedRoots];

  const mostRecentProject = recentHistoryProjects[0];
  if (mostRecentProject) {
    suggestions.push(mostRecentProject);
  }

  const fromSessions = await mostRecentProjectFromClaudeSessions();
  if (fromSessions) {
    const parent = parentDirectory(fromSessions);
    if (parent) suggestions.push(parent);
    suggestions.push(fromSessions);
  }

  suggestions.push(os.homedir());

  const unique: string[] = [];
  for (const candidate of suggestions) {
    if (!existsSync(candidate)) continue;
    if (unique.includes(candidate)) continue;
    unique.push(candidate);
    if (unique.length >= max) break;
  }
  return unique;
}

async function inferResumeFolders(max = 5): Promise<Array<{ path: string; conversationCount: number }>> {
  if (!existsSync(CLAUDE_HISTORY_PATH)) return [];

  const raw = await fs.readFile(CLAUDE_HISTORY_PATH, "utf8");
  const lines = raw.split("\n");
  const statsByPath = new Map<string, { sessions: Set<string>; lastActive: number }>();
  let scanned = 0;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (scanned >= 4_000) break;
    const line = lines[i]?.trim();
    if (!line) continue;
    scanned += 1;

    const project = extractJsonStringField(line, "project");
    const sessionId = extractJsonStringField(line, "sessionId");
    if (!project || !sessionId) continue;

    const normalizedPath = normalizeProjectPath(project);
    if (!existsSync(normalizedPath)) continue;

    const timestamp = extractJsonNumberField(line, "timestamp") ?? 0;
    const existing = statsByPath.get(normalizedPath);
    if (!existing) {
      statsByPath.set(normalizedPath, {
        sessions: new Set([sessionId]),
        lastActive: timestamp,
      });
      continue;
    }
    existing.sessions.add(sessionId);
    if (timestamp > existing.lastActive) existing.lastActive = timestamp;
  }

  return Array.from(statsByPath.entries())
    .map(([path, value]) => ({
      path,
      conversationCount: value.sessions.size,
      lastActive: value.lastActive,
    }))
    .sort((a, b) => {
      if (b.lastActive !== a.lastActive) return b.lastActive - a.lastActive;
      return b.conversationCount - a.conversationCount;
    })
    .slice(0, max)
    .map(({ path, conversationCount }) => ({ path, conversationCount }));
}

function claudeProjectDir(cwd: string): string {
  return path.join(os.homedir(), ".claude", "projects", cwd.split(path.sep).join("-"));
}

function claudeHistoryCandidates(projectPath: string): string[] {
  const trimmed = projectPath.trim();
  const expanded = expandHomePath(trimmed);
  const resolvedRaw = path.resolve(trimmed);
  const resolvedExpanded = path.resolve(expanded);
  return Array.from(new Set([trimmed, expanded, resolvedRaw, resolvedExpanded].filter((v) => v.length > 0)));
}

async function findHistoryFileBySessionId(sessionId: string): Promise<string | undefined> {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return undefined;

  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(projectsDir, entry.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function extractAssistantText(entry: unknown): string | null {
  if (!isObject(entry) || entry.type !== "assistant") return null;
  if (!isObject(entry.message)) return null;
  const content = entry.message.content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    if (block.type !== "text") continue;
    if (typeof block.text !== "string") continue;
    parts.push(block.text);
  }
  if (parts.length === 0) return null;
  return parts.join("");
}

function extractUserText(entry: unknown): string | null {
  if (!isObject(entry) || entry.type !== "user") return null;
  if (!isObject(entry.message)) return null;
  if (entry.message.role !== "user") return null;
  if (typeof entry.message.content !== "string") return null;
  return entry.message.content;
}

async function loadClaudeHistory(projectPath: string, sessionId: string): Promise<{
  messages: ChatHistoryMessage[];
  events: unknown[];
}> {
  let filePath = claudeHistoryCandidates(projectPath)
    .map((cwd) => path.join(claudeProjectDir(cwd), `${sessionId}.jsonl`))
    .find((candidate) => existsSync(candidate));
  if (!filePath) {
    filePath = await findHistoryFileBySessionId(sessionId);
  }
  if (!filePath) return { messages: [], events: [] };

  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  const messages: ChatHistoryMessage[] = [];
  const events: unknown[] = [];

  lines.forEach((line, index) => {
    const entry: unknown = JSON.parse(line);
    if (!isObject(entry)) return;

    if (
      entry.type === "assistant" ||
      entry.type === "user" ||
      entry.type === "progress" ||
      entry.type === "result"
    ) {
      events.push(entry);
    }

    const userText = extractUserText(entry);
    if (typeof userText === "string") {
      const id = typeof entry.uuid === "string" ? entry.uuid : `history-user:${index}`;
      messages.push({ id, role: "user", text: userText });
      return;
    }

    const assistantText = extractAssistantText(entry);
    if (typeof assistantText === "string") {
      const id = typeof entry.uuid === "string" ? entry.uuid : `history-assistant:${index}`;
      messages.push({ id, role: "assistant", text: assistantText });
    }
  });

  return { messages, events };
}

function send(ws: WebSocket, msg: ServerToClient): void {
  ws.send(JSON.stringify(msg));
}

function parseMessagePayload(payload: unknown): ClientToServer {
  if (!payload || typeof payload !== "object") throw new Error("Message must be an object");
  const t = (payload as { type?: unknown }).type;
  if (typeof t !== "string") throw new Error("Message missing type");
  return payload as ClientToServer;
}

function parseMessage(data: WebSocket.RawData): ClientToServer {
  const text = typeof data === "string" ? data : data.toString("utf8");
  const parsed: unknown = JSON.parse(text);
  return parseMessagePayload(parsed);
}

function jsonResponse(res: http.ServerResponse, statusCode: number, value: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text);
}

function parseUploadImageBody(payload: unknown): UploadImageBody | null {
  if (!isObject(payload)) return null;
  if (
    typeof payload.chatId !== "string" ||
    typeof payload.fileName !== "string" ||
    typeof payload.mimeType !== "string" ||
    typeof payload.base64 !== "string"
  ) {
    return null;
  }

  return {
    chatId: payload.chatId,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    base64: payload.base64,
  };
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  if (strings.length === 0) return undefined;
  return strings;
}

function optionalStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => {
    const [, v] = entry;
    return typeof v === "string";
  });
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function sanitizeConversationEntry(value: unknown): KeyboardConversationEntry | null {
  if (!isObject(value)) return null;
  if (typeof value.text !== "string") return null;

  const entry: KeyboardConversationEntry = {
    text: clampText(value.text, MAX_CONVERSATION_ENTRY_CHARS),
  };
  const senderIdentifier = optionalString(value.senderIdentifier);
  if (senderIdentifier) entry.senderIdentifier = senderIdentifier;
  const sentDate = optionalString(value.sentDate);
  if (sentDate) entry.sentDate = sentDate;
  const entryIdentifier = optionalString(value.entryIdentifier);
  if (entryIdentifier) entry.entryIdentifier = entryIdentifier;
  if (typeof value.replyThreadIdentifier === "string" || value.replyThreadIdentifier === null) {
    entry.replyThreadIdentifier = value.replyThreadIdentifier;
  }
  const primaryRecipientIdentifiers = optionalStringArray(value.primaryRecipientIdentifiers);
  if (primaryRecipientIdentifiers) entry.primaryRecipientIdentifiers = primaryRecipientIdentifiers;
  return entry;
}

function sanitizeConversationContext(value: unknown): KeyboardConversationContext | undefined {
  if (!isObject(value)) return undefined;
  const context: KeyboardConversationContext = {};

  const threadIdentifier = optionalString(value.threadIdentifier);
  if (threadIdentifier) context.threadIdentifier = threadIdentifier;

  if (Array.isArray(value.entries)) {
    const entries = value.entries
      .map((entry) => sanitizeConversationEntry(entry))
      .filter((entry): entry is KeyboardConversationEntry => entry !== null);
    if (entries.length > 0) context.entries = entries;
  }

  const selfIdentifiers = optionalStringArray(value.selfIdentifiers);
  if (selfIdentifiers) context.selfIdentifiers = selfIdentifiers;

  const responsePrimaryRecipientIdentifiers = optionalStringArray(
    value.responsePrimaryRecipientIdentifiers
  );
  if (responsePrimaryRecipientIdentifiers) {
    context.responsePrimaryRecipientIdentifiers = responsePrimaryRecipientIdentifiers;
  }

  const participantNameByIdentifier = optionalStringRecord(value.participantNameByIdentifier);
  if (participantNameByIdentifier) {
    context.participantNameByIdentifier = participantNameByIdentifier;
  }

  if (Object.keys(context).length === 0) return undefined;
  return context;
}

function sanitizeKeyboardRequest(value: unknown): KeyboardRespondRequest | null {
  if (!isObject(value)) return null;
  if (typeof value.prompt !== "string") return null;

  const request: KeyboardRespondRequest = { prompt: value.prompt };
  if (typeof value.selectedText === "string") {
    request.selectedText = clampText(value.selectedText, MAX_SELECTED_TEXT_CHARS);
  }
  if (typeof value.documentContextBeforeInput === "string") {
    request.documentContextBeforeInput = clampText(value.documentContextBeforeInput, MAX_CONTEXT_SIDE_CHARS);
  }
  if (typeof value.documentContextAfterInput === "string") {
    request.documentContextAfterInput = clampText(value.documentContextAfterInput, MAX_CONTEXT_SIDE_CHARS);
  }
  if (typeof value.documentIdentifier === "string") {
    request.documentIdentifier = value.documentIdentifier;
  }
  const conversationContext = sanitizeConversationContext(value.conversationContext);
  if (conversationContext) request.conversationContext = conversationContext;
  return request;
}

function buildKeyboardPrompt(input: KeyboardRespondRequest): string {
  const sections: string[] = [
    "You are drafting a reply on behalf of the user in another app.",
    "Return only the reply text the user can send. Do not add explanations or labels.",
  ];

  if (typeof input.selectedText === "string" && input.selectedText.trim().length > 0) {
    sections.push(`Selected text (highest priority context):\n${input.selectedText}`);
  }

  const entries = input.conversationContext?.entries?.slice(-MAX_CONVERSATION_ENTRIES) ?? [];
  if (entries.length > 0) {
    const lines = entries.map((entry, index) => {
      const sender = entry.senderIdentifier ?? "participant";
      const date = entry.sentDate ? ` (${entry.sentDate})` : "";
      return `${index + 1}. ${sender}${date}: ${entry.text}`;
    });
    sections.push(`Recent conversation entries:\n${lines.join("\n")}`);
  }

  const before = input.documentContextBeforeInput?.trim() ?? "";
  const after = input.documentContextAfterInput?.trim() ?? "";
  if (before.length > 0 || after.length > 0) {
    sections.push(
      ["Nearby text context:", `Before cursor: ${before || "(none)"}`, `After cursor: ${after || "(none)"}`].join(
        "\n"
      )
    );
  }

  if (typeof input.documentIdentifier === "string" && input.documentIdentifier.trim().length > 0) {
    sections.push(`Document identifier: ${input.documentIdentifier}`);
  }

  sections.push(`User instruction:\n${input.prompt}`);
  return sections.join("\n\n");
}

function extractClaudeTextDelta(event: unknown): string | null {
  if (!isObject(event) || event.type !== "stream_event") return null;
  if (!isObject(event.event) || event.event.type !== "content_block_delta") return null;
  if (!isObject(event.event.delta) || event.event.delta.type !== "text_delta") return null;
  if (typeof event.event.delta.text !== "string") return null;
  return event.event.delta.text;
}

function extractClaudeResultText(event: unknown): string | null {
  if (!isObject(event) || event.type !== "result") return null;
  if (typeof event.result !== "string") return null;
  return event.result;
}

function runKeyboardPrompt(prompt: string): Promise<KeyboardRunOutcome> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let timedOut = false;
    let resultText = "";
    let deltaText = "";
    let lastStderr = "";

    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        "bypassPermissions",
        "--tools",
        "default",
      ],
      {
        cwd: PROJECTS_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      }
    );

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, KEYBOARD_TIMEOUT_MS);

    const rlOut = readline.createInterface({ input: child.stdout });
    rlOut.on("line", (line) => {
      if (!line.trim()) return;
      const event: unknown = JSON.parse(line);
      const result = extractClaudeResultText(event);
      if (typeof result === "string") {
        resultText = result;
      }
      const delta = extractClaudeTextDelta(event);
      if (typeof delta === "string") {
        deltaText += delta;
      }
    });

    const rlErr = readline.createInterface({ input: child.stderr });
    rlErr.on("line", (line) => {
      if (!line.trim()) return;
      lastStderr = line;
    });

    child.on("exit", (exitCode, signal) => {
      clearTimeout(timeout);
      rlOut.close();
      rlErr.close();
      const durationMs = Date.now() - startedAt;

      if (timedOut) {
        resolve({
          ok: false,
          statusCode: 502,
          error: `Claude timed out after ${KEYBOARD_TIMEOUT_MS / 1000}s`,
          durationMs,
        });
        return;
      }
      if (signal) {
        resolve({
          ok: false,
          statusCode: 502,
          error: `Claude exited with signal ${signal}`,
          durationMs,
        });
        return;
      }
      if (exitCode !== 0) {
        resolve({
          ok: false,
          statusCode: 502,
          error: lastStderr || `Claude exited with code ${String(exitCode)}`,
          durationMs,
        });
        return;
      }

      const reply = (resultText.trim().length > 0 ? resultText : deltaText).trim();
      if (reply.length === 0) {
        resolve({
          ok: false,
          statusCode: 502,
          error: "Claude returned an empty reply",
          durationMs,
        });
        return;
      }
      resolve({ ok: true, reply, durationMs });
    });
  });
}

function fileExtension(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) return ext;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/heic") return ".heic";
  return ".jpg";
}

async function uploadImage(state: State, body: UploadImageBody): Promise<ChatAttachment> {
  const chat = state.chats.find((entry) => entry.id === body.chatId);
  if (!chat) {
    throw new Error("Unknown chat");
  }

  const project = state.projects.find((entry) => entry.id === chat.projectId);
  if (!project) {
    throw new Error("Unknown project");
  }

  const projectPath = normalizeProjectPath(project.path);
  const relativeDirFs = path.join(".claude", "tmp", chat.id);
  const relativeDir = relativeDirFs.split(path.sep).join("/");
  const id = crypto.randomUUID();
  const ext = fileExtension(body.fileName, body.mimeType);
  const storedFileName = `${id}${ext}`;
  const relativePath = `${relativeDir}/${storedFileName}`;
  const absoluteDir = path.join(projectPath, relativeDirFs);
  const absolutePath = path.join(projectPath, relativePath);
  const bytes = Buffer.from(body.base64, "base64");
  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(absolutePath, bytes);

  return {
    id,
    name: body.fileName,
    mimeType: body.mimeType,
    relativePath,
    sizeBytes: bytes.byteLength,
  };
}

function buildClaudePrompt(text: string, attachments: ChatAttachment[], projectPath: string): string {
  if (attachments.length === 0) return text;

  const attachmentLines = attachments.map(
    (attachment, index) =>
      `${index + 1}. ${path.join(projectPath, attachment.relativePath)} (${attachment.mimeType})`
  );
  const textPart = text.trim().length > 0 ? text : "Please analyze the attached image.";
  return `${textPart}\n\nAttached files:\n${attachmentLines.join("\n")}`;
}

function wsUrlForHost(hostWithPort: string, secure: boolean): string {
  return `${secure ? "wss" : "ws"}://${hostWithPort}/ws`;
}

function connectLinkForServer(serverUrl: string): string {
  return `jumper://connect?server=${encodeURIComponent(serverUrl)}`;
}

function connectPageUrlForServer(hostWithPort: string, secure: boolean): string {
  return `${secure ? "https" : "http"}://${hostWithPort}/connect`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function main() {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });

  const suggestedHost = process.env.PUBLIC_HOST ?? `${os.hostname()}:${PORT}`;
  const suggestedWs = wsUrlForHost(suggestedHost, false);
  const suggestedConnectPage = connectPageUrlForServer(suggestedHost, false);
  const suggestedDeepLink = connectLinkForServer(suggestedWs);
  const startupQr = await QRCode.toString(suggestedDeepLink, {
    type: "terminal",
    small: true,
  });

  const active = new Map<string, ReturnType<typeof spawn>>();

  let state: State = await loadState();
  state = await normalizeStateProjectPaths(state);
  let defaultFolderBrowsePath: string | null = null;
  let suggestedFolderRoots: string[] | null = null;
  let resumeFolders: Array<{ path: string; conversationCount: number }> | null = null;

  const handleClientMessage = async (
    msg: ClientToServer,
    reply: (message: ServerToClient) => void
  ): Promise<void> => {
    if (msg.type === "projects.list") {
      reply({ type: "projects.list.result", projects: state.projects });
      return;
    }

    if (msg.type === "projects.create") {
      const projectPath = msg.path
        ? normalizeProjectPath(msg.path)
        : path.resolve(path.join(PROJECTS_ROOT, slugify(msg.name)));
      await fs.mkdir(projectPath, { recursive: true });

      const project = { id: crypto.randomUUID(), name: msg.name, path: projectPath, createdAt: nowIso() };
      state = { ...state, projects: [...state.projects, project] };
      await saveState(state);

      reply({ type: "projects.create.result", project });
      return;
    }

    if (msg.type === "chats.list") {
      const chats = msg.projectId ? state.chats.filter((c) => c.projectId === msg.projectId) : state.chats;
      reply({ type: "chats.list.result", chats });
      return;
    }

    if (msg.type === "chats.create") {
      const project = state.projects.find((p) => p.id === msg.projectId);
      if (!project) throw new Error("Unknown project");

      const chat = {
        id: crypto.randomUUID(),
        projectId: msg.projectId,
        title: msg.title,
        sessionId: null,
        createdAt: nowIso(),
      };
      state = { ...state, chats: [...state.chats, chat] };
      await saveState(state);

      reply({ type: "chats.create.result", chat });
      return;
    }

    if (msg.type === "chats.history") {
      const chat = state.chats.find((c) => c.id === msg.chatId);
      if (!chat) throw new Error("Unknown chat");

      if (!chat.sessionId) {
        reply({ type: "chats.history.result", chatId: chat.id, messages: [], events: [] });
        return;
      }

      const project = state.projects.find((p) => p.id === chat.projectId);
      if (!project) throw new Error("Unknown project");

      const projectPath = normalizeProjectPath(project.path);
      const history = await loadClaudeHistory(projectPath, chat.sessionId);
      reply({
        type: "chats.history.result",
        chatId: chat.id,
        messages: history.messages,
        events: history.events,
      });
      return;
    }

    if (msg.type === "chats.cancel") {
      const child = active.get(msg.chatId);
      if (child) child.kill("SIGINT");
      return;
    }

    if (msg.type === "upload-image") {
      const attachment = await uploadImage(state, msg);
      reply({ type: "upload-image.result", attachment });
      return;
    }

    if (msg.type === "folders.list") {
      if (!suggestedFolderRoots) {
        suggestedFolderRoots = await inferSuggestedFolderRoots(3);
      }
      if (!resumeFolders) {
        resumeFolders = await inferResumeFolders(5);
      }
      if (!defaultFolderBrowsePath) {
        defaultFolderBrowsePath = suggestedFolderRoots[0] ?? (await inferDefaultFolderBrowsePath());
      }

      let requestedPath: string;
      if (typeof msg.path === "string" && msg.path.trim().length > 0) {
        requestedPath = msg.path;
      } else {
        requestedPath = defaultFolderBrowsePath;
      }
      const folderPath = normalizeProjectPath(requestedPath);
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: path.join(folderPath, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const parentPath = path.dirname(folderPath);

      reply({
        type: "folders.list.result",
        requestId: msg.requestId,
        path: folderPath,
        parentPath: parentPath === folderPath ? null : parentPath,
        directories,
        suggestedRoots: suggestedFolderRoots,
        resumeFolders,
      });
      return;
    }

    if (msg.type === "chats.send") {
      const chat = state.chats.find((c) => c.id === msg.chatId);
      if (!chat) throw new Error("Unknown chat");

      if (active.has(chat.id)) throw new Error("Chat is busy");

      const project = state.projects.find((p) => p.id === chat.projectId);
      if (!project) throw new Error("Unknown project");
      const projectPath = normalizeProjectPath(project.path);
      const prompt = buildClaudePrompt(msg.text, msg.attachments ?? [], projectPath);

      const args: string[] = [];
      if (chat.sessionId) args.push("-r", chat.sessionId);
      args.push(
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        "bypassPermissions",
        "--tools",
        "default",
      );

      const child = spawn("claude", args, {
        cwd: projectPath,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
      active.set(chat.id, child);

      const onLine = async (line: string) => {
        if (!line.trim()) return;
        const event: unknown = JSON.parse(line);
        reply({ type: "claude.event", chatId: chat.id, event });

        const maybe = event as { type?: unknown; subtype?: unknown; session_id?: unknown };
        if (maybe.type === "system" && maybe.subtype === "init" && typeof maybe.session_id === "string") {
          const idx = state.chats.findIndex((c) => c.id === chat.id);
          if (idx === -1) return;
          const existing = state.chats[idx];
          if (!existing) return;
          const updated = { ...existing, sessionId: maybe.session_id };
          state = {
            ...state,
            chats: [...state.chats.slice(0, idx), updated, ...state.chats.slice(idx + 1)],
          };
          await saveState(state);
        }
      };

      const rlOut = readline.createInterface({ input: child.stdout });
      rlOut.on("line", (line) => void onLine(line));

      const rlErr = readline.createInterface({ input: child.stderr });
      rlErr.on("line", (line) => reply({ type: "claude.event", chatId: chat.id, event: { type: "stderr", line } }));

      child.on("exit", (exitCode, signal) => {
        active.delete(chat.id);
        rlOut.close();
        rlErr.close();
        reply({ type: "claude.done", chatId: chat.id, exitCode, signal });
      });

      return;
    }

    const unreachable: never = msg;
    throw new Error(`Unhandled message: ${(unreachable as { type: string }).type}`);
  };

  const httpServer = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const protoHeader = req.headers["x-forwarded-proto"];
    const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
    const secure = proto === "https";
    const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host ?? `localhost:${PORT}`;
    const hostWithPort =
      (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) ?? `localhost:${PORT}`;

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      jsonResponse(res, 200, { ok: true, serverVersion: "0.1.0" });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/connect") {
      const explicitServer = requestUrl.searchParams.get("server");
      const serverUrl = explicitServer ?? wsUrlForHost(hostWithPort, secure);
      const deepLink = connectLinkForServer(serverUrl);
      const qrCodeImage = await QRCode.toDataURL(deepLink, {
        width: 320,
        margin: 1,
      });
      const manualConnectPage = connectPageUrlForServer(hostWithPort, secure);

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect to Jumper</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at 10% 20%, #fff7ed, #f5f5f4 45%, #e7e5e4);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1c1917;
      }
      .card {
        width: min(680px, calc(100vw - 32px));
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 20px;
        padding: 22px;
        box-sizing: border-box;
        box-shadow: 0 16px 50px rgba(0, 0, 0, 0.08);
      }
      h1 {
        margin: 0 0 6px;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: #57534e;
        line-height: 1.45;
      }
      .layout {
        display: grid;
        gap: 20px;
        margin-top: 18px;
      }
      @media (min-width: 680px) {
        .layout {
          grid-template-columns: 320px 1fr;
          align-items: center;
        }
      }
      .qr {
        width: 100%;
        max-width: 320px;
        justify-self: center;
        border-radius: 16px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: #fff;
      }
      .steps {
        display: grid;
        gap: 10px;
      }
      .step {
        display: grid;
        grid-template-columns: 24px 1fr;
        gap: 10px;
        align-items: start;
      }
      .num {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: #b45309;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        display: grid;
        place-items: center;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f5f5f4;
        border: 1px solid rgba(0, 0, 0, 0.08);
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.35;
        word-break: break-all;
      }
      .buttons {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      button,
      a.button {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        background: #1c1917;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
      }
      a.secondary {
        background: #e7e5e4;
        color: #292524;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Connect to Jumper</h1>
      <p>Start jumping with one scan. The app saves your server URL and reconnects automatically.</p>

      <div class="layout">
        <img class="qr" src="${qrCodeImage}" alt="QR code to connect mobile app" />
        <div class="steps">
          <div class="step">
            <div class="num">1</div>
            <p>Open your iPhone camera and scan this QR code.</p>
          </div>
          <div class="step">
            <div class="num">2</div>
            <p>Tap the banner to open the Jumper app.</p>
          </div>
          <div class="step">
            <div class="num">3</div>
            <p>It stores the bridge server URL and reconnects automatically.</p>
          </div>

          <div class="mono" id="server-url">${escapeHtml(serverUrl)}</div>
          <div class="buttons">
            <button id="copy-server">Copy Server URL</button>
            <a class="button secondary" href="${escapeHtml(deepLink)}">Open Link</a>
            <a class="button secondary" href="${escapeHtml(manualConnectPage)}">Refresh</a>
          </div>
        </div>
      </div>
    </div>
    <script>
      const button = document.getElementById("copy-server");
      const value = document.getElementById("server-url")?.textContent || "";
      button?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy Server URL";
        }, 1200);
      });
    </script>
  </body>
</html>`);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/upload-image") {
      const payload = await readJsonBody(req);
      const body = parseUploadImageBody(payload);
      if (!body) {
        jsonResponse(res, 400, { error: "Invalid upload-image payload" });
        return;
      }

      const chat = state.chats.find((entry) => entry.id === body.chatId);
      if (!chat) {
        jsonResponse(res, 404, { error: "Unknown chat" });
        return;
      }
      const project = state.projects.find((entry) => entry.id === chat.projectId);
      if (!project) {
        jsonResponse(res, 404, { error: "Unknown project" });
        return;
      }

      const attachment = await uploadImage(state, body);
      jsonResponse(res, 200, { attachment });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/keyboard/respond") {
      const payload = await readJsonBody(req);
      const body = sanitizeKeyboardRequest(payload);
      if (!body) {
        jsonResponse(res, 400, { error: "Invalid keyboard payload" });
        return;
      }
      if (body.prompt.trim().length === 0) {
        jsonResponse(res, 400, { error: "prompt is required" });
        return;
      }

      const synthesizedPrompt = buildKeyboardPrompt(body);
      const outcome = await runKeyboardPrompt(synthesizedPrompt);
      if (!outcome.ok) {
        jsonResponse(res, outcome.statusCode, { error: outcome.error });
        return;
      }
      const response: KeyboardRespondSuccess = {
        reply: outcome.reply,
        durationMs: outcome.durationMs,
      };
      jsonResponse(res, 200, response);
      return;
    }

    res.writeHead(200, { "content-type": "text/plain" });
    res.end("jumper\n");
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    ws.on("message", async (data) => {
      const msg = parseMessage(data);
      await handleClientMessage(msg, (message) => send(ws, message));
    });
  });

  if (RELAY_URL) {
    const relaySession = await loadRelaySession();
    const relayClient = new RelayClient({
      relayUrl: RELAY_URL,
      session: relaySession,
      onPairingCode: (message) => {
        console.log(`Pairing code: ${message.code}`);
      },
      onPaired: async (session) => {
        await saveRelaySession(session);
      },
      onPayload: async (payload) => {
        const msg = parseMessagePayload(payload);
        await handleClientMessage(msg, (message) => relayClient.send(JSON.stringify(message)));
      },
      onControlMessage: (message) => {
        if (message.type === "relay.error") {
          console.error(`Relay error: ${message.message}`);
        }
      },
    });
    relayClient.connect();
  }

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, HOST, () => resolve());
  });
  console.log("Bridge started.\n");
  console.log(startupQr);
}

void main();
