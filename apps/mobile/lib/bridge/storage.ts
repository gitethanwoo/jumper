import * as SecureStore from 'expo-secure-store';

const KEY_SERVER_URL = 'cc_bridge_server_url';

export async function getServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_SERVER_URL, url);
}
