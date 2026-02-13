import React from 'react';
import { ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import type { ToolCall, ToolRun, ToolStatus } from '@/lib/bridge/tool-runs';
import { TaskAgentSwarm, buildTaskAgents } from '@/components/task-agent-swarm';
import { Pressable, Text, View } from '@/tw';
import Colors from '@/constants/Colors';

type Props = {
  run: ToolRun;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function statusText(status: ToolStatus): string {
  if (status === 'success') return 'finished';
  if (status === 'error') return 'failed';
  return 'running';
}

function statusColor(status: ToolStatus, palette: { running: string; success: string; error: string }): string {
  if (status === 'success') return palette.success;
  if (status === 'error') return palette.error;
  return palette.running;
}

function runSummary(tools: ToolCall[]): {
  title: string;
  subtitle: string;
  runningCount: number;
  doneCount: number;
  failedCount: number;
  activeTool: ToolCall;
  activeStepNumber: number;
} {
  const runningCount = tools.filter((tool) => tool.status === 'running').length;
  const failedCount = tools.filter((tool) => tool.status === 'error').length;
  const doneCount = tools.filter((tool) => tool.status !== 'running').length;

  const runningIndex = tools.findIndex((tool) => tool.status === 'running');
  const activeStepNumber = runningIndex >= 0 ? runningIndex + 1 : tools.length;
  const activeTool = tools[Math.max(activeStepNumber - 1, 0)] ?? tools[0]!;

  if (runningCount > 0) {
    return {
      title: `Running step ${activeStepNumber} of ${tools.length}`,
      subtitle: `${activeTool.name} ${statusText(activeTool.status)}`,
      runningCount,
      doneCount,
      failedCount,
      activeTool,
      activeStepNumber,
    };
  }

  if (failedCount > 0) {
    return {
      title: `${failedCount} failed • ${doneCount}/${tools.length} complete`,
      subtitle: `${activeTool.name} ${statusText(activeTool.status)}`,
      runningCount,
      doneCount,
      failedCount,
      activeTool,
      activeStepNumber,
    };
  }

  return {
    title: `All ${tools.length} tools finished`,
    subtitle: `${activeTool.name} ${statusText(activeTool.status)}`,
    runningCount,
    doneCount,
    failedCount,
    activeTool,
    activeStepNumber,
  };
}

export function ToolRunBlock(props: Props) {
  const colors = Colors.light;
  const [isRunExpanded, setIsRunExpanded] = React.useState(false);
  const [expandedToolId, setExpandedToolId] = React.useState<string | null>(null);
  const taskAgentBuild = React.useMemo(() => buildTaskAgents(props.run.tools), [props.run.tools]);
  const taskAgents = taskAgentBuild.taskAgents;
  const rootTools = React.useMemo(
    () =>
      props.run.tools.filter(
        (tool) => typeof tool.parentId !== 'string' && !taskAgentBuild.taskToolIds.has(tool.id)
      ),
    [props.run.tools, taskAgentBuild]
  );

  const palette = React.useMemo(
    () => ({
      surface: '#F0EDE9',
      surfaceStrong: '#E7E5E4',
      border: 'rgba(0,0,0,0.08)',
      text: '#1C1917',
      textMuted: '#57534E',
      textSubtle: '#A8A29E',
      running: colors.tint,
      success: '#0D9488',
      error: '#DC2626',
    }),
    [colors.tint]
  );

  if (props.run.tools.length === 0) return null;

  const toolsSummary = rootTools.length > 0 ? runSummary(rootTools) : null;

  return (
    <View style={{ rowGap: 8 }}>
      <TaskAgentSwarm taskAgents={taskAgents} palette={palette} />

      {toolsSummary ? (
        <View
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 12,
            rowGap: 10,
          }}
        >
          {/* Layer 1: one stateful summary card for root tools */}
          <Pressable
            onPress={() => setIsRunExpanded((prev) => !prev)}
            style={{ rowGap: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, flex: 1 }}>
                {toolsSummary.runningCount > 0 ? (
                  <ActivityIndicator size="small" color={palette.running} />
                ) : (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: statusColor(toolsSummary.activeTool.status, palette),
                    }}
                  />
                )}
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  {toolsSummary.title}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
                <Text style={{ color: palette.textSubtle, fontSize: 12, fontWeight: '600' }}>
                  {isRunExpanded ? 'Hide' : 'Show'}
                </Text>
                <FontAwesome
                  name={isRunExpanded ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  color={palette.textSubtle}
                />
              </View>
            </View>

            <Text numberOfLines={1} selectable style={{ color: palette.textMuted, fontSize: 12 }}>
              {toolsSummary.subtitle}
            </Text>
          </Pressable>

          {/* Layer 2: expanded stack of root tools */}
          {isRunExpanded ? (
            <View style={{ rowGap: 8 }}>
              {rootTools.map((tool, index) => {
                const isToolExpanded = expandedToolId === tool.id;
                return (
                  <View
                    key={tool.id}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: palette.border,
                      backgroundColor: '#FFFFFF',
                      overflow: 'hidden',
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        setExpandedToolId((current) => (current === tool.id ? null : tool.id));
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        rowGap: 4,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, flex: 1 }}>
                          <Text
                            style={{
                              color: palette.textSubtle,
                              fontSize: 11,
                              fontWeight: '700',
                              width: 18,
                            }}
                          >
                            {index + 1}.
                          </Text>
                          {tool.status === 'running' ? (
                            <ActivityIndicator size="small" color={palette.running} />
                          ) : (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: statusColor(tool.status, palette),
                              }}
                            />
                          )}
                          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                            {tool.name}
                          </Text>
                        </View>

                        <FontAwesome
                          name={isToolExpanded ? 'chevron-up' : 'chevron-down'}
                          size={11}
                          color={palette.textSubtle}
                        />
                      </View>

                      <Text numberOfLines={1} style={{ color: palette.textSubtle, fontSize: 12, paddingLeft: 27 }}>
                        {statusText(tool.status)}
                      </Text>
                    </Pressable>

                    {/* Layer 3: per-tool details */}
                    {isToolExpanded ? (
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: palette.border,
                          backgroundColor: '#FCFCFB',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          rowGap: 8,
                        }}
                      >
                        {tool.inputSummary ? (
                          <View style={{ rowGap: 4 }}>
                            <Text
                              style={{
                                color: palette.textSubtle,
                                fontSize: 11,
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: 0.3,
                              }}
                            >
                              Input
                            </Text>
                            <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Menlo' }}>
                              {tool.inputSummary}
                            </Text>
                          </View>
                        ) : null}

                        <View style={{ rowGap: 4 }}>
                          <Text
                            style={{
                              color: palette.textSubtle,
                              fontSize: 11,
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: 0.3,
                            }}
                          >
                            Output
                          </Text>
                          <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Menlo' }}>
                            {tool.output ? truncate(tool.output, 2400) : 'No output'}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
