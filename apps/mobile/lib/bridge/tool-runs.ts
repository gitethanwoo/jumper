export type ToolStatus = 'running' | 'success' | 'error';

export type ToolCall = {
  id: string;
  name: string;
  status: ToolStatus;
  inputSummary?: string;
  output?: string;
};

export type ToolRun = {
  tools: ToolCall[];
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

function pickOutput(content: unknown, toolUseResult: unknown): string | undefined {
  if (typeof content === 'string' && content.trim().length > 0) {
    return truncate(content, 1200);
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
  return undefined;
}

export function parseToolRuns(events: unknown[]): ToolRun[] {
  const runs: ToolRun[] = [];
  let toolsById = new Map<string, ToolCall>();
  let toolOrder: string[] = [];
  let turnOpen = false;

  const flushRun = () => {
    if (!turnOpen && toolOrder.length === 0) return;
    const tools = toolOrder
      .map((id) => toolsById.get(id))
      .filter((tool): tool is ToolCall => Boolean(tool));
    runs.push({ tools });
    toolsById = new Map<string, ToolCall>();
    toolOrder = [];
    turnOpen = false;
  };

  events.forEach((rawEvent, index) => {
    if (!isObject(rawEvent) || typeof rawEvent.type !== 'string') return;

    if (rawEvent.type === 'assistant' && isObject(rawEvent.message)) {
      const content = Array.isArray(rawEvent.message.content) ? rawEvent.message.content : [];
      let hasAssistantText = false;

      content.forEach((block, contentIndex) => {
        if (!isObject(block)) return;

        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
          hasAssistantText = true;
          return;
        }

        if (block.type !== 'tool_use') return;

        const id =
          typeof block.id === 'string' ? block.id : `tool:${index}:${contentIndex}`;
        const name = typeof block.name === 'string' ? block.name : 'Tool';
        const inputSummary = summarizeToolInput(block.input);

        turnOpen = true;
        toolsById.set(id, { id, name, status: 'running', inputSummary });
        toolOrder = [...toolOrder, id];
      });

      if (hasAssistantText) {
        turnOpen = true;
        flushRun();
      }
      return;
    }

    if (rawEvent.type === 'user' && isObject(rawEvent.message)) {
      const content = Array.isArray(rawEvent.message.content) ? rawEvent.message.content : [];
      let sawToolResult = false;

      content.forEach((block, contentIndex) => {
        if (!isObject(block) || block.type !== 'tool_result') return;
        sawToolResult = true;
        const toolUseId =
          typeof block.tool_use_id === 'string'
            ? block.tool_use_id
            : `result:${index}:${contentIndex}`;

        const existing = toolsById.get(toolUseId);
        const status: ToolStatus = block.is_error === true ? 'error' : 'success';
        const output = pickOutput(block.content, rawEvent.tool_use_result);

        turnOpen = true;
        if (existing) {
          toolsById.set(toolUseId, { ...existing, status, output });
          return;
        }

        toolsById.set(toolUseId, {
          id: toolUseId,
          name: 'Tool',
          status,
          output,
        });
        toolOrder = [...toolOrder, toolUseId];
      });

      if (sawToolResult) return;

      if (rawEvent.message.role === 'user' && hasUserTextContent(rawEvent.message.content)) {
        if (turnOpen) flushRun();
        turnOpen = true;
      }
      return;
    }

    if (rawEvent.type === 'result') {
      flushRun();
    }
  });

  flushRun();

  return runs;
}
