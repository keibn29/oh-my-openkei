import { spawnSync } from 'node:child_process';
import { getDefaultAgentSkills } from '../config/agent-skills';

/**
 * A recommended skill to install via `npx skills add`.
 */
export interface RecommendedSkill {
  /** Human-readable name for prompts */
  name: string;
  /** GitHub repo URL for `npx skills add` */
  repo: string;
  /** Skill name within the repo (--skill flag) */
  skillName: string;
  /** Agents this skill is recommended for (install metadata only) */
  recommendedFor: string[];
  /** Description shown to user during install */
  description: string;
  /** Optional commands to run after the skill is added */
  postInstallCommands?: string[];
}

/**
 * List of recommended skills.
 * Add new skills here to include them in the installation flow.
 */
export const RECOMMENDED_SKILLS: RecommendedSkill[] = [
  {
    name: 'agent-browser',
    repo: 'https://github.com/vercel-labs/agent-browser',
    skillName: 'agent-browser',
    recommendedFor: ['designer'],
    description: 'High-performance browser automation',
    postInstallCommands: [
      'npm install -g agent-browser',
      'agent-browser install',
    ],
  },
];

/**
 * Install a skill using `npx skills add`.
 * @param skill - The skill to install
 * @returns True if installation succeeded, false otherwise
 */
export function installSkill(skill: RecommendedSkill): boolean {
  const args = [
    'skills',
    'add',
    skill.repo,
    '--skill',
    skill.skillName,
    '-a',
    'opencode',
    '-y',
    '--global',
  ];

  try {
    const result = spawnSync('npx', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      return false;
    }

    // Run post-install commands if any
    if (skill.postInstallCommands && skill.postInstallCommands.length > 0) {
      console.log(`Running post-install commands for ${skill.name}...`);
      for (const cmd of skill.postInstallCommands) {
        console.log(`> ${cmd}`);
        const [command, ...cmdArgs] = cmd.split(' ');
        const cmdResult = spawnSync(command, cmdArgs, { stdio: 'inherit' });
        if (cmdResult.status !== 0) {
          console.warn(`Post-install command failed: ${cmd}`);
        }
      }
    }

    return true;
  } catch (error) {
    console.error(`Failed to install skill: ${skill.name}`, error);
    return false;
  }
}

/**
 * Resolve a list of skill names (with wildcard/exclusion syntax) into a
 * permission record.
 */
function resolveSkillListToPermissions(
  skillNames: string[],
): Record<string, 'allow' | 'deny'> {
  const permissions: Record<string, 'allow' | 'deny'> = {};
  const allows = skillNames.filter((s) => !s.startsWith('!'));
  const denies = skillNames
    .filter((s) => s.startsWith('!'))
    .map((s) => s.slice(1));

  if (allows.includes('*')) {
    permissions['*'] = 'allow';
  } else {
    permissions['*'] = 'deny';
    for (const a of allows) {
      permissions[a] = 'allow';
    }
  }

  for (const d of denies) {
    permissions[d] = 'deny';
  }

  return permissions;
}

/**
 * Get permission presets for a specific agent based on default skill config.
 * @param agentName - The name of the agent
 * @param skillList - Optional explicit list of skills to allow (overrides defaults)
 * @returns Permission rules for the skill permission type
 */
export function getSkillPermissionsForAgent(
  agentName: string,
  skillList?: string[],
): Record<string, 'allow' | 'ask' | 'deny'> {
  // If the user provided an explicit skill list (even empty), honor it
  if (skillList) {
    return resolveSkillListToPermissions(skillList);
  }

  // Use config-driven default skill list for this agent
  const defaultSkills = getDefaultAgentSkills(agentName);
  return resolveSkillListToPermissions(defaultSkills);
}
