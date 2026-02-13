type RelayRole = "bridge" | "mobile";

interface RelayRegisteredMessage {
  type: "relay.registered";
  code: string;
  sessionId: string;
}

interface RelayPairedMessage {
  type: "relay.paired";
  sessionId: string;
  sessionToken: string;
  role: RelayRole;
}

interface RelayReconnectedMessage {
  type: "relay.reconnected";
  role: RelayRole;
}

interface RelayPeerConnectedMessage {
  type: "relay.peer_connected";
  peer: RelayRole;
}

interface RelayPeerDisconnectedMessage {
  type: "relay.peer_disconnected";
  peer: RelayRole;
}

interface RelayErrorMessage {
  type: "relay.error";
  message: string;
}

type RelayMessage =
  | RelayRegisteredMessage
  | RelayPairedMessage
  | RelayReconnectedMessage
  | RelayPeerConnectedMessage
  | RelayPeerDisconnectedMessage
  | RelayErrorMessage;

const SESSION_TOKEN_KEY = "sessionToken";

export class RelaySession {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: unknown
  ) {}

  private parseRole(value: string | null): RelayRole | null {
    if (value === "bridge" || value === "mobile") {
      return value;
    }

    return null;
  }

  private getRoleFromSocket(socket: WebSocket): RelayRole | null {
    for (const bridgeSocket of this.state.getWebSockets("bridge")) {
      if (bridgeSocket === socket) {
        return "bridge";
      }
    }

    for (const mobileSocket of this.state.getWebSockets("mobile")) {
      if (mobileSocket === socket) {
        return "mobile";
      }
    }

    return null;
  }

  private getOtherRole(role: RelayRole): RelayRole {
    return role === "bridge" ? "mobile" : "bridge";
  }

  private sendControlMessage(socket: WebSocket, message: RelayMessage): void {
    socket.send(JSON.stringify(message));
  }

  private sendToRole(role: RelayRole, message: RelayMessage): void {
    for (const socket of this.state.getWebSockets(role)) {
      this.sendControlMessage(socket, message);
    }
  }

  private sendToAll(message: RelayMessage): void {
    this.sendToRole("bridge", message);
    this.sendToRole("mobile", message);
  }

  private sendToOtherRole(role: RelayRole, message: RelayMessage): void {
    this.sendToRole(this.getOtherRole(role), message);
  }

  private async broadcastPairedMessage(sessionId: string): Promise<boolean> {
    const sessionToken = await this.state.storage.get<string>(SESSION_TOKEN_KEY);
    if (!sessionToken) {
      return false;
    }

    this.sendToRole("bridge", {
      type: "relay.paired",
      sessionId,
      sessionToken,
      role: "bridge",
    });
    this.sendToRole("mobile", {
      type: "relay.paired",
      sessionId,
      sessionToken,
      role: "mobile",
    });
    return true;
  }

  private async validateReconnectToken(token: string): Promise<boolean> {
    const storedToken = await this.state.storage.get<string>(SESSION_TOKEN_KEY);
    return storedToken === token;
  }

  async fetch(request: Request): Promise<Response> {
    const role = this.parseRole(request.headers.get("X-Relay-Role"));
    if (!role) {
      return new Response("Missing or invalid X-Relay-Role", { status: 400 });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 400 });
    }

    const sockets = new WebSocketPair();
    const clientSocket = sockets[0];
    const serverSocket = sockets[1];
    this.state.acceptWebSocket(serverSocket, [role]);

    const code = request.headers.get("X-Relay-Code");
    const token = request.headers.get("X-Relay-Token");
    const sessionId = request.headers.get("X-Relay-Session-Id");
    if (!sessionId) {
      serverSocket.close(1008, "Missing session id");
      return new Response("Missing session id", { status: 400 });
    }

    if (role === "bridge") {
      if (token) {
        const valid = await this.validateReconnectToken(token);
        if (!valid) {
          this.sendControlMessage(serverSocket, {
            type: "relay.error",
            message: "Invalid session token",
          });
          serverSocket.close(1008, "Invalid session token");
          return new Response("Invalid session token", { status: 401 });
        }

        this.sendToAll({ type: "relay.reconnected", role });
        this.sendToOtherRole(role, { type: "relay.peer_connected", peer: role });
      } else if (code && sessionId) {
        const sessionToken = crypto.randomUUID();
        await this.state.storage.put(SESSION_TOKEN_KEY, sessionToken);
        this.sendControlMessage(serverSocket, {
          type: "relay.registered",
          code,
          sessionId,
        });
        this.sendToOtherRole(role, { type: "relay.peer_connected", peer: role });
      } else {
        serverSocket.close(1008, "Missing registration details");
        return new Response("Missing registration details", { status: 400 });
      }
    } else if (code) {
      const paired = await this.broadcastPairedMessage(sessionId);
      if (!paired) {
        this.sendControlMessage(serverSocket, {
          type: "relay.error",
          message: "Session token unavailable",
        });
        serverSocket.close(1011, "Session token unavailable");
        return new Response("Session token unavailable", { status: 500 });
      }

      this.sendToOtherRole(role, { type: "relay.peer_connected", peer: role });
    } else if (token) {
      const valid = await this.validateReconnectToken(token);
      if (!valid) {
        this.sendControlMessage(serverSocket, {
          type: "relay.error",
          message: "Invalid session token",
        });
        serverSocket.close(1008, "Invalid session token");
        return new Response("Invalid session token", { status: 401 });
      }

      this.sendToAll({ type: "relay.reconnected", role });
      this.sendToOtherRole(role, { type: "relay.peer_connected", peer: role });
    } else {
      serverSocket.close(1008, "Missing registration details");
      return new Response("Missing registration details", { status: 400 });
    }

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer | ArrayBufferView
  ): void {
    const role = this.getRoleFromSocket(socket);
    if (!role) {
      return;
    }

    const peerRole = this.getOtherRole(role);
    for (const peerSocket of this.state.getWebSockets(peerRole)) {
      peerSocket.send(message);
    }
  }

  webSocketClose(
    socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): void {
    const role = this.getRoleFromSocket(socket);
    if (!role) {
      return;
    }

    this.sendToRole(this.getOtherRole(role), {
      type: "relay.peer_disconnected",
      peer: role,
    });
  }

  webSocketError(socket: WebSocket, _error: unknown): void {
    socket.close(1011, "relay websocket error");
  }
}
