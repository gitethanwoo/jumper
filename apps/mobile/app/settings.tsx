import React, { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Feather from '@expo/vector-icons/Feather';
import { Stack } from 'expo-router';

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
  const isRelayMode = bridge.connectionMode === 'relay';
  const shouldCenterOnboarding = !isConnected;
  const connectPageUrl = useMemo(() => {
    const url = new URL(bridge.serverUrl);
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    url.pathname = '/connect';
    url.search = '';
    return url.toString();
  }, [bridge.serverUrl]);

  const handleDisconnectRelay = () => {
    void bridge.disconnectRelay();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#FAFAF9' }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}
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
          {/* Step 1 */}
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
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 16,
                borderRadius: 12,
                backgroundColor: '#1C1917',
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <Text
                selectable
                style={{
                  color: '#FBBF24',
                  fontSize: 16,
                  fontWeight: '600',
                  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                  letterSpacing: 0.3,
                }}
              >
                npx jumper-app
              </Text>
            </View>
          </View>

          {/* Step 2 */}
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

          {/* Fallback */}
          <View
            style={{
              borderRadius: 14,
              backgroundColor: '#F5F5F4',
              paddingHorizontal: 16,
              paddingVertical: 14,
              rowGap: 8,
            }}
          >
            <Text style={{ color: '#A8A29E', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Alternative
            </Text>
            <Text style={{ color: '#78716C', fontSize: 13, lineHeight: 19 }}>
              If QR scanning isn't working, open this URL on your Mac:
            </Text>
            <View
              style={{
                borderRadius: 10,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.06)',
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                selectable
                style={{
                  color: '#57534E',
                  fontSize: 12,
                  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                }}
              >
                {connectPageUrl}
              </Text>
            </View>
          </View>

          <View
            style={{
              borderRadius: 14,
              backgroundColor: '#EFF6FF',
              borderWidth: 1,
              borderColor: '#BFDBFE',
              paddingHorizontal: 16,
              paddingVertical: 14,
              rowGap: 8,
            }}
          >
            <Text
              style={{
                color: '#1E3A8A',
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Away from Your Mac? (Tailscale/VPN)
            </Text>
            <Text style={{ color: '#1E40AF', fontSize: 13, lineHeight: 19 }}>
              If you started Jumper over SSH, use a reachable host and connect directly.
            </Text>
            <View
              style={{
                borderRadius: 10,
                backgroundColor: '#DBEAFE',
                borderWidth: 1,
                borderColor: '#93C5FD',
                paddingHorizontal: 12,
                paddingVertical: 10,
                rowGap: 6,
              }}
            >
              <Text
                selectable
                style={{
                  color: '#1E3A8A',
                  fontSize: 12,
                  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                }}
              >
                PUBLIC_HOST=mac-studio npx jumper-app
              </Text>
              <Text
                selectable
                style={{
                  color: '#1E3A8A',
                  fontSize: 12,
                  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                }}
              >
                ws://mac-studio:8787/ws
              </Text>
            </View>
            <Text style={{ color: '#1E40AF', fontSize: 12, lineHeight: 18 }}>
              In Jumper, open Advanced Settings and paste that ws URL into Server URL.
            </Text>
          </View>
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
            <Text style={{ color: '#A8A29E', fontSize: 12 }}>
              Only use these if automatic setup is unavailable.
            </Text>
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
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  Disconnect Pairing
                </Text>
              </Pressable>
            ) : null}
            <View style={{ rowGap: 8, paddingTop: 4 }}>
              <Text style={{ color: '#1C1917', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
              <Text style={{ color: '#A8A29E', fontSize: 12 }}>
                WebSocket endpoint, e.g. ws://hostname:8787/ws or ws://mac-studio:8787/ws (Tailscale)
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
