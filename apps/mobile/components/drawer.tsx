import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useBridge } from '@/lib/bridge/bridge-provider';
import { useDrawer } from '@/lib/drawer-context';
import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';

const DRAWER_ANIMATION_MS = 220;

type DrawerView = 'list' | 'new';

function projectPathKey(projectPath: string): string {
  const trimmed = projectPath.trim();
  if (trimmed === '/' || trimmed === '\\') return '/';
  return trimmed.replace(/[\\/]+$/, '').replace(/\\/g, '/');
}

export function Drawer() {
  const { width } = useWindowDimensions();
  const bridge = useBridge();
  const drawer = useDrawer();
  const [view, setView] = useState<DrawerView>('list');
  const [folderPath, setFolderPath] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserPath, setBrowserPath] = useState<string | null>(null);
  const [browserParentPath, setBrowserParentPath] = useState<string | null>(null);
  const [browserDirectories, setBrowserDirectories] = useState<Array<{ name: string; path: string }>>([]);
  const [browserSuggestedRoots, setBrowserSuggestedRoots] = useState<string[]>([]);
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);

  const panelWidth = Math.min(width * 0.82, 420);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(drawer.isOpen ? 1 : 0, {
      duration: DRAWER_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    if (!drawer.isOpen) {
      setView('list');
      setFolderPath('');
    }
  }, [drawer.isOpen, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.42,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * panelWidth }],
  }));

  const chats = useMemo(
    () =>
      [...bridge.allChats].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [bridge.allChats]
  );

  const projectPathById = useMemo(
    () => Object.fromEntries(bridge.projects.map((project) => [project.id, project.path])),
    [bridge.projects]
  );
  const uniqueProjects = useMemo(() => {
    const sorted = [...bridge.projects].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const uniqueByPath = new Map<string, (typeof sorted)[number]>();
    for (const project of sorted) {
      const key = projectPathKey(project.path);
      if (uniqueByPath.has(key)) continue;
      uniqueByPath.set(key, project);
    }
    return Array.from(uniqueByPath.values());
  }, [bridge.projects]);

  const canStartWithNewFolder = folderPath.trim().length > 0;
  const canSelectBrowserPath = browserPath !== null && browserPath.trim().length > 0;

  const loadFolders = (path?: string) => {
    setIsBrowserLoading(true);
    return bridge
      .listFolders(path)
      .then((result) => {
        setBrowserPath(result.path);
        setBrowserParentPath(result.parentPath);
        setBrowserDirectories(result.directories);
        setBrowserSuggestedRoots(result.suggestedRoots);
      })
      .finally(() => {
        setIsBrowserLoading(false);
      });
  };

  const startWithProject = (projectPath: string) => {
    bridge.startConversation(projectPath);
    drawer.close();
  };

  return (
    <View
      pointerEvents={drawer.isOpen ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 30,
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: '#000000',
          },
          backdropStyle,
        ]}
      >
        <Pressable onPress={drawer.close} style={{ flex: 1 }} />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: panelWidth,
            backgroundColor: '#FAFAF9',
            borderRightWidth: 1,
            borderRightColor: 'rgba(0,0,0,0.08)',
            paddingTop: 64,
            paddingBottom: 16,
          },
          panelStyle,
        ]}
      >
        {view === 'list' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 }}>
              <Text style={{ color: '#1C1917', fontSize: 18, fontWeight: '700' }}>Conversations</Text>
              <Pressable
                onPress={drawer.close}
                style={{ width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E5E4' }}
              >
                <FontAwesome name="close" size={14} color="#57534E" />
              </Pressable>
            </View>

            <View style={{ flex: 1, minHeight: 0 }}>
              <Text
                style={{
                  color: '#78716C',
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  paddingHorizontal: 16,
                  marginBottom: 8,
                }}
              >
                Recent
              </Text>
              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{ paddingHorizontal: 10, rowGap: 6, paddingBottom: 12 }}
              >
                {chats.length === 0 ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                    <Text style={{ color: '#A8A29E', fontSize: 13 }}>No conversations yet.</Text>
                  </View>
                ) : (
                  chats.map((chat) => {
                    const isActive = bridge.activeChatId === chat.id;
                    return (
                      <Pressable
                        key={chat.id}
                        onPress={() => {
                          bridge.selectChat(chat.id);
                          drawer.close();
                        }}
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isActive ? '#B45309' : 'rgba(0,0,0,0.06)',
                          backgroundColor: isActive ? '#FFF7ED' : '#FFFFFF',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          rowGap: 4,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: '#1C1917', fontSize: 14, fontWeight: '600' }}>
                          {chat.title}
                        </Text>
                        <Text numberOfLines={1} style={{ color: '#78716C', fontSize: 12 }}>
                          {projectPathById[chat.projectId] ?? 'Unknown project'}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <Pressable
              onPress={() => {
                bridge.deselectChat();
                drawer.close();
              }}
              style={{
                position: 'absolute',
                bottom: 116,
                right: 16,
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: '#B45309',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              <Feather name="plus" size={24} color="#FFFFFF" />
            </Pressable>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14, columnGap: 12 }}>
              <Pressable
                onPress={() => { setView('list'); setFolderPath(''); }}
                style={{ width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E5E4' }}
              >
                <FontAwesome name="chevron-left" size={12} color="#57534E" />
              </Pressable>
              <Text style={{ color: '#1C1917', fontSize: 18, fontWeight: '700' }}>New Chat</Text>
            </View>

            <View style={{ flex: 1, minHeight: 0 }}>
              {uniqueProjects.length > 0 && (
                <>
                  <Text
                    style={{
                      color: '#78716C',
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      paddingHorizontal: 16,
                      marginBottom: 8,
                    }}
                  >
                    Existing Projects
                  </Text>
                  <ScrollView
                    contentInsetAdjustmentBehavior="automatic"
                    contentContainerStyle={{ paddingHorizontal: 10, rowGap: 6, paddingBottom: 16 }}
                  >
                    {uniqueProjects.map((project) => (
                      <Pressable
                        key={project.id}
                        onPress={() => startWithProject(project.path)}
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(0,0,0,0.06)',
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          rowGap: 2,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: '#1C1917', fontSize: 14, fontWeight: '600' }}>
                          {project.name}
                        </Text>
                        <Text numberOfLines={1} style={{ color: '#78716C', fontSize: 12 }}>
                          {project.path}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text
                style={{
                  color: '#78716C',
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  paddingHorizontal: 16,
                  marginBottom: 8,
                }}
              >
                New Folder
              </Text>
              <View style={{ paddingHorizontal: 12, rowGap: 10 }}>
                <TextInput
                  value={folderPath}
                  onChangeText={setFolderPath}
                  placeholder="~/dev/my-project"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(0,0,0,0.08)',
                    backgroundColor: '#FFFFFF',
                    paddingHorizontal: 12,
                    color: '#1C1917',
                  }}
                />
                <Text
                  style={{
                    color: '#78716C',
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  Use a Mac folder path. `~/...` works.
                </Text>
                <Pressable
                  onPress={() => {
                    setIsBrowserOpen(true);
                    void loadFolders();
                  }}
                  style={{
                    height: 38,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(0,0,0,0.08)',
                    backgroundColor: '#F8F7F5',
                  }}
                >
                  <Text style={{ color: '#1C1917', fontSize: 13, fontWeight: '600' }}>Browse Mac Folders</Text>
                </Pressable>
                <Pressable
                  disabled={!canStartWithNewFolder}
                  onPress={() => {
                    startWithProject(folderPath.trim());
                    setFolderPath('');
                  }}
                  style={{
                    height: 40,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: canStartWithNewFolder ? '#B45309' : '#D6D3D1',
                  }}
                >
                  <Text style={{ color: canStartWithNewFolder ? '#FFFFFF' : '#78716C', fontSize: 14, fontWeight: '700' }}>
                    Start
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        <Pressable
          onPress={() => {
            drawer.close();
            router.navigate('/settings');
          }}
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            marginBottom: 40,
            height: 46,
            borderRadius: 12,
            backgroundColor: '#E7E5E4',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            columnGap: 8,
          }}
        >
          <FontAwesome name="sliders" size={14} color="#44403C" />
          <Text style={{ color: '#1C1917', fontSize: 14, fontWeight: '700' }}>Settings</Text>
        </Pressable>

        {isBrowserOpen ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.3)',
              justifyContent: 'center',
              paddingHorizontal: 10,
              paddingVertical: 24,
            }}
          >
            <View
              style={{
                borderRadius: 16,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.08)',
                maxHeight: '88%',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(0,0,0,0.08)',
                  rowGap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#1C1917', fontSize: 17, fontWeight: '700' }}>Browse Folders</Text>
                  <Pressable
                    onPress={() => setIsBrowserOpen(false)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#E7E5E4',
                    }}
                  >
                    <FontAwesome name="close" size={13} color="#57534E" />
                  </Pressable>
                </View>
                <Text numberOfLines={1} style={{ color: '#78716C', fontSize: 12 }}>
                  {browserPath ?? 'Loading...'}
                </Text>
                {browserSuggestedRoots.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                    {browserSuggestedRoots.map((candidate) => (
                      <Pressable
                        key={candidate}
                        onPress={() => {
                          void loadFolders(candidate);
                        }}
                        style={{
                          maxWidth: '100%',
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: 'rgba(0,0,0,0.08)',
                          backgroundColor: '#F8F7F5',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: '#78716C', fontSize: 10, fontWeight: '600' }}>
                          {candidate}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
                <Pressable
                  disabled={browserParentPath === null || isBrowserLoading}
                  onPress={() => {
                    if (!browserParentPath) return;
                    void loadFolders(browserParentPath);
                  }}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: browserParentPath && !isBrowserLoading ? '#E7E5E4' : '#F5F5F4',
                  }}
                >
                  <Text
                    style={{
                      color: browserParentPath && !isBrowserLoading ? '#1C1917' : '#A8A29E',
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    Up One Level
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!canSelectBrowserPath || isBrowserLoading}
                  onPress={() => {
                    if (!browserPath) return;
                    setFolderPath(browserPath);
                    setIsBrowserOpen(false);
                  }}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: canSelectBrowserPath && !isBrowserLoading ? '#1C1917' : '#D6D3D1',
                  }}
                >
                  <Text
                    style={{
                      color: canSelectBrowserPath && !isBrowserLoading ? '#FFFFFF' : '#78716C',
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    Use This Folder
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, rowGap: 6 }}
              >
                {isBrowserLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#78716C', fontSize: 13 }}>Loading...</Text>
                  </View>
                ) : null}
                {!isBrowserLoading && browserDirectories.length === 0 ? (
                  <View style={{ paddingVertical: 16, paddingHorizontal: 4 }}>
                    <Text style={{ color: '#78716C', fontSize: 12 }}>No subfolders found.</Text>
                  </View>
                ) : null}
                {!isBrowserLoading
                  ? browserDirectories.map((directory) => (
                      <Pressable
                        key={directory.path}
                        onPress={() => {
                          void loadFolders(directory.path);
                        }}
                        style={{
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: 'rgba(0,0,0,0.06)',
                          backgroundColor: '#FAFAF9',
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          rowGap: 2,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: '#1C1917', fontSize: 13, fontWeight: '600' }}>
                          {directory.name}
                        </Text>
                        <Text numberOfLines={1} style={{ color: '#78716C', fontSize: 11 }}>
                          {directory.path}
                        </Text>
                      </Pressable>
                    ))
                  : null}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
