export type ErrorMessage = {
  type: "error";
  message: string;
};

export type Project = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

export type AgentProvider = "claude" | "codex";

export type AgentSessions = Partial<Record<AgentProvider, string>>;

export type Chat = {
  id: string;
  projectId: string;
  title: string;
  sessionId?: string | null;
  activeAgent: AgentProvider;
  agentSessions: AgentSessions;
  createdAt: string;
};

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  relativePath: string;
  sizeBytes: number;
};

export type KeyboardConversationEntry = {
  text: string;
  senderIdentifier?: string;
  sentDate?: string;
  entryIdentifier?: string;
  replyThreadIdentifier?: string | null;
  primaryRecipientIdentifiers?: string[];
};

export type KeyboardConversationContext = {
  threadIdentifier?: string;
  entries?: KeyboardConversationEntry[];
  selfIdentifiers?: string[];
  responsePrimaryRecipientIdentifiers?: string[];
  participantNameByIdentifier?: Record<string, string>;
};

export type KeyboardRespondRequest = {
  prompt: string;
  selectedText?: string | null;
  documentContextBeforeInput?: string | null;
  documentContextAfterInput?: string | null;
  documentIdentifier?: string | null;
  conversationContext?: KeyboardConversationContext | null;
};

export type KeyboardRespondSuccess = {
  reply: string;
  durationMs: number;
};

export type KeyboardRespondError = {
  error: string;
};

export type ProjectsListResult = {
  type: "projects.list.result";
  projects: Project[];
};

export type ProjectsCreateResult = {
  type: "projects.create.result";
  project: Project;
};

export type ChatsListResult = {
  type: "chats.list.result";
  chats: Chat[];
};

export type ChatsCreateResult = {
  type: "chats.create.result";
  chat: Chat;
};

export type ChatHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ChatsHistoryResult = {
  type: "chats.history.result";
  chatId: string;
  messages: ChatHistoryMessage[];
  events: unknown[];
};

export type ChatsStatusResult = {
  type: "chats.status.result";
  chatId: string;
  responding: boolean;
};

export type AgentTokenStats = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  reasoningOutputTokens: number;
};

export type AgentRateLimit = {
  label: string;
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number | null;
};

export type AgentInfo = {
  sessionId: string | null;
  model: string | null;
  cliVersion: string | null;
  contextWindow: number | null;
  costUsd: number | null;
  tokens: AgentTokenStats;
  rateLimits: AgentRateLimit[];
};

export type GitInfo = {
  branch: string | null;
  isWorktree: boolean;
  worktreePath: string | null;
  mainRepoPath: string | null;
  dirtyCount: number;
};

export type ChatInfo = {
  chatId: string;
  cwd: string;
  git: GitInfo | null;
  agents: Partial<Record<AgentProvider, AgentInfo>>;
};

export type ChatsInfoResult = {
  type: "chats.info.result";
  info: ChatInfo;
};

export type ClaudeEvent = {
  type: "claude.event";
  chatId: string;
  event: unknown;
};

export type ClaudeDone = {
  type: "claude.done";
  chatId: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export type ChatsCancelResult = {
  type: "chats.cancel.result";
  chatId: string;
  accepted: boolean;
};

export type UploadImageResult = {
  type: "upload-image.result";
  attachment: ChatAttachment;
};

export type FolderEntry = {
  name: string;
  path: string;
};

export type ResumeFolder = {
  path: string;
  conversationCount: number;
};

export type FoldersListResult = {
  type: "folders.list.result";
  requestId: string;
  path: string;
  parentPath: string | null;
  directories: FolderEntry[];
  suggestedRoots: string[];
  resumeFolders: ResumeFolder[];
};

export type ServerToClient =
  | ProjectsListResult
  | ProjectsCreateResult
  | ChatsListResult
  | ChatsCreateResult
  | ChatsHistoryResult
  | ChatsStatusResult
  | ChatsInfoResult
  | ClaudeEvent
  | ClaudeDone
  | ChatsCancelResult
  | UploadImageResult
  | FoldersListResult
  | ErrorMessage;

export type ProjectsListMessage = { type: "projects.list" };
export type ProjectsCreateMessage = { type: "projects.create"; name: string; path?: string };
export type ChatsListMessage = { type: "chats.list"; projectId?: string };
export type ChatsCreateMessage = {
  type: "chats.create";
  projectId: string;
  title: string;
  agent?: AgentProvider;
};
export type ChatsHistoryMessage = { type: "chats.history"; chatId: string };
export type ChatsStatusMessage = { type: "chats.status"; chatId: string };
export type ChatsInfoMessage = { type: "chats.info"; chatId: string };
export type ChatsSendMessage = {
  type: "chats.send";
  chatId: string;
  text: string;
  attachments?: ChatAttachment[];
  agent?: AgentProvider;
  mode?: "normal" | "consult";
};
export type ChatsCancelMessage = { type: "chats.cancel"; chatId: string };
export type UploadImageMessage = {
  type: "upload-image";
  chatId: string;
  fileName: string;
  mimeType: string;
  base64: string;
};
export type FoldersListMessage = {
  type: "folders.list";
  requestId: string;
  path?: string;
};

export type ClientToServer =
  | ProjectsListMessage
  | ProjectsCreateMessage
  | ChatsListMessage
  | ChatsCreateMessage
  | ChatsHistoryMessage
  | ChatsStatusMessage
  | ChatsInfoMessage
  | ChatsSendMessage
  | ChatsCancelMessage
  | UploadImageMessage
  | FoldersListMessage;
