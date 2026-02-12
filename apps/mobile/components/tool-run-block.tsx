import React from 'react';
import { ActivityIndicator } from 'react-native';

import type { ToolRun, ToolStatus } from '@/lib/bridge/tool-runs';
import { Pressable, Text, View } from '@/tw';
import Colors from '@/constants/Colors';

type Props = {
  run: ToolRun;
};

function dotClass(status: ToolStatus): string {
  if (status === 'success') return 'bg-sf-teal';
  if (status === 'error') return 'bg-sf-red';
  return 'bg-sf-amber';
}

function statusText(status: ToolStatus): string {
  if (status === 'success') return 'finished';
  if (status === 'error') return 'failed';
  return 'running';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function ToolRunBlock(props: Props) {
  const [expandedById, setExpandedById] = React.useState<Record<string, boolean>>({});
  const colors = Colors.light;
  const palette = React.useMemo(
    () => ({
      surface: '#F0EDE9',
      border: 'rgba(0,0,0,0.08)',
      text: '#1C1917',
      textMuted: '#78716C',
      textSubtle: '#A8A29E',
    }),
    []
  );

  if (props.run.tools.length === 0) return null;

  return (
    <View className="w-full gap-2">
      {props.run.tools.map((tool) => (
        <View
          key={tool.id}
          className="py-2 px-3 rounded-2xl border"
          style={{ backgroundColor: palette.surface, borderColor: palette.border }}
        >
          <Pressable
            onPress={() =>
              setExpandedById((prev) => ({
                ...prev,
                [tool.id]: !prev[tool.id],
              }))
            }
            className="gap-1.5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                {tool.status === 'running' ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (
                  <View className={`h-2 w-2 rounded-full ${dotClass(tool.status)}`} />
                )}
                <Text className="text-[14px] font-semibold" style={{ color: palette.text }}>
                  {tool.name} {statusText(tool.status)}
                </Text>
              </View>

              <Text className="text-[12px] font-semibold" style={{ color: palette.textSubtle }}>
                {expandedById[tool.id] ? 'Hide' : 'Details'}
              </Text>
            </View>

            {tool.inputSummary ? (
              <Text
                selectable
                numberOfLines={1}
                className="text-[13px] leading-5 font-mono"
                style={{ color: palette.textMuted }}
              >
                {truncate(tool.inputSummary, 120)}
              </Text>
            ) : null}
          </Pressable>

          {expandedById[tool.id] ? (
            <View className="mt-1.5 pl-3 border-l gap-1.5" style={{ borderLeftColor: palette.border }}>
              {tool.inputSummary ? (
                <View className="gap-1">
                  <Text
                    className="text-[11px] font-semibold uppercase tracking-[0.3px]"
                    style={{ color: palette.textSubtle }}
                  >
                    Input
                  </Text>
                  <Text selectable className="text-[13px] leading-5 font-mono" style={{ color: palette.textMuted }}>
                    {tool.inputSummary}
                  </Text>
                </View>
              ) : null}

              {tool.output ? (
                <View className="gap-1">
                  <Text
                    className="text-[11px] font-semibold uppercase tracking-[0.3px]"
                    style={{ color: palette.textSubtle }}
                  >
                    Output
                  </Text>
                  <Text selectable className="text-[13px] leading-5 font-mono" style={{ color: palette.textMuted }}>
                    {tool.output}
                  </Text>
                </View>
              ) : (
                <View className="gap-1">
                  <Text
                    className="text-[11px] font-semibold uppercase tracking-[0.3px]"
                    style={{ color: palette.textSubtle }}
                  >
                    Output
                  </Text>
                  <Text className="text-[12px] leading-5" style={{ color: palette.textSubtle }}>
                    No output
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
