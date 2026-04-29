import { AGENT_ALIASES, ALL_AGENT_NAMES } from './constants';
import type { AgentOverrideConfig, PluginConfig } from './schema';

/**
 * Get agent override config by name, supporting backward-compatible aliases.
 * Checks both the current name and any legacy alias names.
 *
 * For frontend-developer and backend-developer: if no explicit config exists,
 * falls back to the legacy 'fixer' agent config (model, variant, temperature,
 * options, skills, mcps, displayName) for full backward compatibility with the
 * pre-split era.
 *
 * @param config - The plugin configuration
 * @param name - The current agent name
 * @returns The agent-specific override configuration if found
 */
export function getAgentOverride(
  config: PluginConfig | undefined,
  name: string,
): AgentOverrideConfig | undefined {
  const overrides = config?.agents ?? {};

  // Direct lookup first — explicit per-agent config always wins
  const direct = overrides[name];
  if (direct !== undefined) return direct;

  // For the split agents, fall back to legacy fixer config for ALL fields
  // (model, variant, temperature, options, skills, mcps, displayName) when
  // no explicit config is provided. Explicit per-agent overrides must still
  // win over legacy fixer.
  if (name === 'frontend-developer' || name === 'backend-developer') {
    return overrides['fixer'];
  }

  // Standard alias lookup for other legacy agent names
  const aliasKey = Object.keys(AGENT_ALIASES).find(
    (k) => AGENT_ALIASES[k] === name,
  );
  return aliasKey ? overrides[aliasKey] : undefined;
}

/**
 * Get custom agent names declared in config.agents.
 *
 * Custom agents are unknown keys that are neither built-in agent names nor
 * legacy aliases.
 */
export function getCustomAgentNames(
  config: PluginConfig | undefined,
): string[] {
  const overrides = config?.agents ?? {};
  return Object.keys(overrides).filter((name) => {
    if (AGENT_ALIASES[name] !== undefined) {
      return false;
    }

    return !(ALL_AGENT_NAMES as readonly string[]).includes(name);
  });
}
