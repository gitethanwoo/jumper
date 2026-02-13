import React from 'react';

import type { ToolCall, ToolStatus } from '@/lib/bridge/tool-runs';
import { Pressable, Text, View } from '@/tw';
import { TaskAgentDetailsSheet } from '@/components/task-agent-details-sheet';

export type TaskAgent = {
  id: string;
  name: string;
  faceSeed: number;
  description: string;
  prompt: string;
  status: ToolStatus;
  doneCount: number;
  totalCount: number;
  tools: ToolCall[];
};

export type TaskAgentBuild = {
  taskAgents: TaskAgent[];
  taskToolIds: Set<string>;
};

export type TaskAgentPalette = {
  surface: string;
  surfaceStrong: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  running: string;
  success: string;
  error: string;
};

type TaskAgentSwarmProps = {
  taskAgents: TaskAgent[];
  palette: TaskAgentPalette;
};

const TASK_AGENT_NAMES = [
  'Rosalind',
  'Tyler',
  'Winston',
  'Allen',
  'Riemann',
  'Ada',
  'Turing',
  'Noether',
  'Sagan',
  'Curie',
  'Euler',
  'Lovelace',
];

const TASK_PROGRESS_ROWS = 3;
const TASK_PROGRESS_COLS = 8;
const TASK_PROGRESS_DOTS = TASK_PROGRESS_ROWS * TASK_PROGRESS_COLS;
const TASK_AVATAR_SIZE = 22;
const TASK_AVATAR_RADIUS = TASK_AVATAR_SIZE / 2;
const TASK_FACE_SIZE = 18;

const FACE_SKINS = ['#FFFFFF', '#F5F5F4', '#E7E5E4', '#D6D3D1'];
const FACE_ACCENTS = ['#7C3AED', '#2563EB', '#0F766E', '#B45309', '#4338CA', '#BE123C'];
const FACE_INK = '#292524';

const EYE_STYLES = ['dot', 'wide', 'wink'] as const;
const MOUTH_STYLES = ['smile', 'flat', 'open'] as const;
const ACCESSORY_STYLES = ['none', 'brow', 'glasses', 'cap'] as const;

type EyeStyle = (typeof EYE_STYLES)[number];
type MouthStyle = (typeof MOUTH_STYLES)[number];
type AccessoryStyle = (typeof ACCESSORY_STYLES)[number];

type FaceSpec = {
  skin: string;
  accent: string;
  eye: EyeStyle;
  mouth: MouthStyle;
  accessory: AccessoryStyle;
};

function positiveMod(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return hash;
}

function faceSpec(seed: number): FaceSpec {
  return {
    skin: FACE_SKINS[positiveMod(seed, FACE_SKINS.length)]!,
    accent: FACE_ACCENTS[positiveMod(seed * 3 + 11, FACE_ACCENTS.length)]!,
    eye: EYE_STYLES[positiveMod(seed * 5 + 7, EYE_STYLES.length)]!,
    mouth: MOUTH_STYLES[positiveMod(seed * 7 + 13, MOUTH_STYLES.length)]!,
    accessory: ACCESSORY_STYLES[positiveMod(seed * 11 + 17, ACCESSORY_STYLES.length)]!,
  };
}

function faceKey(seed: number): string {
  const spec = faceSpec(seed);
  return `${spec.skin}|${spec.accent}|${spec.eye}|${spec.mouth}|${spec.accessory}`;
}

function FaceEye(props: { side: 'left' | 'right'; style: EyeStyle }) {
  const left = props.side === 'left' ? 4 : 9;
  if (props.style === 'wink' && props.side === 'right') {
    return (
      <View
        style={{
          position: 'absolute',
          top: 7,
          left,
          width: 3,
          height: 1,
          borderRadius: 1,
          backgroundColor: FACE_INK,
        }}
      />
    );
  }
  if (props.style === 'wide') {
    return (
      <View
        style={{
          position: 'absolute',
          top: 6,
          left,
          width: 3,
          height: 2,
          borderRadius: 1,
          backgroundColor: FACE_INK,
        }}
      />
    );
  }
  return (
    <View
      style={{
        position: 'absolute',
        top: 6,
        left,
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: FACE_INK,
      }}
    />
  );
}

function FaceMouth(props: { style: MouthStyle }) {
  if (props.style === 'open') {
    return (
      <View
        style={{
          position: 'absolute',
          left: 6,
          top: 11,
          width: 4,
          height: 2,
          borderRadius: 2,
          backgroundColor: FACE_INK,
        }}
      />
    );
  }

  if (props.style === 'flat') {
    return (
      <View
        style={{
          position: 'absolute',
          left: 5,
          top: 12,
          width: 6,
          height: 1,
          borderRadius: 1,
          backgroundColor: FACE_INK,
        }}
      />
    );
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: 5,
        top: 10,
        width: 6,
        height: 3,
        borderBottomWidth: 1.5,
        borderColor: FACE_INK,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
      }}
    />
  );
}

function FaceAccessory(props: { style: AccessoryStyle; accent: string }) {
  if (props.style === 'cap') {
    return (
      <>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 2,
            right: 2,
            height: 3,
            borderTopLeftRadius: 3,
            borderTopRightRadius: 3,
            backgroundColor: props.accent,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 3,
            left: 4,
            right: 4,
            height: 1,
            borderRadius: 1,
            backgroundColor: FACE_INK,
          }}
        />
      </>
    );
  }

  if (props.style === 'brow') {
    return (
      <>
        <View
          style={{
            position: 'absolute',
            top: 5,
            left: 4,
            width: 3,
            height: 1,
            borderRadius: 1,
            backgroundColor: FACE_INK,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 5,
            left: 9,
            width: 3,
            height: 1,
            borderRadius: 1,
            backgroundColor: FACE_INK,
          }}
        />
      </>
    );
  }

  if (props.style === 'glasses') {
    return (
      <>
        <View
          style={{
            position: 'absolute',
            top: 5,
            left: 3,
            width: 4,
            height: 4,
            borderRadius: 2,
            borderWidth: 1,
            borderColor: FACE_INK,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 5,
            left: 8,
            width: 4,
            height: 4,
            borderRadius: 2,
            borderWidth: 1,
            borderColor: FACE_INK,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 6,
            left: 7,
            width: 1,
            height: 1,
            borderRadius: 1,
            backgroundColor: FACE_INK,
          }}
        />
      </>
    );
  }

  return null;
}

function TaskAgentFace(props: { seed: number; surfaceColor: string }) {
  const spec = faceSpec(props.seed);
  return (
    <View
      style={{
        width: TASK_AVATAR_SIZE,
        height: TASK_AVATAR_SIZE,
        borderRadius: 999,
        backgroundColor: props.surfaceColor,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.14)',
      }}
    >
      <View
        style={{
          width: TASK_FACE_SIZE,
          height: TASK_FACE_SIZE,
          borderRadius: 999,
          backgroundColor: spec.skin,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <FaceAccessory style={spec.accessory} accent={spec.accent} />
        <FaceEye side="left" style={spec.eye} />
        <FaceEye side="right" style={spec.eye} />
        <FaceMouth style={spec.mouth} />
      </View>
    </View>
  );
}

function findTaskTool(tools: ToolCall[]): ToolCall | undefined {
  return tools.find((tool) => isTaskTool(tool) && tool.taskInput !== undefined);
}

function summarizeTaskDescription(tools: ToolCall[]): string {
  const description = findTaskTool(tools)?.taskInput?.description;
  if (typeof description === 'string' && description.trim().length > 0) return description.trim();

  const taskFromInput = tools.find((tool) => typeof tool.inputSummary === 'string' && tool.inputSummary.length > 0);
  if (taskFromInput?.inputSummary) return taskFromInput.inputSummary;

  const namedTool = tools.find((tool) => tool.name.trim().length > 0);
  if (namedTool) return namedTool.name;
  return 'Task';
}

function summarizeTaskPrompt(tools: ToolCall[]): string {
  const prompt = findTaskTool(tools)?.taskInput?.prompt;
  if (typeof prompt === 'string' && prompt.trim().length > 0) {
    return prompt.trim().replace(/\s+/g, ' ');
  }
  const taskTool = findTaskTool(tools);
  if (taskTool?.inputSummary) return taskTool.inputSummary;
  return 'No prompt';
}

function taskStatus(tools: ToolCall[]): ToolStatus {
  if (tools.some((tool) => tool.status === 'running')) return 'running';
  if (tools.some((tool) => tool.status === 'error')) return 'error';
  return 'success';
}

function isTaskTool(tool: ToolCall): boolean {
  return tool.name.trim().toLowerCase() === 'task';
}

function statusColor(status: ToolStatus, palette: Pick<TaskAgentPalette, 'running' | 'success' | 'error'>): string {
  if (status === 'success') return palette.success;
  if (status === 'error') return palette.error;
  return palette.running;
}

export function buildTaskAgents(tools: ToolCall[]): TaskAgentBuild {
  const grouped = new Map<string, ToolCall[]>();
  const topLevelTools = tools.filter((tool) => typeof tool.parentId !== 'string');
  const topLevelById = new Map(topLevelTools.map((tool) => [tool.id, tool]));

  tools.forEach((tool) => {
    if (typeof tool.parentId !== 'string') return;
    const existing = grouped.get(tool.parentId);
    if (existing) {
      grouped.set(tool.parentId, [...existing, tool]);
      return;
    }
    grouped.set(tool.parentId, [tool]);
  });

  const taskGroups: Array<{ id: string; tools: ToolCall[]; hiddenRootToolId?: string }> = [];
  grouped.forEach((children, parentId) => {
    const parentTool = topLevelById.get(parentId);
    if (parentTool && isTaskTool(parentTool)) {
      taskGroups.push({ id: parentId, tools: [parentTool, ...children], hiddenRootToolId: parentTool.id });
      return;
    }
    taskGroups.push({ id: parentId, tools: children });
  });

  topLevelTools
    .filter((tool) => isTaskTool(tool) && !grouped.has(tool.id))
    .forEach((tool) => {
      taskGroups.push({ id: tool.id, tools: [tool], hiddenRootToolId: tool.id });
    });

  const usedNames = new Set<string>();
  const usedFaceKeys = new Set<string>();
  const taskToolIds = new Set<string>();
  const taskAgents = taskGroups.map((group, index) => {
    const { id, tools: taskTools, hiddenRootToolId } = group;
    if (hiddenRootToolId) taskToolIds.add(hiddenRootToolId);

    const seed = hashString(id);
    let nameIndex = positiveMod(seed, TASK_AGENT_NAMES.length);
    for (let attempt = 0; attempt < TASK_AGENT_NAMES.length; attempt += 1) {
      const candidate = TASK_AGENT_NAMES[nameIndex]!;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        break;
      }
      nameIndex = (nameIndex + 1) % TASK_AGENT_NAMES.length;
    }

    const fallbackCount = index + 1;
    const chosenName = TASK_AGENT_NAMES[nameIndex] ?? `Task Agent ${fallbackCount}`;
    let faceSeed = positiveMod(seed + index * 11, 10_000);
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const key = faceKey(faceSeed);
      if (!usedFaceKeys.has(key)) {
        usedFaceKeys.add(key);
        break;
      }
      faceSeed = positiveMod(faceSeed + 97, 10_000);
    }
    const status = taskStatus(taskTools);
    const doneCount = taskTools.filter((tool) => tool.status !== 'running').length;

      return {
        id,
        name: chosenName,
        faceSeed,
        description: summarizeTaskDescription(taskTools),
        prompt: summarizeTaskPrompt(taskTools),
        status,
        doneCount,
        totalCount: taskTools.length,
        tools: taskTools,
      };
    });

  return { taskAgents, taskToolIds };
}

export function TaskAgentSwarm(props: TaskAgentSwarmProps) {
  const [activeAgentId, setActiveAgentId] = React.useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const activeAgent = React.useMemo(
    () => props.taskAgents.find((agent) => agent.id === activeAgentId) ?? null,
    [activeAgentId, props.taskAgents]
  );
  if (props.taskAgents.length === 0) return null;

  const closeDetails = React.useCallback(() => {
    setIsDetailsOpen(false);
    setActiveAgentId(null);
  }, []);

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: props.palette.border,
        backgroundColor: props.palette.surface,
        padding: 10,
        rowGap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: props.palette.text, fontSize: 13, fontWeight: '700' }}>
          Agent Swarm
        </Text>
        <Text style={{ color: props.palette.textSubtle, fontSize: 11, fontWeight: '700' }}>
          {props.taskAgents.length} Tasks
        </Text>
      </View>

      {props.taskAgents.map((agent, index) => {
        const completion = agent.totalCount > 0 ? agent.doneCount / agent.totalCount : 0;
        const filledDots =
          agent.status === 'success'
            ? TASK_PROGRESS_DOTS
            : Math.max(1, Math.round(completion * TASK_PROGRESS_DOTS));

        return (
          <View
            key={agent.id}
            style={{
              borderRadius: 10,
              backgroundColor: '#FCFCFB',
              paddingHorizontal: 10,
              paddingVertical: 8,
              rowGap: 6,
            }}
          >
            <Pressable
              onPress={() => {
                setActiveAgentId(agent.id);
                setIsDetailsOpen(true);
              }}
              style={{ rowGap: 6 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, flex: 1 }}>
                  <TaskAgentFace seed={agent.faceSeed} surfaceColor="#FFFFFF" />
                  <Text numberOfLines={1} style={{ color: props.palette.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                    {agent.description}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6 }}>
                  <Text
                    style={{
                      color: props.palette.textSubtle,
                      fontSize: 12,
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text style={{ color: props.palette.textSubtle, fontSize: 16, lineHeight: 16, fontWeight: '700' }}>
                    ›
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    columnGap: 6,
                    paddingLeft: TASK_AVATAR_RADIUS - 3,
                    flex: 1,
                  }}
                >
                  <View style={{ width: 16, alignItems: 'center', paddingTop: 1 }}>
                    <View
                      style={{
                        width: 12,
                        height: 10,
                        borderLeftWidth: 1.5,
                        borderBottomWidth: 1.5,
                        borderLeftColor: props.palette.textSubtle,
                        borderBottomColor: props.palette.textSubtle,
                        borderBottomLeftRadius: 5,
                      }}
                    />
                  </View>
                  <Text numberOfLines={1} style={{ color: props.palette.textMuted, fontSize: 12, flex: 1 }}>
                    {agent.prompt}
                  </Text>
                </View>

                <View style={{ rowGap: 2, paddingTop: 1 }}>
                  {Array.from({ length: TASK_PROGRESS_ROWS }).map((_, rowIndex) => (
                    <View key={`${agent.id}:row:${rowIndex}`} style={{ flexDirection: 'row', columnGap: 2 }}>
                      {Array.from({ length: TASK_PROGRESS_COLS }).map((_, colIndex) => {
                        const dotIndex = rowIndex * TASK_PROGRESS_COLS + colIndex;
                        return (
                          <View
                            key={`${agent.id}:${dotIndex}`}
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 1,
                              backgroundColor:
                                dotIndex < filledDots
                                  ? statusColor(agent.status, props.palette)
                                  : props.palette.surfaceStrong,
                            }}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>

            </Pressable>
          </View>
        );
      })}
      <TaskAgentDetailsSheet
        visible={isDetailsOpen}
        agent={activeAgent}
        palette={props.palette}
        onClose={closeDetails}
        renderFace={(seed) => <TaskAgentFace seed={seed} surfaceColor="#FFFFFF" />}
      />
    </View>
  );
}
