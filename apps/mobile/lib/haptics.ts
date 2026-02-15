import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type ExpoHapticsModule = {
  selectionAsync?: () => Promise<void>;
  impactAsync?: (style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => Promise<void>;
  notificationAsync?: (type: 'success' | 'warning' | 'error') => Promise<void>;
};

const ExpoHaptics = requireOptionalNativeModule<ExpoHapticsModule>('ExpoHaptics');

function isSupported(): boolean {
  return Platform.OS === 'ios' && ExpoHaptics !== null;
}

export function hapticTap(): void {
  const module = ExpoHaptics;
  if (!isSupported() || !module || !module.selectionAsync) return;
  void module.selectionAsync();
}

export function hapticAction(): void {
  const module = ExpoHaptics;
  if (!isSupported() || !module || !module.impactAsync) return;
  void module.impactAsync('light');
}

export function hapticSuccess(): void {
  const module = ExpoHaptics;
  if (!isSupported() || !module || !module.notificationAsync) return;
  void module.notificationAsync('success');
}

export function hapticWarning(): void {
  const module = ExpoHaptics;
  if (!isSupported() || !module || !module.notificationAsync) return;
  void module.notificationAsync('warning');
}
