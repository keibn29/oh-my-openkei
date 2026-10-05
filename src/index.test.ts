import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OhMyOpenKei from './index';

/**
 * Minimal host stub. Only the plugin entry path and the two hook surfaces
 * this test drives are faked; everything under test is the real plugin wiring.
 */
function createClient() {
  return new Proxy(
    {},
    {
      get: () => async () => ({ data: {} }),
    },
  );
}

let configDir = '';
let previousXdg: string | undefined;
let previousCustom: string | undefined;

beforeAll(() => {
  configDir = mkdtempSync(join(tmpdir(), 'omoa-plugin-test-'));
  previousXdg = process.env.XDG_CONFIG_HOME;
  previousCustom = process.env.OPENCODE_CONFIG_DIR;
  // Keep config discovery off the developer's real OpenCode config.
  process.env.XDG_CONFIG_HOME = configDir;
  process.env.OPENCODE_CONFIG_DIR = join(configDir, 'opencode');
});

afterAll(() => {
  if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdg;
  if (previousCustom === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = previousCustom;
  rmSync(configDir, { recursive: true, force: true });
});

function taskEnvelope(sessionId: string, body = 'done'): string {
  return [
    `<task id="${sessionId}" state="completed">`,
    '<task_result>',
    body,
    '</task_result>',
    '</task>',
  ].join('\n');
}

type Hooks = Awaited<ReturnType<typeof OhMyOpenKei>>;

describe('plugin chat.message session reuse', () => {
  test('a new user message keeps a remembered alias usable', async () => {
    const workdir = mkdtempSync(join(configDir, 'work-'));
    const hooks: Hooks = await OhMyOpenKei({
      client: createClient() as never,
      directory: workdir,
      worktree: workdir,
    } as never);

    const sessionID = 'session-orchestrator-1';
    const call = (callID: string) =>
      ({
        tool: 'task',
        sessionID,
        callID,
      }) as never;
    const say = (agent: string) =>
      hooks['chat.message']?.({ sessionID, agent } as never);

    // The host announces the session's agent on the first user message.
    await say('orchestrator');

    const first = {
      args: {
        subagent_type: 'explorer',
        description: 'route table',
        prompt: 'inspect the route table',
      },
    };
    await hooks['tool.execute.before']?.(call('call-1'), first as never);
    await hooks['tool.execute.after']?.(call('call-1'), {
      title: 'task',
      output: taskEnvelope('ses_routechild'),
      metadata: {},
    } as never);

    const injectedBefore = { system: ['base'] };
    await hooks['experimental.chat.system.transform']?.(
      { sessionID } as never,
      injectedBefore as never,
    );
    expect(injectedBefore.system.join('\n')).toContain(
      'explorer: exp-1 route table',
    );

    // A second user message must not invalidate the alias.
    await say('orchestrator');

    const injectedAfter = { system: ['base'] };
    await hooks['experimental.chat.system.transform']?.(
      { sessionID } as never,
      injectedAfter as never,
    );
    expect(injectedAfter.system.join('\n')).toContain(
      'explorer: exp-1 route table',
    );

    const followUp = {
      args: {
        subagent_type: 'explorer',
        description: 'continue route table',
        task_id: 'exp-1',
      },
    };
    await hooks['tool.execute.before']?.(call('call-2'), followUp as never);

    expect(followUp.args.task_id).toBe('ses_routechild');
  });
});
