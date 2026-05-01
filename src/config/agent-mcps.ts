import {
  type AgentName,
  getAgentOverride,
  McpNameSchema,
  type PluginConfig,
} from '.';

/** Default MCPs per agent - "*" means all MCPs, "!item" excludes specific MCPs */

export const DEFAULT_AGENT_MCPS: Record<AgentName, string[]> = {
  orchestrator: ['*', '!context7'],
  planner: ['*', '!context7'], // same as orchestrator
  sprinter: ['*', '!context7'], // same as orchestrator - primary self-executing agent
  'business-analyst': ['*', '!context7'], // same as orchestrator - analysis primary agent
  designer: ['figma'],
  oracle: [],
  debugger: [],
  // Research MCPs (websearch, context7, grep_app) are safe for read-only
  // agents because they only fetch/search external content — no file mutation.
  // MCPs like serena are intentionally excluded from read-only agents because
  // they can edit files. Users may explicitly configure them if desired.
  librarian: ['websearch', 'context7', 'grep_app'],
  explorer: [], // removed serena — read-only agent, no write-capable MCPs
  'frontend-developer': ['figma'],
  'backend-developer': [],
  observer: [],
  council: [],
  councillor: [],
};

/**
 * Get the default MCP list for an agent.
 * Falls back to an empty array for unknown agents.
 */
export function getDefaultAgentMcps(agentName: string): string[] {
  return DEFAULT_AGENT_MCPS[agentName as AgentName] ?? [];
}

/**
 * Parse a list with wildcard and exclusion syntax.
 */
export function parseList(items: string[], allAvailable: string[]): string[] {
  if (!items || items.length === 0) {
    return [];
  }

  const allow = items.filter((i) => !i.startsWith('!'));
  const deny = items.filter((i) => i.startsWith('!')).map((i) => i.slice(1));

  if (deny.includes('*')) {
    return [];
  }

  if (allow.includes('*')) {
    return allAvailable.filter((item) => !deny.includes(item));
  }

  return allow.filter(
    (item) => !deny.includes(item) && allAvailable.includes(item),
  );
}

/**
 * Get available MCP names from schema and config.
 */
export function getAvailableMcpNames(config?: PluginConfig): string[] {
  const builtinMcps = McpNameSchema.options;
  const disabled = new Set(config?.disabled_mcps ?? []);
  return builtinMcps.filter((name) => !disabled.has(name));
}

/**
 * Get the MCP list for an agent (from config or defaults).
 */
export function getAgentMcpList(
  agentName: string,
  config?: PluginConfig,
): string[] {
  const agentConfig = getAgentOverride(config, agentName);
  if (agentConfig?.mcps !== undefined) {
    return agentConfig.mcps;
  }

  const defaultMcps = DEFAULT_AGENT_MCPS[agentName as AgentName];
  return defaultMcps ?? [];
}
