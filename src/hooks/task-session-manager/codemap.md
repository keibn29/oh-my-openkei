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
- Unsettled calls are keyed by **parent session *and* `callID`** (`pendingCallKey`).
  A call id is not assumed unique across sessions, so a result or task part must
  name both halves before it may consume a call.
- A child reference is owned by whoever acquired it and released only by that
  owner: one per in-flight resume (taken in `tool.execute.before`) and one per
  provisional child (the `provisionalParentByChild` entry *is* that reference, so
  a repeated `session.created` cannot take a second one). Binding a child to a
  call acquires nothing, so a call can never release a sibling's reference.
- **Exact correlation** is the primary source: `message.part.updated` for a
  native `task` ToolPart carries the parent `sessionID`, the `callID`, and the
  child session ID in the tool state `metadata` (reused from
  `taskSessionIdFromMetadata` in `src/utils/task.ts`). Only the tool state's
  metadata is read, an unknown tool state is ignored, and the part must name both
  the same call and the same parent — otherwise it registers nothing
  (fail-closed).
- A bound child is remembered immediately, so an aborted delegation (which never
  reaches `tool.execute.after`) still leaves a usable alias. An `error` part
  settles the call only when it carried a child id; a metadata-less error part
  leaves the call pending so a later child-bearing part can still bind. Nothing
  is settled from parent idleness.
- `session.created` additionally registers the child as a fallback only when
  attribution is unambiguous — exactly one pending call for that parent, a fresh
  delegation, and no child bound yet. No FIFO/oldest fallback is used, because
  that would file a child under the wrong delegation, and it never overrides a
  binding an exact event already made.
- Both sources write one binding (`boundChildId`) through `rememberChildForCall`,
  which `tool.execute.after` also uses: the same child is idempotent (alias
  preserved, not renumbered), and a genuinely different child supersedes only the
  earlier binding of that same call. A child can be bound by several calls at once
  (two concurrent resumes), so superseding is scoped to the call doing it and never
  touches a sibling's view of the child.
- A resume binds its already-known child in `tool.execute.before`, before any part
  or result exists, so an abort that reports nothing cannot lose it. This does not
  rewrite the stored label: an unresolved resume keeps describing the thread the
  alias was created for.
- **Protection is ownership-based.** `SessionManager` stores a set of owner keys per
  entry and exempts non-empty sets from `maxSessionsPerAgent` trimming; the value is
  the capacity of settled history.
  - `active:<parent>\0<callId>` — one per in-flight execution of that child, added by
    `rememberChildForCall`. Replay is a no-op.
  - `recovery:<childId>` — taken when an execution ends interrupted, failed, or is
    evicted from the pending window. It belongs to the child, so it outlives the
    call, and it is bounded by `MAX_RECOVERY_RETAINED_CHILDREN` (200, oldest first):
    overflow releases the oldest rather than deleting it.
  - `settleCall(call, outcome)` takes an explicit outcome:
    `completed` releases this execution's active owner *and* the child's recovery
    owner; `interrupted` establishes the recovery owner **before** releasing the
    active owner, so trimming never observes an unprotected gap; `discarded`
    (session-deletion teardown) releases only the active owner, so dropping a
    parent cannot create retention. One execution finishing therefore never
    unprotects a child another execution still holds.
- `settleCall` is the single end-of-call path: it removes the call from the
  unsettled set, releases the references the call owns, and ends its protection.
- `rememberPendingCall(call, beforeInsert?)` centralizes replacement ordering for a
  reused `(parent, callID)`: the previous execution is settled first (settling
  removes the key, so inserting first would delete the new call, and both
  executions share the slot's active owner key), then `beforeInsert` runs — where a
  resume takes its protection — and the new call is inserted last and never settled
  here.
- `forgetChild` clears everything about a child the plugin is forgetting: alias,
  read context, provisional reference, and recovery retention membership. Parent
  deletion runs it for every child of that parent via
  `SessionManager.taskIdsForParent`, after settling the parent's pending calls as
  `discarded`.
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
7. On `message.part.updated`, a native `task` tool part is correlated by
   `callID` **and** parent `sessionID` to its pending call, and the child from
   the tool state metadata is remembered and pinned immediately — the alias
   exists before any result, so an interrupted delegation stays reusable.
8. An `error` state settles that call (no `after` will ever run) but only when it
   carried a child id, so a later child-bearing part can still bind a
   metadata-less failure.
9. `tool.execute.after` reads the task ID from `task` metadata or result text and
   registers it through the same binding logic, so a child already reported by a
   part keeps its alias.
10. A result naming an already-deleted child registers nothing: the child's alias
    was dropped when it was deleted.
11. Otherwise the ID is bound: the alias is registered and any read context
    collected for that child is attached.
12. If this call was a resume attempt, or had already bound a child, and the ID
    that arrives is different, only that one call's stale alias and read context
    are dropped; siblings keep theirs.
13. If the host confirms the child is missing (`Session not found` /
    `Session no session`), the predecessor alias is dropped. Cancellations and
    generic failures keep it so the thread can be retried.
14. The call settles: a result with a child id also clears that child's recovery
    retention, so the capped history applies again, while an id-less result hands
    the child to recovery retention instead. Read context is pruned for anything no
    longer remembered, and provisional children of a parent with no call left in
    flight are released.
15. `experimental.chat.system.transform` injects a rendered block from
    `SessionManager.formatForPrompt` under `### Resumable Sessions`.
16. On `session.deleted`, the hook records the id as deleted (bounded FIFO of
    200), then releases tracking *before* dropping state: every pending call that
    owns the session — as its parent, as the child it resumed, **or as the child
    already bound to it** — is settled, so neither a late result nor a late task
    part can re-register an alias, even after the bounded tombstone window has
    churned past the id. Provisional children, recovery retention and read context
    are released and remembered aliases are cleared. A child that was never
    correlated to a call has no call to invalidate here and relies on the bounded
    tombstone alone.

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
  - `parseTaskIdFromTaskOutput` and `taskSessionIdFromMetadata`
    (from `src/utils/task.ts`)
  - `ALL_AGENT_NAMES` (from `src/config/constants.ts`)
  - plugin configuration (`maxSessionsPerAgent`) and runtime session filtering from
    `src/index.ts` (`shouldManageSession`).
