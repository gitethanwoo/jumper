import { ExtensionStorage } from '@bacons/apple-targets';
import { Platform } from 'react-native';

const APP_GROUP = 'group.com.ethanwoo.ccbridge';

export const SHARED_BRIDGE_SERVER_URL_KEY = 'bridge_server_url';

const storage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;

export function setSharedBridgeServerUrl(serverUrl: string): void {
  if (!storage) return;
  storage.set(SHARED_BRIDGE_SERVER_URL_KEY, serverUrl);
}
