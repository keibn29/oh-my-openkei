# Task Completion Checklist
When code changes are done:
1. Update docs if behavior/configuration/user-facing workflow changed (`README.md`, `docs/` as needed).
2. Run `bun run check:ci`.
3. Run `bun run typecheck`.
4. Run `bun test`.
5. Before pushing, perform code review (repo guidance recommends `/review`).
6. Only create git commits when explicitly requested by the user.