import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';

import { useBridge } from '@/lib/bridge/bridge-provider';
import { Text, View } from '@/tw';

export default function ConnectScreen() {
  const bridge = useBridge();
  const url = Linking.useURL();
  const handledRef = useRef(false);
  const params = useLocalSearchParams<{ server?: string | string[] }>();

  useEffect(() => {
    if (handledRef.current) return;

    const serverParam = Array.isArray(params.server) ? params.server[0] : params.server;
    const fallbackFromParams =
      typeof serverParam === 'string' && serverParam.length > 0
        ? `jumper://connect?server=${encodeURIComponent(serverParam)}`
        : null;
    const connectUrl = url ?? fallbackFromParams;
    if (!connectUrl) return;

    handledRef.current = true;
    void bridge.handleConnectLink(connectUrl).then(() => {
      router.replace('/');
    });
  }, [bridge, params.server, url]);

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
        Applying your Jumper link. This should take a second.
      </Text>
    </View>
  );
}
