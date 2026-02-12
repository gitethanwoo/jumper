import * as SecureStore from 'expo-secure-store';

const KEY_SERVER_URL = 'cc_bridge_server_url';
const KEY_TOKEN = 'cc_bridge_token';

export async function getServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_SERVER_URL, url);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_TOKEN);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_TOKEN, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_TOKEN);
}
