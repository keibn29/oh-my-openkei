# src/hooks/task-session-manager/

## Responsibility

Provides resumable-task state for `task` tool calls so orchestrator users can
resume work in a parent session by using short aliases (`exp-1`, `ora-2`) instead
of raw child session IDs.

## Design

- `createTaskSessionManagerHook(ctx, options)` returns handlers for:
  - `tool.execute.before`
  - `tool.execute.after`
  - `experimental.chat.system.transform`
  - `event`
- Internally uses `SessionManager` from `src/utils/session-manager.ts` to store
  remembered task sessions with bounded per-agent history.
- The resumable-agent registry is `ALL_AGENT_NAMES` from `src/config`, so every
  registered agent gets an alias and no agent is silently skipped.
- Task labels are derived from `description`/`prompt` via
  `deriveTaskSessionLabel` and converted to compact aliases by `SessionManager`.
- In-flight calls are tracked by `callID` in a capped ordered map (`MAX_PENDING_TASK_CALLS`)
  to rewrite inputs and correlate outputs safely. Eviction, replacement of the
  same `callID`, and the `tool.execute.after` handler all release the tracking
  a call held.
- Tracked child ids are reference counted (`managedTaskRefs`), so one finishing
  call cannot clear a marker a concurrent call still needs.
- `session.created` carries no `callID`, so a child is tracked *provisionally*
  (`provisionalParentByChild`) only while its managed parent has a call in
  flight, and released when no call of that parent remains — unless a result
  names the child as its own id.
- Session governance is feature-gated by `shouldManageSession(sessionID)`, allowing
  the hook to run only for orchestrator-managed sessions.

## Flow

1. `tool.execute.before` receives a `task` call.
2. If `subagent_type` is a registered agent, it derives a short label.
3. When `task_id` is provided, it resolves against remembered aliases for the
   current parent session/agent **before** touching any state.
4. On a hit, `args.task_id` is rewritten to the real task ID and the call is
   stored in the pending-call map as a resume.
5. On a miss it throws `UnknownTaskSessionAliasError`, which rejects the call
   with the list of aliases that are actually available. The host's rendering
   of that thrown error to the model has not been verified.
6. Without `task_id` (or with a blank/non-string value) the argument is removed
   and the call is recorded as a fresh delegation.
7. `tool.execute.after` reads the task ID from `task` metadata or result text.
8. A result naming an already-deleted child is rejected, for a fresh
   delegation and a replacement alike, and never registers an alias.
9. Otherwise the ID is parsed once: `remember()` registers the alias and any
   read context collected for that child is attached.
10. If this call was a resume attempt, and the returned ID changed, the stale
    predecessor alias and its read context are dropped.
11. If the host confirms the child is missing (`Session not found` /
    `Session no session`), the predecessor alias is dropped. Cancellations and
    generic failures keep it so the thread can be retried.
12. Pending tracking for a consumed call is released on every path, read
    context is pruned for anything no longer remembered, and provisional
    children of a parent with no call left in flight are released.
13. `experimental.chat.system.transform` injects a rendered block from
    `SessionManager.formatForPrompt` under `### Resumable Sessions`.
14. On `session.deleted`, the hook records the id as deleted (bounded FIFO of
    200), then releases tracking *before* dropping state: pending calls that
    own or resume the session are invalidated, provisional children and read
    context are released, and remembered aliases are cleared. A resume of a
    deleted child therefore cannot be revived by a late result even after the
    bounded tombstone window has churned past the id.

## Integration

- Wired in `src/index.ts`:
  - invoked in `tool.execute.before`
  - invoked in `tool.execute.after` (with tool `metadata` passed through)
  - injected into `experimental.chat.system.transform`
  - cleaned up in `event` on `session.deleted`
- `chat.message` intentionally does NOT reset aliases: reuse is decided per
  `task` call and aliases live for the parent session's lifetime.
- Exposes no side effects outside hook handling and `SessionManager`.
- Depends on:
  - `SessionManager` and `deriveTaskSessionLabel` (from `src/utils/session-manager.ts`)
  - `parseTaskIdFromTaskOutput` (from `src/utils/task.ts`)
  - `ALL_AGENT_NAMES` (from `src/config/constants.ts`)
  - plugin configuration (`maxSessionsPerAgent`) and runtime session filtering from
    `src/index.ts` (`shouldManageSession`).
