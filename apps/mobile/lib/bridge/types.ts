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

export type ClientToServer =
  | { type: 'projects.list' }
  | { type: 'projects.create'; name: string; path?: string }
  | { type: 'chats.list'; projectId?: string }
  | { type: 'chats.create'; projectId: string; title: string }
  | { type: 'chats.history'; chatId: string }
  | { type: 'chats.send'; chatId: string; text: string; attachments?: ChatAttachment[] }
  | { type: 'chats.cancel'; chatId: string };

export type ServerToClient =
  | { type: 'projects.list.result'; projects: Project[] }
  | { type: 'projects.create.result'; project: Project }
  | { type: 'chats.list.result'; chats: Chat[] }
  | { type: 'chats.create.result'; chat: Chat }
  | { type: 'chats.history.result'; chatId: string; messages: ChatMessage[]; events: unknown[] }
  | { type: 'claude.event'; chatId: string; event: unknown }
  | { type: 'claude.done'; chatId: string; exitCode: number | null; signal: string | null }
  | { type: 'error'; message: string };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};
