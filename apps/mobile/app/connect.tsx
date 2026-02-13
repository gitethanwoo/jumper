import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

import { useBridge } from '@/lib/bridge/bridge-provider';
import { Text, View } from '@/tw';

export default function ConnectScreen() {
  const bridge = useBridge();
  const url = Linking.useURL();

  useEffect(() => {
    if (!url) return;
    void bridge.handleConnectLink(url).then(() => {
      router.replace('/');
    });
  }, [bridge, url]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        backgroundColor: '#FAFAF9',
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={{ color: '#1C1917', fontSize: 22, fontWeight: '700', marginBottom: 10 }}>
        Connecting…
      </Text>
      <Text style={{ color: '#78716C', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
        Applying bridge URL from your QR link.
      </Text>
    </View>
  );
}
