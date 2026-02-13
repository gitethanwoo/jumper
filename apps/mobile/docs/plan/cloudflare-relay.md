# Cloudflare Worker Relay for Jumper

## Context

Jumper currently requires the phone and Mac to be on the same network (or Tailscale) for the WebSocket connection. We're adding a Cloudflare Worker relay at `relay.jumper.sh` so the phone can reach the bridge server from anywhere. Both sides connect outbound to the relay — no port forwarding, no VPN, no Tailscale required.

**User flow after this change:**
1. `npx jumper-app` on Mac → prints pairing code like `JUMP-4829`
2. Open Jumper on phone → enter code once → paired forever
3. Every subsequent launch auto-reconnects via stored session token

## Architecture

```
Mac (bridge-server)  ──outbound WSS──>  relay.jumper.sh (CF Worker + DO)  <──outbound WSS──  Phone (Jumper app)
```

The relay is a dumb pipe — it doesn't parse app-level messages. It just matches bridge + phone by pairing code and forwards bytes between them.

---

## Phase 1: Relay Worker (`apps/relay/`)

### New files

```
apps/relay/
├── package.json          # wrangler, @cloudflare/workers-types
├── tsconfig.json         # ES2022, strict, CF workers-types
├── wrangler.toml         # DO binding + KV namespace
└── src/
    ├── index.ts          # Worker entry: route requests to DOs
    ├── relay-session.ts  # Durable Object: hold paired WebSockets, pipe data
    └── codes.ts          # Short code generation (WORD-NNNN format)
```

### Worker routes (`src/index.ts`)

| Route | Purpose |
|-------|---------|
| `GET /health` | Health check |
| `GET /ws/bridge` | Bridge registers, gets assigned a code |
| `GET /ws/bridge?session=X&token=T` | Bridge reconnects with stored session |
| `GET /ws/mobile?code=JUMP-4829` | Phone pairs with code |
| `GET /ws/mobile?session=X&token=T` | Phone reconnects with stored session |

- Worker generates DO ID for new sessions, stores `code → doId` in KV with 10min TTL
- Phone lookups code in KV, deletes after use, routes to correct DO
- Reconnects go directly to DO by ID, validated against stored session token

### Durable Object (`src/relay-session.ts`)

Uses **WebSocket Hibernation API** for indefinite connection lifetime.

**Persistent storage:** `sessionToken: string` (generated on first pairing)

**Behavior:**
- `fetch()`: Accept WebSocket upgrade, tag socket as `"bridge"` or `"mobile"`, send control messages (registered/paired/reconnected/peer_connected)
- `webSocketMessage()`: Find peer via `ctx.getWebSockets()` + tags, forward message as-is
- `webSocketClose()`: Notify peer of disconnection via `relay.peer_disconnected`

**Relay control protocol** (thin envelope, only used for pairing/status):
- `relay.registered { code, sessionId }` → sent to bridge on registration
- `relay.paired { sessionToken, role }` → sent to both sides when phone pairs
- `relay.reconnected { role }` → sent on session reconnect
- `relay.peer_connected { peer }` / `relay.peer_disconnected { peer }` → connection status
- `relay.error { message }` → errors

**App-level messages are forwarded raw** — no wrapping needed. The DO just pipes whatever it receives from one side to the other. The relay doesn't need a `relay.forward` envelope because there's only one peer on each side.

### Deploy

```bash
cd apps/relay
pnpm install
wrangler kv namespace create CODES   # get KV ID for wrangler.toml
wrangler deploy
# Configure custom domain: relay.jumper.sh → jumper-relay worker
```

---

## Phase 2: Bridge Server Changes (`apps/bridge-server/`)

### New file: `src/relay-client.ts`

A WebSocket client that connects outbound to the relay. Handles:
- Registration (new session) → receives code, calls `onPairingCode(code)`
- Reconnection (existing session) → uses stored sessionId + token
- Receiving messages from phone via relay → calls `onMessage(data)` with raw app-level message
- Sending messages to phone → `send(data)` writes to relay WebSocket
- Auto-reconnect on disconnect (3s backoff)

### Changes to `src/index.ts`

**1. Extract message handler** — The inline `ws.on("message")` handler (lines 832-980) becomes:

```typescript
async function handleClientMessage(
  msg: ClientToServer,
  reply: (msg: ServerToClient) => void
): Promise<void>
```

This function takes the parsed message and a `reply` callback. The existing local WS handler calls it with `(msg, (m) => send(ws, m))`. The relay handler calls it with `(msg, (m) => relayClient.send(JSON.stringify(m)))`.

The `state` and `active` variables remain module-level (they already are).

**2. Add image upload via WS** — New message type `upload-image` handled in `handleClientMessage`, reusing the same logic from the HTTP `/upload-image` handler. Response sent as `upload-image.result`. This is needed because the phone can't HTTP POST through the relay.

**3. Initialize RelayClient** — At the end of `main()`, if `RELAY_URL` env var is set:
- Load saved session from `~/.cc-bridge/relay-session.json`
- Create `RelayClient` with relay URL
- On `onPairingCode`: print code to terminal
- On `onMessage`: parse and route through `handleClientMessage`
- On session token received: save to `relay-session.json`
- Connect

**4. Terminal output** — When relay is configured:
```
[jumper] Your code: JUMP-4829
[jumper] Enter this in the Jumper app to connect.
```

### Changes to `src/types.ts`

Add to `ClientToServer`:
```typescript
| { type: "upload-image"; chatId: string; fileName: string; mimeType: string; base64: string }
```

Add to `ServerToClient`:
```typescript
| { type: "upload-image.result"; attachment: ChatAttachment }
```

### New additions to `src/state.ts`

Add `loadRelaySession()` and `saveRelaySession()` for persisting `{ sessionId, sessionToken }` to `~/.cc-bridge/relay-session.json`.

---

## Phase 3: Mobile App Changes (`apps/mobile/`)

### New file: `app/pair.tsx`

Pairing screen — shown on first launch when no session exists:
- Text input for code (e.g., "JUMP-4829")
- "Connect" button
- On submit: connect WebSocket to `wss://relay.jumper.sh/ws/mobile?code=JUMP-4829`
- On `relay.paired` received: store sessionId + token in SecureStore, navigate to index

### New file: `lib/bridge/relay-storage.ts`

SecureStore helpers for relay session (sessionId, sessionToken). Pattern follows existing `storage.ts`.

### Changes to `lib/bridge/bridge-provider.tsx`

- Add `connectionMode: 'direct' | 'relay'` state
- On mount: check for relay session in SecureStore first, then fall back to direct server URL
- **Relay mode connect**: `wss://relay.jumper.sh/ws/mobile?session=X&token=T`
- **Message handling**: In relay mode, handle relay control messages (`relay.peer_connected`, `relay.peer_disconnected`, `relay.error`). Forward all other messages through existing `handleAppMessage` logic
- **Sending**: In relay mode, `ws.send(JSON.stringify(msg))` — no wrapping needed since the DO forwards raw
- **Image uploads**: In relay mode, send `upload-image` message over WS instead of HTTP POST
- New context fields: `connectionMode`, `peerConnected` (bridge online status), `pairWithCode(code)`

### Changes to `app/_layout.tsx`

- Add `pair` screen to Stack
- Startup routing: if no relay session and no direct URL → redirect to `/pair`

### Changes to `app/settings.tsx`

- Show connection mode (relay vs direct)
- Show relay session status
- "Disconnect" button that clears relay session → returns to pair screen

---

## Verification

1. **Relay only**: `cd apps/relay && wrangler dev` — use wscat to simulate bridge + mobile connections, verify pairing and message forwarding
2. **Bridge + Relay**: `RELAY_URL=wss://relay.jumper.sh pnpm -C apps/bridge-server dev` — verify code printed, relay connection established
3. **End-to-end**: Enter code on phone → messages flow → Claude responses stream through relay to phone
4. **Reconnection**: Kill and restart bridge server → phone auto-reconnects via stored session → no re-pairing needed
5. **Reconnection (phone)**: Close and reopen app → auto-reconnects to relay → bridge notified of peer

---

## Implementation order

1. `apps/relay/` — standalone, deploy to Cloudflare
2. `apps/bridge-server/` — extract handler, add relay client, add upload-image WS message
3. `apps/mobile/` — add pair screen, relay connection mode, relay storage
