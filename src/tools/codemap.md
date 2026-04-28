# src/tools/

## Responsibility

`src/tools/` exposes plugin tooling and runtime command hooks used by OpenCode.

- AST-aware search/replace via `ast-grep` stack.
- Remote fetch/transform utility via `smartfetch` (`webfetch` tool).
- Council orchestration via `createCouncilTool` (`council.ts`).

It is the bridge between plugin runtime integration (`src/index.ts`) and the lower-level
implementations in feature folders.

## Export surface (`src/tools/index.ts`)

- `ast_grep_search`, `ast_grep_replace` from `./ast-grep`
- `createWebfetchTool`, `WEBFETCH_DESCRIPTION`, and related types from `./smartfetch`
- `createCouncilTool`

## Design patterns

- **Factory-based registration:** each feature exposes a factory that returns an
  executable/tool or handler object bound to plugin context.
- **Clear boundaries:** all plugin lifecycle hooks are emitted from factory methods
  (`handleCommandExecuteBefore`, `handleEvent`, `registerCommand`) rather than in tool
  modules.
- **Metadata-first output:** tool calls return text plus internal metadata writes when
  possible (for richer UI surfaces).

## Subsystems and data flow

### Council tool path

- `createCouncilTool` defines `council_session`.
- `execute` performs guarded invocation:
  - validates `toolContext` and `sessionID`,
  - only allows direct use by `agent: 'council'` (or missing agent for backward compatibility),
  - calls `CouncilManager.runCouncil(prompt, preset, parentSessionId)`.
- On success, appends a councillor response summary and normalized model list to output.
- On failure, returns a concise error string.
- Shows config deprecation warnings when `CouncilManager` exposes deprecated field metadata.

### Smartfetch path

- `createWebfetchTool` owns fetch orchestration, permission prompts, cache checks,
  llms.txt probing, binary/text branching, and optional secondary-model post-processing.
- `smartfetch` modules split work into:
  - transport/policy (`network.ts`),
  - cache + TTL semantics (`cache.ts`),
  - output shaping (`utils.ts`),
  - file-backed binaries (`binary.ts`),
  - secondary-model summarization (`secondary-model.ts`),
  - constants and types.
- `webfetch` is always registered from `src/index.ts` as a public tool.

### AST-grep path

- `ast-grep` is split into CLI/CLI-discovery and tool-definition concerns.
- `ast_grep_search`/`ast_grep_replace` execution calls into `runSg`, which handles
  argument normalization, binary availability, timeout/error handling, and output truncation.
- `src/tools/ast-grep/index.ts` re-exports tool definitions and utility helpers for
  discoverability (`ensureCliAvailable`, `getAstGrepPath`, downloader/runtime checks).

## Integration points in `src/index.ts`

- Tool registration:
  - `council` tools (only when `config.council` exists),
  - `webfetch`,
  - AST tools.
