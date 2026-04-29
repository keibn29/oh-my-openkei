# Repository Atlas: oh-my-openkei

## Project Responsibility

`oh-my-openkei` is an OpenCode plugin that adds a specialist-agent operating model on top of the host runtime. Its core job is to:

- define orchestrator and specialist agents,
- load layered plugin configuration and per-agent permissions,
- expose additional tools and MCP integrations,
- manage delegated/resumable session orchestration,
- inject workflow-enforcement hooks plus runtime command handlers,
- ship install-time skills and a bootstrap CLI.

This codemap intentionally covers the plugin repository itself and excludes the nested `opencode/` upstream checkout.

## System Entry Points

| Path | Role |
|---|---|
| `package.json` | Package manifest, dependency graph, release scripts, published file list. |
| `src/index.ts` | Main plugin bootstrap: wires agents, tools, MCPs, hooks, council/session managers, task-session tracking, and config merge behavior. |
| `src/cli/index.ts` | CLI entrypoint for installation/bootstrap workflows. |
| `src/config/schema.ts` | Source-of-truth runtime config schema used by validation and schema generation. |
| `scripts/generate-schema.ts` | Generates `oh-my-openkei.schema.json` from the Zod config schema. |

## Repository Directory Map

| Directory | Responsibility Summary | Detailed Map |
|---|---|---|
| `src/` | Main application surface that composes plugin bootstrap, runtime model chains, hook orchestration, task-session aliasing, and installer-facing code. | [View Map](src/codemap.md) |

## Runtime Control Flow

1. **Plugin startup**
   - OpenCode loads `src/index.ts`.
   - Config is loaded and normalized through `src/config/`.
   - Agent definitions are produced by `src/agents/`.
   - Tool factories from `src/tools/` and MCP definitions from `src/mcp/` are registered.
   - Hooks from `src/hooks/` are attached.
   - Delegation/council orchestration, task-session aliasing, and runtime preset handling are initialized.

2. **Interactive request handling**
   - The orchestrator prompt drives routing decisions.
   - Tool calls resolve through `src/tools/` or built-in OpenCode tools.
   - Hooks can transform prompts/messages, normalize system message arrays, repair tool failures, or intercept runtime commands before/after execution.

3. **Delegated execution**
   - OpenCode child sessions are created by delegation/council flows and tracked by plugin utilities.
   - `src/hooks/task-session-manager/` remembers reusable child sessions and injects short aliases into the orchestrator prompt.

4. **Install/release path**
   - `src/cli/` configures host OpenCode instances.
   - `src/skills/` is copied into the user skill directory.
   - `scripts/` validates generated schema, package completeness, and host-load behavior.

## Key Cross-Module Integration Points

- `src/index.ts` is the central composition root for nearly every runtime subsystem.
- `src/config/` feeds `src/agents/`, session/delegation utilities, and MCP registration.
- `src/cli/skills.ts` and `src/cli/custom-skills.ts` bridge install-time skill packaging with runtime permission policy.
- Session/delegation utilities cooperate with helpers in `src/utils/` for depth tracking, result extraction, task output parsing, and alias state.
- `src/tools/council.ts` delegates into `src/council/`.
- `src/hooks/task-session-manager/` depends on `src/utils/session-manager.ts` and `src/utils/task.ts` to support child-session reuse.
- `src/hooks/filter-available-skills/` and agent permission logic rely on shared skill names from the CLI/config layer.

## Root Assets

- `README.md`: user-facing product overview, install docs, and agent descriptions.
- `AGENTS.md`: agent operating conventions for this repository.
- `biome.json`: formatting/lint policy.
- `tsconfig.json`: TypeScript compiler settings.
- `.slim/codemap.json`: codemap change-detection state for this repository.

## Recommended Reading Order

1. `codemap.md`
2. `src/codemap.md`
3. One of:
   - `src/agents/codemap.md`
   - `src/tools/codemap.md`
   - `src/hooks/codemap.md`
4. Relevant subsystem sub-map for the task at hand
