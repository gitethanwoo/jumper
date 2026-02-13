import * as SecureStore from 'expo-secure-store';

const KEY_RELAY_SESSION_ID = 'cc_bridge_relay_session_id';
const KEY_RELAY_SESSION_TOKEN = 'cc_bridge_relay_session_token';

export type RelaySession = {
  sessionId: string;
  sessionToken: string;
};

export async function getRelaySession(): Promise<RelaySession | null> {
  const sessionId = await SecureStore.getItemAsync(KEY_RELAY_SESSION_ID);
  const sessionToken = await SecureStore.getItemAsync(KEY_RELAY_SESSION_TOKEN);
  if (!sessionId || !sessionToken) return null;
  return { sessionId, sessionToken };
}

export async function setRelaySession(session: RelaySession): Promise<void> {
  await SecureStore.setItemAsync(KEY_RELAY_SESSION_ID, session.sessionId);
  await SecureStore.setItemAsync(KEY_RELAY_SESSION_TOKEN, session.sessionToken);
}

export async function clearRelaySession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_RELAY_SESSION_ID);
  await SecureStore.deleteItemAsync(KEY_RELAY_SESSION_TOKEN);
}
