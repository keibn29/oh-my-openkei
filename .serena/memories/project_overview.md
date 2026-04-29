# Project Overview
- oh-my-openkei is an OpenCode plugin that adds an orchestrator + specialist-agent operating model on top of the host runtime.
- Main responsibilities: define agents, register tools/MCPs/hooks, manage delegated/resumable sessions, ship install-time skills, and provide a bootstrap CLI.
- Tech stack: TypeScript, Bun, Biome, Zod, OpenCode plugin/sdk packages.
- Main entry points: `src/index.ts` (plugin bootstrap) and `src/cli/index.ts` (installer/bootstrap CLI).
- Key runtime areas: `src/agents`, `src/config`, `src/hooks`, `src/tools`, `src/utils`, `src/council`, `src/cli`, `src/skills`.
- Install flow lives in `src/cli/`; bundled skills are shipped from `src/skills/` and copied into the user OpenCode skills directory during install.