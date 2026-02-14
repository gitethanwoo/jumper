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

export type FolderEntry = {
  name: string;
  path: string;
};

export type ResumeFolder = {
  path: string;
  conversationCount: number;
};

export type FolderListResult = {
  requestId: string;
  path: string;
  parentPath: string | null;
  directories: FolderEntry[];
  suggestedRoots: string[];
  resumeFolders: ResumeFolder[];
};

export type RelayRole = 'bridge' | 'mobile';

export type RelayRegisteredMessage = {
  type: 'relay.registered';
  code: string;
  sessionId: string;
};

export type RelayPairedMessage = {
  type: 'relay.paired';
  sessionId: string;
  sessionToken: string;
  role: RelayRole;
};

export type RelayReconnectedMessage = {
  type: 'relay.reconnected';
  role: RelayRole;
};

export type RelayPeerConnectedMessage = {
  type: 'relay.peer_connected';
  peer: RelayRole;
};

export type RelayPeerDisconnectedMessage = {
  type: 'relay.peer_disconnected';
  peer: RelayRole;
};

export type RelayErrorMessage = {
  type: 'relay.error';
  message: string;
};

export type RelayControlMessage =
  | RelayRegisteredMessage
  | RelayPairedMessage
  | RelayReconnectedMessage
  | RelayPeerConnectedMessage
  | RelayPeerDisconnectedMessage
  | RelayErrorMessage;

export type ClientToServer =
  | { type: 'projects.list' }
  | { type: 'projects.create'; name: string; path?: string }
  | { type: 'chats.list'; projectId?: string }
  | { type: 'chats.create'; projectId: string; title: string }
  | { type: 'chats.history'; chatId: string }
  | { type: 'chats.send'; chatId: string; text: string; attachments?: ChatAttachment[] }
  | { type: 'chats.cancel'; chatId: string }
  | { type: 'upload-image'; chatId: string; fileName: string; mimeType: string; base64: string }
  | { type: 'folders.list'; requestId: string; path?: string };

export type ServerToClient =
  | { type: 'projects.list.result'; projects: Project[] }
  | { type: 'projects.create.result'; project: Project }
  | { type: 'chats.list.result'; chats: Chat[] }
  | { type: 'chats.create.result'; chat: Chat }
  | { type: 'chats.history.result'; chatId: string; messages: ChatMessage[]; events: unknown[] }
  | { type: 'claude.event'; chatId: string; event: unknown }
  | { type: 'claude.done'; chatId: string; exitCode: number | null; signal: string | null }
  | { type: 'upload-image.result'; attachment: ChatAttachment }
  | {
      type: 'folders.list.result';
      requestId: string;
      path: string;
      parentPath: string | null;
      directories: FolderEntry[];
      suggestedRoots: string[];
      resumeFolders: ResumeFolder[];
    }
  | { type: 'error'; message: string };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};
