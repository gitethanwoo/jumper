import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Feather from '@expo/vector-icons/Feather';
import Markdown, { type MarkdownProps } from 'react-native-markdown-display';
import * as ImagePicker from 'expo-image-picker';

import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';
import { useBridge } from '@/lib/bridge/bridge-provider';
import Colors from '@/constants/Colors';
import { parseToolRuns } from '@/lib/bridge/tool-runs';
import { ToolRunBlock } from '@/components/tool-run-block';

const AUTO_SCROLL_THRESHOLD = 72;

type PendingImage = {
  uri: string;
  fileName: string;
  mimeType: string;
};

export default function ChatScreen() {
  const bridge = useBridge();
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const colors = Colors.light;
  const palette = useMemo(
    () => ({
      background: '#FAFAF9',
      surface: '#F0EDE9',
      surfaceStrong: '#E4E1DC',
      border: 'rgba(0,0,0,0.08)',
      text: '#1C1917',
      textMuted: '#78716C',
      textSubtle: '#A8A29E',
    }),
    []
  );
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const prevContentKeyRef = useRef<string | null>(null);

  const canSend = useMemo(
    () => (draft.trim().length > 0 || pendingImage !== null) && !isUploadingImage,
    [draft, isUploadingImage, pendingImage]
  );
  const chatId = bridge.activeChatId;
  const messages = chatId ? bridge.messagesByChatId[chatId] ?? [] : [];
  const events = chatId ? bridge.eventsByChatId[chatId] ?? [] : [];
  const toolRuns = useMemo(() => parseToolRuns(events), [events]);
  const userMessages = useMemo(() => messages.filter((m) => m.role === 'user'), [messages]);
  const assistantMessages = useMemo(() => messages.filter((m) => m.role === 'assistant'), [messages]);
  const turnCount = Math.max(userMessages.length, assistantMessages.length, toolRuns.length);
  const lastAssistantLength = assistantMessages.at(-1)?.text.length ?? 0;
  const toolProgressKey = useMemo(
    () =>
      toolRuns
        .map((run) =>
          run.tools
            .map((tool) => `${tool.id}:${tool.status}:${tool.output?.length ?? 0}`)
            .join(';')
        )
        .join('|'),
    [toolRuns]
  );
  const contentKey = `${messages.length}:${lastAssistantLength}:${toolProgressKey}`;
  const markdownStyle = useMemo<NonNullable<MarkdownProps['style']>>(
    () => ({
      body: {
        marginTop: 0,
        marginBottom: 0,
        color: '#1C1917',
        fontSize: 16,
        lineHeight: 24,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 14,
      },
      heading1: {
        color: '#0C0A09',
        fontSize: 26,
        lineHeight: 32,
        fontWeight: '700',
        marginTop: 4,
        marginBottom: 12,
      },
      heading2: {
        color: '#0C0A09',
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700',
        marginTop: 4,
        marginBottom: 10,
      },
      heading3: {
        color: '#0C0A09',
        fontSize: 19,
        lineHeight: 25,
        fontWeight: '700',
        marginTop: 4,
        marginBottom: 10,
      },
      link: {
        color: '#B45309',
        textDecorationLine: 'underline',
      },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: '#D6D3D1',
        backgroundColor: '#F5F5F4',
        marginTop: 6,
        marginBottom: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
      },
      code_inline: {
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
        color: '#92400E',
        backgroundColor: '#E7E5E4',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      },
      code_block: {
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
        color: '#292524',
        backgroundColor: '#F5F5F4',
        borderRadius: 10,
        padding: 12,
        marginTop: 4,
        marginBottom: 12,
      },
      fence: {
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
        color: '#292524',
        backgroundColor: '#F5F5F4',
        borderRadius: 10,
        padding: 12,
        marginTop: 4,
        marginBottom: 12,
      },
      bullet_list: {
        marginTop: 2,
        marginBottom: 12,
      },
      ordered_list: {
        marginTop: 2,
        marginBottom: 12,
      },
      list_item: {
        marginBottom: 6,
      },
      hr: {
        backgroundColor: '#D6D3D1',
        height: 1,
        marginVertical: 12,
      },
      table: {
        borderWidth: 1,
        borderColor: '#D6D3D1',
        borderRadius: 8,
        marginBottom: 12,
      },
      th: {
        backgroundColor: '#E7E5E4',
        color: '#1C1917',
        paddingVertical: 8,
        paddingHorizontal: 10,
      },
      td: {
        color: '#1C1917',
        paddingVertical: 8,
        paddingHorizontal: 10,
      },
      strong: {
        color: '#0C0A09',
        fontWeight: '700',
      },
      em: {
        color: '#44403C',
      },
    }),
    []
  );
  const composerContainerStyle = useMemo(
    () => ({
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 5,
      borderWidth: 0.5,
      borderColor: 'rgba(0,0,0,0.06)',
    }),
    []
  );

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Photo library permission not granted');

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.92,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    setPendingImage({
      uri: asset.uri,
      fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }, []);

  const scrollToLatest = useCallback((animated: boolean) => {
    scrollRef.current?.scrollToEnd({ animated });
    setAutoFollow(true);
    setShowJumpToLatest(false);
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const nearBottom = distanceToBottom <= AUTO_SCROLL_THRESHOLD;

      if (nearBottom) {
        setAutoFollow(true);
        setShowJumpToLatest(false);
        return;
      }

      setAutoFollow(false);
    },
    []
  );

  useEffect(() => {
    if (!chatId) return;
    prevContentKeyRef.current = null;
    setAutoFollow(true);
    setShowJumpToLatest(false);
    const timeout = setTimeout(() => {
      scrollToLatest(false);
    }, 0);
    return () => {
      clearTimeout(timeout);
    };
  }, [chatId, scrollToLatest]);

  useEffect(() => {
    if (!chatId) return;
    const prev = prevContentKeyRef.current;
    prevContentKeyRef.current = contentKey;
    if (prev === null || prev === contentKey) return;

    if (autoFollow) {
      const timeout = setTimeout(() => {
        scrollToLatest(false);
      }, 0);
      return () => {
        clearTimeout(timeout);
      };
    }

    setShowJumpToLatest(true);
  }, [autoFollow, chatId, contentKey, scrollToLatest]);

  /* ── Empty state ── */
  if (!chatId) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 40,
          backgroundColor: palette.background,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            backgroundColor: palette.surface,
          }}
        >
          <FontAwesome name="comments" size={26} color={colors.tint} />
        </View>
        <Text
          style={{
            color: palette.text,
            fontSize: 20,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          No Active Chat
        </Text>
        <Text
          style={{
            color: palette.textMuted,
            fontSize: 15,
            lineHeight: 24,
            textAlign: 'center',
          }}
        >
          Head to Projects to create a project{'\n'}and start a conversation.
        </Text>
      </View>
    );
  }

  /* ── Active chat ── */
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: palette.background }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, rowGap: 8 }}
          scrollEventThrottle={16}
          onScroll={onScroll}
        >
          {/* Status pill */}
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                columnGap: 6,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: palette.surface,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: bridge.status === 'connected' ? '#0D9488' : '#A8A29E',
                }}
              />
              <Text
                style={{
                  color: palette.textSubtle,
                  fontSize: 11,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {bridge.status}
              </Text>
            </View>
          </View>

          {Array.from({ length: turnCount }).map((_, index) => {
            const user = userMessages[index];
            const assistant = assistantMessages[index];
            const run = toolRuns[index];

            return (
              <View key={`turn:${index}`} style={{ rowGap: 8 }}>
                {user ? (
                  <View
                    style={{
                      maxWidth: '85%',
                      marginLeft: 'auto',
                      backgroundColor: '#B45309',
                      borderTopLeftRadius: 20,
                      borderTopRightRadius: 20,
                      borderBottomLeftRadius: 20,
                      borderBottomRightRadius: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <Text selectable style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 22 }}>
                      {user.text}
                    </Text>
                  </View>
                ) : null}

                {run && run.tools.length > 0 ? <ToolRunBlock run={run} /> : null}

                {assistant ? (
                  <View style={{ width: '100%', paddingVertical: 4 }}>
                    <Markdown style={markdownStyle}>{assistant.text}</Markdown>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        {/* Input bar */}
        <View
          style={{
            paddingHorizontal: 12,
            paddingBottom: 28,
            paddingTop: 8,
            backgroundColor: palette.background,
          }}
        >
          {pendingImage ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
                padding: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
                <Image
                  source={{ uri: pendingImage.uri }}
                  style={{ width: 52, height: 52, borderRadius: 10 }}
                  resizeMode="cover"
                />
                <View style={{ flex: 1, rowGap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}
                  >
                    {pendingImage.fileName}
                  </Text>
                  <Text style={{ color: palette.textSubtle, fontSize: 11 }}>
                    Uploads when you send
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPendingImage(null)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: palette.surfaceStrong,
                  }}
                >
                  <FontAwesome name="close" size={14} color={colors.tabIconDefault} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {showJumpToLatest ? (
            <View style={{ alignItems: 'center', paddingBottom: 8 }}>
              <Pressable
                onPress={() => scrollToLatest(true)}
                style={{
                  height: 34,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                }}
              >
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>
                  New messages ↓
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={composerContainerStyle}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message Claude…"
              placeholderTextColor={colors.tabIconDefault}
              selectionColor={colors.tint}
              keyboardAppearance="light"
              multiline
              style={{
                color: palette.text,
                maxHeight: 120,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 14,
                fontSize: 16,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 8,
                paddingBottom: 8,
              }}
            >
              <Pressable
                disabled={isUploadingImage}
                onPress={() => {
                  void pickImage();
                }}
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather
                  name="plus"
                  size={22}
                  color={colors.text}
                />
              </Pressable>
              <Pressable
                disabled={!canSend}
                onPress={() => {
                  const text = draft.trim();
                  if (!pendingImage) {
                    setDraft('');
                    bridge.sendToActiveChat(text);
                    scrollToLatest(true);
                    return;
                  }

                  setIsUploadingImage(true);
                  void bridge
                    .uploadImageForActiveChat({
                      uri: pendingImage.uri,
                      fileName: pendingImage.fileName,
                      mimeType: pendingImage.mimeType,
                    })
                    .then((attachment) => {
                      setDraft('');
                      setPendingImage(null);
                      bridge.sendToActiveChat(text, [attachment]);
                      scrollToLatest(true);
                    })
                    .finally(() => {
                      setIsUploadingImage(false);
                    });
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: canSend ? '#B45309' : palette.surfaceStrong,
                }}
              >
                <Feather
                  name="arrow-up"
                  size={18}
                  color={canSend ? '#FFFFFF' : colors.tabIconDefault}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
