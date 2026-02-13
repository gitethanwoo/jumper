# Relay Next Steps (Bridge + Mobile + E2E)

## Current State

- `apps/relay` exists and typechecks.
- Cloudflare Worker + Durable Object routing is implemented.
- Pairing control messages were fixed to include per-side role and `sessionId`.
- Bridge server and mobile app still need relay mode integration.

## Goal

Ship a working remote connection flow where:

1. Bridge starts and prints a pairing code.
2. Mobile pairs once with the code.
3. Both reconnect automatically on future launches using stored session credentials.
4. Chat + image upload work over relay (no direct HTTP dependency for uploads in relay mode).

## Scope of Remaining Work

## 1) Bridge Server (`apps/bridge-server`)

- Add `src/relay-client.ts`:
  - Connect to `RELAY_URL/ws/bridge`.
  - Handle registration vs reconnect query params.
  - Parse relay control messages:
    - `relay.registered`
    - `relay.paired`
    - `relay.reconnected`
    - `relay.peer_connected`
    - `relay.peer_disconnected`
    - `relay.error`
  - Forward non-relay messages as raw app protocol payloads.
  - Reconnect with fixed backoff (3s).

- Extend `src/types.ts`:
  - `ClientToServer` add:
    - `{ type: "upload-image"; chatId: string; fileName: string; mimeType: string; base64: string }`
  - `ServerToClient` add:
    - `{ type: "upload-image.result"; attachment: ChatAttachment }`

- Refactor `src/index.ts`:
  - Extract current WS message switch into `handleClientMessage(msg, reply)`.
  - Keep existing local `/ws` behavior unchanged by using same handler.
  - Add `upload-image` message handling in WS path (reuse `/upload-image` logic).
  - If `RELAY_URL` is set:
    - Load relay session from state helpers.
    - Start `RelayClient`.
    - Persist `{ sessionId, sessionToken }` after pairing.
    - Route relay payload messages through `handleClientMessage`.
    - Print pairing code in terminal when received.

- Extend `src/state.ts`:
  - `loadRelaySession()`
  - `saveRelaySession()`
  - `clearRelaySession()` (optional but useful for recovery)

## 2) Mobile (`apps/mobile`)

- Add `lib/bridge/relay-storage.ts` with SecureStore helpers:
  - `getRelaySession()`
  - `setRelaySession()`
  - `clearRelaySession()`

- Extend `lib/bridge/types.ts`:
  - Add `upload-image` / `upload-image.result`.
  - Add relay control message union types for parsing.

- Update `lib/bridge/bridge-provider.tsx`:
  - Add `connectionMode: "direct" | "relay"`.
  - Add `peerConnected` state.
  - Add `pairWithCode(code)` action.
  - Startup behavior:
    - If relay session exists, connect to `wss://relay.jumper.sh/ws/mobile?session=...&token=...`.
    - Else continue existing direct mode behavior.
  - Message handling:
    - Handle relay control messages explicitly.
    - Pass non-relay payloads to existing app message handling.
  - Upload behavior:
    - Direct mode: keep existing HTTP `/upload-image`.
    - Relay mode: send WS `upload-image`, await `upload-image.result`.

- Add `app/pair.tsx`:
  - Code input + connect button.
  - Calls `pairWithCode`.
  - On success, route to `/`.

- Update `app/_layout.tsx`:
  - Register `pair` route.
  - Redirect strategy:
    - If relay mode expected and no session/direct URL available, go to `/pair`.

- Update `app/settings.tsx`:
  - Show mode/status.
  - Show relay peer connection state.
  - Add “Disconnect relay” action (clear relay session, route to pair screen).

## 3) Cloudflare Setup + Deploy

- Confirm `apps/relay/wrangler.toml` KV namespace ID is real (not placeholder).
- Run:
  - `pnpm -C apps/relay install`
  - `pnpm -C apps/relay typecheck`
  - `pnpm -C apps/relay deploy`
- Bind custom domain `relay.jumper.sh` to deployed worker if not already active.

## 4) End-to-End Test Plan

## Local relay validation

1. Run `pnpm -C apps/relay dev`.
2. Simulate bridge/mobile websocket clients.
3. Verify:
   - `relay.registered` includes `code` + `sessionId`.
   - `relay.paired` includes `sessionId` + `sessionToken` and correct per-recipient `role`.
   - Raw message forwarding works.

## Bridge + relay validation

1. Run bridge with relay env:
   - `RELAY_URL=wss://relay.jumper.sh pnpm -C apps/bridge-server dev`
2. Verify:
   - Pairing code prints.
   - `~/.cc-bridge/relay-session.json` is created after pairing.
   - Bridge reconnect uses saved session/token after restart.

## Mobile + relay validation

1. Fresh install or clear relay session.
2. Pair using code.
3. Verify:
   - Relay session stored in SecureStore.
   - Reopen app auto-reconnects without re-pairing.
   - Settings shows relay mode and peer status.

## Functional validation

1. Send chat prompt from mobile in relay mode.
2. Verify streaming Claude events appear in UI.
3. Upload image from mobile in relay mode.
4. Verify attachment round-trip and Claude receives attachment path.

## Failure/recovery validation

1. Kill bridge while mobile connected.
2. Confirm mobile sees `peer_disconnected`.
3. Restart bridge.
4. Confirm mobile sees `peer_connected` and chat works without re-pairing.

## Exit Criteria

- Relay deploy is healthy at `/health`.
- Bridge and mobile both reconnect via stored session credentials.
- Chat + image upload work over relay mode.
- No regression in direct mode behavior.
