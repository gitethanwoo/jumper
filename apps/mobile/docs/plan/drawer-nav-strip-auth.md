# Replace Tabs with Drawer Navigation + Strip Auth

## Context
The app currently uses 3-tab bottom navigation (Chat, Projects, Settings) and a pairing/token auth flow. Since the app runs behind Tailscale, auth is unnecessary. The user wants:
- Left-side drawer menu (hamburger button top-left) instead of tabs
- Type any folder path to start a conversation
- Recent conversations in the drawer sidebar
- Settings accessible from the drawer
- No more pairing/token ceremony

---

## 1. Server: Remove auth, support path-based projects, list all chats

### `apps/bridge-server/src/types.ts`
- `ProjectsCreateMessage`: add optional `path?: string` field
- `ChatsListMessage`: make `projectId` optional (omit = return all chats)
- Remove `AuthMessage` and `PairMessage` types from `ClientToServer`
- Remove `Authed` and `Paired` types from `ServerToClient`

### `apps/bridge-server/src/index.ts`
- **Remove auth gate**: remove the `conn.authed` check — accept all messages after connection
- **Remove pairing handler**: delete `pair` and `auth` message handlers
- **`projects.create`**: if `msg.path` is provided, use it directly (create dir if needed) instead of slugifying name into `PROJECTS_ROOT`
- **`chats.list`**: if no `projectId`, return all chats (remove the `.filter`)

---

## 2. Mobile: Remove auth state from bridge provider

### `lib/bridge/bridge-provider.tsx`
- Remove `token` state, `pair()`, `clearToken()`, `auth` message sending
- Remove secure store reads/writes for token
- Remove extension storage token sync
- Auto-connect on mount (no token needed)
- On connect: immediately send `projects.list` and `chats.list` (no projectId) to load everything
- Store `allChats: Chat[]` (all chats across projects) from the no-projectId `chats.list` response
- Add `startConversation(folderPath: string)` method:
  1. Send `projects.create` with `path` and `name` (basename of path)
  2. On result, send `chats.create` with the new project's ID and a default title
  3. Select the new chat
- Remove `pair`, `clearToken` from `BridgeState` type

### `lib/bridge/types.ts`
- Add optional `path` to `projects.create` client message
- Make `projectId` optional in `chats.list` client message
- Remove `auth` and `pair` from `ClientToServer`
- Remove `authed` and `paired` from `ServerToClient`

### `lib/bridge/storage.ts`
- Remove token storage functions (keep server URL)

### `lib/bridge/extension-storage.ts`
- Remove token-related extension storage functions

---

## 3. Mobile: Replace tab navigation with stack + custom drawer

### Delete
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/projects.tsx` (functionality moves into drawer)
- `app/(tabs)/settings.tsx`

### Create `components/drawer.tsx`
Custom animated drawer overlay using `react-native-reanimated`:
- Semi-transparent backdrop (tap to close)
- Panel slides in from left (~80% screen width)
- **Top section**: "New Conversation" — text input for folder path + start button
- **Middle section**: scrollable list of recent conversations (all chats, newest first), each showing title + project path. Tap to select chat and close drawer
- **Bottom section**: "Settings" row — navigates to settings screen

### Create `lib/drawer-context.tsx`
Simple React context: `{ isOpen, open, close, toggle }`

### Create `app/index.tsx` (main chat screen)
- Move from `app/(tabs)/index.tsx`
- Add hamburger menu button in top-left (via `headerLeft` or custom header)
- Show active project path in header subtitle
- Remove tab-specific code

### Create `app/settings.tsx`
- Move from `app/(tabs)/settings.tsx`
- Remove pairing section entirely
- Keep: connection status, server URL, connect/disconnect buttons

### Modify `app/_layout.tsx`
- Remove `(tabs)` stack screen reference
- Add `index` and `settings` as stack screens
- Wrap with `DrawerProvider`
- Render `<Drawer />` as overlay sibling to `<Stack />`
- Keep `modal` route

---

## 4. Key files reference

| File | Action |
|------|--------|
| `apps/bridge-server/src/index.ts` | Remove auth, support path, list all chats |
| `apps/bridge-server/src/types.ts` | Update message types |
| `apps/mobile/app/_layout.tsx` | Stack layout + drawer overlay |
| `apps/mobile/app/index.tsx` | Chat screen (from tabs) |
| `apps/mobile/app/settings.tsx` | Simplified settings (from tabs) |
| `apps/mobile/app/(tabs)/` | Delete entire directory |
| `apps/mobile/components/drawer.tsx` | New custom drawer component |
| `apps/mobile/lib/drawer-context.tsx` | New drawer state context |
| `apps/mobile/lib/bridge/bridge-provider.tsx` | Remove auth, add startConversation |
| `apps/mobile/lib/bridge/types.ts` | Update protocol types |
| `apps/mobile/lib/bridge/storage.ts` | Remove token functions |
| `apps/mobile/lib/bridge/extension-storage.ts` | Remove token functions |

---

## Verification
1. `cd apps/bridge-server && npm run dev` — server starts without errors
2. `cd apps/mobile && npx expo start` — app builds
3. Hamburger button opens drawer, tapping backdrop closes it
4. Type a folder path → new conversation starts → chat is active
5. Recent conversations appear in drawer, tapping one loads history
6. Settings accessible from drawer, shows server URL + connect/disconnect (no pairing)
