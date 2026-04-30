// Agent names
export const AGENT_ALIASES: Record<string, string> = {
  explore: 'explorer',
  'frontend-ui-ux-engineer': 'designer',
  fixer: 'frontend-developer', // legacy fallback
};

export const SUBAGENT_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'frontend-developer',
  'backend-developer',
  'observer',
  'council',
  'councillor',
] as const;

export const ORCHESTRATOR_NAME = 'orchestrator' as const;
export const PLANNER_NAME = 'planner' as const;
export const SPRINTER_NAME = 'sprinter' as const;
export const BUSINESS_ANALYST_NAME = 'business-analyst' as const;

export const PRIMARY_AGENT_NAMES = [
  ORCHESTRATOR_NAME,
  PLANNER_NAME,
  SPRINTER_NAME,
  BUSINESS_ANALYST_NAME,
] as const;

/**
 * Planner's allowed delegate subagents (planning-only agent).
 * Used by: prompt rendering (planner.ts), runtime gate (planner-delegate-validation hook),
 * delegation rules (SUBAGENT_DELEGATION_RULES.planner).
 */
export const PLANNER_DELEGATE_SET = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
] as const;

/**
 * Business Analyst's allowed delegate subagents.
 * Used by: prompt rendering (business-analyst.ts), delegation rules
 * (SUBAGENT_DELEGATION_RULES.business-analyst).
 */
export const BUSINESS_ANALYST_DELEGATE_SET = [
  'explorer',
  'librarian',
  'oracle',
] as const;

export const ALL_AGENT_NAMES = [
  ORCHESTRATOR_NAME,
  PLANNER_NAME,
  SPRINTER_NAME,
  BUSINESS_ANALYST_NAME,
  ...SUBAGENT_NAMES,
] as const;

// Agent name type (for use in DEFAULT_MODELS)
export type AgentName = (typeof ALL_AGENT_NAMES)[number];

// Subagent delegation rules: which agents can spawn which subagents
// orchestrator: can spawn all subagents (full delegation)
// frontend-developer: leaf node — prompt forbids delegation
// backend-developer: leaf node — prompt forbids delegation
// designer: can spawn explorer (for research during design)
// explorer/librarian/oracle: cannot spawn any subagents (leaf nodes)
// Unknown agent types not listed here default to explorer-only access
// Which agents each agent type can spawn via delegation.
// councillor is internal — only CouncilManager spawns it.
export const ORCHESTRATABLE_AGENTS = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'frontend-developer',
  'backend-developer',
  'observer',
  'council',
] as const;

/** Agents that cannot be disabled even if listed in disabled_agents config. */
export const PROTECTED_AGENTS = new Set(['orchestrator', 'councillor']);

/**
 * Get the list of orchestratable agents, excluding any disabled agents.
 * This is used for delegation validation at runtime.
 */
export function getOrchestratableAgents(
  disabledAgents?: Set<string>,
): string[] {
  return ORCHESTRATABLE_AGENTS.filter((name) => !disabledAgents?.has(name));
}

export const SUBAGENT_DELEGATION_RULES: Record<AgentName, readonly string[]> = {
  orchestrator: ORCHESTRATABLE_AGENTS,
  planner: PLANNER_DELEGATE_SET, // restricted set
  sprinter: [], // self-executing, no delegation by default
  'business-analyst': BUSINESS_ANALYST_DELEGATE_SET,
  'frontend-developer': [],
  'backend-developer': [],
  designer: [],
  explorer: [],
  librarian: [],
  oracle: [],
  observer: [],
  council: [],
  councillor: [],
};

// Default models for each agent
// orchestrator: undefined — resolved at runtime via _modelArray or user config
// planner: uses same strong model class as orchestrator (runtime-safe default)
// sprinter: openai/gpt-5.3-codex with low variant for fast Q&A and direct execution
export const DEFAULT_MODELS: Record<AgentName, string | undefined> = {
  orchestrator: undefined,
  planner: 'openai/gpt-5.5', // strong planning model, runtime-safe default
  sprinter: 'openai/gpt-5.3-codex',
  'business-analyst': 'openai/gpt-5.5', // strong reasoning model for analysis
  oracle: 'openai/gpt-5.5',
  librarian: 'openai/gpt-5.4-mini',
  explorer: 'openai/gpt-5.4-mini',
  designer: 'openai/gpt-5.4-mini',
  'frontend-developer': 'openai/gpt-5.4-mini',
  'backend-developer': 'openai/gpt-5.4-mini',
  observer: 'openai/gpt-5.4-mini',
  council: 'openai/gpt-5.4-mini',
  councillor: 'openai/gpt-5.4-mini',
};

// Polling configuration
export const POLL_INTERVAL_MS = 500;
export const POLL_INTERVAL_SLOW_MS = 1000;
export const POLL_INTERVAL_BACKGROUND_MS = 2000;

// Timeouts
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const FALLBACK_FAILOVER_TIMEOUT_MS = 15_000;

// Subagent depth limits
export const DEFAULT_MAX_SUBAGENT_DEPTH = 3;

// Workflow reminders
export const PHASE_REMINDER_TEXT = `!IMPORTANT! Recall the workflow rules:
Understand → choose the best parallelized path based on your capabilities and agents delegation rules → recall session reuse rules → execute → verify.
If delegating, launch the specialist in the same turn you mention it !END!`;

// Polling stability
export const STABLE_POLLS_THRESHOLD = 3;

/** Agents that are disabled by default. Users must explicitly enable them
 *  by removing from disabled_agents and configuring an appropriate model. */
export const DEFAULT_DISABLED_AGENTS: string[] = ['observer'];
