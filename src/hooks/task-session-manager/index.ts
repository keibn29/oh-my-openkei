import path from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import { type AgentName, ALL_AGENT_NAMES } from '../../config';
import {
  type ContextFile,
  deriveTaskSessionLabel,
  parseTaskIdFromTaskOutput,
  SessionManager,
} from '../../utils';

interface TaskArgs {
  description?: unknown;
  prompt?: unknown;
  subagent_type?: unknown;
  task_id?: unknown;
}

interface PendingTaskCall {
  callId: string;
  parentSessionId: string;
  agentType: AgentName;
  label: string;
  resumedTaskId?: string;
}

/** Every registered agent is resumable; the list stays the single source. */
const AGENT_NAME_SET = new Set<AgentName>(ALL_AGENT_NAMES);

const MAX_PENDING_TASK_CALLS = 100;

/**
 * Bound on remembered deletions used to reject late results that name an
 * already-deleted child. The bound only limits this defense: an in-flight
 * resume of a deleted child is invalidated directly (see the `session.deleted`
 * handler), so it cannot be revived by tombstone churn.
 */
const MAX_DELETED_SESSION_IDS = 200;

/**
 * Descriptive rejection for a `task_id` this plugin does not remember for the
 * current parent/agent. Thrown so the host aborts the call instead of the hook
 * silently deleting the argument and letting a fresh child start.
 *
 * How the host renders or retries a thrown tool error (in particular whether
 * the model itself sees this message) has not been verified against the host,
 * so nothing here promises that behaviour.
 */
export class UnknownTaskSessionAliasError extends Error {
  constructor(input: {
    requested: string;
    agentType: string;
    knownAliases: string;
  }) {
    super(
      `task_id "${input.requested}" is not a resumable task session for subagent_type "${input.agentType}" in this session. ` +
        'It is unknown, already evicted, or belongs to a different session or agent. ' +
        'Omit task_id to start a fresh child session, or use an alias from the "### Resumable Sessions" list. ' +
        `Known resumable sessions here: ${input.knownAliases}.`,
    );
    this.name = 'UnknownTaskSessionAliasError';
  }
}

interface PendingContextFile {
  path: string;
  lines: Set<number>;
  lastReadAt: number;
}

function isAgentName(value: unknown): value is AgentName {
  return typeof value === 'string' && AGENT_NAME_SET.has(value as AgentName);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractPath(output: string): string | undefined {
  return /<path>([^<]+)<\/path>/.exec(output)?.[1];
}

function normalizePath(root: string, file: string): string {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return file;
  }
  return relative;
}

function extractReadFiles(
  root: string,
  output: { output: unknown; metadata?: unknown },
): ContextFile[] {
  if (typeof output.output !== 'string') return [];

  const file = extractPath(output.output);
  if (!file) return [];

  return [
    {
      path: normalizePath(root, file),
      lineCount: countReadLines(output.output).length,
      lineNumbers: countReadLines(output.output),
      lastReadAt: Date.now(),
    },
  ];
}

function countReadLines(output: string): number[] {
  const lines = new Set<number>();
  for (const match of output.matchAll(/^([0-9]+):/gm)) {
    lines.add(Number(match[1]));
  }
  return [...lines];
}

export function createTaskSessionManagerHook(
  _ctx: PluginInput,
  options: {
    maxSessionsPerAgent: number;
    readContextMinLines?: number;
    readContextMaxFiles?: number;
    shouldManageSession: (sessionID: string) => boolean;
  },
) {
  const sessionManager = new SessionManager(options.maxSessionsPerAgent, {
    readContextMinLines: options.readContextMinLines,
    readContextMaxFiles: options.readContextMaxFiles,
  });
  const pendingCalls = new Map<string, PendingTaskCall>();
  const pendingCallOrder: string[] = [];
  const contextByTask = new Map<string, Map<string, PendingContextFile>>();
  /**
   * Reference count per tracked child id: in-flight resumes plus provisional
   * children announced by `session.created`. A count (not a set) keeps one
   * finishing call from dropping a marker another concurrent call still needs.
   */
  const managedTaskRefs = new Map<string, number>();
  /**
   * Child ids announced by `session.created` while their managed parent had a
   * call in flight. `session.created` carries no callID, so the child is kept
   * until every call of that parent finishes or its own id shows up in a result.
   */
  const provisionalParentByChild = new Map<string, string>();
  const deletedSessionIds: string[] = [];

  function markSessionDeleted(sessionId: string): void {
    deletedSessionIds.push(sessionId);
    while (deletedSessionIds.length > MAX_DELETED_SESSION_IDS) {
      deletedSessionIds.shift();
    }
  }

  function isKnownDeletedSession(sessionId: string): boolean {
    return deletedSessionIds.includes(sessionId);
  }

  function acquireManagedTask(taskId: string): void {
    managedTaskRefs.set(taskId, (managedTaskRefs.get(taskId) ?? 0) + 1);
  }

  function releaseManagedTask(taskId: string): void {
    const refs = managedTaskRefs.get(taskId);
    if (refs === undefined) return;
    if (refs > 1) {
      managedTaskRefs.set(taskId, refs - 1);
      return;
    }
    managedTaskRefs.delete(taskId);
  }

  function isManagedTask(taskId: string): boolean {
    return managedTaskRefs.has(taskId);
  }

  function hasPendingCallFor(parentSessionId: string): boolean {
    for (const pending of pendingCalls.values()) {
      if (pending.parentSessionId === parentSessionId) return true;
    }
    return false;
  }

  /**
   * Drop the provisional children of a parent once no call of that parent is
   * in flight. While a call is still running the children are retained, which
   * is conservative under concurrency and avoids clearing a child that a
   * parallel delegation is about to report.
   */
  function releaseProvisionalChildren(parentSessionId: string): void {
    if (hasPendingCallFor(parentSessionId)) return;
    for (const [childId, owner] of provisionalParentByChild) {
      if (owner !== parentSessionId) continue;
      releaseManagedTask(childId);
      provisionalParentByChild.delete(childId);
    }
  }

  function addTaskContext(taskId: string, files: ContextFile[]): void {
    if (files.length === 0) return;

    let context = contextByTask.get(taskId);
    if (!context) {
      context = new Map();
      contextByTask.set(taskId, context);
    }
    for (const file of files) {
      const pending = context.get(file.path) ?? {
        path: file.path,
        lines: new Set<number>(),
        lastReadAt: file.lastReadAt,
      };
      for (const line of file.lineNumbers ?? []) {
        pending.lines.add(line);
      }
      pending.lastReadAt = Math.max(pending.lastReadAt, file.lastReadAt);
      context.set(file.path, pending);
    }

    sessionManager.addContext(taskId, contextFilesForPrompt(context));
  }

  function contextFilesForPrompt(
    context: Map<string, PendingContextFile> | undefined,
  ): ContextFile[] {
    if (!context) return [];
    return [...context.values()].map((file) => ({
      path: file.path,
      lineCount: file.lines.size,
      lastReadAt: file.lastReadAt,
    }));
  }

  function canTrackTaskContext(taskId: string): boolean {
    return isManagedTask(taskId) || sessionManager.taskIds().has(taskId);
  }

  function pruneContext(): void {
    const remembered = sessionManager.taskIds();
    for (const taskId of contextByTask.keys()) {
      if (!isManagedTask(taskId) && !remembered.has(taskId)) {
        contextByTask.delete(taskId);
      }
    }
  }

  function isMissingRememberedSessionError(output: string): boolean {
    const firstLine = output.split(/\r?\n/, 1)[0]?.trim().toLowerCase() ?? '';
    return (
      firstLine.startsWith('[error]') &&
      firstLine.includes('session') &&
      (firstLine.includes('not found') || firstLine.includes('no session'))
    );
  }

  /**
   * Drop pending tracking for the call on every path that reaches this
   * function — a completed call's result, replacement, or eviction — so a
   * consumed resume never keeps its child marked as live and a provisional
   * child is never left behind when no result ever names it.
   *
   * A native execution that throws does not reach here, because the host
   * runs no `after` for it; see the Known Limits section of
   * docs/session-management.md.
   */
  function releasePendingTracking(
    pending: PendingTaskCall,
    taskId?: string,
  ): void {
    if (taskId) {
      releaseManagedTask(taskId);
      // The child answered with its own id, so it is remembered from now on
      // instead of provisional.
      provisionalParentByChild.delete(taskId);
    }
    // A resume that returned its own child already released it above; this
    // call only ever holds one reference, so releasing twice would clear a
    // marker a concurrent call on the same child still needs.
    if (pending.resumedTaskId && pending.resumedTaskId !== taskId) {
      releaseManagedTask(pending.resumedTaskId);
    }
    releaseProvisionalChildren(pending.parentSessionId);
  }

  function dropRememberedChild(pending: PendingTaskCall, taskId: string): void {
    sessionManager.drop(pending.parentSessionId, pending.agentType, taskId);
    contextByTask.delete(taskId);
    provisionalParentByChild.delete(taskId);
  }

  function rememberPendingCall(call: PendingTaskCall): void {
    const replaced = takePendingCall(call.callId);

    pendingCalls.set(call.callId, call);
    pendingCallOrder.push(call.callId);

    if (replaced) {
      releasePendingTracking(replaced);
    }

    while (pendingCallOrder.length > MAX_PENDING_TASK_CALLS) {
      const evictedCallId = pendingCallOrder.shift();
      if (!evictedCallId) {
        break;
      }
      const evicted = pendingCalls.get(evictedCallId);
      pendingCalls.delete(evictedCallId);
      if (evicted) {
        releasePendingTracking(evicted);
      }
    }
  }

  function takePendingCall(callId?: string): PendingTaskCall | undefined {
    if (!callId) return undefined;
    const pending = pendingCalls.get(callId);
    pendingCalls.delete(callId);

    const orderIndex = pendingCallOrder.indexOf(callId);
    if (orderIndex >= 0) {
      pendingCallOrder.splice(orderIndex, 1);
    }

    return pending;
  }

  return {
    'tool.execute.before': async (
      input: { tool: string; sessionID?: string; callID?: string },
      output: { args?: unknown },
    ): Promise<void> => {
      if (input.tool.toLowerCase() !== 'task') return;
      if (!input.sessionID || !options.shouldManageSession(input.sessionID)) {
        return;
      }
      if (!isObjectRecord(output.args)) return;

      const args = output.args as TaskArgs;
      if (!isAgentName(args.subagent_type)) return;

      const label = deriveTaskSessionLabel({
        description:
          typeof args.description === 'string' ? args.description : undefined,
        prompt: typeof args.prompt === 'string' ? args.prompt : undefined,
        agentType: args.subagent_type,
      });

      const requested =
        typeof args.task_id === 'string' ? args.task_id.trim() : '';

      if (requested) {
        // Validate before touching any state: an unknown reference must not
        // create a pending call or bump recency for an entry it cannot reach.
        const remembered = sessionManager.resolve(
          input.sessionID,
          args.subagent_type,
          requested,
        );

        if (!remembered) {
          throw new UnknownTaskSessionAliasError({
            requested,
            agentType: args.subagent_type,
            knownAliases: sessionManager.aliasSummary(input.sessionID),
          });
        }

        args.task_id = remembered.taskId;
        acquireManagedTask(remembered.taskId);
        sessionManager.markUsed(
          input.sessionID,
          args.subagent_type,
          remembered.taskId,
        );
        if (input.callID) {
          rememberPendingCall({
            callId: input.callID,
            parentSessionId: input.sessionID,
            agentType: args.subagent_type,
            label,
            resumedTaskId: remembered.taskId,
          });
        }
        return;
      }

      // Fresh delegation: task_id omitted, blank, or not a string. Normalize
      // to a truly absent value so the host always creates a new child.
      delete args.task_id;
      if (input.callID) {
        rememberPendingCall({
          callId: input.callID,
          parentSessionId: input.sessionID,
          agentType: args.subagent_type,
          label,
        });
      }
    },

    'tool.execute.after': async (
      input: { tool: string; sessionID?: string; callID?: string },
      output: { output: unknown; metadata?: unknown },
    ): Promise<void> => {
      if (input.tool.toLowerCase() === 'read') {
        if (input.sessionID && canTrackTaskContext(input.sessionID)) {
          addTaskContext(
            input.sessionID,
            extractReadFiles(_ctx.directory, output),
          );
        }
        return;
      }

      if (input.tool.toLowerCase() !== 'task') return;

      const pending = takePendingCall(input.callID);
      if (!pending) return;

      // Metadata is authoritative, so it is consulted even when the result
      // text is missing or not a string (for example a truncated response).
      const text = typeof output.output === 'string' ? output.output : '';
      const taskId = parseTaskIdFromTaskOutput(text, output.metadata);

      // A result naming an already-deleted child must not register an alias,
      // for a fresh delegation and for a replacement alike. A resume of a
      // deleted child never reaches this point: its pending call was already
      // invalidated on the deletion event.
      if (taskId && isKnownDeletedSession(taskId)) {
        releasePendingTracking(pending, taskId);
        pruneContext();
        return;
      }

      if (taskId) {
        if (pending.resumedTaskId && pending.resumedTaskId !== taskId) {
          dropRememberedChild(pending, pending.resumedTaskId);
        }

        sessionManager.remember({
          parentSessionId: pending.parentSessionId,
          taskId,
          agentType: pending.agentType,
          label: pending.label,
        });
        sessionManager.addContext(
          taskId,
          contextFilesForPrompt(contextByTask.get(taskId)),
        );
      } else if (
        pending.resumedTaskId &&
        text &&
        isMissingRememberedSessionError(text)
      ) {
        // Only a confirmed missing session means the child is gone. A
        // cancellation or generic failure keeps the alias so the same thread
        // can be retried.
        dropRememberedChild(pending, pending.resumedTaskId);
      }

      releasePendingTracking(pending, taskId);
      pruneContext();
    },

    'experimental.chat.system.transform': async (
      input: { sessionID?: string },
      output: { system: string[] },
    ): Promise<void> => {
      if (!input.sessionID || !options.shouldManageSession(input.sessionID)) {
        return;
      }

      const reminder = sessionManager.formatForPrompt(input.sessionID);
      if (!reminder) return;
      output.system.push(reminder);
    },

    event: async (input: {
      event: {
        type: string;
        properties?: {
          info?: { id?: string; parentID?: string };
          sessionID?: string;
        };
      };
    }): Promise<void> => {
      if (input.event.type === 'session.created') {
        const info = input.event.properties?.info;
        if (
          info?.id &&
          info.parentID &&
          options.shouldManageSession(info.parentID) &&
          hasPendingCallFor(info.parentID)
        ) {
          // Provisional only: `session.created` has no callID, so the child is
          // tracked while the parent has a call in flight and released once
          // none does, unless a result names it as its own id.
          acquireManagedTask(info.id);
          provisionalParentByChild.set(info.id, info.parentID);
        }
        return;
      }

      if (input.event.type !== 'session.deleted') return;
      const sessionId =
        input.event.properties?.info?.id ?? input.event.properties?.sessionID;
      if (!sessionId) return;

      markSessionDeleted(sessionId);

      // Release before dropping. A pending call resuming this child is
      // invalidated here, so its late result cannot re-register an alias no
      // matter how far the bounded tombstone list has since churned.
      for (const [callId, pending] of [...pendingCalls]) {
        if (
          pending.parentSessionId !== sessionId &&
          pending.resumedTaskId !== sessionId
        ) {
          continue;
        }
        takePendingCall(callId);
        releasePendingTracking(pending);
      }

      releaseProvisionalChildren(sessionId);
      provisionalParentByChild.delete(sessionId);
      releaseManagedTask(sessionId);
      contextByTask.delete(sessionId);
      sessionManager.clearParent(sessionId);
      sessionManager.dropTask(sessionId);
      pruneContext();
    },
  };
}
