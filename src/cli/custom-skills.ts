import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from './paths';

/**
 * A custom skill bundled in this repository.
 * Unlike npx-installed skills, these are copied from src/skills/ to the OpenCode skills directory
 */
export interface CustomSkill {
  /** Skill name (folder name) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Agents this skill is recommended for (install metadata only) */
  recommendedFor: string[];
  /** Source path in this repo (relative to project root) */
  sourcePath: string;
}

/**
 * Registry of custom skills bundled in this repository.
 */
export const CUSTOM_SKILLS: CustomSkill[] = [
  {
    name: 'simplify',
    description: 'Code simplification and readability-focused refactoring',
    recommendedFor: ['oracle'],
    sourcePath: 'src/skills/simplify',
  },
  {
    name: 'codemap',
    description: 'Repository understanding and hierarchical codemap generation',
    recommendedFor: ['orchestrator'],
    sourcePath: 'src/skills/codemap',
  },
  {
    name: 'vercel-react-best-practices',
    description:
      'React and Next.js performance optimization guidelines from Vercel Engineering',
    recommendedFor: ['frontend-developer'],
    sourcePath: 'src/skills/vercel-react-best-practices',
  },
  {
    name: 'backend-developer',
    description:
      'Senior backend developer skill with clean architecture and Python/FastAPI patterns',
    recommendedFor: ['backend-developer'],
    sourcePath: 'src/skills/backend-developer',
  },
  {
    name: 'karpathy-guidelines',
    description:
      "Inspired by Andrej Karpathy's observations on LLM coding pitfalls",
    recommendedFor: ['frontend-developer', 'backend-developer'],
    sourcePath: 'src/skills/karpathy-guidelines',
  },
  {
    name: 'business-analyst',
    description:
      'Business analysis frameworks, templates, and documentation standards',
    recommendedFor: ['business-analyst'],
    sourcePath: 'src/skills/business-analyst',
  },
];

/**
 * Get the target directory for custom skills installation.
 */
export function getCustomSkillsDir(): string {
  return join(getConfigDir(), 'skills');
}

/**
 * Check whether a bundled custom skill is already installed locally.
 */
export function isCustomSkillInstalled(skill: CustomSkill): boolean {
  return existsSync(join(getCustomSkillsDir(), skill.name, 'SKILL.md'));
}

/**
 * Recursively copy a directory.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install a custom skill by copying from src/skills/ to the OpenCode skills directory.
 * Skips gracefully if the skill is already installed.
 * @param skill - The custom skill to install
 * @returns True if installation succeeded or skill was already present, false otherwise
 */
export function installCustomSkill(skill: CustomSkill): boolean {
  try {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const sourcePath = join(packageRoot, skill.sourcePath);
    const targetPath = join(getCustomSkillsDir(), skill.name);

    // Skip if already installed
    if (isCustomSkillInstalled(skill)) {
      return true;
    }

    // Validate source exists
    if (!existsSync(sourcePath)) {
      console.error(`Custom skill source not found: ${sourcePath}`);
      return false;
    }

    // Copy skill directory
    copyDirRecursive(sourcePath, targetPath);

    return true;
  } catch (error) {
    console.error(`Failed to install custom skill: ${skill.name}`, error);
    return false;
  }
}
