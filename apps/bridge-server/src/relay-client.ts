import { WebSocket, type RawData } from "ws";

import type { RelaySession } from "./state.js";

type RelayRole = "bridge" | "mobile";

type RelayRegisteredMessage = {
  type: "relay.registered";
  code: string;
  sessionId: string;
};

type RelayPairedMessage = {
  type: "relay.paired";
  sessionId: string;
  sessionToken: string;
  role: RelayRole;
};

type RelayReconnectedMessage = {
  type: "relay.reconnected";
  role: RelayRole;
};

type RelayPeerConnectedMessage = {
  type: "relay.peer_connected";
  peer: RelayRole;
};

type RelayPeerDisconnectedMessage = {
  type: "relay.peer_disconnected";
  peer: RelayRole;
};

type RelayErrorMessage = {
  type: "relay.error";
  message: string;
};

export type RelayControlMessage =
  | RelayRegisteredMessage
  | RelayPairedMessage
  | RelayReconnectedMessage
  | RelayPeerConnectedMessage
  | RelayPeerDisconnectedMessage
  | RelayErrorMessage;

type RelayClientOptions = {
  relayUrl: string;
  session: RelaySession | null;
  onPayload: (payload: unknown) => Promise<void> | void;
  onPairingCode: (message: RelayRegisteredMessage) => void;
  onPaired: (session: RelaySession) => Promise<void> | void;
  onControlMessage?: (message: RelayControlMessage) => void;
};

const RECONNECT_DELAY_MS = 3_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRelayRole(value: unknown): value is RelayRole {
  return value === "bridge" || value === "mobile";
}

function isRelayControlMessage(value: unknown): value is RelayControlMessage {
  if (!isObject(value) || typeof value.type !== "string") return false;

  if (value.type === "relay.registered") {
    return typeof value.code === "string" && typeof value.sessionId === "string";
  }
  if (value.type === "relay.paired") {
    return (
      typeof value.sessionId === "string" &&
      typeof value.sessionToken === "string" &&
      isRelayRole(value.role)
    );
  }
  if (value.type === "relay.reconnected") {
    return isRelayRole(value.role);
  }
  if (value.type === "relay.peer_connected" || value.type === "relay.peer_disconnected") {
    return isRelayRole(value.peer);
  }
  if (value.type === "relay.error") {
    return typeof value.message === "string";
  }
  return false;
}

function relayWsUrl(relayUrl: string, session: RelaySession | null): string {
  const url = new URL(relayUrl);
  url.pathname = "/ws/bridge";
  url.search = "";
  if (session) {
    url.searchParams.set("session", session.sessionId);
    url.searchParams.set("token", session.sessionToken);
  }
  return url.toString();
}

function rawDataToText(data: RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) {
    return data
      .map((chunk) =>
        chunk instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(chunk)).toString("utf8")
          : Buffer.from(chunk).toString("utf8")
      )
      .join("");
  }
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

export class RelayClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private session: RelaySession | null;

  constructor(private readonly options: RelayClientOptions) {
    this.session = options.session;
  }

  connect(): void {
    this.stopped = false;
    this.connectNow();
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  send(data: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Relay websocket is not open");
    }
    this.socket.send(data);
  }

  private connectNow(): void {
    const socket = new WebSocket(relayWsUrl(this.options.relayUrl, this.session));
    this.socket = socket;

    socket.on("message", async (data) => {
      const payload: unknown = JSON.parse(rawDataToText(data));
      if (isRelayControlMessage(payload)) {
        this.handleControlMessage(payload);
        return;
      }
      await this.options.onPayload(payload);
    });

    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectNow();
    }, RECONNECT_DELAY_MS);
  }

  private handleControlMessage(message: RelayControlMessage): void {
    this.options.onControlMessage?.(message);

    if (message.type === "relay.registered") {
      this.options.onPairingCode(message);
      return;
    }

    if (message.type === "relay.paired" && message.role === "bridge") {
      const session: RelaySession = {
        sessionId: message.sessionId,
        sessionToken: message.sessionToken,
      };
      this.session = session;
      void this.options.onPaired(session);
    }
  }
}
