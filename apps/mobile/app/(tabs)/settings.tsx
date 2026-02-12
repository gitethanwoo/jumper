import React, { useMemo, useState } from 'react';

import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';
import { useBridge } from '@/lib/bridge/bridge-provider';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function SettingsScreen() {
  const [pairingCode, setPairingCode] = useState('');
  const bridge = useBridge();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const canPair = useMemo(() => pairingCode.trim().length > 0, [pairingCode]);
  const isConnected = bridge.status === 'connected';
  const hasToken = bridge.token !== null;

  return (
    <ScrollView
      className="flex-1 bg-sf-bg"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4 gap-5"
    >
      {/* Description */}
      <Text className="text-sf-text-2 text-[14px] leading-5">
        Point this app at your Mac bridge server and pair once to get a long-lived token.
      </Text>

      {/* ── Connection ── */}
      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
            Connection
          </Text>
          <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-sf-bg-3">
            <View
              className={[
                'w-[6px] h-[6px] rounded-full',
                isConnected ? 'bg-sf-teal' : 'bg-sf-red',
              ].join(' ')}
            />
            <Text className="text-sf-text-2 text-[11px] font-semibold">
              {bridge.status}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => bridge.connect()}
            className="flex-1 h-[44px] rounded-xl items-center justify-center bg-sf-amber"
          >
            <Text className="text-white text-[14px] font-bold">Connect</Text>
          </Pressable>
          <Pressable
            onPress={() => bridge.disconnect()}
            className="flex-1 h-[44px] rounded-xl items-center justify-center bg-sf-bg-3"
          >
            <Text className="text-sf-text text-[14px] font-semibold">Disconnect</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Server URL ── */}
      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
          Server URL
        </Text>
        <TextInput
          value={bridge.serverUrl}
          onChangeText={(v) => void bridge.setServerUrl(v)}
          placeholder="wss://your-host/ws"
          placeholderTextColor={colors.tabIconDefault}
          selectionColor={colors.tint}
          keyboardAppearance={colorScheme}
          autoCapitalize="none"
          autoCorrect={false}
          className="h-[44px] rounded-xl px-4 bg-sf-bg text-sf-text text-[15px] border border-sf-sep"
        />
        <Text className="text-sf-text-3 text-[12px]">
          Websocket endpoint, e.g. wss://hostname/ws
        </Text>
      </View>

      {/* ── Pairing ── */}
      <View className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-3">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
          Pairing
        </Text>
        <View className="flex-row gap-2 items-center">
          <TextInput
            value={pairingCode}
            onChangeText={setPairingCode}
            placeholder="6-digit code"
            placeholderTextColor={colors.tabIconDefault}
            selectionColor={colors.tint}
            keyboardAppearance={colorScheme}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            className="flex-1 h-[44px] rounded-xl px-4 bg-sf-bg text-sf-text text-[15px] border border-sf-sep"
          />
          <Pressable
            disabled={!canPair}
            onPress={() => {
              bridge.pair(pairingCode.trim(), 'cc-bridge-mobile');
              setPairingCode('');
            }}
            className={[
              'h-[44px] px-5 rounded-xl items-center justify-center',
              canPair ? 'bg-sf-amber' : 'bg-sf-bg-3',
            ].join(' ')}
          >
            <Text
              className={
                canPair
                  ? 'text-white text-[14px] font-bold'
                  : 'text-sf-text-3 text-[14px] font-semibold'
              }
            >
              Pair
            </Text>
          </Pressable>
        </View>

        <View className="mt-1 gap-1.5">
          <Text className="text-sf-text-3 text-[11px] font-bold uppercase tracking-[0.5px]">
            Token
          </Text>
          <View className="rounded-xl bg-sf-bg border border-sf-sep p-3">
            <Text selectable className="text-sf-text-2 text-[12px] leading-5 font-mono">
              {bridge.token ?? 'Not paired'}
            </Text>
          </View>
        </View>

        <Pressable
          disabled={!hasToken}
          onPress={() => {
            void bridge.clearToken();
          }}
          className={[
            'h-[40px] rounded-xl items-center justify-center',
            hasToken ? 'bg-sf-red' : 'bg-sf-bg-3',
          ].join(' ')}
        >
          <Text
            className={
              hasToken
                ? 'text-white text-[13px] font-semibold'
                : 'text-sf-text-3 text-[13px] font-semibold'
            }
          >
            Clear Saved Token
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
