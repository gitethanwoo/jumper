import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import type {
  AgentProvider,
  Chat,
  ChatAttachment,
  ChatInfo,
  FolderListResult,
  ChatMessage,
  ClientToServer,
  Project,
  RelayControlMessage,
  ServerToClient,
} from './types';
import * as RelayStore from './relay-storage';
import * as Store from './storage';
import { hapticAction, hapticSuccess, hapticTap, hapticWarning } from '@/lib/haptics';

type Status = 'disconnected' | 'connecting' | 'connected';
type ConnectionMode = 'direct' | 'relay';

type BridgeState = {
  status: Status;
  connectionMode: ConnectionMode;
  peerConnected: boolean;
  serverUrl: string;

  projects: Project[];
  allChats: Chat[];

  activeChatId: string | null;

  messagesByChatId: Record<string, ChatMessage[]>;
  eventsByChatId: Record<string, unknown[]>;
  isRespondingByChatId: Record<string, boolean>;
  isStoppingByChatId: Record<string, boolean>;
  infoByChatId: Record<string, ChatInfo>;
  activeAgent: AgentProvider;

  setServerUrl: (url: string) => Promise<void>;
  connectDirect: (url?: string) => Promise<void>;
  handleConnectLink: (url: string) => Promise<boolean>;
  pairWithCode: (code: string) => Promise<void>;
  disconnectRelay: () => Promise<void>;

  selectChat: (chatId: string) => void;
  deselectChat: () => void;
  startConversation: (folderPath: string, agent?: AgentProvider) => void;
  listFolders: (path?: string) => Promise<FolderListResult>;

  uploadImageForActiveChat: (input: {
    uri: string;
    fileName: string;
    mimeType: string;
  }) => Promise<ChatAttachment>;
  sendToActiveChat: (text: string, attachments?: ChatAttachment[]) => void;
  consultActiveChat: (agent: AgentProvider, text: string) => void;
  interruptActiveChat: () => boolean;
  cancelActiveChat: () => boolean;
  refreshActiveChatInfo: () => void;
};

const BridgeContext = React.createContext<BridgeState | null>(null);

type PendingConversation = {
  title: string;
  agent: AgentProvider;
};

type PendingPair = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type PendingUpload = {
  resolve: (attachment: ChatAttachment) => void;
  reject: (error: Error) => void;
};

type PendingFolderList = {
  resolve: (result: FolderListResult) => void;
  reject: (error: Error) => void;
};

type ReconnectTarget = {
  mode: ConnectionMode;
  url: string;
};

type BridgeInbound = ServerToClient | RelayControlMessage;

const RELAY_WS_BASE_URL = 'wss://relay.jumper.sh/ws/mobile';
const RECONNECT_DELAYS_MS = [750, 1500, 3000, 5000] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseInboundMessage(data: unknown): BridgeInbound {
  if (!isObject(data)) throw new Error('WS message must be an object');
  if (typeof data.type !== 'string') throw new Error('WS message missing type');
  return data as BridgeInbound;
}

function isRelayControlMessage(msg: BridgeInbound): msg is RelayControlMessage {
  return msg.type.startsWith('relay.');
}

function nextId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function uploadUrlFromServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  url.pathname = '/upload-image';
  url.search = '';
  return url.toString();
}

function relayUrlFromSession(session: RelayStore.RelaySession): string {
  const url = new URL(RELAY_WS_BASE_URL);
  url.searchParams.set('session', session.sessionId);
  url.searchParams.set('token', session.sessionToken);
  return url.toString();
}

function relayUrlFromCode(code: string): string {
  const url = new URL(RELAY_WS_BASE_URL);
  url.searchParams.set('code', code);
  return url.toString();
}

function pushEvent(
  prev: Record<string, unknown[]>,
  chatId: string,
  event: unknown
): Record<string, unknown[]> {
  return { ...prev, [chatId]: [...(prev[chatId] ?? []), event] };
}

function pushMessage(
  prev: Record<string, ChatMessage[]>,
  chatId: string,
  msg: ChatMessage
): Record<string, ChatMessage[]> {
  return { ...prev, [chatId]: [...(prev[chatId] ?? []), msg] };
}

function appendAssistantDelta(
  prev: Record<string, ChatMessage[]>,
  chatId: string,
  delta: string
): Record<string, ChatMessage[]> {
  const msgs = prev[chatId] ?? [];
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'assistant') {
    return { ...prev, [chatId]: [...msgs, { id: nextId('a'), role: 'assistant', text: delta }] };
  }
  const updated: ChatMessage = { ...last, text: last.text + delta };
  return { ...prev, [chatId]: [...msgs.slice(0, -1), updated] };
}

function appendAssistantMessage(
  prev: Record<string, ChatMessage[]>,
  chatId: string,
  text: string
): Record<string, ChatMessage[]> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return prev;
  return pushMessage(prev, chatId, { id: nextId('a'), role: 'assistant', text: trimmed });
}

function normalizeFolderPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '/' || trimmed === '\\') return trimmed;
  const normalized = trimmed.replace(/[\\/]+$/, '');
  return normalized.length > 0 ? normalized : trimmed;
}

function basenameFromPath(folderPath: string): string {
  const parts = folderPath.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? 'project';
}

function serverUrlFromConnectLink(url: string): string | null {
  const parsed = new URL(url);
  const target = parsed.hostname || parsed.pathname.replace(/^\//, '');
  if (target !== 'connect') return null;
  const server = parsed.searchParams.get('server');
  if (!server || server.trim().length === 0) return null;
  return server.trim();
}

function normalizeAgent(value: unknown): AgentProvider {
  return value === 'codex' ? 'codex' : 'claude';
}

function normalizeChat(chat: Chat): Chat {
  let activeAgent = normalizeAgent(chat.activeAgent);
  const agentSessions = { ...(chat.agentSessions ?? {}) };
  if (typeof chat.sessionId === 'string' && !agentSessions[activeAgent]) {
    agentSessions[activeAgent] = chat.sessionId;
  }
  const sessionAgents = Object.keys(agentSessions) as AgentProvider[];
  const onlySessionAgent = sessionAgents[0];
  if (!agentSessions[activeAgent] && sessionAgents.length === 1 && onlySessionAgent) {
    activeAgent = onlySessionAgent;
  }
  return {
    ...chat,
    activeAgent,
    agentSessions,
    sessionId: agentSessions[activeAgent] ?? null,
  };
}

function isEmptyPlaceholderChat(chat: Chat): boolean {
  const normalized = normalizeChat(chat);
  return normalized.title === 'New conversation' && Object.keys(normalized.agentSessions).length === 0;
}

function chatTitleFromPrompt(text: string): string {
  const compact = text.split(/\s+/).join(' ').trim();
  if (compact.length === 0) return 'New conversation';
  return compact.length > 54 ? `${compact.slice(0, 51)}...` : compact;
}

export function BridgeProvider(props: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('disconnected');
  const [connectionModeState, setConnectionModeState] = useState<ConnectionMode>('direct');
  const [peerConnected, setPeerConnected] = useState(false);
  const [serverUrl, setServerUrlState] = useState('ws://localhost:8787/ws');
  const [initialized, setInitialized] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [eventsByChatId, setEventsByChatId] = useState<Record<string, unknown[]>>({});
  const [isRespondingByChatId, setIsRespondingByChatId] = useState<Record<string, boolean>>({});
  const [isStoppingByChatId, setIsStoppingByChatId] = useState<Record<string, boolean>>({});
  const [infoByChatId, setInfoByChatId] = useState<Record<string, ChatInfo>>({});
  const activeChat = allChats.find((chat) => chat.id === activeChatId) ?? null;
  const activeAgent = activeChat?.activeAgent ?? 'claude';

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<ClientToServer[]>([]);
  const autoConnectAttemptedRef = useRef(false);
  const pendingConversationsRef = useRef<PendingConversation[]>([]);
  const pendingReconnectRef = useRef<ReconnectTarget | null>(null);
  const pendingPairRef = useRef<PendingPair | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const pendingFolderListsRef = useRef<Map<string, PendingFolderList>>(new Map());
  const relaySessionRef = useRef<RelayStore.RelaySession | null>(null);
  const statusRef = useRef<Status>('disconnected');
  const serverUrlRef = useRef('ws://localhost:8787/ws');
  const connectionModeRef = useRef<ConnectionMode>('direct');
  const activeChatIdRef = useRef<string | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    serverUrlRef.current = serverUrl;
  }, [serverUrl]);

  useEffect(() => {
    connectionModeRef.current = connectionModeState;
  }, [connectionModeState]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const setConnectionMode = (mode: ConnectionMode) => {
    setConnectionModeState(mode);
    connectionModeRef.current = mode;
  };

  const clearReconnectTimer = () => {
    const timer = reconnectTimerRef.current;
    if (!timer) return;
    clearTimeout(timer);
    reconnectTimerRef.current = null;
  };

  const persistServerUrl = async (url: string) => {
    setServerUrlState(url);
    serverUrlRef.current = url;
    await Store.setServerUrl(url);
  };

  const sendOrQueue = (msg: ClientToServer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return;
    }
    pendingRef.current = [...pendingRef.current, msg];
  };

  const requestInitialData = () => {
    sendOrQueue({ type: 'projects.list' });
    sendOrQueue({ type: 'chats.list' });
    const chatId = activeChatIdRef.current;
    if (chatId) {
      sendOrQueue({ type: 'chats.history', chatId });
      sendOrQueue({ type: 'chats.status', chatId });
      sendOrQueue({ type: 'chats.info', chatId });
    }
  };

  const resolvePendingPair = () => {
    const pending = pendingPairRef.current;
    if (!pending) return;
    pendingPairRef.current = null;
    pending.resolve();
  };

  const rejectPendingPair = (message: string) => {
    const pending = pendingPairRef.current;
    if (!pending) return;
    pendingPairRef.current = null;
    pending.reject(new Error(message));
  };

  const rejectPendingUploads = (message: string) => {
    const pending = pendingUploadsRef.current;
    pendingUploadsRef.current = [];
    for (const upload of pending) {
      upload.reject(new Error(message));
    }
  };

  const rejectPendingFolderLists = (message: string) => {
    const pending = Array.from(pendingFolderListsRef.current.values());
    pendingFolderListsRef.current.clear();
    for (const request of pending) {
      request.reject(new Error(message));
    }
  };

  const handleAppMessage = (msg: ServerToClient) => {
    if (msg.type === 'projects.list.result') {
      setProjects(msg.projects);
      return;
    }

    if (msg.type === 'projects.create.result') {
      setProjects((prev) => {
        const withoutExisting = prev.filter((project) => project.id !== msg.project.id);
        return [...withoutExisting, msg.project];
      });

      const pending = pendingConversationsRef.current[0];
      if (pending) {
        pendingConversationsRef.current = pendingConversationsRef.current.slice(1);
        sendOrQueue({ type: 'chats.create', projectId: msg.project.id, title: pending.title, agent: pending.agent });
      }
      return;
    }

    if (msg.type === 'chats.list.result') {
      setAllChats(msg.chats.map(normalizeChat));
      return;
    }

    if (msg.type === 'chats.create.result') {
      setAllChats((prev) => {
        const chat = normalizeChat(msg.chat);
        const withoutExisting = prev.filter((entry) => entry.id !== chat.id);
        return [...withoutExisting, chat];
      });
      activeChatIdRef.current = msg.chat.id;
      setActiveChatId(msg.chat.id);
      sendOrQueue({ type: 'chats.history', chatId: msg.chat.id });
      sendOrQueue({ type: 'chats.status', chatId: msg.chat.id });
      sendOrQueue({ type: 'chats.info', chatId: msg.chat.id });
      return;
    }

    if (msg.type === 'chats.history.result') {
      setMessagesByChatId((prev) => ({ ...prev, [msg.chatId]: msg.messages }));
      setEventsByChatId((prev) => ({ ...prev, [msg.chatId]: msg.events }));
      return;
    }

    if (msg.type === 'chats.status.result') {
      setIsRespondingByChatId((prev) => ({ ...prev, [msg.chatId]: msg.responding }));
      setIsStoppingByChatId((prev) => ({ ...prev, [msg.chatId]: false }));
      return;
    }

    if (msg.type === 'chats.info.result') {
      setInfoByChatId((prev) => ({ ...prev, [msg.info.chatId]: msg.info }));
      return;
    }

    if (msg.type === 'claude.event') {
      setEventsByChatId((prev) => pushEvent(prev, msg.chatId, msg.event));

      const e = msg.event;
      if (isObject(e) && e.type === 'stream_event') {
        const inner = e.event;
        if (isObject(inner) && inner.type === 'content_block_delta') {
          const delta = inner.delta;
          if (isObject(delta) && delta.type === 'text_delta') {
            const text = delta.text;
            if (typeof text === 'string') {
              setMessagesByChatId((prev) => appendAssistantDelta(prev, msg.chatId, text));
            }
          }
        }
      }
      if (isObject(e) && e.type === 'item.completed' && isObject(e.item)) {
        const item = e.item;
        if (item.type === 'agent_message' && typeof item.text === 'string') {
          const text = item.text;
          setMessagesByChatId((prev) => appendAssistantMessage(prev, msg.chatId, text));
        }
      }
      return;
    }

    if (msg.type === 'claude.done') {
      setIsRespondingByChatId((prev) => ({ ...prev, [msg.chatId]: false }));
      setIsStoppingByChatId((prev) => ({ ...prev, [msg.chatId]: false }));
      setEventsByChatId((prev) =>
        pushEvent(prev, msg.chatId, {
          type: 'claude.done',
          exitCode: msg.exitCode,
          signal: msg.signal,
        })
      );
      sendOrQueue({ type: 'chats.list' });
      sendOrQueue({ type: 'chats.info', chatId: msg.chatId });
      return;
    }

    if (msg.type === 'chats.cancel.result') {
      setIsStoppingByChatId((prev) => ({ ...prev, [msg.chatId]: msg.accepted }));
      if (msg.accepted) {
        hapticWarning();
      }
      return;
    }

    if (msg.type === 'upload-image.result') {
      const pending = pendingUploadsRef.current[0];
      if (!pending) return;
      pendingUploadsRef.current = pendingUploadsRef.current.slice(1);
      pending.resolve(msg.attachment);
      return;
    }

    if (msg.type === 'folders.list.result') {
      const pending = pendingFolderListsRef.current.get(msg.requestId);
      if (!pending) return;
      pendingFolderListsRef.current.delete(msg.requestId);
      pending.resolve({
        requestId: msg.requestId,
        path: msg.path,
        parentPath: msg.parentPath,
        directories: msg.directories,
        suggestedRoots: msg.suggestedRoots,
        resumeFolders: msg.resumeFolders,
      });
      return;
    }

    if (msg.type === 'error') {
      throw new Error(msg.message);
    }
  };

  const handleRelayControlMessage = (msg: RelayControlMessage) => {
    if (msg.type === 'relay.registered') {
      return;
    }

    if (msg.type === 'relay.paired') {
      const session: RelayStore.RelaySession = {
        sessionId: msg.sessionId,
        sessionToken: msg.sessionToken,
      };
      relaySessionRef.current = session;
      void RelayStore.setRelaySession(session);
      setConnectionMode('relay');
      setPeerConnected(true);
      resolvePendingPair();
      requestInitialData();
      return;
    }

    if (msg.type === 'relay.reconnected') {
      if (msg.role === 'bridge') {
        setPeerConnected(true);
        requestInitialData();
      }
      return;
    }

    if (msg.type === 'relay.peer_connected') {
      if (msg.peer === 'bridge') {
        setPeerConnected(true);
        requestInitialData();
      }
      return;
    }

    if (msg.type === 'relay.peer_disconnected') {
      if (msg.peer === 'bridge') {
        setPeerConnected(false);
      }
      return;
    }

    if (msg.type === 'relay.error') {
      rejectPendingPair(msg.message);
      throw new Error(msg.message);
    }
  };

  const startConnection = (target: ReconnectTarget) => {
    if (statusRef.current !== 'disconnected') return;

    clearReconnectTimer();
    setConnectionMode(target.mode);
    setPeerConnected(false);
    setStatus('connecting');
    statusRef.current = 'connecting';

    const ws = new WebSocket(target.url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setStatus('connected');
      statusRef.current = 'connected';

      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const m of pending) ws.send(JSON.stringify(m));

      requestInitialData();
    };

    ws.onmessage = (evt) => {
      const raw: unknown = JSON.parse(String(evt.data));
      const msg = parseInboundMessage(raw);

      if (isRelayControlMessage(msg)) {
        handleRelayControlMessage(msg);
        return;
      }

      handleAppMessage(msg);
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus('disconnected');
      statusRef.current = 'disconnected';
      setPeerConnected(false);
      setIsRespondingByChatId({});
      setIsStoppingByChatId({});
      rejectPendingUploads('Connection closed');
      rejectPendingFolderLists('Connection closed');

      const reconnectTarget = pendingReconnectRef.current;
      if (reconnectTarget) {
        pendingReconnectRef.current = null;
        startConnection(reconnectTarget);
        return;
      }

      if (shouldReconnectRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (!shouldReconnectRef.current || statusRef.current !== 'disconnected') return;
          if (connectionModeRef.current === 'relay') {
            const session = relaySessionRef.current;
            if (!session) return;
            startConnection({ mode: 'relay', url: relayUrlFromSession(session) });
            return;
          }
          startConnection({ mode: 'direct', url: serverUrlRef.current });
        }, delay);
      }

      rejectPendingPair('Pairing connection closed');
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  const connectOrReconnect = (target: ReconnectTarget) => {
    shouldReconnectRef.current = true;
    if (statusRef.current === 'disconnected') {
      startConnection(target);
      return;
    }

    pendingReconnectRef.current = target;
    wsRef.current?.close();
  };

  const handleConnectLink = async (url: string): Promise<boolean> => {
    const nextServerUrl = serverUrlFromConnectLink(url);
    if (!nextServerUrl) return false;

    await persistServerUrl(nextServerUrl);
    await RelayStore.clearRelaySession();
    relaySessionRef.current = null;

    connectOrReconnect({ mode: 'direct', url: nextServerUrl });
    hapticSuccess();
    return true;
  };

  const connectDirect = async (url?: string): Promise<void> => {
    const nextServerUrl = (url ?? serverUrlRef.current).trim();
    if (nextServerUrl.length === 0) throw new Error('Server URL is required');

    await persistServerUrl(nextServerUrl);
    await RelayStore.clearRelaySession();
    relaySessionRef.current = null;

    connectOrReconnect({ mode: 'direct', url: nextServerUrl });
    hapticSuccess();
  };

  const selectChat = (chatId: string) => {
    hapticTap();
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    sendOrQueue({ type: 'chats.history', chatId });
    sendOrQueue({ type: 'chats.status', chatId });
    sendOrQueue({ type: 'chats.info', chatId });
  };

  const deselectChat = () => {
    hapticTap();
    const chatId = activeChatId;
    if (chatId) {
      setAllChats((prev) =>
        prev.filter((chat) => chat.id !== chatId || !isEmptyPlaceholderChat(chat))
      );
    }
    activeChatIdRef.current = null;
    setActiveChatId(null);
  };

  const startConversation = (folderPath: string, agent: AgentProvider = 'codex') => {
    const path = normalizeFolderPath(folderPath);
    if (path.length === 0) throw new Error('Folder path is required');

    const projectName = basenameFromPath(path);
    pendingConversationsRef.current = [
      ...pendingConversationsRef.current,
      { title: 'New conversation', agent },
    ];

    if (statusRef.current === 'disconnected') {
      if (connectionModeRef.current === 'relay') {
        const session = relaySessionRef.current;
        if (!session) throw new Error('Relay session missing');
        startConnection({ mode: 'relay', url: relayUrlFromSession(session) });
      } else {
        startConnection({ mode: 'direct', url: serverUrlRef.current });
      }
    }

    hapticAction();
    sendOrQueue({ type: 'projects.create', name: projectName, path });
  };

  const listFolders = async (path?: string): Promise<FolderListResult> => {
    const requestId = nextId('folders');
    return await new Promise<FolderListResult>((resolve, reject) => {
      pendingFolderListsRef.current.set(requestId, { resolve, reject });
      if (path && path.trim().length > 0) {
        sendOrQueue({ type: 'folders.list', requestId, path });
        return;
      }
      sendOrQueue({ type: 'folders.list', requestId });
    });
  };

  const pairWithCode = async (code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length === 0) throw new Error('Code is required');

    rejectPendingPair('Pairing replaced by a new attempt');

    await new Promise<void>((resolve, reject) => {
      pendingPairRef.current = { resolve, reject };
      connectOrReconnect({ mode: 'relay', url: relayUrlFromCode(normalizedCode) });
    });
    hapticSuccess();
  };

  const disconnectRelay = async () => {
    await RelayStore.clearRelaySession();
    relaySessionRef.current = null;
    setPeerConnected(false);
    shouldReconnectRef.current = false;
    clearReconnectTimer();

    if (connectionModeRef.current !== 'relay') return;

    pendingReconnectRef.current = null;
    rejectPendingPair('Relay disconnected');
    setConnectionMode('direct');
    wsRef.current?.close();
    hapticWarning();
  };

  const uploadImageForActiveChat = async (input: {
    uri: string;
    fileName: string;
    mimeType: string;
  }) => {
    const chatId = activeChatId;
    if (!chatId) throw new Error('No active chat');

    const base64 = await FileSystem.readAsStringAsync(input.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (connectionModeRef.current === 'relay') {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('Relay connection is not open');
      }

      return await new Promise<ChatAttachment>((resolve, reject) => {
        pendingUploadsRef.current = [...pendingUploadsRef.current, { resolve, reject }];
        ws.send(
          JSON.stringify({
            type: 'upload-image',
            chatId,
            fileName: input.fileName,
            mimeType: input.mimeType,
            base64,
          } satisfies ClientToServer)
        );
      });
    }

    const response = await fetch(uploadUrlFromServerUrl(serverUrlRef.current), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chatId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        base64,
      }),
    });
    if (!response.ok) {
      throw new Error(`Image upload failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    if (!isObject(payload) || !isObject(payload.attachment)) {
      throw new Error('upload-image response missing attachment');
    }
    const raw = payload.attachment;
    if (
      typeof raw.id !== 'string' ||
      typeof raw.name !== 'string' ||
      typeof raw.mimeType !== 'string' ||
      typeof raw.relativePath !== 'string' ||
      typeof raw.sizeBytes !== 'number'
    ) {
      throw new Error('upload-image response attachment shape mismatch');
    }
    return {
      id: raw.id,
      name: raw.name,
      mimeType: raw.mimeType,
      relativePath: raw.relativePath,
      sizeBytes: raw.sizeBytes,
    } satisfies ChatAttachment;
  };

  const sendToActiveChat = (text: string, attachments: ChatAttachment[] = []) => {
    const chatId = activeChatId;
    if (!chatId) throw new Error('No active chat');
    setAllChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId && chat.title === 'New conversation'
          ? { ...chat, title: chatTitleFromPrompt(text) }
          : chat
      )
    );
    const attachmentText = attachments.map((attachment) => `[Attached file: ${attachment.name}]`);
    const localText = [text, ...attachmentText].filter((part) => part.trim().length > 0).join('\n');
    setMessagesByChatId((prev) =>
      pushMessage(prev, chatId, {
        id: nextId('u'),
        role: 'user',
        text: localText.length > 0 ? localText : '[Attached file]',
      })
    );
    setIsRespondingByChatId((prev) => ({ ...prev, [chatId]: true }));
    setIsStoppingByChatId((prev) => ({ ...prev, [chatId]: false }));
    hapticAction();
    sendOrQueue({
      type: 'chats.send',
      chatId,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  };

  const consultActiveChat = (agent: AgentProvider, text: string) => {
    const chatId = activeChatId;
    if (!chatId) throw new Error('No active chat');
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setAllChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId && chat.title === 'New conversation'
          ? { ...chat, title: chatTitleFromPrompt(trimmed) }
          : chat
      )
    );

    const label = agent === 'codex' ? 'Codex' : 'Claude';
    setMessagesByChatId((prev) =>
      pushMessage(prev, chatId, {
        id: nextId('u'),
        role: 'user',
        text: `Ask ${label}:\n${trimmed}`,
      })
    );
    setIsRespondingByChatId((prev) => ({ ...prev, [chatId]: true }));
    setIsStoppingByChatId((prev) => ({ ...prev, [chatId]: false }));
    hapticAction();
    sendOrQueue({
      type: 'chats.send',
      chatId,
      text: trimmed,
      agent,
      mode: 'consult',
    });
  };

  const refreshActiveChatInfo = () => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;
    sendOrQueue({ type: 'chats.info', chatId });
  };

  const interruptActiveChat = () => {
    const chatId = activeChatId;
    if (!chatId) throw new Error('No active chat');
    if (isRespondingByChatId[chatId] !== true) return false;
    if (isStoppingByChatId[chatId] === true) return true;
    setIsStoppingByChatId((prev) => ({ ...prev, [chatId]: true }));
    hapticWarning();
    sendOrQueue({ type: 'chats.cancel', chatId });
    return true;
  };
  const cancelActiveChat = interruptActiveChat;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const relaySession = await RelayStore.getRelaySession();
      if (cancelled) return;
      if (relaySession) {
        relaySessionRef.current = relaySession;
        setConnectionMode('relay');
        setInitialized(true);
        return;
      }

      const savedUrl = await Store.getServerUrl();
      if (cancelled) return;
      if (savedUrl) {
        await persistServerUrl(savedUrl);
      }
      setInitialized(true);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized || autoConnectAttemptedRef.current) return;
    autoConnectAttemptedRef.current = true;
    shouldReconnectRef.current = true;

    const relaySession = relaySessionRef.current;
    if (relaySession) {
      startConnection({ mode: 'relay', url: relayUrlFromSession(relaySession) });
      return;
    }

    startConnection({ mode: 'direct', url: serverUrlRef.current });
  }, [initialized]);

  const value: BridgeState = useMemo(
    () => ({
      status,
      connectionMode: connectionModeState,
      peerConnected,
      serverUrl,
      projects,
      allChats,
      activeChatId,
      messagesByChatId,
      eventsByChatId,
      isRespondingByChatId,
      isStoppingByChatId,
      infoByChatId,
      activeAgent,

      setServerUrl: async (url: string) => {
        await persistServerUrl(url);
      },
      connectDirect,
      handleConnectLink,
      pairWithCode,
      disconnectRelay,
      selectChat,
      deselectChat,
      startConversation,
      listFolders,
      uploadImageForActiveChat,
      sendToActiveChat,
      consultActiveChat,
      interruptActiveChat,
      cancelActiveChat,
      refreshActiveChatInfo,
    }),
    [
      status,
      connectionModeState,
      peerConnected,
      serverUrl,
      projects,
      allChats,
      activeChatId,
      messagesByChatId,
      eventsByChatId,
      isRespondingByChatId,
      isStoppingByChatId,
      infoByChatId,
      activeAgent,
      handleConnectLink,
      pairWithCode,
      disconnectRelay,
      listFolders,
    ]
  );

  return <BridgeContext.Provider value={value}>{props.children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeState {
  const ctx = React.use(BridgeContext);
  if (!ctx) throw new Error('BridgeProvider missing');
  return ctx;
}
