import React from 'react';

import { Modal, ScrollView, useWindowDimensions } from 'react-native';
import Markdown, { type MarkdownProps } from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ToolCall } from '@/lib/bridge/tool-runs';
import { Pressable, Text, View } from '@/tw';

import type { TaskAgent, TaskAgentPalette } from './task-agent-swarm';

type TaskAgentDetailsSheetProps = {
  visible: boolean;
  agent: TaskAgent | null;
  palette: TaskAgentPalette;
  onClose: () => void;
  renderFace: (seed: number) => React.ReactNode;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function isTaskTool(tool: ToolCall): boolean {
  return tool.name.trim().toLowerCase() === 'task';
}

function outputText(tool: ToolCall): string {
  if (tool.output && tool.output.trim().length > 0) return truncate(tool.output.trim(), 1800);
  return 'No output yet';
}

export function TaskAgentDetailsSheet(props: TaskAgentDetailsSheetProps) {
  const { visible, agent, palette, onClose, renderFace } = props;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const horizontalPadding = Math.max(14, insets.left, insets.right);
  const sectionSpacing = 14;

  const markdownStyle = React.useMemo<NonNullable<MarkdownProps['style']>>(
    () => ({
      body: { color: palette.text, fontSize: 15, lineHeight: 24, marginTop: 0, marginBottom: 0 },
      paragraph: { marginTop: 0, marginBottom: 10 },
      text: { color: palette.text, fontSize: 15, lineHeight: 24 },
      heading1: {
        color: palette.text,
        fontSize: 24,
        lineHeight: 30,
        marginTop: 2,
        marginBottom: 6,
        fontWeight: '700',
      },
      heading2: {
        color: palette.text,
        fontSize: 20,
        lineHeight: 26,
        marginTop: 2,
        marginBottom: 6,
        fontWeight: '700',
      },
      heading3: {
        color: palette.text,
        fontSize: 17,
        lineHeight: 23,
        marginTop: 2,
        marginBottom: 6,
        fontWeight: '700',
      },
      bullet_list: { marginTop: 0, marginBottom: 10 },
      ordered_list: { marginTop: 0, marginBottom: 10 },
      list_item: { marginBottom: 5 },
      code_inline: {
        color: palette.text,
        backgroundColor: palette.surfaceStrong,
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 2,
        fontSize: 14,
        lineHeight: 20,
      },
      code_block: {
        color: palette.text,
        backgroundColor: palette.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.border,
        padding: 8,
        marginTop: 2,
        marginBottom: 8,
        lineHeight: 22,
      },
      fence: {
        color: palette.text,
        backgroundColor: palette.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.border,
        padding: 8,
        marginTop: 2,
        marginBottom: 8,
      },
      strong: { color: palette.text, fontWeight: '700', fontSize: 15, lineHeight: 24 },
      em: { color: palette.textMuted },
    }),
    [palette.border, palette.surface, palette.surfaceStrong, palette.text, palette.textMuted]
  );

  if (!visible || !agent) return null;

  const taskTool = agent.tools.find((tool) => isTaskTool(tool));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(12,10,9,0.34)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable onPress={onClose} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />

        <View
          style={{
            maxHeight: Math.min(window.height * 0.88, 860),
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: palette.border,
            borderBottomWidth: 0,
            backgroundColor: palette.surface,
            paddingTop: 8,
            paddingBottom: 14,
            paddingHorizontal: 0,
            rowGap: 12,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                backgroundColor: palette.surfaceStrong,
              }}
            />
          </View>

          <View
            style={{
              paddingHorizontal: horizontalPadding,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              columnGap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10, flex: 1, minWidth: 0 }}>
              {renderFace(agent.faceSeed)}
              <View style={{ flex: 1, minWidth: 0, rowGap: 1 }}>
                <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
                  {agent.name}
                </Text>
                <Text numberOfLines={1} style={{ color: palette.textMuted, fontSize: 12 }}>
                  {agent.description}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              rowGap: sectionSpacing,
              paddingHorizontal: horizontalPadding,
              paddingBottom: insets.bottom + 18,
            }}
            contentInsetAdjustmentBehavior="automatic"
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
          >
            {taskTool?.taskInput?.prompt ? (
              <View style={{ rowGap: 8 }}>
                <Text style={{ color: palette.textSubtle, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                  Task Brief
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: palette.border,
                    borderRadius: 14,
                    padding: 10,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <Markdown style={markdownStyle}>{truncate(taskTool.taskInput.prompt.trim(), 3600)}</Markdown>
                </View>
              </View>
            ) : null}

            {agent.tools.length > 0 ? (
              <View style={{ rowGap: 8 }}>
                {agent.tools.map((tool, toolIndex) => {
                  const isLast = toolIndex === agent.tools.length - 1;

                  return (
                    <View
                      key={tool.id}
                      style={{
                        paddingTop: 8,
                        paddingBottom: isLast ? 0 : 8,
                        rowGap: 6,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderBottomColor: palette.border,
                      }}
                    >
                      <View style={{ rowGap: 2 }}>
                        <Text style={{ color: palette.textSubtle, fontSize: 11, fontWeight: '700' }}>Output</Text>
                        <View
                          style={{
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: palette.border,
                            backgroundColor: '#FFFFFF',
                            padding: 8,
                          }}
                        >
                          <Markdown style={markdownStyle}>{outputText(tool)}</Markdown>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
