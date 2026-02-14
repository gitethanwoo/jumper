import { Stack, router } from 'expo-router';
import { useState } from 'react';

import { useBridge } from '@/lib/bridge/bridge-provider';
import { Pressable, Text, TextInput, View } from '@/tw';

export default function PairScreen() {
  const bridge = useBridge();
  const [code, setCode] = useState('');
  const normalizedCode = code.trim().toUpperCase();
  const isConnecting = bridge.connectionMode === 'relay' && bridge.status === 'connecting';

  const handleConnect = () => {
    if (normalizedCode.length === 0) throw new Error('Pairing code is required');
    void bridge.pairWithCode(normalizedCode).then(() => {
      router.replace('/');
    });
  };

  return (
    <View className="flex-1 bg-sf-bg px-5 pt-6 gap-5">
      <Stack.Screen options={{ title: 'Connection Code', headerShadowVisible: false }} />

      <View className="gap-2">
        <Text className="text-sf-text text-[22px] font-bold">Connect with code</Text>
        <Text className="text-sf-text-2 text-[14px] leading-5">
          Enter the code shown by npx jumper-app on your Mac.
        </Text>
      </View>

      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">Pairing Code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="JUMP-4829"
          placeholderTextColor="#A8A29E"
          autoCapitalize="characters"
          autoCorrect={false}
          className="h-[44px] rounded-xl px-4 bg-sf-bg text-sf-text text-[16px] border border-sf-sep font-mono"
        />
        <Pressable
          onPress={handleConnect}
          disabled={normalizedCode.length === 0 || isConnecting}
          className={[
            'h-[44px] rounded-xl items-center justify-center',
            normalizedCode.length === 0 || isConnecting ? 'bg-sf-bg-3' : 'bg-sf-text',
          ].join(' ')}
        >
          <Text className={['text-[15px] font-semibold', isConnecting ? 'text-sf-text-3' : 'text-sf-bg'].join(' ')}>
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Text>
        </Pressable>
      </View>

      <View className="rounded-xl bg-sf-bg-2 border border-sf-sep p-3">
        <Text className="text-sf-text-2 text-[12px] leading-5">
          Status: {bridge.status}
        </Text>
      </View>
    </View>
  );
}
