# src/skills/

## Responsibility

- Own metadata-driven OpenCode custom skills shipped with this package.
- Maintain the skill contract artifacts (`SKILL.md`, `README.md`, per-skill helper files) that are copied into
  `${configDir}/skills` at install time.
- Preserve a canonical registry boundary: runtime code consumes skill definitions as data, not as executable
  plugin dependencies.

## Design

- `CUSTOM_SKILLS` in `src/cli/custom-skills.ts` is the authoritative skill manifest for bundled
  skills; each entry maps folder name + `sourcePath` to an install-time consumer.
- `install.ts` runs `installCustomSkill()` which recursively copies each bundled
  skill directory from `src/skills/` into the OpenCode skills directory.
- Files are considered static runtime payload. No plugin TS module in `src/` imports these files directly; they
  are loaded by OpenCode via filesystem installation.

## Flow

- `bun run install` delegates to `src/cli/install.ts`, where `installCustomSkills` gates copying of
  each `CUSTOM_SKILLS` entry.
- `installCustomSkill()` computes `packageRoot`, validates `sourcePath`, checks if already installed (skips if present), then performs a recursive directory copy via `copyDirRecursive()`.
- During plugin release, the `files` whitelist in `package.json` must include `src/skills` so
  `src/skills/**` survive `npm pack`.
- OpenCode plugin startup discovers these installed folders and reads each `SKILL.md` as a prompt-level contract.

## Bundled Skills

This directory is partitioned by skill:
- `src/skills/codemap/` (command-style repository mapping skill)
- `src/skills/simplify/` (readability/refactor guidance skill)
- `src/skills/vercel-react-best-practices/` (React/Next.js performance guidelines)
- `src/skills/backend-developer/` (clean architecture/FastAPI patterns)
- `src/skills/karpathy-guidelines/` (LLM coding pitfall guidelines)

## Integration

- `src/cli/custom-skills.ts`: source-of-truth registry consumed by installer and permission helpers.
- `src/cli/skills.ts:getSkillPermissionsForAgent()` auto-populates permission rules for
  all bundled skills when agent policy is derived from built-in recommendations.
- `verify-release-artifact.ts` enforces artifact completeness by asserting all `SKILL.md` files
  are present in the tarball.
- `package.json` scripts (`verify:release`, `build`) rely on these assets to ensure install-time skill availability.
