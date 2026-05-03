import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { Stack, router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useBridge } from '@/lib/bridge/bridge-provider';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';

const COMMAND = 'npx jumper-app';

export default function SettingsScreen() {
  const bridge = useBridge();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView> | null>(null);

  const isConnected = bridge.status === 'connected';
  const isConnecting = bridge.status === 'connecting';
  const isRelayMode = bridge.connectionMode === 'relay';
  const shouldCenterOnboarding = !isConnected;
  const isPairing = isRelayMode && bridge.status === 'connecting';

  const normalizedCode = pairingCode.trim().toUpperCase();

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(COMMAND);
    hapticSuccess();
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  const handlePair = () => {
    if (normalizedCode.length === 0) return;
    void bridge.pairWithCode(normalizedCode).then(() => {
      router.replace('/');
    });
  };

  const handleDisconnectRelay = () => {
    void bridge.disconnectRelay();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#FAFAF9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1, backgroundColor: '#FAFAF9' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }}
      >
        <Stack.Screen
          options={{
            title: 'Settings',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: '#FAFAF9' },
          }}
        />

      <View
        style={{
          flexGrow: shouldCenterOnboarding ? 1 : 0,
          justifyContent: shouldCenterOnboarding ? 'center' : 'flex-start',
        }}
      >
        {/* ── Connection status hero ── */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: shouldCenterOnboarding ? 8 : 20,
            paddingBottom: 28,
            alignItems: 'center',
            borderBottomWidth: isConnected ? 1 : 0,
            borderBottomColor: 'rgba(0,0,0,0.05)',
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isConnected ? '#D1FAE5' : isConnecting ? '#FEF3C7' : '#FEE2E2',
              marginBottom: 14,
            }}
          >
            <Feather
              name={isConnected ? 'check-circle' : isConnecting ? 'loader' : 'wifi-off'}
              size={28}
              color={isConnected ? '#059669' : isConnecting ? '#D97706' : '#DC2626'}
            />
          </View>
          <Text
            style={{
              color: '#1C1917',
              fontSize: 24,
              fontWeight: '800',
              letterSpacing: -0.5,
              textAlign: 'center',
              marginBottom: 6,
            }}
          >
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
          </Text>
          <Text
            style={{
              color: '#78716C',
              fontSize: 14,
              lineHeight: 20,
              textAlign: 'center',
              maxWidth: 260,
            }}
          >
            {isConnected
              ? 'Your Mac is linked. You can start sessions from the home screen.'
              : isConnecting
                ? 'Attempting to reach your Mac...'
                : 'Run a quick command on your Mac to get started.'}
          </Text>
        </View>

        {/* ── Setup instructions (only when NOT connected) ── */}
        {!isConnected ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, rowGap: 16 }}>
            {/* Step 1 — command with copy */}
            <View
              style={{
                borderRadius: 16,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.08)',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  columnGap: 12,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 12,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: '#1C1917',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>1</Text>
                </View>
                <Text style={{ color: '#1C1917', fontSize: 16, fontWeight: '700' }}>
                  Run this on your Mac
                </Text>
              </View>
              <Pressable
                onPress={handleCopy}
                style={{
                  marginHorizontal: 16,
                  marginBottom: 16,
                  borderRadius: 12,
                  backgroundColor: '#1C1917',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    color: '#FBBF24',
                    fontSize: 16,
                    fontWeight: '600',
                    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                    letterSpacing: 0.3,
                  }}
                >
                  {COMMAND}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 4 }}>
                  {copied ? (
                    <Feather name="check" size={14} color="#4ADE80" />
                  ) : (
                    <Feather name="copy" size={14} color="#78716C" />
                  )}
                  <Text
                    style={{
                      color: copied ? '#4ADE80' : '#78716C',
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Step 2 — scan QR */}
            <View
              style={{
                borderRadius: 16,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.08)',
                paddingHorizontal: 16,
                paddingVertical: 16,
                rowGap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: '#1C1917',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>2</Text>
                </View>
                <Text style={{ color: '#1C1917', fontSize: 16, fontWeight: '700' }}>
                  Scan the QR code
                </Text>
              </View>
              <Text style={{ color: '#78716C', fontSize: 14, lineHeight: 20, paddingLeft: 40 }}>
                Point your iPhone camera at the QR code shown in your Mac terminal.
              </Text>
            </View>

            {/* ── Can't scan fallback ── */}
            <Pressable
              onPress={() => {
                hapticTap();
                setShowFallback((v) => !v);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                columnGap: 6,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: '#A8A29E', fontSize: 13, fontWeight: '600' }}>
                Can't scan the QR code?
              </Text>
              <Feather
                name={showFallback ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#A8A29E"
              />
            </Pressable>

            {showFallback ? (
              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.08)',
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  rowGap: 12,
                }}
              >
                <Text style={{ color: '#1C1917', fontSize: 15, fontWeight: '700' }}>
                  Enter pairing code
                </Text>
                <Text style={{ color: '#78716C', fontSize: 13, lineHeight: 19 }}>
                  Type the code shown in your Mac terminal (e.g. JUMP-4829). Works over SSH too.
                </Text>
                <TextInput
                  value={pairingCode}
                  onChangeText={setPairingCode}
                  placeholder="JUMP-XXXX"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  selectionColor={colors.tint}
                  keyboardAppearance={colorScheme}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    backgroundColor: '#F5F5F4',
                    color: '#1C1917',
                    fontSize: 18,
                    fontWeight: '700',
                    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                    letterSpacing: 1,
                    textAlign: 'center',
                  }}
                />
                <Pressable
                  onPress={handlePair}
                  disabled={normalizedCode.length === 0 || isPairing}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      normalizedCode.length === 0 || isPairing ? '#E7E5E4' : '#1C1917',
                  }}
                >
                  <Text
                    style={{
                      color: normalizedCode.length === 0 || isPairing ? '#A8A29E' : '#FFFFFF',
                      fontSize: 15,
                      fontWeight: '700',
                    }}
                  >
                    {isPairing ? 'Connecting...' : 'Connect'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ── Advanced settings ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
        <Pressable
          onPress={() => setShowAdvanced((current) => !current)}
          style={{
            height: 48,
            borderRadius: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            columnGap: 8,
            backgroundColor: '#F0EDE9',
          }}
        >
          <Feather name="settings" size={16} color="#78716C" />
          <Text style={{ color: '#57534E', fontSize: 14, fontWeight: '600' }}>
            {showAdvanced ? 'Hide Advanced' : 'Advanced Settings'}
          </Text>
          <Feather
            name={showAdvanced ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#78716C"
          />
        </Pressable>
        {showAdvanced ? (
          <View
            style={{
              marginTop: 12,
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.08)',
              paddingHorizontal: 16,
              paddingVertical: 16,
              rowGap: 12,
            }}
          >
            {isRelayMode ? (
              <Pressable
                onPress={handleDisconnectRelay}
                style={{
                  height: 44,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#DC2626',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                  Disconnect Pairing
                </Text>
              </Pressable>
            ) : null}
            <View style={{ rowGap: 8, paddingTop: 4 }}>
              <Text
                style={{
                  color: '#1C1917',
                  fontSize: 13,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Server URL
              </Text>
              <TextInput
                value={bridge.serverUrl}
                onChangeText={(value) => void bridge.setServerUrl(value)}
                placeholder="ws://hostname:8787/ws"
                placeholderTextColor="#A8A29E"
                selectionColor={colors.tint}
                keyboardAppearance={colorScheme}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => {
                  setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);
                }}
                style={{
                  height: 44,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  backgroundColor: '#F5F5F4',
                  color: '#1C1917',
                  fontSize: 14,
                  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                }}
              />
              <Pressable
                onPress={() => {
                  void bridge.connectDirect();
                }}
                disabled={isConnecting}
                style={{
                  height: 44,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isConnecting ? '#E7E5E4' : '#1C1917',
                }}
              >
                <Text
                  style={{
                    color: isConnecting ? '#A8A29E' : '#FFFFFF',
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Connect to Server'}
                </Text>
              </Pressable>
              <Text style={{ color: '#A8A29E', fontSize: 12 }}>
                Direct WebSocket URL for manual connection.
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
