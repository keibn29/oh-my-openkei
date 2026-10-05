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

## Scope and Safety

Session management is intentionally narrow:

- It only applies to primary-agent-managed `task` delegations (Orchestrator, Planner, or Sprinter).
- It is scoped to the current parent orchestrator session.
- It is in-memory only: nothing is written to disk, and nothing survives an
  OpenCode or plugin restart. After a restart the agent starts a fresh child.
- Aliases last until the parent session is deleted, the child is deleted, or
  the entry is pushed out of the per-specialist window.
- It does not change manual `@agent` calls.
- It keeps only a small number of recent sessions per specialist type.
- Deleted child sessions are cleaned up automatically, and a delegation that is
  still running when its child is deleted is invalidated so the late result
  cannot register an alias.
- Read context is best-effort and tracks normal OpenCode `read` tool usage, not
  arbitrary filesystem access through shell commands or external MCP tools.

This keeps the feature useful for continuity without turning child sessions into
long-lived global state.

### Known Limits

- The child session ID is read from the host's task result (metadata
  `sessionId`, the `<task id="..." state="completed">` envelope, or a leading
  legacy `task_id:` header). A host that reports none of these yields no
  alias for that call.
- Deleted ids are remembered in a bounded window (the most recent 200). A
  fresh delegation whose result arrives after more than 200 other sessions were
  deleted can therefore still register an alias for an already-deleted child.
  In-flight resumes of a deleted child are invalidated directly and are not
  subject to this window.
- Child sessions are tracked through the host's `session.created` event, which
  does not report the originating call. A child is therefore tracked only while
  its parent has a `task` call in flight; a child created outside a delegation,
  or reads that happen after every call of its parent finished, are not tracked.
- Only explicit references are accepted: a raw child ID works when the plugin
  already remembers it for that parent and agent.
- Tracking is released from a tool result, not from the tool itself: OpenCode
  awaits the native `task` item and only then runs `after`, with no `finally`,
  so an execution that throws never produces a result. Its pending entry, the
  provisional child markers, and any read context stay in place until the same
  `callID` is recorded again, the entry is evicted from the bounded pending
  window, the relevant session is deleted, or the plugin restarts. While such a
  stranded call exists its parent keeps being treated as having a delegation in
  flight, which is conservative: children and read context are retained rather
  than cleared.

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
| integer | `2` | `1`–`10` | Number of recent resumable child sessions remembered per specialist type in the current parent session |

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
