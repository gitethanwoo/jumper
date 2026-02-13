import type { ChatMessage } from './types';
import { parseToolRuns, parseTurnMessages } from './tool-runs';

export type ThreadPlacementItem =
  | {
      kind: 'user';
      turnIndex: number;
      text: string;
    }
  | {
      kind: 'assistant';
      turnIndex: number;
      eventIndex?: number;
      text: string;
    }
  | {
      kind: 'tool-run';
      turnIndex: number;
      runIndex: number;
      eventIndex: number;
      toolCount: number;
      toolIds: string[];
      toolNames: string[];
      toolStatuses: string[];
    }
  | {
      kind: 'loading';
      turnIndex: number;
    };

export type ThreadSimulatorInput = {
  messages: ReadonlyArray<ChatMessage>;
  events: unknown[];
  isResponding: boolean;
};

function buildToolRunsByTurn(toolRuns: ReturnType<typeof parseToolRuns>) {
  const toolRunsByTurn = new Map<number, typeof toolRuns>();

  for (const run of toolRuns) {
    const existing = toolRunsByTurn.get(run.turnIndex);
    if (existing) {
      toolRunsByTurn.set(run.turnIndex, [...existing, run]);
    } else {
      toolRunsByTurn.set(run.turnIndex, [run]);
    }
  }

  return toolRunsByTurn;
}

export function simulateThreadPlacement(input: ThreadSimulatorInput): ThreadPlacementItem[] {
  const { messages, events, isResponding } = input;

  const toolRuns = parseToolRuns(events);
  const turnMessages = parseTurnMessages(events);
  const toolRunsByTurn = buildToolRunsByTurn(toolRuns);
  const userMessages = messages.filter((message) => message.role === 'user');
  const assistantMessages = messages.filter((message) => message.role === 'assistant');

  const assistantTextByTurn = new Map<number, typeof turnMessages.assistant>();
  turnMessages.assistant.forEach((entry) => {
    const existing = assistantTextByTurn.get(entry.turnIndex);
    if (existing) {
      assistantTextByTurn.set(entry.turnIndex, [...existing, entry]);
      return;
    }
    assistantTextByTurn.set(entry.turnIndex, [entry]);
  });

  const userByTurn = new Map<number, (typeof turnMessages.users)[number]>();
  turnMessages.users.forEach((entry) => {
    if (!userByTurn.has(entry.turnIndex)) userByTurn.set(entry.turnIndex, entry);
  });

  let maxTimelineTurnIndex = -1;
  turnMessages.users.forEach((entry) => {
    maxTimelineTurnIndex = Math.max(maxTimelineTurnIndex, entry.turnIndex);
  });
  turnMessages.assistant.forEach((entry) => {
    maxTimelineTurnIndex = Math.max(maxTimelineTurnIndex, entry.turnIndex);
  });
  toolRuns.forEach((run) => {
    maxTimelineTurnIndex = Math.max(maxTimelineTurnIndex, run.turnIndex);
  });

  const hasEventTimeline = maxTimelineTurnIndex >= 0;
  const turnCount = hasEventTimeline
    ? maxTimelineTurnIndex + 1
    : Math.max(userMessages.length, assistantMessages.length, toolRuns.length);

  const placement: ThreadPlacementItem[] = [];

  for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
    const turnUser = userByTurn.get(turnIndex);
    const fallbackUser = userMessages[turnIndex];
    const userText = turnUser?.text ?? fallbackUser?.text;

    if (userText) {
      placement.push({
        kind: 'user',
        turnIndex,
        text: userText,
      });
    }

    const runs = toolRunsByTurn.get(turnIndex) ?? [];
    const assistantTurnTexts = assistantTextByTurn.get(turnIndex) ?? [];
    const fallbackAssistant = assistantMessages[turnIndex];

    const orderedItems = hasEventTimeline
      ? [
          ...runs.map((run, runIndex) => ({
            kind: 'tool-run' as const,
            runIndex,
            eventIndex: run.eventIndex,
            run,
          })),
          ...assistantTurnTexts.map((entry) => ({
            kind: 'assistant' as const,
            eventIndex: entry.eventIndex,
            text: entry.text,
          })),
        ].sort((a, b) => {
          if (a.eventIndex !== b.eventIndex) return a.eventIndex - b.eventIndex;
          if (a.kind === b.kind) return 0;
          return a.kind === 'tool-run' ? -1 : 1;
        })
      : [
          ...runs.map((run, runIndex) => ({
            kind: 'tool-run' as const,
            runIndex,
            eventIndex: run.eventIndex,
            run,
          })),
          ...(fallbackAssistant
            ? [
                {
                  kind: 'assistant' as const,
                  eventIndex: undefined,
                  text: fallbackAssistant.text,
                },
              ]
            : []),
        ];

    orderedItems.forEach((item) => {
      if (item.kind === 'tool-run') {
        placement.push({
          kind: 'tool-run',
          turnIndex,
          runIndex: item.runIndex,
          eventIndex: item.eventIndex,
          toolCount: item.run.tools.length,
          toolIds: item.run.tools.map((tool) => tool.id),
          toolNames: item.run.tools.map((tool) => tool.name),
          toolStatuses: item.run.tools.map((tool) => tool.status),
        });
        return;
      }
      placement.push({
        kind: 'assistant',
        turnIndex,
        eventIndex: hasEventTimeline ? item.eventIndex : undefined,
        text: item.text,
      });
    });

    const hasAssistantInTurn = orderedItems.some((item) => item.kind === 'assistant');
    const hasRunInTurn = orderedItems.some((item) => item.kind === 'tool-run');

    const shouldShowLoading =
      turnIndex === turnCount - 1 &&
      isResponding &&
      !hasAssistantInTurn &&
      !hasRunInTurn &&
      Boolean(userText);

    if (shouldShowLoading) {
      placement.push({ kind: 'loading', turnIndex });
    }
  }

  return placement;
}

export function stringifyThreadPlacement(items: ThreadPlacementItem[]): string {
  return items
    .map((item) => {
      if (item.kind === 'loading') {
        return `turn:${item.turnIndex} loading`;
      }

      if (item.kind === 'tool-run') {
        const summaries = item.toolNames.map((name, index) => `${item.toolIds[index]}:${name}:${item.toolStatuses[index]}`);
        return `turn:${item.turnIndex} tool-run[${item.runIndex}]@${item.eventIndex} ${summaries.join(', ')}`;
      }

      if (item.kind === 'assistant' && typeof item.eventIndex === 'number') {
        return `turn:${item.turnIndex} assistant@${item.eventIndex} ${item.text}`;
      }

      return `turn:${item.turnIndex} ${item.kind} ${item.text}`;
    })
    .join('\n');
}
