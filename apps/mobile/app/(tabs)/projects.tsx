import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Pressable, ScrollView, Text, TextInput, View } from '@/tw';
import { useBridge } from '@/lib/bridge/bridge-provider';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function ProjectsScreen() {
  const [name, setName] = useState('');
  const [chatTitle, setChatTitle] = useState('');
  const bridge = useBridge();
  const projectId = bridge.activeProjectId;
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const canCreate = useMemo(() => name.trim().length > 0, [name]);
  const canCreateChat = useMemo(() => chatTitle.trim().length > 0, [chatTitle]);

  useEffect(() => {
    if (bridge.status === 'connected') bridge.listProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.status]);

  return (
    <ScrollView
      className="flex-1 bg-sf-bg"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4 gap-5"
    >
      {/* Description */}
      <Text className="text-sf-text-2 text-[14px] leading-5">
        Projects live on your Mac. Create one to allocate a folder and start a Claude session.
      </Text>

      {/* ── Create Project ── */}
      <View className="gap-3 rounded-2xl bg-sf-bg-2 border border-sf-sep p-4">
        <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
          New Project
        </Text>
        <View className="flex-row gap-2 items-center">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="project-name"
            placeholderTextColor={colors.tabIconDefault}
            selectionColor={colors.tint}
            keyboardAppearance={colorScheme}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 h-[44px] rounded-xl px-4 bg-sf-bg text-sf-text text-[15px] border border-sf-sep"
          />
          <Pressable
            disabled={!canCreate}
            onPress={() => {
              const projectName = name.trim();
              setName('');
              bridge.createProject(projectName);
            }}
            className={[
              'h-[44px] w-[44px] rounded-xl items-center justify-center',
              canCreate ? 'bg-sf-amber' : 'bg-sf-bg-3',
            ].join(' ')}
          >
            <FontAwesome
              name="plus"
              size={16}
              color={canCreate ? '#FFFFFF' : colors.tabIconDefault}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Project List ── */}
      {bridge.projects.length === 0 ? (
        <View className="py-8 items-center gap-3">
          <View className="w-14 h-14 rounded-2xl bg-sf-bg-2 items-center justify-center">
            <FontAwesome name="folder-open" size={22} color={colors.tabIconDefault} />
          </View>
          <Text className="text-sf-text-3 text-[14px]">No projects yet</Text>
        </View>
      ) : (
        <View className="gap-2">
          {bridge.projects.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => bridge.selectProject(p.id)}
              className={[
                'rounded-2xl border p-4 gap-1',
                bridge.activeProjectId === p.id
                  ? 'bg-sf-bg-2 border-sf-amber'
                  : 'bg-sf-bg-2 border-sf-sep',
              ].join(' ')}
            >
              <View className="flex-row items-center gap-2">
                <FontAwesome
                  name="folder"
                  size={14}
                  color={bridge.activeProjectId === p.id ? colors.tint : colors.tabIconDefault}
                />
                <Text className="text-sf-text text-[15px] font-semibold flex-1">
                  {p.name}
                </Text>
                {bridge.activeProjectId === p.id && (
                  <View className="w-2 h-2 rounded-full bg-sf-amber" />
                )}
              </View>
              <Text selectable className="text-sf-text-2 text-[12px] leading-4 pl-[22px]">
                {p.path}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Chats for selected project ── */}
      {projectId && (
        <View className="gap-4">
          <View className="h-[1px] bg-sf-sep" />

          {/* Create Chat */}
          <View className="gap-3 rounded-2xl bg-sf-bg-2 border border-sf-sep p-4">
            <Text className="text-sf-text text-[13px] font-bold uppercase tracking-[0.5px]">
              New Chat
            </Text>
            <View className="flex-row gap-2 items-center">
              <TextInput
                value={chatTitle}
                onChangeText={setChatTitle}
                placeholder="Chat title"
                placeholderTextColor={colors.tabIconDefault}
                selectionColor={colors.tint}
                keyboardAppearance={colorScheme}
                autoCorrect={false}
                className="flex-1 h-[44px] rounded-xl px-4 bg-sf-bg text-sf-text text-[15px] border border-sf-sep"
              />
              <Pressable
                disabled={!canCreateChat}
                onPress={() => {
                  const title = chatTitle.trim();
                  setChatTitle('');
                  bridge.createChat(projectId, title);
                }}
                className={[
                  'h-[44px] w-[44px] rounded-xl items-center justify-center',
                  canCreateChat ? 'bg-sf-amber' : 'bg-sf-bg-3',
                ].join(' ')}
              >
                <FontAwesome
                  name="plus"
                  size={16}
                  color={canCreateChat ? '#FFFFFF' : colors.tabIconDefault}
                />
              </Pressable>
            </View>
          </View>

          {/* Chat list */}
          {bridge.chats.length === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-sf-text-3 text-[14px]">No chats yet</Text>
            </View>
          ) : (
            <View className="gap-2">
              {bridge.chats.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    bridge.selectChat(c.id);
                    router.navigate('/');
                  }}
                  className="rounded-2xl bg-sf-bg-2 border border-sf-sep p-4 gap-1"
                >
                  <View className="flex-row items-center gap-2">
                    <FontAwesome name="comment" size={13} color={colors.tint} />
                    <Text className="text-sf-text text-[15px] font-semibold flex-1">
                      {c.title}
                    </Text>
                    <FontAwesome name="chevron-right" size={11} color={colors.tabIconDefault} />
                  </View>
                  <Text className="text-sf-text-3 text-[12px] leading-4 pl-[21px]">
                    {c.sessionId ? `Session ${c.sessionId}` : 'New session'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
