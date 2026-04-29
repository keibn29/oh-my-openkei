import { describe, expect, test } from 'bun:test';
import { createPlannerDelegateValidationHookWithSession } from './index';

describe('createPlannerDelegateValidationHookWithSession', () => {
  const createHook = (sessionAgentMap: Map<string, string>) =>
    createPlannerDelegateValidationHookWithSession({} as any, {
      getSessionAgent: (sid: string) => sessionAgentMap.get(sid),
    });

  test('allows task call for orchestrator session', async () => {
    const sessionAgentMap = new Map<string, string>([['s1', 'orchestrator']]);
    const hook = createHook(sessionAgentMap);

    const input = { tool: 'task', sessionID: 's1', callID: 'c1' };
    const output = { args: { subagent_type: 'frontend-developer' } };

    await hook['tool.execute.before'](input as any, output as any);

    // Should not be blocked — orchestrator is not restricted
    expect(output.args.subagent_type).toBe('frontend-developer');
  });

  test('allows task call to allowed planner subagent', async () => {
    const sessionAgentMap = new Map<string, string>([['s2', 'planner']]);
    const hook = createHook(sessionAgentMap);

    for (const allowed of ['explorer', 'librarian', 'oracle', 'designer']) {
      const input = { tool: 'task', sessionID: 's2', callID: 'c1' };
      const output = { args: { subagent_type: allowed } };

      await hook['tool.execute.before'](input as any, output as any);

      expect(output.args.subagent_type).toBe(allowed);
    }
  });

  test('blocks task call to disallowed planner subagent', async () => {
    const sessionAgentMap = new Map<string, string>([['s3', 'planner']]);
    const hook = createHook(sessionAgentMap);

    for (const disallowed of [
      'frontend-developer',
      'backend-developer',
      'council',
      'observer',
      'councillor',
    ]) {
      const input = { tool: 'task', sessionID: 's3', callID: 'c1' };
      const output = { args: { subagent_type: disallowed } };

      await hook['tool.execute.before'](input as any, output as any);

      expect(output.args.subagent_type).toBe('__planner_forbidden__');
    }
  });

  test('passes through non-task tool calls', async () => {
    const sessionAgentMap = new Map<string, string>([['s4', 'planner']]);
    const hook = createHook(sessionAgentMap);

    const input = { tool: 'Read', sessionID: 's4', callID: 'c1' };
    const output = { args: { path: '/some/file' } };

    await hook['tool.execute.before'](input as any, output as any);

    // Should not be modified
    expect(output.args.subagent_type).toBeUndefined();
    expect(output.args.path).toBe('/some/file');
  });

  test('passes through unknown session', async () => {
    const sessionAgentMap = new Map<string, string>(); // empty
    const hook = createHook(sessionAgentMap);

    const input = {
      tool: 'task',
      sessionID: 'unknown-session',
      callID: 'c1',
    };
    const output = { args: { subagent_type: 'frontend-developer' } };

    await hook['tool.execute.before'](input as any, output as any);

    // Should not be blocked — session is unknown
    expect(output.args.subagent_type).toBe('frontend-developer');
  });
});
