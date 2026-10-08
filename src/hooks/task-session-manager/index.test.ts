import { describe, expect, mock, test } from 'bun:test';
import type { ToolPart, ToolState } from '@opencode-ai/sdk';
import { createTaskSessionManagerHook } from './index';

function taskEnvelope(sessionId: string, body = 'done'): string {
  return [
    `<task id="${sessionId}" state="completed">`,
    '<task_result>',
    body,
    '</task_result>',
    '</task>',
  ].join('\n');
}

function createHook(options?: {
  shouldManageSession?: (sessionID: string) => boolean;
  readContextMinLines?: number;
  readContextMaxFiles?: number;
  maxSessionsPerAgent?: number;
}) {
  const hook = createTaskSessionManagerHook(
    {
      client: { session: { status: mock(async () => ({ data: {} })) } },
      directory: '/tmp',
      worktree: '/tmp',
    } as never,
    {
      maxSessionsPerAgent: options?.maxSessionsPerAgent ?? 2,
      readContextMinLines: options?.readContextMinLines,
      readContextMaxFiles: options?.readContextMaxFiles,
      shouldManageSession: options?.shouldManageSession ?? (() => true),
    },
  );

  return { hook };
}

async function runTask(
  hook: ReturnType<typeof createTaskSessionManagerHook>,
  input: { sessionID?: string; callID: string },
  output: {
    args: Record<string, unknown>;
    output?: unknown;
    metadata?: unknown;
  },
): Promise<Record<string, unknown>> {
  await hook['tool.execute.before'](
    { tool: 'task', sessionID: input.sessionID, callID: input.callID },
    { args: output.args },
  );
  if (output.output !== undefined) {
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: input.sessionID, callID: input.callID },
      { output: output.output, metadata: output.metadata },
    );
  }
  return output.args;
}

async function promptFor(
  hook: ReturnType<typeof createTaskSessionManagerHook>,
  sessionID: string,
): Promise<string> {
  const system = { system: ['base'] };
  await hook['experimental.chat.system.transform']({ sessionID }, system);
  return system.system.join('\n');
}

type Hook = ReturnType<typeof createTaskSessionManagerHook>;

/** Record a `task` call in `tool.execute.before` and return its args. */
async function startTask(
  hook: Hook,
  input: {
    callId: string;
    agent: string;
    description?: string;
    taskId?: string;
    parentId?: string;
  },
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {
    subagent_type: input.agent,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.taskId === undefined ? {} : { task_id: input.taskId }),
  };

  await hook['tool.execute.before'](
    {
      tool: 'task',
      sessionID: input.parentId ?? 'parent-1',
      callID: input.callId,
    },
    { args },
  );
  return args;
}

/** `tool.execute.after` alone, for a call already recorded by `startTask`. */
async function settleTask(
  hook: Hook,
  input: { callId: string; output: unknown; parentId?: string },
): Promise<void> {
  await hook['tool.execute.after'](
    {
      tool: 'task',
      sessionID: input.parentId ?? 'parent-1',
      callID: input.callId,
    },
    { output: input.output },
  );
}

/** A completed delegation reported the legacy `task_id:` result header. */
function taskResult(childId: string): string {
  return `task_id: ${childId} (for resuming to continue this task)`;
}

/**
 * The host reports a child session while its `task` call is still in flight,
 * so provisional tracking only applies when the parent has a pending call.
 */
async function childCreated(
  hook: Hook,
  childId: string,
  parentId: string,
): Promise<void> {
  await hook.event({
    event: {
      type: 'session.created',
      properties: { info: { id: childId, parentID: parentId } },
    },
  });
}

/**
 * A tool state in the shape the SDK declares for each status, so the fixture
 * exercises the same payload the host publishes. `sessionId` lands in the
 * metadata the plugin reads; pass `metadata` to supply an unusable shape
 * instead.
 */
function taskPartState(
  status: ToolState['status'],
  metadata: Record<string, unknown> | undefined,
): ToolState {
  const input = { subagent_type: 'explorer' };
  const time = { start: 1, end: 2 };
  const reported = metadata ?? undefined;

  switch (status) {
    case 'pending':
      return { status, input, raw: JSON.stringify(input) };
    case 'running':
      // `ToolStateRunning` requires `time.start`, not just metadata.
      return {
        status,
        input,
        ...(reported ? { metadata: reported } : {}),
        time: { start: time.start },
      };
    case 'completed':
      return {
        status,
        input,
        output: 'done',
        title: 'task',
        metadata: reported ?? {},
        time,
      };
    case 'error':
      return {
        status,
        input,
        error: 'aborted',
        ...(reported ? { metadata: reported } : {}),
        time,
      };
  }
}

/**
 * A native `task` tool part shaped by the SDK's own `ToolPart` type: the parent
 * session, the originating `callID`, the tool state, and — once the child exists
 * — the child session id in the state metadata.
 */
async function taskPart(
  hook: Hook,
  input: {
    parentId: string;
    callId: string;
    status: ToolState['status'];
    sessionId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const part: ToolPart = {
    id: `prt_${input.parentId}_${input.callId}`,
    sessionID: input.parentId,
    messageID: 'msg-1',
    type: 'tool',
    callID: input.callId,
    tool: 'task',
    state: taskPartState(
      input.status,
      input.metadata ?? (input.sessionId ? { sessionId: input.sessionId } : {}),
    ),
  };

  await hook.event({
    event: {
      type: 'message.part.updated',
      properties: { part },
    },
  });
}

async function readFromChild(
  hook: Hook,
  sessionID: string,
  callID: string,
  path: string,
  lineCount: number,
  startLine = 1,
): Promise<void> {
  await hook['tool.execute.after'](
    { tool: 'read', sessionID, callID },
    {
      output: [
        `<path>${path}</path>`,
        '<type>file</type>',
        '<content>',
        ...Array.from(
          { length: lineCount },
          (_, index) => `${startLine + index}: line`,
        ),
        '</content>',
      ].join('\n'),
    },
  );
}

describe('task-session-manager hook', () => {
  test('stores task sessions and injects resumable-session prompt block', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
          prompt: 'inspect config schema',
        },
      },
    );

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system.join('\n')).toContain('### Resumable Sessions');
    expect(system.system.join('\n')).toContain('explorer: exp-1 config schema');
  });

  test('resolves remembered aliases to real task ids before execution', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
          prompt: 'inspect config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const next = {
      args: {
        subagent_type: 'explorer',
        description: 'continue schema work',
        task_id: 'exp-1',
      },
    };
    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      next,
    );

    expect(next.args.task_id).toBe('child-1');
  });

  test('tracks files read by child sessions in resumable prompt context', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'session files',
        },
      },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    await readFromChild(hook, 'child-1', 'read-1', '/tmp/src/index.ts', 12);
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system.join('\n')).toContain('exp-1 session files');
    expect(system.system.join('\n')).toContain(
      'Context read by exp-1: src/index.ts (12 lines)',
    );
  });

  test('accumulates multiple reads and hides tiny read context', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'line counts' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');

    await readFromChild(hook, 'child-1', 'read-1', '/tmp/src/small.ts', 4);
    await readFromChild(hook, 'child-1', 'read-2', '/tmp/src/large.ts', 7);
    await readFromChild(hook, 'child-1', 'read-3', '/tmp/src/large.ts', 5, 8);

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    const prompt = system.system.join('\n');
    expect(prompt).not.toContain('small.ts');
    expect(prompt).toContain('src/large.ts (12 lines)');
  });

  test('counts overlapping repeated reads once per unique line', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'repeat reads' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    for (const call of ['read-1', 'read-2']) {
      await readFromChild(hook, 'child-1', call, '/tmp/src/repeat.ts', 12);
    }

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system.join('\n')).toContain('src/repeat.ts (12 lines)');
    expect(system.system.join('\n')).not.toContain('src/repeat.ts (24 lines)');
  });

  test('uses configured read context thresholds', async () => {
    const { hook } = createHook({
      readContextMinLines: 5,
      readContextMaxFiles: 1,
    });

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'configured caps' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    for (const [file, lines] of [
      ['small.ts', 4],
      ['medium.ts', 5],
      ['large.ts', 12],
    ] as const) {
      await readFromChild(
        hook,
        'child-1',
        `read-${file}`,
        `/tmp/src/${file}`,
        lines,
      );
    }

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    const prompt = system.system.join('\n');
    expect(prompt).not.toContain('small.ts');
    expect(prompt).toContain('Context read by exp-1:');
    expect(prompt).toContain('(+1 more)');
  });

  test('ignores reads from unmanaged child sessions', async () => {
    const { hook } = createHook({
      shouldManageSession: (sessionID) => sessionID === 'parent-1',
    });

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-1', parentID: 'other-parent' } },
      },
    });
    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'child-1', callID: 'read-1' },
      {
        output: [
          '<path>/tmp/src/index.ts</path>',
          '<content>',
          ...Array.from({ length: 12 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
      },
    );

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'unmanaged read' } },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    const prompt = system.system.join('\n');
    expect(prompt).toContain('exp-1 unmanaged read');
    expect(prompt).not.toContain('Context read by exp-1');
  });

  test('prunes read context when remembered sessions are evicted', async () => {
    const { hook } = createHook();

    for (const index of [1, 2, 3]) {
      await hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: `call-${index}` },
        { args: { subagent_type: 'explorer', description: `thread ${index}` } },
      );
      await childCreated(hook, `child-${index}`, 'parent-1');
      await readFromChild(
        hook,
        `child-${index}`,
        `read-${index}`,
        `/tmp/src/file-${index}.ts`,
        12,
      );
      await hook['tool.execute.after'](
        { tool: 'task', sessionID: 'parent-1', callID: `call-${index}` },
        {
          output: `task_id: child-${index} (for resuming to continue this task if needed)`,
        },
      );
    }

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    const prompt = system.system.join('\n');
    expect(prompt).not.toContain('exp-1 thread 1');
    expect(prompt).not.toContain('file-1.ts');
    expect(prompt).toContain('exp-2 thread 2');
    expect(prompt).toContain('file-2.ts (12 lines)');
    expect(prompt).toContain('exp-3 thread 3');
    expect(prompt).toContain('file-3.ts (12 lines)');
  });

  test('drops remembered session only when the host confirms it is missing', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const next = {
      args: {
        subagent_type: 'explorer',
        description: 'continue schema work',
        task_id: 'exp-1',
      },
    };
    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      next,
    );

    expect(next.args.task_id).toBe('child-1');

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: '[ERROR] Session not found',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );
    expect(system.system.join('\n')).not.toContain('exp-1');
  });

  test('drops resumed predecessor when success returns a new task id', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue schema work',
          task_id: 'exp-1',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output:
          'task_id: child-2 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system.join('\n')).toContain('continue schema work');
    expect(system.system.join('\n')).not.toContain('config schema');
  });

  test('does not drop remembered session on non-runtime session text', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue schema work',
          task_id: 'exp-1',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: 'Found no session cookies in fixtures, continuing analysis.',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system.join('\n')).toContain('exp-1 config schema');
  });

  test('ignores sessions that are not orchestrator-managed', async () => {
    const { hook } = createHook({ shouldManageSession: () => false });

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'manual-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'manual-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'manual-1' },
      system,
    );

    expect(system.system).toEqual(['base']);
  });

  test('cleans up remembered sessions when parent or child is deleted', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'architecture review',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'child-1' },
      },
    });

    const afterChildDelete = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      afterChildDelete,
    );
    expect(afterChildDelete.system).toEqual(['base']);
  });

  test('cleans pending calls when parent session is deleted', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'architecture review',
        },
      },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'parent-1' },
      },
    });

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system).toEqual(['base']);
  });

  test('keeps pending order when a resume call is recorded after a fresh call', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue schema work',
          task_id: 'exp-1',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: '[ERROR] Session not found',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-3',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'architecture review',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-3',
      },
      {
        output:
          'task_id: child-3 (for resuming to continue this task if needed)',
      },
    );

    const system = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      system,
    );

    expect(system.system.join('\n')).toContain(
      'oracle: ora-1 architecture review',
    );
  });

  test('records a real host envelope and reuses the alias on a follow-up', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: {
          subagent_type: 'backend-developer',
          description: 'payment flow',
          prompt: 'implement payment flow',
        },
        output: taskEnvelope('ses_child1'),
      },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('### Resumable Sessions');
    expect(prompt).toContain('backend-developer: bed-1 payment flow');
    expect(prompt).toContain('task_id="<alias>"');
    expect(prompt).toContain('OMIT task_id');

    // Second delegation on the same thread reuses the same child session.
    const resumed = await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'backend-developer',
          description: 'continue payment flow',
          task_id: 'bed-1',
        },
        output: taskEnvelope('ses_child1', 'continued'),
      },
    );

    expect(resumed.task_id).toBe('ses_child1');
    // The alias stays bound to the same child across reuse.
    expect(await promptFor(hook, 'parent-1')).toContain(
      'backend-developer: bed-1 continue payment flow',
    );
  });

  test('records the host-reported id when the result text is truncated', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'router' },
        output: '<task id="ses_trunc" state="completed">\n<task_result>\nhalf',
        metadata: { sessionId: 'ses_trunc' },
      },
    );

    const resumed = await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'router follow up',
          task_id: 'exp-1',
        },
      },
    );

    expect(resumed.task_id).toBe('ses_trunc');
  });

  test('records the host-reported id when the result text is not a string', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'router' },
        output: { structured: true },
        metadata: { sessionId: 'ses_metaonly' },
      },
    );

    const resumed = await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'router follow up',
          task_id: 'exp-1',
        },
      },
    );

    expect(resumed.task_id).toBe('ses_metaonly');
  });

  test('omitting task_id starts a fresh child and keeps the old alias', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    const fresh = await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: { subagent_type: 'explorer', description: 'unrelated' },
        output: taskEnvelope('ses_child2'),
      },
    );

    expect('task_id' in fresh).toBe(false);

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 routing');
    expect(prompt).toContain('exp-2 unrelated');
  });

  test('normalizes a blank task_id to a fresh delegation', async () => {
    const { hook } = createHook();

    const args = await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'blank reference',
          task_id: '   ',
        },
        output: taskEnvelope('ses_child1'),
      },
    );

    expect('task_id' in args).toBe(false);
    expect(await promptFor(hook, 'parent-1')).toContain(
      'exp-1 blank reference',
    );
  });

  test('assigns aliases to debugger and other registered agents', async () => {
    const { hook } = createHook();

    for (const [index, subagentType] of [
      'debugger',
      'business-analyst',
      'planner',
      'sprinter',
    ].entries()) {
      await runTask(
        hook,
        { sessionID: 'parent-1', callID: `call-${index}` },
        {
          args: { subagent_type: subagentType, description: 'thread' },
          output: taskEnvelope(`ses_child${index}`),
        },
      );
    }

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('debugger: dbg-1 thread');
    expect(prompt).toContain('business-analyst: bas-1 thread');
    expect(prompt).toContain('planner: pln-1 thread');
    expect(prompt).toContain('sprinter: spr-1 thread');
  });

  test('fails closed on an unknown alias without mutating state', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    const args = {
      subagent_type: 'explorer',
      description: 'stale reference',
      task_id: 'exp-9',
    };
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args },
      ),
    ).rejects.toThrow(/exp-9/);
    expect(args.task_id).toBe('exp-9');

    // No pending call was recorded, so a late result cannot be remembered.
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { output: taskEnvelope('ses_late') },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 routing');
    expect(prompt).not.toContain('ses_late');
    expect(prompt).not.toContain('stale reference');
  });

  test('names the known aliases in the unknown-alias error', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args: { subagent_type: 'explorer', task_id: 'exp-9' } },
      ),
    ).rejects.toThrow(/Known resumable sessions here: explorer: exp-1/);
  });

  test('rejects aliases from another agent, parent, or an evicted slot', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    // Wrong agent
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args: { subagent_type: 'oracle', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);

    // Wrong parent
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-2', callID: 'call-3' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);

    // Raw id that was never remembered
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-4' },
        { args: { subagent_type: 'explorer', task_id: 'ses_never_seen' } },
      ),
    ).rejects.toThrow(/ses_never_seen/);

    // Evicted: a second explorer session pushes exp-1 out of the window.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-5' },
      {
        args: { subagent_type: 'explorer', description: 'other' },
        output: taskEnvelope('ses_child2'),
      },
    );
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-6' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('accepts a remembered raw id for the same parent and agent', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    const args = await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'raw id follow up',
          task_id: 'ses_child1',
        },
        output: taskEnvelope('ses_child1'),
      },
    );

    expect(args.task_id).toBe('ses_child1');
  });

  test('keeps the child on cancellation and generic failures', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    for (const [index, failure] of [
      '[ERROR] Session cancelled by user',
      '[ERROR] rate limit exceeded, try again later',
      'Found no session cookies in fixtures, continuing analysis.',
    ].entries()) {
      await runTask(
        hook,
        { sessionID: 'parent-1', callID: `call-cancel-${index}` },
        {
          args: {
            subagent_type: 'explorer',
            description: `retry ${index}`,
            task_id: 'exp-1',
          },
          output: failure,
        },
      );

      expect(await promptFor(hook, 'parent-1')).toContain('exp-1');
    }

    // A confirmed missing session is the only case that drops the child.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-missing' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'gone',
          task_id: 'exp-1',
        },
        output: '[ERROR] Session not found',
      },
    );

    expect(await promptFor(hook, 'parent-1')).not.toContain('exp-1');
  });

  test('releases the replaced child alias and its context', async () => {
    const { hook } = createHook();

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'ses_child1', parentID: 'parent-1' } },
      },
    });
    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'ses_child1', callID: 'read-1' },
      {
        output: [
          '<path>/tmp/src/index.ts</path>',
          '<content>',
          ...Array.from({ length: 12 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
      },
    );
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    // The host replaced the child instead of resuming it.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'replacement',
          task_id: 'exp-1',
        },
        output: taskEnvelope('ses_child2'),
      },
    );

    // Reads from the replaced child no longer reach the prompt.
    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'ses_child1', callID: 'read-2' },
      {
        output: [
          '<path>/tmp/src/late.ts</path>',
          '<content>',
          ...Array.from({ length: 20 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
      },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-2 replacement');
    expect(prompt).not.toContain('exp-1');
    expect(prompt).not.toContain('late.ts');
  });

  test('ignores a late result for a child deleted mid-resume', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'resume then delete',
          task_id: 'exp-1',
        },
      },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'ses_child1' },
      },
    });

    // Deleting the child dropped the alias, so the prompt has no resumable
    // session at all.
    expect(await promptFor(hook, 'parent-1')).toEqual('base');

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { output: taskEnvelope('ses_child2') },
    );

    // The late result registered nothing: the prompt never carries raw child
    // ids, so the observable check is that no alias came back and the deleted
    // alias is still unusable.
    expect(await promptFor(hook, 'parent-1')).toEqual('base');
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-3' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('cannot revive a deleted resume after the tombstone window churns', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'resume then delete',
          task_id: 'exp-1',
        },
      },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'ses_child1' },
      },
    });

    // More deletions than the remembered-deletion bound.
    for (let index = 0; index < 250; index += 1) {
      await hook.event({
        event: {
          type: 'session.deleted',
          properties: { sessionID: `ses_unrelated_${index}` },
        },
      });
    }

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { output: taskEnvelope('ses_child2') },
    );

    expect(await promptFor(hook, 'parent-1')).toEqual('base');
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-3' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('rejects a fresh result naming a child deleted mid-call', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'deleted child' } },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'ses_child1' },
      },
    });

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { output: taskEnvelope('ses_child1') },
    );

    expect(await promptFor(hook, 'parent-1')).toEqual('base');
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('rejects a replacement result naming a deleted child', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'replacement',
          task_id: 'exp-1',
        },
      },
    );
    // The replacement child is deleted while the call is still in flight.
    await childCreated(hook, 'ses_child2', 'parent-1');
    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'ses_child2' },
      },
    });

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { output: taskEnvelope('ses_child2') },
    );

    // The dead replacement is not remembered; the predecessor alias survives
    // because nothing confirmed the predecessor itself is gone.
    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 routing');
    expect(prompt).not.toContain('replacement');
  });

  test('keeps the early-registered child when the call yields no parseable id', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'no metadata' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    await readFromChild(hook, 'child-1', 'read-1', '/tmp/src/orphan.ts', 12);

    // No metadata and no parseable envelope: nothing identifies the child.
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { output: '[ERROR] rate limit exceeded, try again later' },
    );

    // The child was attributed unambiguously before the call failed, so the
    // alias stands and the read it made is still attached to it.
    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 no metadata');
    expect(prompt).toContain('orphan.ts');

    // A later delegation reporting the same child keeps that same alias.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: { subagent_type: 'explorer', description: 'retry' },
        output: 'task_id: child-1 (for resuming to continue this task)',
      },
    );

    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 retry');
  });

  test('registers an aborted fresh delegation from session.created alone', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'aborted run' } },
    );
    // The user stops the run here: the child exists, but `after` never runs.
    await childCreated(hook, 'child-1', 'parent-1');

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 aborted run');

    // And the alias resolves on the next turn.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue',
          task_id: 'exp-1',
        },
        output: 'task_id: child-1 (for resuming to continue this task)',
      },
    );

    const resumed = await promptFor(hook, 'parent-1');
    expect(resumed).toContain('exp-1 continue');
    expect(resumed).not.toContain('exp-2');
  });

  test('a normal result does not duplicate or renumber an early alias', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'routing' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { output: 'task_id: child-1 (for resuming to continue this task)' },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 routing');
    expect(prompt).not.toContain('exp-2');
  });

  test('reconciles a changed child id from an early registration', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'routing' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    await readFromChild(hook, 'child-1', 'read-1', '/tmp/src/stale.ts', 20);

    // The host reports a different child than the one it announced.
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { output: 'task_id: child-2 (for resuming to continue this task)' },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-2 routing');
    expect(prompt).not.toContain('stale.ts');

    // The stale early child is no longer resumable.
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('does not guess a session.created child while several calls are in flight', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'first',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'second',
    });
    await childCreated(hook, 'child-1', 'parent-1');

    // No pending call may claim the child: only an exact task part knows which
    // call owns it.
    expect(await promptFor(hook, 'parent-1')).toEqual('base');

    // ... and exact correlation still works with both calls in flight.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 first');
  });

  test('aliases concurrent mixed-agent calls from exact task parts alone', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'routing files',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'auth review',
    });

    // Interrupted run: parts arrive interleaved, out of order, and with an
    // early metadata-less snapshot. No `tool.execute.after` ever runs.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'running',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'running',
      sessionId: 'child-oracle',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-explorer',
    });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 routing files');
    expect(prompt).toContain('ora-1 auth review');

    // Each alias resolves to its own child, not a sibling's.
    const explorer = await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'more routing',
      taskId: 'exp-1',
    });
    const oracle = await startTask(hook, {
      callId: 'call-4',
      agent: 'oracle',
      description: 'more review',
      taskId: 'ora-1',
    });
    expect(explorer.task_id).toBe('child-explorer');
    expect(oracle.task_id).toBe('child-oracle');
  });

  test('keeps three interrupted same-agent children with identical descriptions', async () => {
    const { hook } = createHook();

    for (const callId of ['call-1', 'call-2', 'call-3']) {
      await startTask(hook, {
        callId,
        agent: 'explorer',
        description: 'investigate',
      });
    }
    // Interleaved and reversed, with no `after` and the default window of 2.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-3',
      status: 'running',
      sessionId: 'child-3',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'running',
      sessionId: 'child-2',
    });

    // All three survive the cap, because unsettled children are protected.
    const aliases = ['exp-1', 'exp-2', 'exp-3'];
    expect(await promptFor(hook, 'parent-1')).toContain('exp-3 investigate');

    const resolved = new Map<string, unknown>();
    for (const alias of aliases) {
      const args = await startTask(hook, {
        callId: `resume-${alias}`,
        agent: 'explorer',
        description: `continue ${alias}`,
        taskId: alias,
      });
      resolved.set(alias, args.task_id);
    }

    // Identical labels must not make two aliases point at one child.
    expect([...resolved.values()].sort()).toEqual([
      'child-1',
      'child-2',
      'child-3',
    ]);
  });

  test('keeps a completed sibling and an interrupted sibling', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'finishes',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'interrupted',
    });

    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'completed',
      sessionId: 'child-1',
    });
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-1') });

    // Sibling two is aborted: an error part and no `after` at all.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'error',
      sessionId: 'child-2',
    });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 finishes');
    expect(prompt).toContain('ora-1 interrupted');
  });

  test('binds a child that arrives after a metadata-less error part', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'aborted run',
    });

    // An error part with no child id must not settle the call: the host may
    // still publish the child-bearing snapshot.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'error',
    });
    expect(await promptFor(hook, 'parent-1')).toEqual('base');

    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 aborted run');
  });

  test('treats repeated and reordered task parts as idempotent', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'routing',
    });

    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'completed',
      sessionId: 'child-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-1') });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 routing');
    expect(prompt).not.toContain('exp-2');
  });

  test('a session.created fallback never overrides an exact binding', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'routing',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-exact',
    });

    // A stale creation event for a sibling of the same parent arrives late; the
    // weaker source must not take the child the task part already claimed.
    await childCreated(hook, 'child-other', 'parent-1');

    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 routing');

    const args = await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
    });
    expect(args.task_id).toBe('child-exact');
  });

  test('a task part replacing the bound child drops only that call binding', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'routing',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'review',
    });

    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-stale',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'running',
      sessionId: 'child-oracle',
    });
    // The host swapped the child of call-1 only.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-final',
    });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-2 routing');
    expect(prompt).toContain('ora-1 review');
  });

  test('a reused call id settles the old execution before the new one', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'first attempt',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-old',
    });

    // The host retries the same call id: the first execution must be cleaned up
    // without deleting the retry that takes the same slot.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'retry',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-new',
    });
    await settleTask(hook, {
      callId: 'call-1',
      output: taskResult('child-new'),
    });

    // The retry is registered: the old execution's cleanup no longer deletes
    // the call that took its slot. Its alias is the next one because the first
    // number was already spent on the abandoned child.
    expect(await promptFor(hook, 'parent-1')).toContain('exp-2 retry');

    const args = await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-2',
    });
    expect(args.task_id).toBe('child-new');
  });

  test('a resumed child survives a metadata-less abort and history pressure', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    // A resume that is aborted without ever reporting a child again.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'interrupted',
      taskId: 'exp-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'error',
    });
    await settleTask(hook, { callId: 'call-1', output: '[ERROR] aborted' });

    // A same-agent sibling then settles, which the window would normally use
    // to evict the older child.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'later',
    });
    await settleTask(hook, { callId: 'call-2', output: taskResult('child-1') });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-2 later');
    const args = await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
    });
    expect(args.task_id).toBe('child-0');
  });

  test('one completion does not unprotect a child another execution holds', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    // Two concurrent resumes of the same child.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'one',
      taskId: 'exp-1',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'two',
      taskId: 'exp-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-0',
    });
    // The second execution is interrupted, so it keeps its own claim.
    // The second execution is interrupted before reporting anything, so it is
    // still active and still holds the child.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'error',
    });

    // The first one completes normally and answers the interrupted thread.
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-0') });

    // History pressure must not take the alias the interrupted call still needs.
    await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'later',
    });
    await settleTask(hook, { callId: 'call-3', output: taskResult('child-1') });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-1');
    const args = await startTask(hook, {
      callId: 'call-4',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
    });
    expect(args.task_id).toBe('child-0');
  });

  test('a later successful continuation clears stale recovery retention', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    // An interrupted delegation leaves recovery retention on child-0.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'interrupted',
      taskId: 'exp-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'error',
      sessionId: 'child-0',
    });

    // Answering it successfully ends that retention, so the capped history may
    // now evict the child.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
    });
    await settleTask(hook, { callId: 'call-2', output: taskResult('child-0') });

    await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'later',
    });
    await settleTask(hook, { callId: 'call-3', output: taskResult('child-1') });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-2 later');
    expect(await promptFor(hook, 'parent-1')).not.toContain('exp-1');
  });

  test('recovery retention is bounded, releasing the oldest first', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    // 201 interrupted delegations, each retaining its child for recovery.
    for (let index = 0; index < 201; index += 1) {
      await startTask(hook, {
        callId: `call-${index}`,
        agent: 'explorer',
        description: `child-${index}`,
      });
      await taskPart(hook, {
        parentId: 'parent-1',
        callId: `call-${index}`,
        status: 'error',
        sessionId: `child-${index}`,
      });
    }

    // The oldest retention overflowed the window, so child-0 is no longer
    // protected. One more settled delegation is enough for the capped history
    // to take it; it is released, not deleted.
    await startTask(hook, {
      callId: 'call-last',
      agent: 'explorer',
      description: 'child-last',
    });
    await settleTask(hook, {
      callId: 'call-last',
      output: taskResult('child-last'),
    });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('child-200');
    expect(prompt).toContain('child-last');
    expect(prompt).not.toContain('child-0');
  });

  test('an interrupted child never has an unprotected gap under pressure', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    // History pressure is already at capacity before the interruption, so the
    // handoff from the active owner to recovery ownership must be atomic: any
    // gap would let trimming evict the child right there.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'pressure',
    });
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-1') });

    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'interrupted',
      taskId: 'exp-2',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'error',
    });
    await settleTask(hook, { callId: 'call-2', output: '[ERROR] aborted' });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-2');
    const args = await startTask(hook, {
      callId: 'call-4',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-2',
    });
    expect(args.task_id).toBe('child-1');
  });

  test('a resume replacing itself under one key keeps the child protected', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'pressure',
    });
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-1') });

    // The same composite key resumes the same child again: the replacement must
    // clean up the previous execution before taking the slot's shared owner.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'first attempt',
      taskId: 'exp-2',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'retry',
      taskId: 'exp-2',
    });

    // While the replacement is still in flight it must hold the slot's owner:
    // history pressure right now would evict the child if the previous
    // execution's cleanup had already released that shared owner.
    await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'pressure',
    });
    await settleTask(hook, { callId: 'call-3', output: taskResult('child-2') });
    expect(await promptFor(hook, 'parent-1')).toContain('exp-2');

    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'error',
    });
    await settleTask(hook, { callId: 'call-2', output: '[ERROR] aborted' });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-2');
    const args = await startTask(hook, {
      callId: 'call-4',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-2',
    });
    expect(args.task_id).toBe('child-1');
  });

  test('deleting a parent frees its children retention capacity', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    for (const parentId of ['parent-1', 'parent-2']) {
      await startTask(hook, {
        callId: 'call-0',
        agent: 'explorer',
        description: 'routing',
        parentId,
      });
      await settleTask(hook, {
        callId: 'call-0',
        output: taskResult(`child-${parentId}`),
        parentId,
      });
      await startTask(hook, {
        callId: 'call-1',
        agent: 'explorer',
        description: 'interrupted',
        taskId: 'exp-1',
        parentId,
      });
      await taskPart(hook, {
        parentId,
        callId: 'call-1',
        status: 'error',
        sessionId: `child-${parentId}`,
      });
    }

    // Both children are retained; dropping one parent must release exactly that
    // parent's retention, not touch the other.
    await hook.event({
      event: { type: 'session.deleted', properties: { sessionID: 'parent-1' } },
    });

    // The surviving parent's child keeps its protection: settling another
    // same-agent child of that parent cannot evict it.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'newest',
      parentId: 'parent-2',
    });
    await settleTask(hook, {
      callId: 'call-2',
      output: taskResult('child-new'),
      parentId: 'parent-2',
    });

    const prompt = await promptFor(hook, 'parent-2');
    expect(prompt).toContain('exp-2 newest');
    expect(prompt).toContain('exp-1');
    const args = await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
      parentId: 'parent-2',
    });
    expect(args.task_id).toBe('child-parent-2');
  });

  test('replacing a retained child clears its retention membership', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    // Retain child-0 for recovery.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'interrupted',
      taskId: 'exp-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'error',
      sessionId: 'child-0',
    });

    // A later continuation replaces that child, so it is forgotten for good.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
    });
    await settleTask(hook, { callId: 'call-2', output: taskResult('child-1') });

    // Re-registering the forgotten id in another parent must not inherit the
    // stale retention: a leftover membership would silently skip protecting it,
    // leaving the new child evictable as if it were settled history.
    await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'reused id',
      parentId: 'parent-2',
    });
    await taskPart(hook, {
      parentId: 'parent-2',
      callId: 'call-3',
      status: 'error',
      sessionId: 'child-0',
    });
    await startTask(hook, {
      callId: 'call-4',
      agent: 'explorer',
      description: 'pressure',
      parentId: 'parent-2',
    });
    await settleTask(hook, {
      callId: 'call-4',
      output: taskResult('child-new'),
      parentId: 'parent-2',
    });

    const args = await startTask(hook, {
      callId: 'call-5',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
      parentId: 'parent-2',
    });
    expect(args.task_id).toBe('child-0');
  });

  test('deleting a parent leaves no retention behind for its children', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    // One retained child, and one child whose call is still in flight.
    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'retained',
    });
    await settleTask(hook, {
      callId: 'call-0',
      output: taskResult('child-old'),
    });
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'interrupted',
      taskId: 'exp-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'error',
      sessionId: 'child-old',
    });

    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'in flight',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'running',
      sessionId: 'child-live',
    });

    await hook.event({
      event: { type: 'session.deleted', properties: { sessionID: 'parent-1' } },
    });

    // Teardown must not hand either child to recovery retention, so reusing the
    // same ids in another parent protects them for the right reason and cannot
    // be skipped by a leftover membership.
    for (const [callId, childId, description] of [
      ['call-3', 'child-old', 'reused old'],
      ['call-4', 'child-live', 'reused live'],
    ]) {
      await startTask(hook, {
        callId,
        agent: 'explorer',
        description,
        parentId: 'parent-2',
      });
      await taskPart(hook, {
        parentId: 'parent-2',
        callId,
        status: 'error',
        sessionId: childId,
      });
    }
    await startTask(hook, {
      callId: 'call-5',
      agent: 'explorer',
      description: 'pressure',
      parentId: 'parent-2',
    });
    await settleTask(hook, {
      callId: 'call-5',
      output: taskResult('child-new'),
      parentId: 'parent-2',
    });

    const args = await startTask(hook, {
      callId: 'call-6',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
      parentId: 'parent-2',
    });
    expect(args.task_id).toBe('child-old');
    const second = await startTask(hook, {
      callId: 'call-7',
      agent: 'explorer',
      description: 'continue again',
      taskId: 'exp-2',
      parentId: 'parent-2',
    });
    expect(second.task_id).toBe('child-live');
  });

  test('deleting a retained child frees its recovery capacity', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    // One live child and one doomed child, both retained for recovery. The live
    // one is retained first, so a leftover membership for the doomed child would
    // be the *newer* entry and overflow would evict the live one instead.
    for (const childId of ['child-live', 'child-doomed']) {
      await startTask(hook, {
        callId: `call-${childId}`,
        agent: 'explorer',
        description: childId,
      });
      await settleTask(hook, {
        callId: `call-${childId}`,
        output: taskResult(childId),
      });
      await startTask(hook, {
        callId: `interrupt-${childId}`,
        agent: 'explorer',
        description: `${childId} interrupted`,
        taskId: childId === 'child-live' ? 'exp-1' : 'exp-2',
      });
      await taskPart(hook, {
        parentId: 'parent-1',
        callId: `interrupt-${childId}`,
        status: 'error',
        sessionId: childId,
      });
    }

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'child-doomed' },
      },
    });

    // Fill the window to exactly its bound. A leftover membership for the
    // deleted child would occupy one slot, pushing a live retained child out.
    for (let index = 0; index < 199; index += 1) {
      await startTask(hook, {
        callId: `fill-${index}`,
        agent: 'explorer',
        description: `fill-${index}`,
      });
      await taskPart(hook, {
        parentId: 'parent-1',
        callId: `fill-${index}`,
        status: 'error',
        sessionId: `filler-${index}`,
      });
    }

    // Settled history is the pressure that actually evicts: a child that lost
    // its protection would lose its slot here.
    await startTask(hook, {
      callId: 'settle',
      agent: 'explorer',
      description: 'settled',
    });
    await settleTask(hook, { callId: 'settle', output: taskResult('settled') });

    // The live child kept its protection, so its alias still resolves.
    const args = await startTask(hook, {
      callId: 'check',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-1',
    });
    expect(args.task_id).toBe('child-live');
  });

  test('a re-registered child id is retained again after a confirmed missing one', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    // The host confirms the remembered child is gone, so it is forgotten.
    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'resume',
      taskId: 'exp-1',
    });
    await settleTask(hook, {
      callId: 'call-1',
      output: '[ERROR] Session not found',
    });
    expect(await promptFor(hook, 'parent-1')).toEqual('base');

    // A later fresh delegation reuses that id and is interrupted. Retention must
    // apply to the new child, not be skipped by stale state from the old one.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'pressure',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'error',
      sessionId: 'child-0',
    });
    await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'newest',
    });
    await settleTask(hook, { callId: 'call-3', output: taskResult('child-1') });

    // The re-registered child kept exp-2 (the next number after the forgotten
    // exp-1); resolving it proves the retention applied to the new child.
    const args = await startTask(hook, {
      callId: 'call-4',
      agent: 'explorer',
      description: 'continue',
      taskId: 'exp-2',
    });
    expect(args.task_id).toBe('child-0');
  });

  test('a settled child rejoins the capped history', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 2 });

    // Three settled delegations: the oldest is evicted by the cap.
    for (const [index, childId] of [
      'child-1',
      'child-2',
      'child-3',
    ].entries()) {
      await startTask(hook, {
        callId: `call-${index}`,
        agent: 'explorer',
        description: childId,
      });
      await settleTask(hook, {
        callId: `call-${index}`,
        output: taskResult(childId),
      });
    }

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('child-3');
    expect(prompt).toContain('child-2');
    expect(prompt).not.toContain('child-1');
  });

  test('is not poisoned by an earlier interrupted call with no task part', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-stuck',
      agent: 'explorer',
      description: 'never reported',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'later work',
    });
    await childCreated(hook, 'child-2', 'parent-1');
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-2',
      status: 'running',
      sessionId: 'child-2',
    });

    // Exact correlation needs only its own call, so a stranded call cannot hold
    // a later one back.
    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 later work');
  });

  test('registers nothing for a part with a wrong parent, call, or status', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'routing',
    });

    // Right call id, wrong parent session.
    await taskPart(hook, {
      parentId: 'other-parent',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    // Right parent, unknown call id.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-unknown',
      status: 'running',
      sessionId: 'child-2',
    });
    // Unusable metadata and an unknown tool state.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      metadata: { sessionId: { no: 1 } },
    });
    await hook.event({
      event: {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'prt_1',
            sessionID: 'parent-1',
            messageID: 'msg-1',
            type: 'tool',
            callID: 'call-1',
            tool: 'task',
            state: { status: 'queued', input: {} },
          },
        },
      },
    });
    await hook.event({
      event: { type: 'message.part.updated', properties: { part: 'nonsense' } },
    });
    await hook.event({
      event: { type: 'message.part.updated', properties: {} },
    });

    expect(await promptFor(hook, 'parent-1')).toEqual('base');
  });

  test('keeps parent sessions independent for the same call id', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'parent one',
      parentId: 'parent-1',
    });
    await startTask(hook, {
      callId: 'call-1',
      agent: 'oracle',
      description: 'parent two',
      parentId: 'parent-2',
    });

    // A result for one parent must not consume the other parent's call.
    await settleTask(hook, {
      callId: 'call-1',
      output: taskResult('child-1'),
      parentId: 'parent-1',
    });
    await taskPart(hook, {
      parentId: 'parent-2',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-2',
    });

    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 parent one');
    const other = await promptFor(hook, 'parent-2');
    expect(other).toContain('ora-1 parent two');
    expect(other).not.toContain('parent one');

    // Each parent still resolves its own alias.
    const args = await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'more',
      taskId: 'ora-1',
      parentId: 'parent-2',
    });
    expect(args.task_id).toBe('child-2');
  });

  test('an errored child keeps its protection against the per-agent window', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'interrupted',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'error',
      sessionId: 'child-1',
    });

    // Two later delegations settle normally; the window evicts settled history
    // but never the interrupted child.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'second',
    });
    await settleTask(hook, { callId: 'call-2', output: taskResult('child-2') });
    await startTask(hook, {
      callId: 'call-3',
      agent: 'explorer',
      description: 'third',
    });
    await settleTask(hook, { callId: 'call-3', output: taskResult('child-3') });

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 interrupted');
    expect(prompt).toContain('exp-3 third');
    expect(prompt).not.toContain('second');
  });

  test('a repeated session.created takes only one provisional reference', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'first',
    });
    await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'second',
    });
    // Ambiguous, so no call claims the child, and creation is announced twice.
    await childCreated(hook, 'child-1', 'parent-1');
    await childCreated(hook, 'child-1', 'parent-1');
    await readFromChild(hook, 'child-1', 'read-1', '/tmp/src/stale.ts', 12);

    await settleTask(hook, { callId: 'call-2', output: taskResult('child-2') });
    await settleTask(hook, { callId: 'call-1', output: '[ERROR] rate limit' });

    // One release must be enough to forget the child, so the read collected
    // while it was provisional does not follow it forever.
    await startTask(hook, {
      callId: 'call-3',
      agent: 'oracle',
      description: 'retry',
    });
    await settleTask(hook, { callId: 'call-3', output: taskResult('child-1') });

    expect(await promptFor(hook, 'parent-1')).not.toContain('stale.ts');
  });

  test('overlapping resumes of one alias share it and settle independently', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    const first = await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'one',
      taskId: 'exp-1',
    });
    const second = await startTask(hook, {
      callId: 'call-2',
      agent: 'explorer',
      description: 'two',
      taskId: 'exp-1',
    });
    expect(first.task_id).toBe('child-0');
    expect(second.task_id).toBe('child-0');

    await settleTask(hook, { callId: 'call-1', output: taskResult('child-0') });

    // The alias survives for the still-running sibling; no duplicate was made.
    expect(await promptFor(hook, 'parent-1')).not.toContain('exp-2');
    await settleTask(hook, { callId: 'call-2', output: taskResult('child-0') });
    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 two');
  });

  test('deleting the parent releases resume references it owned', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-0',
      agent: 'explorer',
      description: 'routing',
    });
    await settleTask(hook, { callId: 'call-0', output: taskResult('child-0') });

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'one',
      taskId: 'exp-1',
    });
    await readFromChild(hook, 'child-0', 'read-1', '/tmp/src/mid.ts', 12);

    await hook.event({
      event: { type: 'session.deleted', properties: { sessionID: 'parent-1' } },
    });

    // The child is forgotten with the parent, so a later delegation that names
    // it inherits none of the reads collected while the resume was in flight.
    await startTask(hook, {
      callId: 'call-2',
      agent: 'oracle',
      description: 'review',
      parentId: 'parent-2',
    });
    await settleTask(hook, {
      callId: 'call-2',
      output: taskResult('child-0'),
      parentId: 'parent-2',
    });

    const prompt = await promptFor(hook, 'parent-2');
    expect(prompt).toContain('ora-1 review');
    expect(prompt).not.toContain('mid.ts');
  });

  test('deleting a bound child invalidates its pending call for good', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'aborted run',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    expect(await promptFor(hook, 'parent-1')).toContain('exp-1 aborted run');

    await hook.event({
      event: { type: 'session.deleted', properties: { sessionID: 'child-1' } },
    });

    // The call owned that child, so neither a late task part nor the late
    // result may bring the alias back.
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-1') });

    expect(await promptFor(hook, 'parent-1')).toEqual('base');
  });

  test('a late part cannot resurrect a deleted child after tombstone churn', async () => {
    const { hook } = createHook();

    await startTask(hook, {
      callId: 'call-1',
      agent: 'explorer',
      description: 'aborted run',
    });
    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'running',
      sessionId: 'child-1',
    });
    await hook.event({
      event: { type: 'session.deleted', properties: { sessionID: 'child-1' } },
    });

    // More deletions than the remembered-deletion bound, so the tombstone can
    // no longer reject the id on its own. The invalidated call must still hold.
    for (let index = 0; index < 250; index += 1) {
      await hook.event({
        event: {
          type: 'session.deleted',
          properties: { sessionID: `ses_other_${index}` },
        },
      });
    }

    await taskPart(hook, {
      parentId: 'parent-1',
      callId: 'call-1',
      status: 'completed',
      sessionId: 'child-1',
    });
    await settleTask(hook, { callId: 'call-1', output: taskResult('child-1') });

    expect(await promptFor(hook, 'parent-1')).toEqual('base');
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('deleting an early-registered child removes its alias', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'aborted run' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'child-1' },
      },
    });

    expect(await promptFor(hook, 'parent-1')).toEqual('base');
    await expect(
      hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      ),
    ).rejects.toThrow(/exp-1/);
  });

  test('ignores a child created while the parent has no call in flight', async () => {
    const { hook } = createHook();

    await childCreated(hook, 'stray-child', 'parent-1');
    await readFromChild(hook, 'stray-child', 'read-1', '/tmp/src/stray.ts', 12);

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'later' },
        output: 'task_id: stray-child (for resuming to continue this task)',
      },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 later');
    expect(prompt).not.toContain('stray.ts');
  });

  test('releases provisional children when the parent session is deleted', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'doomed parent' } },
    );
    await childCreated(hook, 'child-1', 'parent-1');
    await readFromChild(hook, 'child-1', 'read-1', '/tmp/src/orphan.ts', 12);

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'parent-1' },
      },
    });

    // The orphan marker is gone, so this read is not tracked.
    await readFromChild(hook, 'child-1', 'read-2', '/tmp/src/late.ts', 20);
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      {
        args: { subagent_type: 'explorer', description: 'retry' },
        output: 'task_id: child-1 (for resuming to continue this task)',
      },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('exp-1 retry');
    expect(prompt).not.toContain('orphan.ts');
    expect(prompt).not.toContain('late.ts');
  });

  test('eviction releases the resume reference but keeps the child recoverable', async () => {
    const { hook } = createHook({ maxSessionsPerAgent: 1 });

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );
    await readFromChild(hook, 'ses_child1', 'read-1', '/tmp/src/stale.ts', 12);

    // Resume the alias, then push it out of the per-agent window.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-2' },
      { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
    );
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-3' },
      {
        args: { subagent_type: 'explorer', description: 'other' },
        output: taskEnvelope('ses_child2'),
      },
    );

    // Overflow the pending-call bound so the resume call is evicted.
    for (let index = 0; index < 100; index += 1) {
      await hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: `filler-${index}` },
        { args: { subagent_type: 'oracle', description: 'filler' } },
      );
    }
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'filler-0' },
      { output: '[ERROR] aborted before any result' },
    );

    // The execution is forgotten, but its child is retained for recovery, so
    // the alias and the reads it made both survive the eviction.
    await readFromChild(hook, 'ses_child1', 'read-2', '/tmp/src/after.ts', 12);
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-4' },
      {
        args: { subagent_type: 'explorer', description: 'restart' },
        output: taskEnvelope('ses_child1'),
      },
    );

    const retained = await promptFor(hook, 'parent-1');
    expect(retained).toContain('explorer:');
    expect(retained).toContain('stale.ts');
    expect(retained).toContain('after.ts');

    // A successful continuation is a deliberate answer to that retained thread:
    // it ends the retention, and the capped history may now take the child.
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-5' },
      { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-5' },
      { output: taskEnvelope('ses_child1') },
    );
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-6' },
      {
        args: { subagent_type: 'explorer', description: 'newest' },
        output: taskEnvelope('ses_child3'),
      },
    );

    const pruned = await promptFor(hook, 'parent-1');
    expect(pruned).toContain('newest');
    expect(pruned).not.toContain('stale.ts');
    expect(pruned).not.toContain('after.ts');
  });

  test('keeps a marker shared by two concurrent resumes of the same alias', async () => {
    const { hook } = createHook();

    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-1' },
      {
        args: { subagent_type: 'explorer', description: 'routing' },
        output: taskEnvelope('ses_child1'),
      },
    );
    await readFromChild(hook, 'ses_child1', 'read-0', '/tmp/src/first.ts', 12);

    for (const callID of ['call-2', 'call-3']) {
      await hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID },
        { args: { subagent_type: 'explorer', task_id: 'exp-1' } },
      );
    }

    // The first concurrent call confirms the child is gone ...
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { output: '[ERROR] Session not found' },
    );

    // ... but the second one still holds the child, so its reads are tracked.
    await readFromChild(hook, 'ses_child1', 'read-1', '/tmp/src/mid.ts', 14);
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-3' },
      { output: taskEnvelope('ses_child1') },
    );

    expect(await promptFor(hook, 'parent-1')).toContain('mid.ts (14 lines)');
  });

  test('keeps a provisional sibling while another call is still running', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'first' } },
    );
    await childCreated(hook, 'child-a', 'parent-1');

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { args: { subagent_type: 'explorer', description: 'second' } },
    );
    await childCreated(hook, 'child-b', 'parent-1');

    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { output: 'task_id: child-a (for resuming to continue this task)' },
    );

    // call-2 is still running, so child-b keeps its provisional tracking.
    await readFromChild(hook, 'child-b', 'read-1', '/tmp/src/b.ts', 15);
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-2' },
      { output: 'task_id: child-b (for resuming to continue this task)' },
    );

    expect(await promptFor(hook, 'parent-1')).toContain('b.ts (15 lines)');
  });
});
