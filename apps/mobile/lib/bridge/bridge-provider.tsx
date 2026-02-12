import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import type {
  Chat,
  ChatAttachment,
  ChatMessage,
  ClientToServer,
  Project,
  ServerToClient,
} from './types';
import * as Store from './storage';
import * as ExtensionStore from './extension-storage';

type Status = 'disconnected' | 'connecting' | 'connected';

type BridgeState = {
  status: Status;
  serverUrl: string;
  token: string | null;

  projects: Project[];
  chats: Chat[];

  activeProjectId: string | null;
  activeChatId: string | null;

  messagesByChatId: Record<string, ChatMessage[]>;
  eventsByChatId: Record<string, unknown[]>;

  setServerUrl: (url: string) => Promise<void>;
  clearToken: () => Promise<void>;
  pair: (code: string, deviceName: string) => void;
  connect: () => void;
  disconnect: () => void;

  listProjects: () => void;
  createProject: (name: string) => void;

  selectProject: (projectId: string) => void;
  selectChat: (chatId: string) => void;
  listChats: (projectId: string) => void;
  createChat: (projectId: string, title: string) => void;

  uploadImageForActiveChat: (input: {
    uri: string;
    fileName: string;
    mimeType: string;
  }) => Promise<ChatAttachment>;
  sendToActiveChat: (text: string, attachments?: ChatAttachment[]) => void;
  cancelActiveChat: () => void;
};

const BridgeContext = React.createContext<BridgeState | null>(null);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseServerMessage(data: unknown): ServerToClient {
  if (!isObject(data)) throw new Error('WS message must be an object');
  if (typeof data.type !== 'string') throw new Error('WS message missing type');
  return data as ServerToClient;
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

export function BridgeProvider(props: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('disconnected');
  const [serverUrl, setServerUrlState] = useState('wss://');
  const [token, setTokenState] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [eventsByChatId, setEventsByChatId] = useState<Record<string, unknown[]>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<ClientToServer[]>([]);

  const sendOrQueue = (msg: ClientToServer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return;
    }
    pendingRef.current = [...pendingRef.current, msg];
  };

  const connect = () => {
    if (status !== 'disconnected') return;
    setStatus('connecting');

    const ws = new WebSocket(serverUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const m of pending) ws.send(JSON.stringify(m));
      if (token) sendOrQueue({ type: 'auth', token });
    };

    ws.onmessage = (evt) => {
      const raw: unknown = JSON.parse(String(evt.data));
      const msg = parseServerMessage(raw);

      if (msg.type === 'paired') {
        setTokenState(msg.token);
        void Store.setToken(msg.token);
        ExtensionStore.setSharedBridgeToken(msg.token);
        sendOrQueue({ type: 'auth', token: msg.token });
        return;
      }

      if (msg.type === 'projects.list.result') {
        setProjects(msg.projects);
        return;
      }

      if (msg.type === 'projects.create.result') {
        setProjects((prev) => [...prev, msg.project]);
        return;
      }

      if (msg.type === 'chats.list.result') {
        setChats(msg.chats);
        return;
      }

      if (msg.type === 'chats.create.result') {
        setChats((prev) => [...prev, msg.chat]);
        setActiveChatId(msg.chat.id);
        return;
      }

      if (msg.type === 'chats.history.result') {
        setMessagesByChatId((prev) => ({ ...prev, [msg.chatId]: msg.messages }));
        setEventsByChatId((prev) => ({ ...prev, [msg.chatId]: msg.events }));
        return;
      }

      if (msg.type === 'claude.event') {
        setEventsByChatId((prev) => pushEvent(prev, msg.chatId, msg.event));

        // Best-effort text streaming: append text_delta to the current assistant message.
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
        setEventsByChatId((prev) =>
          pushEvent(prev, msg.chatId, {
            type: 'claude.done',
            exitCode: msg.exitCode,
            signal: msg.signal,
          })
        );
        return;
      }

      if (msg.type === 'error') {
        throw new Error(msg.message);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus('disconnected');
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  const disconnect = () => {
    wsRef.current?.close();
  };

  const pair = (code: string, deviceName: string) => {
    if (status === 'disconnected') connect();
    sendOrQueue({ type: 'pair', code, deviceName });
  };

  const clearToken = async () => {
    disconnect();
    setTokenState(null);
    await Store.clearToken();
    ExtensionStore.clearSharedBridgeToken();
  };

  const listProjects = () => sendOrQueue({ type: 'projects.list' });
  const createProject = (name: string) => sendOrQueue({ type: 'projects.create', name });

  const selectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveChatId(null);
    sendOrQueue({ type: 'chats.list', projectId });
  };

  const selectChat = (chatId: string) => {
    setActiveChatId(chatId);
    sendOrQueue({ type: 'chats.history', chatId });
  };

  const listChats = (projectId: string) => sendOrQueue({ type: 'chats.list', projectId });
  const createChat = (projectId: string, title: string) =>
    sendOrQueue({ type: 'chats.create', projectId, title });

  const uploadImageForActiveChat = async (input: {
    uri: string;
    fileName: string;
    mimeType: string;
  }) => {
    const chatId = activeChatId;
    if (!chatId) throw new Error('No active chat');
    if (!token) throw new Error('Not authenticated');

    const base64 = await FileSystem.readAsStringAsync(input.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const response = await fetch(uploadUrlFromServerUrl(serverUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
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
    sendOrQueue({ type: 'chats.cancel', chatId });
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const [savedUrl, savedToken] = await Promise.all([Store.getServerUrl(), Store.getToken()]);
      if (cancelled) return;
      if (savedUrl) {
        setServerUrlState(savedUrl);
        ExtensionStore.setSharedBridgeServerUrl(savedUrl);
      }
      if (savedToken) setTokenState(savedToken);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (token && status === 'disconnected') {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, serverUrl]);

  useEffect(() => {
    if (!token) {
      ExtensionStore.clearSharedBridgeToken();
      return;
    }
    ExtensionStore.setSharedBridgeToken(token);
  }, [token]);

  const value: BridgeState = useMemo(
    () => ({
      status,
      serverUrl,
      token,
      projects,
      chats,
      activeProjectId,
      activeChatId,
      messagesByChatId,
      eventsByChatId,

      setServerUrl: async (url: string) => {
        setServerUrlState(url);
        await Store.setServerUrl(url);
        ExtensionStore.setSharedBridgeServerUrl(url);
      },
      clearToken,
      pair,
      connect,
      disconnect,
      listProjects,
      createProject,
      selectProject,
      selectChat,
      listChats,
      createChat,
      uploadImageForActiveChat,
      sendToActiveChat,
      cancelActiveChat,
    }),
    [
      status,
      serverUrl,
      token,
      projects,
      chats,
      activeProjectId,
      activeChatId,
      messagesByChatId,
      eventsByChatId,
    ]
  );

  return <BridgeContext.Provider value={value}>{props.children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeState {
  const ctx = React.use(BridgeContext);
  if (!ctx) throw new Error('BridgeProvider missing');
  return ctx;
}
