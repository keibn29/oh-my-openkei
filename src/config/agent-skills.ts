import type { AgentName } from './constants';

/**
 * Default skill names per agent.
 *
 * Each entry is an array of skill names with wildcard/exclusion semantics:
 * - '*' means all available skills
 * - '!name' excludes a specific skill (used with '*')
 * - 'name' includes a specific skill
 *
 * These defaults drive both the lite preset config generation
 * (generateLiteConfig) and default permission grants
 * (getSkillPermissionsForAgent).
 */
export const DEFAULT_AGENT_SKILLS: Record<AgentName, string[]> = {
  orchestrator: ['*'],
  planner: ['*'],
  sprinter: ['*'],
  'business-analyst': ['business-analyst'],
  designer: ['agent-browser'],
  oracle: ['simplify', 'requesting-code-review'],
  librarian: [],
  explorer: [],
  'frontend-developer': ['vercel-react-best-practices', 'karpathy-guidelines'],
  'backend-developer': ['backend-developer', 'karpathy-guidelines'],
  observer: [],
  council: [],
  councillor: [],
};

/**
 * Get the default skill names for an agent.
 * Falls back to an empty array for unknown agents.
 */
export function getDefaultAgentSkills(agentName: string): string[] {
  return DEFAULT_AGENT_SKILLS[agentName as AgentName] ?? [];
}
