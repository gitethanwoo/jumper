import React, { useMemo, useState } from 'react';
import { Stack, router, type Href } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useBridge } from '@/lib/bridge/bridge-provider';
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';

export default function SettingsScreen() {
  const bridge = useBridge();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isConnected = bridge.status === 'connected';
  const isConnecting = bridge.status === 'connecting';
  const connectPageUrl = useMemo(() => {
    const url = new URL(bridge.serverUrl);
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    url.pathname = '/connect';
    url.search = '';
    return url.toString();
  }, [bridge.serverUrl]);
  const statusLabel = isConnected ? 'Connected' : isConnecting ? 'Connecting' : 'Not connected';

  const handleDisconnectRelay = () => {
    void bridge.disconnectRelay().then(() => {
      router.replace('/pair' as Href);
    });
  };

  return (
    <ScrollView
      className="flex-1 bg-sf-bg"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4 gap-5"
    >
      <Stack.Screen options={{ title: 'Settings', headerShadowVisible: false }} />

      <Text className="text-sf-text-2 text-[14px] leading-5">
        Setup should be simple: run one command on your Mac, then scan a QR code.
      </Text>

      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
          Connect Your Mac
        </Text>
        <Text className="text-sf-text-2 text-[13px]">1) Run this on your Mac</Text>
        <View className="rounded-xl bg-sf-bg border border-sf-sep p-3">
          <Text selectable className="text-sf-text text-[12px] leading-5 font-mono">
            npx jumper-app
          </Text>
        </View>
        <Text className="text-sf-text-2 text-[13px] leading-5">
          2) Scan the QR shown in your Mac terminal with iPhone Camera.
        </Text>
        <Text className="text-sf-text-3 text-[12px] leading-5">
          Optional fallback: if terminal QR rendering is unavailable, open this URL on your Mac.
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
            Status
          </Text>
          <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-sf-bg-3">
            <View
              className={[
                'w-[6px] h-[6px] rounded-full',
                isConnected ? 'bg-sf-teal' : isConnecting ? 'bg-amber-500' : 'bg-sf-red',
              ].join(' ')}
            />
            <Text className="text-sf-text-2 text-[11px] font-semibold">{statusLabel}</Text>
          </View>
        </View>
      </View>

      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Pressable
          onPress={() => setShowAdvanced((current) => !current)}
          className="h-[42px] rounded-xl border border-sf-sep bg-sf-bg items-center justify-center"
        >
          <Text className="text-sf-text text-[14px] font-semibold">
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </Text>
        </Pressable>
        {showAdvanced ? (
          <View className="gap-3">
            <Text className="text-sf-text-3 text-[12px]">
              Only use these if automatic setup is unavailable.
            </Text>
            <Pressable
              onPress={() => {
                router.push('/pair' as Href);
              }}
              className="h-[42px] rounded-xl border border-sf-sep bg-sf-bg items-center justify-center"
            >
              <Text className="text-sf-text text-[14px] font-semibold">Enter Pairing Code Manually</Text>
            </Pressable>
            <Pressable
              onPress={handleDisconnectRelay}
              disabled={bridge.connectionMode !== 'relay'}
              className={[
                'h-[42px] rounded-xl items-center justify-center',
                bridge.connectionMode === 'relay' ? 'bg-sf-red' : 'bg-sf-bg-3',
              ].join(' ')}
            >
              <Text
                className={[
                  'text-[14px] font-semibold',
                  bridge.connectionMode === 'relay' ? 'text-white' : 'text-sf-text-3',
                ].join(' ')}
              >
                Disconnect Pairing
              </Text>
            </Pressable>
            <View className="gap-2">
              <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
                Server URL (Manual)
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
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
