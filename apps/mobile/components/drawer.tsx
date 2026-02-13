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

export function Drawer() {
  const { width } = useWindowDimensions();
  const bridge = useBridge();
  const drawer = useDrawer();
  const [view, setView] = useState<DrawerView>('list');
  const [folderPath, setFolderPath] = useState('');

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

  const canStartWithNewFolder = folderPath.trim().length > 0;

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
              onPress={() => setView('new')}
              style={{
                position: 'absolute',
                bottom: 76,
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
              {bridge.projects.length > 0 && (
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
                    {bridge.projects.map((project) => (
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
                  placeholder="/Users/you/dev/my-project"
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
            height: 46,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.07)',
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            columnGap: 8,
          }}
        >
          <FontAwesome name="sliders" size={14} color="#57534E" />
          <Text style={{ color: '#1C1917', fontSize: 14, fontWeight: '600' }}>Settings</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
