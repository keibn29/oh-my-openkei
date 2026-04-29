/**
 * Planner Delegation Validation Hook
 *
 * Intercepts `task` tool calls from Planner sessions and validates that
 * the requested subagent is within Planner's allowed delegate set:
 *   explorer, librarian, oracle, designer
 *
 * If the subagent is not allowed, the call is blocked by replacing the
 * subagent_type in output.args with an invalid value so OpenCode
 * returns an error, making the intent clear to the Planner.
 */

import type { PluginInput } from '@opencode-ai/plugin';
import { PLANNER_DELEGATE_SET } from '../../config/constants';

const BLOCKED_SUBAGENT = '__planner_forbidden__';

interface PlannerValidationOptions {
  /**
   * Returns the agent name for a given session, or undefined if unknown.
   */
  getSessionAgent: (sessionID: string) => string | undefined;
}

/**
 * Create the planner delegation validation hook.
 *
 * Attaches to `tool.execute.before` and validates that Planner sessions
 * only call task with allowed subagent types. Follows the repo pattern
 * of reading/mutating `output.args` in `tool.execute.before`.
 */
export function createPlannerDelegateValidationHookWithSession(
  _ctx: PluginInput,
  options: PlannerValidationOptions,
) {
  return {
    'tool.execute.before': async (
      input: { tool: string; sessionID?: string; callID?: string },
      output: { args?: unknown },
    ): Promise<void> => {
      if (input.tool.toLowerCase() !== 'task') {
        return;
      }

      if (!input.sessionID) {
        return;
      }

      const agent = options.getSessionAgent(input.sessionID);
      if (agent !== 'planner') {
        return;
      }

      // agent is planner — validate subagent_type in output.args
      const args = output.args as Record<string, unknown> | undefined;
      if (!args) {
        return;
      }

      const subagentType = args.subagent_type;

      if (typeof subagentType !== 'string') {
        return;
      }

      if ((PLANNER_DELEGATE_SET as readonly string[]).includes(subagentType)) {
        return; // allowed
      }

      // Block by rewriting to an invalid subagent type
      args.subagent_type = BLOCKED_SUBAGENT;
    },
  };
}
