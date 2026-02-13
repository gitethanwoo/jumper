import React, { useMemo } from 'react';
import { Stack } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useBridge } from '@/lib/bridge/bridge-provider';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function SettingsScreen() {
  const bridge = useBridge();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isConnected = bridge.status === 'connected';
  const connectPageUrl = useMemo(() => {
    const url = new URL(bridge.serverUrl);
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    url.pathname = '/connect';
    url.search = '';
    return url.toString();
  }, [bridge.serverUrl]);

  return (
    <ScrollView
      className="flex-1 bg-sf-bg"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4 gap-5"
    >
      <Stack.Screen options={{ title: 'Settings', headerShadowVisible: false }} />

      <Text className="text-sf-text-2 text-[14px] leading-5">
        Configure onboarding and the bridge server URL. The app reconnects automatically.
      </Text>

      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
          Quick Connect
        </Text>
        <Text className="text-sf-text-2 text-[13px] leading-5">
          Open this URL on your Mac, then scan the QR with iPhone Camera.
        </Text>
        <View className="rounded-xl bg-sf-bg border border-sf-sep p-3">
          <Text selectable className="text-sf-text-2 text-[12px] leading-5 font-mono">
            {connectPageUrl}
          </Text>
        </View>
      </View>

      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
            Connection
          </Text>
          <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-sf-bg-3">
            <View
              className={['w-[6px] h-[6px] rounded-full', isConnected ? 'bg-sf-teal' : 'bg-sf-red'].join(
                ' '
              )}
            />
            <Text className="text-sf-text-2 text-[11px] font-semibold">{bridge.status}</Text>
          </View>
        </View>
      </View>

      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
          Server URL
        </Text>
        <TextInput
          value={bridge.serverUrl}
          onChangeText={(value) => void bridge.setServerUrl(value)}
          placeholder="ws://hostname:8787/ws"
          placeholderTextColor={colors.tabIconDefault}
          selectionColor={colors.tint}
          keyboardAppearance={colorScheme}
          autoCapitalize="none"
          autoCorrect={false}
          className="h-[44px] rounded-xl px-4 bg-sf-bg text-sf-text text-[15px] border border-sf-sep"
        />
        <Text className="text-sf-text-3 text-[12px]">WebSocket endpoint, e.g. ws://hostname:8787/ws</Text>
      </View>
    </ScrollView>
  );
}
