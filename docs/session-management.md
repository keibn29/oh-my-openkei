# Session Management

Session management lets the primary agents (Orchestrator, Planner, and Sprinter)
keep track
of recent delegated child sessions so follow-up work can continue in the right
specialist context instead of starting from scratch every time.

It is enabled by default. You do not need to add anything to your config unless
you want to change how many sessions are remembered.

---

## Why It Exists

Delegation works best when specialists can continue a thread they already
understand:

- Explorer can continue investigating the same part of the codebase.
- Oracle can keep reviewing the same architecture/debugging thread.
- Frontend Developer / Backend Developer can continue scoped implementation or test updates.
- Librarian can continue the same documentation/API research.

Without session management, follow-up delegations usually create fresh child
sessions. That works, but the specialist may need repeated context. With session
management, the orchestrator can reuse recent child sessions when it makes sense.

---

## How It Feels in Practice

When a child task runs, the plugin remembers it under a short alias such as:

```text
exp-1
ora-1
fed-2
```

The primary agent sees a compact reminder in its system context, for example:

```text
### Resumable Sessions
Child sessions you already ran in this conversation. Reuse is always explicit:
- Continue the same thread: call `task` again with the SAME subagent_type and task_id="<alias>".
- New or unrelated topic: OMIT task_id so a fresh child session is created.
- If several aliases fit, use the most recently used one for that specialist.
- Never reuse an alias blindly; an alias that is unknown or evicted fails the call.

- explorer: exp-1 Search routing files
  Context read by exp-1: src/router.ts (120 lines), src/routes/api.ts (74 lines)
- oracle: ora-1 Review auth architecture
```

When a child session reads files through OpenCode's `read` tool, the reminder can
include a compact list of files that session has already inspected. This helps the
orchestrator choose the right session to resume for related follow-up work.

To keep the prompt small, read context only shows files where at least 10 lines
were read, includes line counts, and caps each remembered session to the most
recent 8 files by default. Both thresholds are configurable.

## Reuse Is Always Explicit

The plugin never reuses a child session on its own. Every delegation either
carries an alias or does not:

| What the agent sends | What happens |
|---|---|
| `subagent_type: explorer, task_id: "exp-1"` | Continues the child session behind `exp-1` |
| `subagent_type: explorer` (no `task_id`) | Starts a brand-new child session |
| `task_id: "exp-9"` (unknown, evicted, or from another session/agent) | The plugin rejects the call with an error naming the aliases that *are* available |

The rejection happens in the plugin, before the call runs, so the unknown alias
never falls back to a silent fresh child. How the host surfaces a thrown tool
error to the model has not been verified against the host, so treat the model-
visible form of that error as unconfirmed.

So a follow-up question about the same file keeps the specialist's context, and
an unrelated request always starts clean. Aliases stay valid for the whole
conversation, including across many user messages.

If the referenced child session no longer exists, the plugin drops the stale
entry, so the next call simply starts fresh. A cancelled or failed task is *not*
treated as a deletion, so the alias survives and the same thread can be retried.
A confirmed-missing child is also dropped from recovery retention, and retention
is never recorded for a child the plugin no longer remembers, so a forgotten or
deleted child cannot keep occupying that bounded capacity.

## Scope and Safety

Session management is intentionally narrow:

- It only applies to primary-agent-managed `task` delegations (Orchestrator, Planner, or Sprinter).
- It is scoped to the current parent orchestrator session.
- It is in-memory only: nothing is written to disk, and nothing survives an
  OpenCode or plugin restart. After a restart the agent starts a fresh child.
- Aliases last until the parent session is deleted, the child is deleted, or
  the entry is pushed out of the per-specialist window. A child whose delegation
  is still running or was interrupted is *protected* from that window (see
  "Protected Children" below), so it stays listed until it completes.
- It does not change manual `@agent` calls.
- It keeps only a small number of recent sessions per specialist type.
- Deleted child sessions are cleaned up automatically, and a delegation that is
  still running when its child is deleted is invalidated so no later event or
  result can register an alias for it.
- Read context is best-effort and tracks normal OpenCode `read` tool usage, not
  arbitrary filesystem access through shell commands or external MCP tools.

This keeps the feature useful for continuity without turning child sessions into
long-lived global state.

### Protected Children

`sessionManager.maxSessionsPerAgent` is the capacity of *settled* history per
specialist: the most recent N finished child sessions. Children that still need
to be resumable are excluded from that capacity, so three interrupted Explorer
children all stay listed under the default capacity of 2.

A child is protected by named owners rather than a flag, so overlapping
situations do not fight over it:

- **Active owner** — one per in-flight execution of that child. Two delegations
  resuming the same child both hold it; when one finishes, the other's claim
  keeps it protected.
- **Recovery owner** — taken when an execution ends interrupted, failed, or is
  evicted from the pending window. It is a property of the child, not of any one
  call, so it survives that call being forgotten. The handoff is not a swap: the
  recovery owner is established *before* the last active owner is released, so
  full history pressure can never catch a child unprotected mid-transition.

A successful completion of that child releases this execution's active owner
*and* the child's recovery owner: the interrupted thread the recovery owner was
keeping alive has now been answered deliberately. The capped history applies
again only once no owner remains at all — an execution that is still in flight, or
retention another path still holds, keeps the child listed.

Deleting a child removes it and every owner with it. Deleting a parent clears the
retention of all of its children, and a superseded or confirmed-missing child is
forgotten along with its retention, so a forgotten id can never keep occupying
retention capacity or be re-registered already "retained".

Recovery retention is bounded: the most recent 200 retained children are kept,
oldest first. Beyond that, the oldest retained child loses its recovery owner and
rejoins the capped history (it is not deleted). Replayed or duplicated events for
the same child and owner change nothing, because owners are a set.

### Known Limits

**Recovery of an interrupted run depends on one host signal.** It works when the
native `task` tool publishes a child-bearing `message.part.updated` part — the
part's tool state metadata carrying `sessionId` — before or during the abort, and
that part must reach the plugin before the next prompt on the same parent
session, since the resumable list is rebuilt for each prompt from what the plugin
has received by then. The plugin has been verified against this event contract
only at the unit level; the timing of the host's own emission and delivery has
not been observed against a running OpenCode. Without a usable child-bearing part
in time, recovery falls back to the weaker behaviour described below.

- The child session ID is read from two sources. The host's task result is
  authoritative when it exists: metadata `sessionId`, the
  `<task id="..." state="completed">` envelope, or a leading legacy `task_id:`
  header. A host that reports none of these yields no alias for that call.
- The event contract used during a run is narrower and is documented from the
  OpenCode SDK type declarations rather than from observed host output: a
  `message.part.updated` part with `type: "tool"`, `tool: "task"`, a `callID`, a
  `sessionID` naming the parent, and a tool state of `pending`, `running`,
  `completed`, or `error` whose metadata may carry `sessionId`. Only the tool
  state's metadata is read, unknown tool states are ignored, and the part must
  name both the same call **and** the same parent session the plugin recorded.
  Anything else registers nothing.
- The part is correlated by `callID` and parent session, never by order, so any
  number of concurrent delegations can be in flight and events may arrive
  interleaved or replayed. A replay of the same snapshot is idempotent.
- If a call's child id is ever genuinely replaced, the later snapshot wins. The
  implementation does not try to order conflicting ids by freshness: two
  snapshots of the *same* call naming different children are resolved by arrival
  order, the last one received is kept, and the previous alias for that call is
  dropped.
- When no child-bearing part is available, `session.created` is used. It does not
  report the originating call, so it registers a child only when exactly one
  `task` call is in flight for that parent and it is a fresh delegation. There is
  no fallback ordering (such as "the oldest pending call wins"): a child would
  then be filed under the wrong delegation, so concurrent delegations stay
  unaliased there instead of being misattributed. That fallback also never
  overrides a child already claimed by an exact event or result.
- A failed or aborted execution runs no `tool.execute.after`, so its call is
  settled by the error state of its task part. An error part that carries no
  child id does *not* settle the call, so a later child-bearing part can still
  bind it; such a call then stays pending until the same call id is recorded
  again, it is evicted from the bounded pending window, a relevant session is
  deleted, or the plugin restarts. A stranded call does not block later
  child-bearing task parts for other calls, because correlation is per call
  rather than per parent; it does still hold its own slot in the bounded pending
  window and still holds a child that may be protected.
- Deleted ids are remembered in a bounded window (the most recent 200). A
  pending call whose child is deleted — the one it resumed or already bound — is
  invalidated directly, so no later event or result can re-register that alias
  even after the tombstone window has churned past the id. A child that was never
  correlated to a call has no such call to invalidate, so it relies on the
  bounded tombstone alone.
- Child sessions are also tracked provisionally through `session.created`, which
  does not report the originating call. A child is therefore tracked only while
  its parent has a `task` call in flight; a child created outside a delegation,
  or reads that happen after every call of its parent finished, are not tracked.
- Only explicit references are accepted: a raw child ID works when the plugin
  already remembers it for that parent and agent. No alias is ever invented for
  a child whose call could not be identified, and an alias that cannot be
  resolved fails the call.
- `maxSessionsPerAgent` is the capacity of settled history only; children with an
  owner are excluded from it (see "Protected Children"). Retention is not
  permanent: an interrupted child is released by a later successful continuation
  of that same child, by deletion, or when it falls out of the bounded
  recovery-retention window (the most recent 200), after which it rejoins the
  capped history. Pending-window eviction alone does not release an interrupted
  child, because retention is tracked separately from the pending window.
- No authoritative fallback is derived from child message or agent events: those
  do not name the originating call, so using them would mean inventing a label,
  and an invented alias would break the fail-closed resolution above.

---

## Default Behavior

By default, the plugin remembers **2 recent child sessions per specialist type**.

That means the generated starter config can stay clean:

```jsonc
{
  "preset": "default",
  "presets": {
    "default": {
      "orchestrator": { "model": "openai/gpt-5.4-fast", "variant": "xhigh" },
      "planner": { "model": "openai/gpt-5.5-fast", "variant": "xhigh" },
      "sprinter": { "model": "openai/gpt-5.3-codex", "variant": "low" },
      "explorer": { "model": "minimax-coding-plan/MiniMax-M2.7" },
      "frontend-developer": { "model": "opencode-go/deepseek-v4-flash" },
      "backend-developer": { "model": "opencode-go/deepseek-v4-flash" }
    }
  }
}
```

Session management still works because the runtime falls back to the built-in
default.

---

## Configuration

Only add `sessionManager` if you want to change the default limits:

```jsonc
{
  "sessionManager": {
    "maxSessionsPerAgent": 2,
    "readContextMinLines": 10,
    "readContextMaxFiles": 8
  }
}
```

### `sessionManager.maxSessionsPerAgent`

| Type | Default | Range | Meaning |
|------|---------|-------|---------|
| integer | `2` | `1`–`10` | Capacity of settled resumable child sessions per specialist type in the current parent session; protected children (running or interrupted delegations) are extra |

### `sessionManager.readContextMinLines`

| Type | Default | Range | Meaning |
|------|---------|-------|---------|
| integer | `10` | `0`–`1000` | Minimum number of lines read from a file before it appears in resumable-session context |

Set this lower if you want short config files to appear. Set it higher to keep
the prompt focused on substantial file reads.

### `sessionManager.readContextMaxFiles`

| Type | Default | Range | Meaning |
|------|---------|-------|---------|
| integer | `8` | `0`–`50` | Maximum number of recent read-context files shown per remembered child session |

Set this to `0` to keep session aliases but hide read-context file lists.

Use a higher value if you often run several parallel threads per specialist. Use
a lower value if you want fewer aliases in the orchestrator context.

---

## When To Tune It

Most users should leave the default alone.

Consider changing it when:

- You frequently run multiple independent Explorer/Oracle/Frontend Developer/Backend Developer threads in one
  long orchestrator session.
- You want the orchestrator prompt to stay smaller and prefer only one remembered
  thread per specialist.
- You are debugging session reuse behavior and want a predictable small window.

Example with a smaller memory window:

```jsonc
{
  "sessionManager": {
    "maxSessionsPerAgent": 1,
    "readContextMaxFiles": 4
  }
}
```

Example with a larger memory window:

```jsonc
{
  "sessionManager": {
    "maxSessionsPerAgent": 4,
    "readContextMinLines": 5
  }
}
```
