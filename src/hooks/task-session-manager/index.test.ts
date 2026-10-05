import { describe, expect, mock, test } from 'bun:test';
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

  test('releases a provisional child when the call yields no parseable id', async () => {
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

    // A later read from the orphan is not tracked ...
    await readFromChild(hook, 'child-1', 'read-2', '/tmp/src/late.ts', 20);
    // ... so a later delegation reporting the same child inherits no context.
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

  test('releases resumed tracking when a pending call is evicted', async () => {
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
    // One completed call, so pruned context reflects the released marker.
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'filler-0' },
      { output: '[ERROR] aborted before any result' },
    );

    // ses_child1 is neither remembered nor in flight any more.
    await readFromChild(hook, 'ses_child1', 'read-2', '/tmp/src/after.ts', 12);
    await runTask(
      hook,
      { sessionID: 'parent-1', callID: 'call-4' },
      {
        args: { subagent_type: 'explorer', description: 'restart' },
        output: taskEnvelope('ses_child1'),
      },
    );

    const prompt = await promptFor(hook, 'parent-1');
    expect(prompt).toContain('explorer:');
    expect(prompt).not.toContain('stale.ts');
    expect(prompt).not.toContain('after.ts');
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
