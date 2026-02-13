import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import type {
  Chat,
  ChatAttachment,
  ChatMessage,
  ClientToServer,
  Project,
  RelayControlMessage,
  ServerToClient,
} from './types';
import * as ExtensionStore from './extension-storage';
import * as RelayStore from './relay-storage';
import * as Store from './storage';

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

  setServerUrl: (url: string) => Promise<void>;
  handleConnectLink: (url: string) => Promise<boolean>;
  pairWithCode: (code: string) => Promise<void>;
  disconnectRelay: () => Promise<void>;

  selectChat: (chatId: string) => void;
  startConversation: (folderPath: string) => void;

  uploadImageForActiveChat: (input: {
    uri: string;
    fileName: string;
    mimeType: string;
  }) => Promise<ChatAttachment>;
  sendToActiveChat: (text: string, attachments?: ChatAttachment[]) => void;
  cancelActiveChat: () => void;
};

const BridgeContext = React.createContext<BridgeState | null>(null);

type PendingConversation = {
  title: string;
};

type PendingPair = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type PendingUpload = {
  resolve: (attachment: ChatAttachment) => void;
  reject: (error: Error) => void;
};

type ReconnectTarget = {
  mode: ConnectionMode;
  url: string;
};

type BridgeInbound = ServerToClient | RelayControlMessage;

const RELAY_WS_BASE_URL = 'wss://relay.jumper.sh/ws/mobile';

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

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<ClientToServer[]>([]);
  const autoConnectAttemptedRef = useRef(false);
  const pendingConversationsRef = useRef<PendingConversation[]>([]);
  const pendingReconnectRef = useRef<ReconnectTarget | null>(null);
  const pendingPairRef = useRef<PendingPair | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const relaySessionRef = useRef<RelayStore.RelaySession | null>(null);
  const statusRef = useRef<Status>('disconnected');
  const serverUrlRef = useRef('ws://localhost:8787/ws');
  const connectionModeRef = useRef<ConnectionMode>('direct');

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    serverUrlRef.current = serverUrl;
  }, [serverUrl]);

  useEffect(() => {
    connectionModeRef.current = connectionModeState;
  }, [connectionModeState]);

  const setConnectionMode = (mode: ConnectionMode) => {
    setConnectionModeState(mode);
    connectionModeRef.current = mode;
  };

  const persistServerUrl = async (url: string) => {
    setServerUrlState(url);
    serverUrlRef.current = url;
    await Store.setServerUrl(url);
    ExtensionStore.setSharedBridgeServerUrl(url);
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
        sendOrQueue({ type: 'chats.create', projectId: msg.project.id, title: pending.title });
      }
      return;
    }

    if (msg.type === 'chats.list.result') {
      setAllChats(msg.chats);
      return;
    }

    if (msg.type === 'chats.create.result') {
      setAllChats((prev) => {
        const withoutExisting = prev.filter((chat) => chat.id !== msg.chat.id);
        return [...withoutExisting, msg.chat];
      });
      setActiveChatId(msg.chat.id);
      sendOrQueue({ type: 'chats.history', chatId: msg.chat.id });
      return;
    }

    if (msg.type === 'chats.history.result') {
      setMessagesByChatId((prev) => ({ ...prev, [msg.chatId]: msg.messages }));
      setEventsByChatId((prev) => ({ ...prev, [msg.chatId]: msg.events }));
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
      return;
    }

    if (msg.type === 'claude.done') {
      setIsRespondingByChatId((prev) => ({ ...prev, [msg.chatId]: false }));
      setEventsByChatId((prev) =>
        pushEvent(prev, msg.chatId, {
          type: 'claude.done',
          exitCode: msg.exitCode,
          signal: msg.signal,
        })
      );
      sendOrQueue({ type: 'chats.list' });
      return;
    }

    if (msg.type === 'upload-image.result') {
      const pending = pendingUploadsRef.current[0];
      if (!pending) return;
      pendingUploadsRef.current = pendingUploadsRef.current.slice(1);
      pending.resolve(msg.attachment);
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

    setConnectionMode(target.mode);
    setPeerConnected(false);
    setStatus('connecting');
    statusRef.current = 'connecting';

    const ws = new WebSocket(target.url);
    wsRef.current = ws;

    ws.onopen = () => {
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
      rejectPendingUploads('Connection closed');

      const reconnectTarget = pendingReconnectRef.current;
      if (reconnectTarget) {
        pendingReconnectRef.current = null;
        startConnection(reconnectTarget);
        return;
      }

      rejectPendingPair('Pairing connection closed');
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  const connectOrReconnect = (target: ReconnectTarget) => {
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
    return true;
  };

  const selectChat = (chatId: string) => {
    setActiveChatId(chatId);
    sendOrQueue({ type: 'chats.history', chatId });
  };

  const startConversation = (folderPath: string) => {
    const path = normalizeFolderPath(folderPath);
    if (path.length === 0) throw new Error('Folder path is required');

    const projectName = basenameFromPath(path);
    pendingConversationsRef.current = [
      ...pendingConversationsRef.current,
      { title: 'New conversation' },
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

    sendOrQueue({ type: 'projects.create', name: projectName, path });
  };

  const pairWithCode = async (code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length === 0) throw new Error('Code is required');

    rejectPendingPair('Pairing replaced by a new attempt');

    await new Promise<void>((resolve, reject) => {
      pendingPairRef.current = { resolve, reject };
      connectOrReconnect({ mode: 'relay', url: relayUrlFromCode(normalizedCode) });
    });
  };

  const disconnectRelay = async () => {
    await RelayStore.clearRelaySession();
    relaySessionRef.current = null;
    setPeerConnected(false);

    if (connectionModeRef.current !== 'relay') return;

    pendingReconnectRef.current = null;
    rejectPendingPair('Relay disconnected');
    setConnectionMode('direct');
    wsRef.current?.close();
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
    sendOrQueue({
      type: 'chats.send',
      chatId,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  };

  const cancelActiveChat = () => {
    const chatId = activeChatId;
    if (!chatId) throw new Error('No active chat');
    setIsRespondingByChatId((prev) => ({ ...prev, [chatId]: false }));
    sendOrQueue({ type: 'chats.cancel', chatId });
  };

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

      setServerUrl: async (url: string) => {
        await persistServerUrl(url);
      },
      handleConnectLink,
      pairWithCode,
      disconnectRelay,
      selectChat,
      startConversation,
      uploadImageForActiveChat,
      sendToActiveChat,
      cancelActiveChat,
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
      handleConnectLink,
      pairWithCode,
      disconnectRelay,
    ]
  );

  return <BridgeContext.Provider value={value}>{props.children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeState {
  const ctx = React.use(BridgeContext);
  if (!ctx) throw new Error('BridgeProvider missing');
  return ctx;
}
