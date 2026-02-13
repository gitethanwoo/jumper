# cc-bridge

cc-bridge is a mobile client for Claude Code. It pairs a local Node.js bridge server — which spawns the `claude` CLI in headless JSON-streaming mode — with an Expo/React Native iOS app that connects over WebSocket, letting you chat with Claude about any project folder on your Mac from your phone. You create projects by pointing at a local directory, start conversations within them, and get real-time streamed responses with full tool-run visibility, markdown rendering, and image attachments, all routed through `ws://your-mac:8787/ws`.

## Run The Bridge Server

```sh
cd /Users/ethanwoo/dev/cc-bridge
pnpm -C apps/bridge-server dev
```

The server prints:

- pairing code (6 digits)
- projects root (defaults to `~/dev/cc-bridge-projects`)
- websocket URL (`ws://127.0.0.1:8787/ws`)

## Run The Mobile App

```sh
cd /Users/ethanwoo/dev/cc-bridge
pnpm -C apps/mobile start
```

Open in Expo Go or iOS Simulator.

## Connect From The App

1. Go to the Settings tab.
2. Set `Server URL` to your reachable websocket endpoint (defaults to `wss://`).
   - For local dev, use `ws://127.0.0.1:8787/ws` (Simulator) or proxy via Tailscale/HTTPS for a real phone.
3. Enter the pairing code printed by the server and press Pair.
4. Create a project and chat in the Projects tab.
5. Switch to Chat tab and send a message.

