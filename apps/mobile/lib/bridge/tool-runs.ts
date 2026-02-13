export type ToolStatus = 'running' | 'success' | 'error';

export type TaskToolInput = {
  description?: string;
  prompt?: string;
  subagentType?: string;
};

export type ToolCall = {
  id: string;
  name: string;
  status: ToolStatus;
  inputSummary?: string;
  taskInput?: TaskToolInput;
  output?: string;
  parentId?: string;
};

export type ToolRun = {
  turnIndex: number;
  eventIndex: number;
  tools: ToolCall[];
};

export type TurnText = {
  turnIndex: number;
  eventIndex: number;
  text: string;
};

export type ParsedTurnMessages = {
  users: TurnText[];
  assistant: TurnText[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatJson(value: unknown, max = 220): string | undefined {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized === '{}') return undefined;
  return truncate(serialized, max);
}

function extractTextContent(content: unknown, max = 1200): string | undefined {
  if (typeof content === 'string' && content.trim().length > 0) {
    return truncate(content, max);
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter(isObject)
      .filter(
        (block): block is Record<string, unknown> & { type: 'text'; text: string } =>
          block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0
      )
      .map((block) => block.text.trim());

    if (textParts.length > 0) {
      return truncate(textParts.join('\n\n'), max);
    }

    const serialized = formatJson(content, max);
    if (serialized) return serialized;
  }

  if (isObject(content) && content.type === 'text' && typeof content.text === 'string') {
    return truncate(content.text, max);
  }

  return undefined;
}

function summarizeToolInput(input: unknown): string | undefined {
  if (!isObject(input)) return formatJson(input);
  if (typeof input.command === 'string') return truncate(input.command, 220);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  if (parts.length > 0) return truncate(parts.join(' • '), 220);
  return formatJson(input);
}

function parseTaskToolInput(input: unknown): TaskToolInput | undefined {
  if (!isObject(input)) return undefined;

  const description = typeof input.description === 'string' ? input.description : undefined;
  const prompt = typeof input.prompt === 'string' ? input.prompt : undefined;
  const subagentType =
    typeof input.subagent_type === 'string'
      ? input.subagent_type
      : typeof input.subagentType === 'string'
        ? input.subagentType
        : undefined;

  if (!description && !prompt && !subagentType) return undefined;
  return { description, prompt, subagentType };
}

function hasUserTextContent(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some(
    (block) =>
      isObject(block) &&
      block.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.trim().length > 0
  );
}

function extractPlainText(content: unknown, max: number): string | undefined {
  if (typeof content === 'string' && content.trim().length > 0) {
    return truncate(content.trim(), max);
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter(isObject)
      .filter(
        (block): block is Record<string, unknown> & { type: 'text'; text: string } =>
          block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0
      )
      .map((block) => block.text.trim());
    if (textParts.length > 0) return truncate(textParts.join('\n\n'), max);
    return undefined;
  }

  if (isObject(content) && content.type === 'text' && typeof content.text === 'string') {
    return truncate(content.text.trim(), max);
  }

  return undefined;
}

function extractUserText(content: unknown): string | undefined {
  return extractPlainText(content, 1200);
}

function extractAssistantText(content: unknown): string | undefined {
  return extractPlainText(content, 2400);
}

function pickOutput(content: unknown, toolUseResult: unknown): string | undefined {
  const inline = extractTextContent(content, 1200);
  if (inline) {
    return inline;
  }
  if (!isObject(toolUseResult)) return undefined;

  const stdout =
    typeof toolUseResult.stdout === 'string' && toolUseResult.stdout.trim().length > 0
      ? toolUseResult.stdout
      : null;
  const stderr =
    typeof toolUseResult.stderr === 'string' && toolUseResult.stderr.trim().length > 0
      ? toolUseResult.stderr
      : null;

  if (stdout) return truncate(stdout, 1200);
  if (stderr) return truncate(stderr, 1200);

  const richContent = extractTextContent(toolUseResult.content, 1200);
  if (richContent) return richContent;

  const structured = formatJson(toolUseResult, 1200);
  if (structured) return structured;

  const fallback = formatJson(content, 1200);
  if (fallback) return fallback;

  return undefined;
}

export function parseToolRuns(events: unknown[]): ToolRun[] {
  const runs: ToolRun[] = [];
  let toolsById = new Map<string, ToolCall>();
  let toolOrder: string[] = [];
  let turnOpen = false;
  let currentTurnIndex = -1;

  const scopedToolId = (id: string, parentToolId?: string): string =>
    parentToolId ? `${parentToolId}::${id}` : id;

  const registerTool = (tool: ToolCall) => {
    if (!toolOrder.includes(tool.id)) {
      toolOrder = [...toolOrder, tool.id];
    }
    toolsById.set(tool.id, tool);
  };

  const startTool = (params: {
    id: string;
    name: string;
    inputSummary?: string;
    taskInput?: TaskToolInput;
    parentId?: string;
  }) => {
    const existing = toolsById.get(params.id);
    if (!existing) {
      registerTool({
        id: params.id,
        name: params.name,
        status: 'running',
        inputSummary: params.inputSummary,
        taskInput: params.taskInput,
        parentId: params.parentId,
      });
      turnOpen = true;
      return;
    }

    registerTool({
      ...existing,
      name: existing.name === 'Tool' ? params.name : existing.name,
      inputSummary: existing.inputSummary ?? params.inputSummary,
      taskInput: existing.taskInput ?? params.taskInput,
      parentId: existing.parentId ?? params.parentId,
    });
    turnOpen = true;
  };

  const completeTool = (params: {
    id: string;
    status: ToolStatus;
    output?: string;
    parentId?: string;
    fallbackName?: string;
  }) => {
    const existing = toolsById.get(params.id);
    const next: ToolCall = existing
      ? {
          ...existing,
          status: params.status,
          output: params.output ?? existing.output,
          parentId: existing.parentId ?? params.parentId,
        }
      : {
          id: params.id,
          name: params.fallbackName ?? 'Tool',
          status: params.status,
          output: params.output,
          parentId: params.parentId,
        };
    registerTool(next);
    turnOpen = true;
  };

  const processAssistantBlocks = (
    content: unknown,
    eventIndex: number,
    parentToolId?: string
  ): { sawTool: boolean; hasText: boolean } => {
    if (!Array.isArray(content)) return { sawTool: false, hasText: false };

    let sawTool = false;
    let hasText = false;

    content.forEach((block, contentIndex) => {
      if (!isObject(block)) return;

      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
        hasText = true;
        return;
      }

      if (block.type !== 'tool_use') return;

      sawTool = true;
      const rawId = typeof block.id === 'string' ? block.id : `tool:${eventIndex}:${contentIndex}`;
      const id = scopedToolId(rawId, parentToolId);
      const name = typeof block.name === 'string' ? block.name : 'Tool';
      const inputSummary = summarizeToolInput(block.input);
      const taskInput = name.trim().toLowerCase() === 'task' ? parseTaskToolInput(block.input) : undefined;

      startTool({ id, name, inputSummary, taskInput, parentId: parentToolId });
    });

    return { sawTool, hasText };
  };

  const processUserBlocks = (
    content: unknown,
    eventIndex: number,
    toolUseResult: unknown,
    parentToolId?: string
  ): { sawToolResult: boolean } => {
    if (!Array.isArray(content)) return { sawToolResult: false };

    let sawToolResult = false;
    content.forEach((block, contentIndex) => {
      if (!isObject(block) || block.type !== 'tool_result') return;

      sawToolResult = true;
      const rawToolUseId =
        typeof block.tool_use_id === 'string' ? block.tool_use_id : `result:${eventIndex}:${contentIndex}`;
      const toolUseId = scopedToolId(rawToolUseId, parentToolId);
      const status: ToolStatus = block.is_error === true ? 'error' : 'success';
      const output = pickOutput(block.content, toolUseResult);

      completeTool({
        id: toolUseId,
        status,
        output,
        parentId: parentToolId,
        fallbackName: 'Tool',
      });
    });

    return { sawToolResult };
  };

  const parseHookToolName = (hookName: unknown): string | undefined => {
    if (typeof hookName !== 'string' || hookName.length === 0) return undefined;
    const match = /^.+:(.+)$/.exec(hookName);
    if (!match) return undefined;
    return match[1]?.trim() || undefined;
  };

  const flushRun = (eventIndex: number) => {
    if (toolOrder.length === 0) {
      turnOpen = false;
      return;
    }
    const tools = toolOrder
      .map((id) => toolsById.get(id))
      .filter((tool): tool is ToolCall => Boolean(tool));
    runs.push({ turnIndex: Math.max(currentTurnIndex, 0), eventIndex, tools });
    toolsById = new Map<string, ToolCall>();
    toolOrder = [];
    turnOpen = false;
  };

  events.forEach((rawEvent, index) => {
    if (!isObject(rawEvent) || typeof rawEvent.type !== 'string') return;

    if (rawEvent.type === 'assistant' && isObject(rawEvent.message)) {
      const parsed = processAssistantBlocks(rawEvent.message.content, index);

      if (parsed.hasText) {
        flushRun(index);
      }
      return;
    }

    if (rawEvent.type === 'user' && isObject(rawEvent.message)) {
      const toolUseResult = rawEvent.toolUseResult ?? rawEvent.tool_use_result;
      const parsed = processUserBlocks(rawEvent.message.content, index, toolUseResult);

      if (parsed.sawToolResult) return;

      if (rawEvent.message.role === 'user' && hasUserTextContent(rawEvent.message.content)) {
        if (turnOpen) flushRun(index);
        currentTurnIndex += 1;
      }
      return;
    }

    if (rawEvent.type === 'progress' && isObject(rawEvent.data)) {
      if (rawEvent.data.type === 'hook_progress') {
        const hookEvent = rawEvent.data.hookEvent;
        if (hookEvent !== 'PreToolUse' && hookEvent !== 'PostToolUse') return;

        const toolUseId =
          typeof rawEvent.parentToolUseID === 'string'
            ? rawEvent.parentToolUseID
            : typeof rawEvent.toolUseID === 'string'
              ? rawEvent.toolUseID
              : null;
        if (!toolUseId || toolUseId.startsWith('bash-progress-')) return;

        if (hookEvent === 'PreToolUse') {
          const hookToolName = parseHookToolName(rawEvent.data.hookName) ?? 'Tool';
          startTool({ id: toolUseId, name: hookToolName });
          return;
        }

        const existing = toolsById.get(toolUseId);
        if (existing && existing.status === 'running') {
          registerTool({ ...existing, status: 'success' });
        }
        return;
      }

      if (rawEvent.data.type === 'agent_progress' && isObject(rawEvent.data.message)) {
        const parentToolUseId =
          typeof rawEvent.parentToolUseID === 'string' ? rawEvent.parentToolUseID : undefined;

        const nestedType = rawEvent.data.message.type;
        if (nestedType === 'assistant' && isObject(rawEvent.data.message.message)) {
          processAssistantBlocks(rawEvent.data.message.message.content, index, parentToolUseId);
          return;
        }

        if (nestedType === 'user' && isObject(rawEvent.data.message.message)) {
          processUserBlocks(
            rawEvent.data.message.message.content,
            index,
            rawEvent.data.message.toolUseResult ?? rawEvent.data.message.tool_use_result,
            parentToolUseId
          );
        }
      }
      return;
    }

    if (rawEvent.type === 'result' || rawEvent.type === 'claude.done') {
      flushRun(index);
    }
  });

  flushRun(events.length);

  return runs;
}

export function parseTurnMessages(events: unknown[]): ParsedTurnMessages {
  const users: TurnText[] = [];
  const assistant: TurnText[] = [];
  let currentTurnIndex = -1;

  events.forEach((rawEvent, eventIndex) => {
    if (!isObject(rawEvent) || typeof rawEvent.type !== 'string') return;

    if (rawEvent.type === 'user' && isObject(rawEvent.message)) {
      const content = rawEvent.message.content;
      const hasToolResult =
        Array.isArray(content) &&
        content.some((block) => isObject(block) && block.type === 'tool_result');
      if (hasToolResult) return;

      if (rawEvent.message.role === 'user' && hasUserTextContent(content)) {
        currentTurnIndex += 1;
        const text = extractUserText(content);
        if (!text) return;
        users.push({ turnIndex: currentTurnIndex, eventIndex, text });
      }
      return;
    }

    if (rawEvent.type === 'assistant' && isObject(rawEvent.message)) {
      if (currentTurnIndex < 0) return;
      const text = extractAssistantText(rawEvent.message.content);
      if (!text) return;
      assistant.push({ turnIndex: currentTurnIndex, eventIndex, text });
    }
  });

  return { users, assistant };
}
