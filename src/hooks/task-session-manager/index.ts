import path from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import { type AgentName, ALL_AGENT_NAMES } from '../../config';
import {
  type ContextFile,
  deriveTaskSessionLabel,
  parseTaskIdFromTaskOutput,
  SessionManager,
  taskSessionIdFromMetadata,
} from '../../utils';

interface TaskArgs {
  description?: unknown;
  prompt?: unknown;
  subagent_type?: unknown;
  task_id?: unknown;
}

/**
 * How a call ends, which decides what happens to its child's protection.
 */
type SettlementOutcome = 'completed' | 'interrupted' | 'discarded';

interface PendingTaskCall {
  callId: string;
  parentSessionId: string;
  agentType: AgentName;
  label: string;
  resumedTaskId?: string;
  /**
   * Child attributed to this call while it is still active, from a
   * `message.part.updated` task part or the unambiguous `session.created`
   * fallback. It makes repeat events idempotent, stops a second child from
   * claiming a call, and is the id a genuinely different child supersedes.
   * While set, the child stays pinned against the per-agent window.
   */
  boundChildId?: string;
}

/**
 * Tool states a native `task` part can report. Anything else is ignored: an
 * unrecognized state is not evidence about the child, so it must not register or
 * settle anything.
 */
const TASK_PART_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'error',
]);

/**
 * Authoritative task-part correlation. The host reports the tool part's parent
 * session, its `callID`, and — once the child exists — the child session ID in
 * the part state's metadata, so a child is tied to the exact call that created
 * it with no ordering or FIFO assumption.
 *
 * Typed defensively: the payload crosses a host boundary, so every field is
 * checked and anything unrecognised is ignored (fail-closed) rather than
 * registered.
 */
interface TaskPartSnapshot {
  parentSessionId: string;
  callId: string;
  status: string;
  metadata: unknown;
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
 * Bound on children kept for recovery after an interrupted delegation, oldest
 * first. Retention survives the bounded pending window (see
 * `retainChildForRecovery`), so this is what stops an interrupted child from
 * being protected forever. Overflowing it returns the oldest child to normal
 * capped history; it does not delete it.
 */
const MAX_RECOVERY_RETAINED_CHILDREN = 200;

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

/**
 * Read the correlation fields out of a `message.part.updated` payload, or
 * `undefined` when the part is not a recognized `task` tool part this hook can
 * act on. Every field is validated because the payload crosses a host boundary:
 * an unrecognized shape or tool state is ignored rather than guessed at.
 */
function readTaskPartSnapshot(part: unknown): TaskPartSnapshot | undefined {
  if (!isObjectRecord(part)) return undefined;
  if (part.type !== 'tool') return undefined;
  if (typeof part.tool !== 'string' || part.tool.toLowerCase() !== 'task') {
    return undefined;
  }
  if (typeof part.callID !== 'string' || !part.callID) return undefined;
  if (typeof part.sessionID !== 'string' || !part.sessionID) return undefined;

  const state = isObjectRecord(part.state) ? part.state : undefined;
  if (!state || typeof state.status !== 'string') return undefined;
  if (!TASK_PART_STATUSES.has(state.status)) return undefined;

  return {
    parentSessionId: part.sessionID,
    callId: part.callID,
    status: state.status,
    // Only the tool state metadata is read: that is the field the SDK declares
    // as carrying the host-reported session id for running/completed/error.
    metadata: state.metadata,
  };
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

/**
 * Composite identity of a call. A `callID` is not assumed unique across parent
 * sessions, so both halves are required everywhere a call is looked up or
 * consumed; the separator cannot occur in a session or call id.
 */
function pendingCallKey(parentSessionId: string, callId: string): string {
  return `${parentSessionId}\u0000${callId}`;
}

/**
 * Protection owner for a call that still holds its child: one per in-flight
 * execution, keyed by that execution's composite identity.
 */
function activeProtectionOwner(
  parentSessionId: string,
  callId: string,
): string {
  return `active:${pendingCallKey(parentSessionId, callId)}`;
}

/**
 * Protection owner for a child whose delegation was interrupted. Recovery
 * retention is a property of the child, not of any one call, so it survives the
 * bounded pending window and is only released by a later *successful*
 * continuation of that same child, or when the retention window overflows.
 */
function recoveryProtectionOwner(taskId: string): string {
  return `recovery:${taskId}`;
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
  /**
   * Unsettled calls, keyed by parent session **and** `callID`: a call id is not
   * assumed unique across sessions, so both halves must match before a result
   * or a task part is allowed to settle a call.
   */
  const pendingCalls = new Map<string, PendingTaskCall>();
  const pendingCallOrder: string[] = [];
  const contextByTask = new Map<string, Map<string, PendingContextFile>>();
  /**
   * Reference count per tracked child id. A reference is owned by whoever
   * acquired it and released only by that owner: one per in-flight resume (see
   * `tool.execute.before`) and one per provisional child (the entry itself in
   * `provisionalParentByChild`). Binding a child to a call acquires nothing, so
   * one call can never release a sibling's reference. A count rather than a set
   * keeps an overlapping resume of the same child from clearing its marker.
   */
  const managedTaskRefs = new Map<string, number>();
  /**
   * Child ids announced by `session.created` while their managed parent had a
   * call in flight. `session.created` carries no callID, so the child is kept
   * until every call of that parent finishes or its own id shows up in a result.
   * The entry *is* the provisional reference; see `releaseProvisionalChild`.
   */
  const provisionalParentByChild = new Map<string, string>();
  /**
   * Children whose delegation was interrupted, oldest first, bounded by
   * `MAX_RECOVERY_RETAINED_CHILDREN`. The list is the source of truth for the
   * retention protection owners, so retention survives pending-call eviction.
   */
  const recoveryRetainedChildren: string[] = [];
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

  /**
   * Take the provisional reference a `session.created` announced. The map entry
   * is the reference, so a repeated creation for the same child does not
   * acquire a second one and removal always releases exactly what was taken.
   */
  function addProvisionalChild(childId: string, parentSessionId: string): void {
    if (provisionalParentByChild.has(childId)) return;
    provisionalParentByChild.set(childId, parentSessionId);
    acquireManagedTask(childId);
  }

  function releaseProvisionalChild(childId: string): void {
    if (!provisionalParentByChild.delete(childId)) return;
    releaseManagedTask(childId);
  }

  /**
   * Drop the provisional children of a parent once no call of that parent is
   * in flight. While a call is still running the children are retained, which
   * is conservative under concurrency and avoids clearing a child that a
   * parallel delegation is about to report.
   */
  function releaseProvisionalChildren(parentSessionId: string): void {
    if (hasPendingCallFor(parentSessionId)) return;
    for (const [childId, owner] of [...provisionalParentByChild]) {
      if (owner !== parentSessionId) continue;
      releaseProvisionalChild(childId);
    }
  }

  function hasPendingCallFor(parentSessionId: string): boolean {
    for (const pending of pendingCalls.values()) {
      if (pending.parentSessionId === parentSessionId) return true;
    }
    return false;
  }

  /**
   * The one pending call of a parent whose child can be attributed *without a
   * task part*, or `undefined` when attributing would be a guess:
   *
   * - more than one call of that parent is in flight, so a `session.created`
   *   cannot be told apart between concurrent delegations (no FIFO/oldest
   *   fallback, which would silently misattribute the alias);
   * - the single call is a resume, whose child is already known; or
   * - that call already bound a child, so a second `session.created` must not
   *   claim another one.
   *
   * This is only a fallback for hosts that never emit task parts. A binding
   * made here is reconciled by the exact task-part correlation, so a later
   * authoritative event can still correct it.
   */
  function unambiguousFreshPendingCall(
    parentSessionId: string,
  ): PendingTaskCall | undefined {
    let candidate: PendingTaskCall | undefined;

    for (const pending of pendingCalls.values()) {
      if (pending.parentSessionId !== parentSessionId) continue;
      if (candidate) return undefined;
      candidate = pending;
    }

    if (!candidate) return undefined;
    if (candidate.resumedTaskId || candidate.boundChildId) {
      return undefined;
    }

    return candidate;
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
   * Release exactly the references this call owns: the one it took for a resume
   * in `tool.execute.before`, plus any provisional entry for a child it bound
   * (binding itself takes nothing).
   */
  function releaseCallReferences(pending: PendingTaskCall): void {
    if (pending.resumedTaskId) {
      releaseManagedTask(pending.resumedTaskId);
    }
    if (pending.boundChildId) {
      releaseProvisionalChild(pending.boundChildId);
    }
    releaseProvisionalChildren(pending.parentSessionId);
  }

  /**
   * Settle a call: remove it from the unsettled set, release exactly the
   * references it owns, and end the protection it held.
   *
   * `outcome` decides what happens to the child's protection:
   * - `completed`: this execution's active owner *and* the child's recovery
   *   owner are released, so the capped history applies once no owner remains.
   * - `interrupted`: the child is handed over to recovery retention (first, so
   *   trimming never sees an unprotected gap) and then this execution's active
   *   owner is released.
   * - `discarded`: teardown of a deleted session. Only the active owner is
   *   released; no retention is created for a child that is being dropped.
   */
  function settleCall(
    pending: PendingTaskCall,
    outcome: SettlementOutcome,
  ): void {
    const key = pendingCallKey(pending.parentSessionId, pending.callId);
    pendingCalls.delete(key);
    const orderIndex = pendingCallOrder.indexOf(key);
    if (orderIndex >= 0) {
      pendingCallOrder.splice(orderIndex, 1);
    }

    releaseCallReferences(pending);

    const childId = pending.boundChildId ?? pending.resumedTaskId;
    if (!childId) {
      pruneContext();
      return;
    }

    if (outcome === 'discarded') {
      sessionManager.releaseProtection(
        childId,
        activeProtectionOwner(pending.parentSessionId, pending.callId),
      );
    } else if (outcome === 'completed') {
      // Order does not matter here: both owners are being given up.
      sessionManager.releaseProtection(
        childId,
        activeProtectionOwner(pending.parentSessionId, pending.callId),
      );
      forgetChildRecovery(childId);
    } else {
      // Handoff, not a swap: recovery protection is established *before* the
      // last active owner goes, so trimming never observes the child
      // unprotected — not even with other owners and full history pressure.
      retainChildForRecovery(childId);
      sessionManager.releaseProtection(
        childId,
        activeProtectionOwner(pending.parentSessionId, pending.callId),
      );
    }

    pruneContext();
  }

  /**
   * Keep an interrupted child recoverable after its call is gone. Retention is
   * bounded: the oldest retained child loses its retention and rejoins the
   * capped history.
   */
  function retainChildForRecovery(taskId: string): void {
    if (recoveryRetainedChildren.includes(taskId)) return;
    // Retention is only meaningful for a child the prompt can still resolve, so
    // an id the store has already forgotten never takes up capacity. This also
    // keeps a lingering owner-free membership from silently skipping the
    // protection of a later child that reuses the same id.
    if (!sessionManager.taskIds().has(taskId)) return;

    sessionManager.protect(taskId, recoveryProtectionOwner(taskId));
    recoveryRetainedChildren.push(taskId);
    while (recoveryRetainedChildren.length > MAX_RECOVERY_RETAINED_CHILDREN) {
      const released = recoveryRetainedChildren.shift();
      if (released) {
        sessionManager.releaseProtection(
          released,
          recoveryProtectionOwner(released),
        );
      }
    }
  }

  /**
   * Drop every trace of a child the plugin is forgetting for good: its alias
   * (and any read context or protection owners it still had) plus its recovery
   * retention membership. Used when a child is superseded, confirmed missing, or
   * deleted, so a forgotten id cannot keep occupying retention capacity or be
   * mistaken for a still-retained one if it is ever re-registered.
   */
  function forgetChild(pending: PendingTaskCall, taskId: string): void {
    sessionManager.drop(pending.parentSessionId, pending.agentType, taskId);
    contextByTask.delete(taskId);
    releaseProvisionalChild(taskId);
    forgetChildRecovery(taskId);
  }

  /** A successful continuation answered the thread that retention was keeping. */
  function forgetChildRecovery(taskId: string): void {
    const index = recoveryRetainedChildren.indexOf(taskId);
    if (index < 0) return;

    recoveryRetainedChildren.splice(index, 1);
    sessionManager.releaseProtection(taskId, recoveryProtectionOwner(taskId));
  }

  /**
   * The single place a call→child binding is registered, shared by the exact
   * task-part correlation and `tool.execute.after` so both reconcile the same
   * way:
   *
   * - the same id again (a repeated or reordered task part, then the result)
   *   keeps the existing alias and only refreshes it;
   * - a genuinely different id supersedes this call's own earlier binding, and
   *   only that call's stale alias and read context are dropped — siblings are
   *   untouched, since a bound child is owned by exactly one call.
   *
   * A child bound while its call is unsettled is pinned, so a burst of
   * concurrent delegations cannot evict one another out of the resumable list.
   *
   * Returns `false` for a child that must not be registered, leaving the
   * existing binding alone.
   */
  function rememberChildForCall(
    pending: PendingTaskCall,
    taskId: string | undefined,
  ): boolean {
    if (!taskId) return false;
    // A result naming an already-deleted child must not register an alias.
    if (isKnownDeletedSession(taskId)) return false;

    const superseded = new Set<string>();
    if (pending.resumedTaskId) superseded.add(pending.resumedTaskId);
    if (pending.boundChildId) superseded.add(pending.boundChildId);
    for (const supersededId of superseded) {
      if (supersededId === taskId) continue;
      forgetChild(pending, supersededId);
    }

    pending.boundChildId = taskId;

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
    // This execution now holds the child, alongside any other execution or
    // recovery retention that also needs it. Adding an owner twice is a no-op.
    sessionManager.protect(
      taskId,
      activeProtectionOwner(pending.parentSessionId, pending.callId),
    );
    return true;
  }

  /**
   * Correlate a native `task` tool part with the exact call that owns it.
   *
   * The part names both the parent session and the `callID`, so this works with
   * any number of delegations in flight and never depends on the order events
   * arrive in. `pendingCalls` holds exactly the calls that have not settled, so
   * a part naming an unknown call, or one whose parent does not match the
   * pending call, registers nothing at all.
   */
  function handleTaskPartEvent(part: unknown): void {
    const snapshot = readTaskPartSnapshot(part);
    if (!snapshot) return;
    if (!options.shouldManageSession(snapshot.parentSessionId)) return;

    const key = pendingCallKey(snapshot.parentSessionId, snapshot.callId);
    const pending = pendingCalls.get(key);
    if (!pending) return;

    // A `pending` state carries no metadata: no child exists yet. Running,
    // completed, and error states do.
    const bound = rememberChildForCall(
      pending,
      taskSessionIdFromMetadata(snapshot.metadata),
    );

    if (snapshot.status === 'error' && bound) {
      // A failed execution runs no `tool.execute.after`, so nothing else would
      // ever settle this call. The child keeps its alias and stays pinned, since
      // a failure is not a deletion. An `error` part with no child id is left
      // pending: a later child-bearing part for the same call must still be
      // able to bind.
      settleCall(pending, 'interrupted');
    }
  }

  /**
   * Record an unsettled call under its `(parent, callID)` slot.
   *
   * Ordering matters and is centralised here:
   * 1. A previous execution of the same slot is settled first. Settling removes
   *    the key from the pending map, so inserting first would delete the new call;
   *    settling first also means the replacement does not inherit, or lose, the
   *    slot's active protection owner — both executions share that key.
   * 2. `beforeInsert` runs after that cleanup and before insertion, which is where
   *    a resume takes its protection.
   * 3. The call is inserted last and is never settled here.
   */
  function rememberPendingCall(
    call: PendingTaskCall,
    beforeInsert?: () => void,
  ): void {
    const key = pendingCallKey(call.parentSessionId, call.callId);

    const replaced = takePendingCall(call.parentSessionId, call.callId);
    if (replaced) {
      // A superseded execution is not an interrupted one: the host abandoned
      // that child, so it must not stay retained for recovery.
      settleCall(replaced, 'completed');
    }

    beforeInsert?.();

    pendingCalls.set(key, call);
    pendingCallOrder.push(key);

    while (pendingCallOrder.length > MAX_PENDING_TASK_CALLS) {
      const evictedKey = pendingCallOrder.shift();
      if (!evictedKey) {
        break;
      }
      const evicted = pendingCalls.get(evictedKey);
      if (evicted) {
        // The execution is forgotten, but an interrupted child stays retained
        // for recovery (see `retainChildForRecovery`).
        settleCall(evicted, 'interrupted');
      }
    }
  }

  function takePendingCall(
    parentSessionId: string | undefined,
    callId: string | undefined,
  ): PendingTaskCall | undefined {
    if (!parentSessionId || !callId) return undefined;

    const key = pendingCallKey(parentSessionId, callId);
    const pending = pendingCalls.get(key);
    pendingCalls.delete(key);

    const orderIndex = pendingCallOrder.indexOf(key);
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
          const callId = input.callID;
          const parentId = input.sessionID;
          const pending: PendingTaskCall = {
            callId,
            parentSessionId: parentId,
            agentType: args.subagent_type,
            label,
            resumedTaskId: remembered.taskId,
          };
          rememberPendingCall(pending, () => {
            // The resumed child is already known, so claim it and protect it
            // now rather than waiting for a part or a result: an abort that
            // reports nothing must not lose it to same-agent history pressure.
            // This runs after the previous execution of this slot is cleaned up,
            // because both share this call's active owner key. The stored label
            // is left alone, so an unresolved resume keeps describing the thread
            // the alias was created for.
            pending.boundChildId = remembered.taskId;
            sessionManager.protect(
              remembered.taskId,
              activeProtectionOwner(parentId, callId),
            );
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

      // Only the call recorded for *this* parent session may be consumed.
      const pending = takePendingCall(input.sessionID, input.callID);
      if (!pending) return;

      // Metadata is authoritative, so it is consulted even when the result
      // text is missing or not a string (for example a truncated response).
      const text = typeof output.output === 'string' ? output.output : '';
      const taskId = parseTaskIdFromTaskOutput(text, output.metadata);

      // Same binding logic as the task-part path, so a child the host already
      // reported through a part keeps its alias and only a genuinely different
      // id replaces it. A result naming an already-deleted child registers
      // nothing: the child's alias was dropped when it was deleted.
      if (!rememberChildForCall(pending, taskId)) {
        if (
          pending.resumedTaskId &&
          text &&
          isMissingRememberedSessionError(text)
        ) {
          // Only a confirmed missing session means the child is gone. A
          // cancellation or generic failure keeps the alias so the same thread
          // can be retried.
          forgetChild(pending, pending.resumedTaskId);
        }
      }

      // A result is the call's normal end: the child settles and rejoins the
      // capped history. An id-less result leaves the child retained, because an
      // aborted or cancelled delegation must stay resumable — unless this call
      // confirmed the child is gone above, in which case there is nothing left
      // to keep and retention would only leak capacity.
      const childGone =
        pending.resumedTaskId !== undefined &&
        taskId === undefined &&
        text !== '' &&
        isMissingRememberedSessionError(text);

      settleCall(
        pending,
        taskId !== undefined
          ? 'completed'
          : childGone
            ? 'discarded'
            : 'interrupted',
      );
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
          part?: unknown;
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
          // Durable provisional tracking: it survives even when no task part
          // ever arrives, which is what lets reads from the child be collected
          // during the delegation. The entry owns one reference, so a repeated
          // creation for the same child cannot take a second one.
          addProvisionalChild(info.id, info.parentID);

          // Fallback for hosts that never emit task parts: an aborted
          // delegation reaches no `after`, so its alias has to exist before a
          // result does. Only claimed when a single fresh call could own it,
          // never over a binding an exact task part already made.
          const owner = unambiguousFreshPendingCall(info.parentID);
          if (owner) {
            rememberChildForCall(owner, info.id);
          }
        }
        return;
      }

      if (input.event.type === 'message.part.updated') {
        handleTaskPartEvent(input.event.properties?.part);
        return;
      }

      if (input.event.type !== 'session.deleted') return;
      const sessionId =
        input.event.properties?.info?.id ?? input.event.properties?.sessionID;
      if (!sessionId) return;

      markSessionDeleted(sessionId);

      // Release before dropping. A pending call that owns this session — as its
      // parent, as the child it resumed, or as the child already bound to it —
      // is invalidated here, so neither a late result nor a late task part can
      // re-register an alias no matter how far the bounded tombstone list has
      // since churned. These children are being dropped, so the calls are
      // discarded rather than interrupted: teardown must not hand them to
      // recovery retention.
      for (const pending of [...pendingCalls.values()]) {
        if (
          pending.parentSessionId !== sessionId &&
          pending.resumedTaskId !== sessionId &&
          pending.boundChildId !== sessionId
        ) {
          continue;
        }
        settleCall(pending, 'discarded');
      }

      releaseProvisionalChildren(sessionId);
      releaseProvisionalChild(sessionId);
      // The deleted session's own retention goes with its entry, which the drops
      // below remove.
      forgetChildRecovery(sessionId);
      // Recovery retention belongs to the children themselves, so every child of
      // this parent loses its membership (and its owner) before the entries go.
      for (const childId of sessionManager.taskIdsForParent(sessionId)) {
        forgetChildRecovery(childId);
      }
      contextByTask.delete(sessionId);
      sessionManager.clearParent(sessionId);
      sessionManager.dropTask(sessionId);
      pruneContext();
    },
  };
}
