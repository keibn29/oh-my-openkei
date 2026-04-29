# Style and Conventions
- Formatter/linter: Biome (`biome.json`), 2-space indent, 80-char line width, LF endings, single quotes, trailing commas enabled.
- TypeScript strict mode is enabled; avoid explicit `any` outside justified test cases.
- Naming: camelCase for variables/functions, PascalCase for classes/interfaces, SCREAMING_SNAKE_CASE for constants, kebab-case filenames except PascalCase React components.
- Prefer typed/descriptive errors; use Zod for runtime validation.
- Let Biome organize imports.
- Architecture notes: `src/index.ts` is the composition root; agent defaults and permissions are centralized through config/constants + CLI skill helpers; installer-related logic belongs under `src/cli/`.