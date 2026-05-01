import type { AgentConfig as SDKAgentConfig } from "@opencode-ai/sdk/v2";
import { getSkillPermissionsForAgent } from "../cli/skills";
import {
  type AgentOverrideConfig,
  ALL_AGENT_NAMES,
  DEFAULT_DISABLED_AGENTS,
  DEFAULT_MODELS,
  getAgentOverride,
  getCustomAgentNames,
  loadAgentPrompt,
  type PluginConfig,
  PRIMARY_AGENT_NAMES,
  PROTECTED_AGENTS,
  SUBAGENT_NAMES,
} from "../config";
import { getAgentMcpList } from "../config/agent-mcps";
import { createBackendDeveloperAgent } from "./backend-developer";
import { createBusinessAnalystAgent } from "./business-analyst";
import { createCouncilAgent } from "./council";
import { createCouncillorAgent } from "./councillor";
import { createDesignerAgent } from "./designer";
import { createExplorerAgent } from "./explorer";
import { createFrontendDeveloperAgent } from "./frontend-developer";
import { createLibrarianAgent } from "./librarian";
import { createObserverAgent } from "./observer";
import { createOracleAgent } from "./oracle";
import {
  type AgentDefinition,
  createOrchestratorAgent,
  resolvePrompt,
} from "./orchestrator";
import { createPlannerAgent } from "./planner";
import { SHARED_SUBAGENT_PROMPT_FRAGMENTS } from "./shared-agent-content";
import { createSprinterAgent } from "./sprinter";

export type { AgentDefinition } from "./orchestrator";

type AgentFactory = (
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
) => AgentDefinition;

const COUNCIL_TOOL_ALLOWED_AGENTS = new Set(["council"]);

/**
 * Subagents that are read-only at the config/permission layer.
 * These agents use `'*': 'deny'` with an allowlist of safe read-only tools,
 * so that mutating tools (edit, bash, task, etc.) are blocked by OpenCode's
 * permission system — not merely by prompt instructions.
 *
 * Councillor is excluded because its factory already sets `'*': 'deny'` with
 * a per-tool allowlist.
 */
const READ_ONLY_SUBAGENTS = new Set([
  "explorer",
  "oracle",
  "observer",
  "librarian",
  "council",
]);

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Agent Configuration Helpers

/**
 * Apply user-provided overrides to an agent's configuration.
 * Supports overriding model (string or priority array), variant, and temperature.
 * When model is an array, stores it as _modelArray for runtime fallback resolution
 * and clears config.model so OpenCode does not pre-resolve a stale value.
 */
function applyOverrides(
  agent: AgentDefinition,
  override: AgentOverrideConfig,
): void {
  if (override.model) {
    if (Array.isArray(override.model)) {
      agent._modelArray = override.model.map((m) =>
        typeof m === "string" ? { id: m } : m,
      );
      agent.config.model = undefined; // cleared; runtime hook resolves from _modelArray
    } else {
      agent.config.model = override.model;
    }
  }
  if (override.variant) agent.config.variant = override.variant;
  if (override.temperature !== undefined)
    agent.config.temperature = override.temperature;
  if (override.options) {
    agent.config.options = {
      ...agent.config.options,
      ...override.options,
    };
  }
  if (override.displayName) {
    agent.displayName = override.displayName;
  }
}

function isKnownAgentName(name: string): boolean {
  return (ALL_AGENT_NAMES as readonly string[]).includes(name);
}

function normalizeCustomAgentName(name: string): string {
  return name.trim();
}

function isSafeCustomAgentName(name: string): boolean {
  return /^[a-z][a-z0-9_-]*$/i.test(name) && !isKnownAgentName(name);
}

function hasCustomAgentModel(
  override: AgentOverrideConfig | undefined,
): override is AgentOverrideConfig & {
  model: NonNullable<AgentOverrideConfig["model"]>;
} {
  if (!override?.model) {
    return false;
  }

  return !Array.isArray(override.model) || override.model.length > 0;
}

function buildCustomAgentDefinition(
  name: string,
  override: AgentOverrideConfig,
  filePrompt?: string,
  fileAppendPrompt?: string,
): AgentDefinition {
  const basePrompt = override.prompt ?? `You are the ${name} specialist.`;
  const resolvedPrompt = resolvePrompt(
    basePrompt,
    filePrompt,
    fileAppendPrompt,
  );

  return {
    name,
    config: {
      model:
        typeof override.model === "string"
          ? override.model
          : DEFAULT_MODELS.orchestrator ?? DEFAULT_MODELS.oracle,
      temperature: 0.2,
      prompt: `${resolvedPrompt}\n\n${SHARED_SUBAGENT_PROMPT_FRAGMENTS}`,
    },
  } as AgentDefinition;
}

function getLegacyAgentModel(
  config: PluginConfig | undefined,
  legacyName: string,
): string | undefined {
  const override = getAgentOverride(config, legacyName);
  if (!override?.model) return undefined;
  if (Array.isArray(override.model)) {
    const first = override.model[0];
    return typeof first === "string" ? first : first?.id;
  }
  return override.model;
}

function getModelFromAgent(
  config: PluginConfig | undefined,
  agentName: string,
): string | undefined {
  const override = getAgentOverride(config, agentName);
  if (!override?.model) return undefined;
  if (Array.isArray(override.model)) {
    const first = override.model[0];
    return typeof first === "string" ? first : first?.id;
  }
  return override.model;
}

function injectDisplayNames(
  orchestrator: AgentDefinition,
  nameMap: Map<string, string>,
): void {
  if (nameMap.size === 0) return;
  let prompt = orchestrator.config.prompt;
  if (!prompt) return;

  for (const [internalName, displayName] of nameMap) {
    prompt = prompt.replace(
      new RegExp(`@${escapeRegExp(internalName)}\\b`, "g"),
      `@${normalizeDisplayName(displayName)}`,
    );
  }

  orchestrator.config.prompt = prompt;
}

/**
 * Apply default permissions to an agent.
 * Sets 'question' permission to 'allow' and includes skill permission presets.
 * If configuredSkills is provided, it honors that list instead of defaults.
 *
 * Note: If the agent already explicitly sets question to 'deny', that is
 * respected (e.g. councillor should not ask questions).
 */
function applyDefaultPermissions(
  agent: AgentDefinition,
  configuredSkills?: string[],
): void {
  const existing = (agent.config.permission ?? {}) as Record<
    string,
    "ask" | "allow" | "deny" | Record<string, "ask" | "allow" | "deny">
  >;

  // Get skill-specific permissions for this agent
  const skillPermissions = getSkillPermissionsForAgent(
    agent.name,
    configuredSkills,
  );

  // Respect explicit deny on question (councillor)
  const questionPerm = existing.question === "deny" ? "deny" : "allow";
  const councilSessionPerm = COUNCIL_TOOL_ALLOWED_AGENTS.has(agent.name)
    ? existing.council_session ?? "allow"
    : "deny";

  if (READ_ONLY_SUBAGENTS.has(agent.name)) {
    agent.config.permission = {
      "*": "deny",
      question: questionPerm,
      council_session: councilSessionPerm,
      read: "allow",
      glob: "allow",
      grep: "allow",
      ast_grep_search: "allow",
      list: "allow",
      lsp: "allow",
      codesearch: "allow",
      external_directory: "allow",
      // Apply skill permissions as nested object under 'skill' key
      skill: {
        ...(typeof existing.skill === "object" ? existing.skill : {}),
        ...skillPermissions,
      },
    } as SDKAgentConfig["permission"];
    return;
  }

  // Default permission profile for edit-capable agents
  agent.config.permission = {
    ...existing,
    question: questionPerm,
    council_session: councilSessionPerm,
    // Apply skill permissions as nested object under 'skill' key
    skill: {
      ...(typeof existing.skill === "object" ? existing.skill : {}),
      ...skillPermissions,
    },
  } as SDKAgentConfig["permission"];
}

// Agent Classification

export type SubagentName = (typeof SUBAGENT_NAMES)[number];

export function isSubagent(name: string): name is SubagentName {
  return (SUBAGENT_NAMES as readonly string[]).includes(name);
}

// Agent Factories

const SUBAGENT_FACTORIES: Record<SubagentName, AgentFactory> = {
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  oracle: createOracleAgent,
  designer: createDesignerAgent,
  "frontend-developer": createFrontendDeveloperAgent,
  "backend-developer": createBackendDeveloperAgent,
  observer: createObserverAgent,
  council: createCouncilAgent,
  councillor: createCouncillorAgent,
};

// Public API

/**
 * Create all agent definitions with optional configuration overrides.
 * Instantiates the orchestrator and all subagents, applying user config and defaults.
 *
 * @param config - Optional plugin configuration with agent overrides
 * @returns Array of agent definitions (orchestrator first, then subagents)
 */
export function createAgents(config?: PluginConfig): AgentDefinition[] {
  const disabled = getDisabledAgents(config);

  // If frontend-developer or backend-developer has no explicit model config,
  // inherit from librarian's model to avoid breaking existing users who don't
  // have them in config yet. Also falls back to legacy 'fixer' agent config
  // (pre-split era) for backward compatibility.
  const getModelForAgent = (name: SubagentName): string => {
    if (
      (name === "frontend-developer" || name === "backend-developer") &&
      !getAgentOverride(config, name)?.model
    ) {
      // Try legacy fixer config first, then librarian
      const legacyFixerModel = getLegacyAgentModel(config, "fixer");
      if (legacyFixerModel) return legacyFixerModel;
      const librarianModel = getModelFromAgent(config, "librarian");
      return librarianModel ?? (DEFAULT_MODELS.librarian as string);
    }
    // Subagents always have a defined default model; cast is safe here
    return DEFAULT_MODELS[name] as string;
  };

  // 1. Gather all sub-agent definitions with custom prompts
  const protoSubAgents = (
    Object.entries(SUBAGENT_FACTORIES) as [SubagentName, AgentFactory][]
  )
    .filter(([name]) => !disabled.has(name))
    .map(([name, factory]) => {
      const customPrompts = loadAgentPrompt(name, config?.preset);
      return factory(
        getModelForAgent(name),
        customPrompts.prompt,
        customPrompts.appendPrompt,
      );
    });

  // 1b. Discover unknown keys in config.agents as custom subagents.
  const customAgentNames = getCustomAgentNames(config)
    .map(normalizeCustomAgentName)
    .filter((name) => name.length > 0)
    .filter((name) => {
      if (!isSafeCustomAgentName(name)) {
        throw new Error(`Unsafe custom agent name '${name}'`);
      }
      if (disabled.has(name)) {
        return false;
      }
      return true;
    });

  const protoCustomAgents = customAgentNames.flatMap((name) => {
    const override = getAgentOverride(config, name);
    if (!hasCustomAgentModel(override)) {
      console.warn(
        `[oh-my-opencode] Custom agent '${name}' skipped: 'model' is required`,
      );
      return [];
    }

    const customPrompts = loadAgentPrompt(name, config?.preset);

    return [
      buildCustomAgentDefinition(
        name,
        override,
        customPrompts.prompt,
        customPrompts.appendPrompt,
      ),
    ];
  });

  // 2. Apply overrides and default permissions to built-in subagents
  const builtInSubAgents = protoSubAgents.map((agent) => {
    const override = getAgentOverride(config, agent.name);
    if (override) {
      applyOverrides(agent, override);
    }
    applyDefaultPermissions(agent, override?.skills);
    return agent;
  });

  // 2b. Backward compat: if council has no preset override and still uses the
  // hardcoded default model, fall back to the deprecated council.master.model.
  // See https://github.com/keibn29/oh-my-openkei/issues/369
  const legacyMasterModel = config?.council?._legacyMasterModel;
  if (legacyMasterModel) {
    const councilAgent = builtInSubAgents.find((a) => a.name === "council");
    if (
      councilAgent &&
      !getAgentOverride(config, "council")?.model &&
      councilAgent.config.model === DEFAULT_MODELS.council
    ) {
      councilAgent.config.model = legacyMasterModel;
    }
  }

  const customSubAgents = protoCustomAgents.map((agent) => {
    const override = getAgentOverride(config, agent.name);
    if (override) {
      applyOverrides(agent, override);
    }
    applyDefaultPermissions(agent, override?.skills);
    return agent;
  });

  const allSubAgents = [...builtInSubAgents, ...customSubAgents];

  // 3. Create Orchestrator (with its own overrides and custom prompts)
  // DEFAULT_MODELS.orchestrator is undefined; model is resolved via override or
  // left unset so the runtime chat.message hook can pick it from _modelArray.
  const orchestratorOverride = getAgentOverride(config, "orchestrator");
  const orchestratorModel =
    orchestratorOverride?.model ?? DEFAULT_MODELS.orchestrator;
  const orchestratorPrompts = loadAgentPrompt("orchestrator", config?.preset);
  const orchestrator = createOrchestratorAgent(
    orchestratorModel,
    orchestratorPrompts.prompt,
    orchestratorPrompts.appendPrompt,
    disabled,
  );
  applyDefaultPermissions(orchestrator, orchestratorOverride?.skills);
  if (orchestratorOverride) {
    applyOverrides(orchestrator, orchestratorOverride);
  }

  // 3b. Create Planner (with its own overrides and custom prompts)
  // Only create if not disabled - planner is NOT protected like orchestrator
  let planner: ReturnType<typeof createPlannerAgent> | null = null;
  if (!disabled.has("planner")) {
    // DEFAULT_MODELS.planner is undefined; model is resolved via override or
    // left unset so the runtime chat.message hook can pick it from _modelArray.
    const plannerOverride = getAgentOverride(config, "planner");
    const plannerModel = plannerOverride?.model ?? DEFAULT_MODELS.planner;
    const plannerPrompts = loadAgentPrompt("planner", config?.preset);
    planner = createPlannerAgent(
      plannerModel,
      plannerPrompts.prompt,
      plannerPrompts.appendPrompt,
      disabled,
    );
    applyDefaultPermissions(planner, plannerOverride?.skills);
    if (plannerOverride) {
      applyOverrides(planner, plannerOverride);
    }
  }

  // 3c. Create Sprinter (with its own overrides and custom prompts)
  // Self-executing primary agent for fast Q&A and direct task execution.
  // NOT protected — can be disabled via disabled_agents.
  let sprinter: ReturnType<typeof createSprinterAgent> | null = null;
  if (!disabled.has("sprinter")) {
    const sprinterOverride = getAgentOverride(config, "sprinter");
    const sprinterModel = sprinterOverride?.model ?? DEFAULT_MODELS.sprinter;
    const sprinterPrompts = loadAgentPrompt("sprinter", config?.preset);
    sprinter = createSprinterAgent(
      sprinterModel,
      sprinterPrompts.prompt,
      sprinterPrompts.appendPrompt,
      disabled,
    );
    applyDefaultPermissions(sprinter, sprinterOverride?.skills);
    if (sprinterOverride) {
      applyOverrides(sprinter, sprinterOverride);
    }
  }

  // 3d. Create Business Analyst (with its own overrides and custom prompts)
  // Analysis-focused primary agent for market research, requirements
  // elicitation, and strategic planning. NOT protected — can be disabled
  // via disabled_agents.
  let businessAnalyst: ReturnType<typeof createBusinessAnalystAgent> | null =
    null;
  if (!disabled.has("business-analyst")) {
    const businessAnalystOverride = getAgentOverride(
      config,
      "business-analyst",
    );
    const businessAnalystModel =
      businessAnalystOverride?.model ?? DEFAULT_MODELS["business-analyst"];
    const businessAnalystPrompts = loadAgentPrompt(
      "business-analyst",
      config?.preset,
    );
    businessAnalyst = createBusinessAnalystAgent(
      businessAnalystModel,
      businessAnalystPrompts.prompt,
      businessAnalystPrompts.appendPrompt,
      disabled,
    );
    applyDefaultPermissions(businessAnalyst, businessAnalystOverride?.skills);
    if (businessAnalystOverride) {
      applyOverrides(businessAnalyst, businessAnalystOverride);
    }
  }

  // Collect all display names from orchestrator, planner, sprinter, business-analyst, and all subagents
  const displayNameMap = new Map<string, string>();
  if (orchestrator.displayName) {
    displayNameMap.set("orchestrator", orchestrator.displayName);
  }
  if (planner?.displayName) {
    displayNameMap.set("planner", planner.displayName);
  }
  if (sprinter?.displayName) {
    displayNameMap.set("sprinter", sprinter.displayName);
  }
  if (businessAnalyst?.displayName) {
    displayNameMap.set("business-analyst", businessAnalyst.displayName);
  }
  for (const agent of allSubAgents) {
    if (agent.displayName) {
      displayNameMap.set(agent.name, agent.displayName);
    }
  }

  // 3b. Append custom orchestrator hints from custom agent overrides.
  const customOrchestratorPrompts = customSubAgents
    .map((agent) => {
      const override = getAgentOverride(config, agent.name);
      return override?.orchestratorPrompt;
    })
    .filter((prompt): prompt is string => Boolean(prompt));

  // Validate display names
  const usedDisplayNames = new Set<string>();
  for (const [, displayName] of displayNameMap) {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    if (usedDisplayNames.has(normalizedDisplayName)) {
      throw new Error(
        `Duplicate displayName '${normalizedDisplayName}' assigned to multiple agents`,
      );
    }
    usedDisplayNames.add(normalizedDisplayName);
  }
  for (const displayName of usedDisplayNames) {
    if (
      (ALL_AGENT_NAMES as readonly string[]).includes(displayName) ||
      customAgentNames.includes(displayName)
    ) {
      throw new Error(
        `displayName '${displayName}' conflicts with an agent name`,
      );
    }
  }

  // Inject display names into orchestrator, planner, sprinter, and business-analyst prompts (complete map)
  injectDisplayNames(orchestrator, displayNameMap);
  if (planner) {
    injectDisplayNames(planner, displayNameMap);
  }
  if (sprinter) {
    injectDisplayNames(sprinter, displayNameMap);
  }
  if (businessAnalyst) {
    injectDisplayNames(businessAnalyst, displayNameMap);
  }

  if (customOrchestratorPrompts.length > 0) {
    const rewrittenPrompts = customOrchestratorPrompts.map((promptText) => {
      let text = promptText;
      for (const [internalName, displayName] of displayNameMap) {
        text = text.replace(
          new RegExp(`@${escapeRegExp(internalName)}\\b`, "g"),
          `@${normalizeDisplayName(displayName)}`,
        );
      }
      return text;
    });

    orchestrator.config.prompt = `${
      orchestrator.config.prompt
    }\n\n${rewrittenPrompts.join("\n\n")}`;
  }

  return [
    orchestrator,
    ...(planner ? [planner] : []),
    ...(sprinter ? [sprinter] : []),
    ...(businessAnalyst ? [businessAnalyst] : []),
    ...allSubAgents,
  ];
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 * Converts agent definitions to SDK config format and applies classification metadata.
 *
 * @param config - Optional plugin configuration with agent overrides
 * @returns Record mapping agent names to their SDK configurations
 */
export function getAgentConfigs(
  config?: PluginConfig,
): Record<string, SDKAgentConfig> {
  const agents = createAgents(config);

  const applyClassification = (
    name: string,
    sdkConfig: SDKAgentConfig & {
      mcps?: string[];
      displayName?: string;
      hidden?: boolean;
    },
  ): void => {
    if (name === "council") {
      // Council is callable both as a primary agent (user-facing)
      // and as a subagent (orchestrator can delegate to it)
      sdkConfig.mode = "all";
    } else if (name === "councillor") {
      // Internal agent — subagent mode, hidden from @ autocomplete
      sdkConfig.mode = "subagent";
      sdkConfig.hidden = true;
    } else if (isSubagent(name)) {
      sdkConfig.mode = "subagent";
    } else if ((PRIMARY_AGENT_NAMES as readonly string[]).includes(name)) {
      sdkConfig.mode = "primary";
    } else {
      sdkConfig.mode = "subagent";
    }
  };

  const isInternalOnly = (name: string): boolean => name === "councillor";

  const entries: Array<[string, SDKAgentConfig]> = [];

  for (const a of agents) {
    const sdkConfig: SDKAgentConfig & {
      mcps?: string[];
      displayName?: string;
      hidden?: boolean;
    } = {
      ...a.config,
      description: a.description,
      mcps: getAgentMcpList(a.name, config),
    };

    if (a.displayName) {
      sdkConfig.displayName = a.displayName;
    }

    applyClassification(a.name, sdkConfig);

    const normalizedDisplayName = a.displayName
      ? normalizeDisplayName(a.displayName)
      : undefined;

    if (normalizedDisplayName && !isInternalOnly(a.name)) {
      entries.push([normalizedDisplayName, sdkConfig]);
      entries.push([a.name, { ...sdkConfig, hidden: true }]);
      continue;
    }

    entries.push([a.name, sdkConfig]);
  }

  return Object.fromEntries(entries);
}

/**
 * Get the set of disabled agent names from config, applying protection rules.
 */
export function getDisabledAgents(config?: PluginConfig): Set<string> {
  const userDisabled = config?.disabled_agents;
  const disabledSource =
    userDisabled !== undefined ? userDisabled : DEFAULT_DISABLED_AGENTS;
  const disabled = new Set<string>();
  for (const name of disabledSource) {
    if (!PROTECTED_AGENTS.has(name)) {
      disabled.add(name);
    }
  }
  return disabled;
}

/**
 * Get the list of enabled (non-disabled) agent names.
 */
export function getEnabledAgentNames(config?: PluginConfig): string[] {
  const disabled = getDisabledAgents(config);
  const customAgentNames = getCustomAgentNames(config).filter(
    (name) => !disabled.has(name),
  );
  return [
    ...ALL_AGENT_NAMES.filter((name) => !disabled.has(name)),
    ...customAgentNames,
  ];
}
