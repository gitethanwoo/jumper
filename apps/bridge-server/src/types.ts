export type Authed = {
  type: "authed";
  serverVersion: string;
};

export type Paired = {
  type: "paired";
  token: string;
};

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

export type Chat = {
  id: string;
  projectId: string;
  title: string;
  sessionId: string | null;
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

export type ServerToClient =
  | Authed
  | Paired
  | ProjectsListResult
  | ProjectsCreateResult
  | ChatsListResult
  | ChatsCreateResult
  | ChatsHistoryResult
  | ClaudeEvent
  | ClaudeDone
  | ErrorMessage;

export type AuthMessage = { type: "auth"; token: string };
export type PairMessage = { type: "pair"; code: string; deviceName: string };
export type ProjectsListMessage = { type: "projects.list" };
export type ProjectsCreateMessage = { type: "projects.create"; name: string };
export type ChatsListMessage = { type: "chats.list"; projectId: string };
export type ChatsCreateMessage = {
  type: "chats.create";
  projectId: string;
  title: string;
};
export type ChatsHistoryMessage = { type: "chats.history"; chatId: string };
export type ChatsSendMessage = {
  type: "chats.send";
  chatId: string;
  text: string;
  attachments?: ChatAttachment[];
};
export type ChatsCancelMessage = { type: "chats.cancel"; chatId: string };

export type ClientToServer =
  | AuthMessage
  | PairMessage
  | ProjectsListMessage
  | ProjectsCreateMessage
  | ChatsListMessage
  | ChatsCreateMessage
  | ChatsHistoryMessage
  | ChatsSendMessage
  | ChatsCancelMessage;
