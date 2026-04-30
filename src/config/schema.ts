import { z } from 'zod';
import { AGENT_ALIASES, ALL_AGENT_NAMES } from './constants';
import { CouncilConfigSchema } from './council-schema';

const FALLBACK_AGENT_NAMES = [
  'orchestrator',
  'planner',
  'business-analyst',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'frontend-developer',
  'backend-developer',
] as const;

const MANUAL_AGENT_NAMES = [
  'orchestrator',
  'planner',
  'business-analyst',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'frontend-developer',
  'backend-developer',
] as const;

export const ProviderModelIdSchema = z
  .string()
  .regex(
    /^[^/\s]+\/[^\s]+$/,
    'Expected provider/model format (provider/.../model)',
  );

export const ManualAgentPlanSchema = z
  .object({
    primary: ProviderModelIdSchema,
    fallback1: ProviderModelIdSchema,
    fallback2: ProviderModelIdSchema,
    fallback3: ProviderModelIdSchema,
  })
  .superRefine((value, ctx) => {
    const unique = new Set([
      value.primary,
      value.fallback1,
      value.fallback2,
      value.fallback3,
    ]);
    if (unique.size !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'primary and fallbacks must be unique per agent',
      });
    }
  });

export const ManualPlanSchema = z
  .object({
    orchestrator: ManualAgentPlanSchema,
    planner: ManualAgentPlanSchema.optional(),
    'business-analyst': ManualAgentPlanSchema.optional(),
    oracle: ManualAgentPlanSchema,
    designer: ManualAgentPlanSchema,
    explorer: ManualAgentPlanSchema,
    librarian: ManualAgentPlanSchema,
    'frontend-developer': ManualAgentPlanSchema.optional(),
    'backend-developer': ManualAgentPlanSchema.optional(),
    // Legacy fixer key — accepted for backward compat, stripped from output
    fixer: ManualAgentPlanSchema.optional(),
  })
  // NOTE: strict() must come before transform so unknown input keys are
  // rejected before the transform strips them. superRefine runs after
  // transform (which is post-transform validation), so it sees the already-
  // transformed output.
  .strict()
  .transform((value) => {
    // Partial migration backfill: if fixer exists, fill in whichever of
    // frontend-developer or backend-developer is missing. If both are missing,
    // fan out to both. Strip fixer from normalized output.
    const hasFrontend = 'frontend-developer' in value;
    const hasBackend = 'backend-developer' in value;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fixer, ...rest } = value as Record<string, unknown>;

    // Start with rest, then apply fixer backfill, then planner backfill.
    // This ensures planner backfill runs even when fixer branches return early.
    let result: Record<string, unknown> = { ...rest };

    if ('fixer' in value && value.fixer) {
      if (!hasFrontend && !hasBackend) {
        // Both missing — fan out to both
        result = {
          ...result,
          'frontend-developer': value.fixer,
          'backend-developer': value.fixer,
        };
      } else if (!hasFrontend) {
        // Only backend present — backfill frontend
        result = { ...result, 'frontend-developer': value.fixer };
      } else if (!hasBackend) {
        // Only frontend present — backfill backend
        result = { ...result, 'backend-developer': value.fixer };
      }
      // If both are present, fixer is simply stripped — no backfill needed
    }

    // Backfill planner from orchestrator for backward compat with legacy
    // configs that don't mention planner. Explicit planner entry wins.
    if (!('planner' in result) || result.planner === undefined) {
      result.planner = value.orchestrator;
    }

    // Backfill business-analyst from planner for backward compat
    if (
      !('business-analyst' in result) ||
      result['business-analyst'] === undefined
    ) {
      result['business-analyst'] = result.planner;
    }

    return result;
  })
  .superRefine((data, ctx) => {
    const required = [
      'orchestrator',
      'planner',
      'business-analyst',
      'oracle',
      'designer',
      'explorer',
      'librarian',
      'frontend-developer',
      'backend-developer',
    ];
    for (const key of required) {
      const value = (data as Record<string, unknown>)[key];
      if (!(key in data) || value === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Required agent plan missing: ${key}`,
          path: [key],
        });
      }
    }
    const known = new Set([...required, 'fixer']);
    for (const key of Object.keys(data as object)) {
      if (!known.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.unrecognized_keys,
          message: `Unrecognized key: ${key}`,
          keys: [key],
          path: [],
        });
      }
    }
  });

export type ManualAgentName = (typeof MANUAL_AGENT_NAMES)[number];
export type ManualAgentPlan = z.infer<typeof ManualAgentPlanSchema>;
export type ManualPlan = z.infer<typeof ManualPlanSchema>;

const AgentModelChainSchema = z.array(z.string()).min(1);

const FallbackChainsSchema = z
  .object({
    orchestrator: AgentModelChainSchema.optional(),
    planner: AgentModelChainSchema.optional(),
    'business-analyst': AgentModelChainSchema.optional(),
    oracle: AgentModelChainSchema.optional(),
    designer: AgentModelChainSchema.optional(),
    explorer: AgentModelChainSchema.optional(),
    librarian: AgentModelChainSchema.optional(),
    'frontend-developer': AgentModelChainSchema.optional(),
    'backend-developer': AgentModelChainSchema.optional(),
  })
  .catchall(AgentModelChainSchema);

export type FallbackAgentName = (typeof FALLBACK_AGENT_NAMES)[number];

// Agent override configuration (distinct from SDK's AgentConfig)
export const AgentOverrideConfigSchema = z
  .object({
    model: z
      .union([
        z.string(),
        z
          .array(
            z.union([
              z.string(),
              z.object({
                id: z.string(),
                variant: z.string().optional(),
              }),
            ]),
          )
          .min(1),
      ])
      .optional(),
    temperature: z.number().min(0).max(2).optional(),
    variant: z.string().optional().catch(undefined),
    skills: z.array(z.string()).optional(), // skills this agent can use ("*" = all, "!item" = exclude)
    mcps: z.array(z.string()).optional(), // MCPs this agent can use ("*" = all, "!item" = exclude)
    prompt: z.string().min(1).optional(),
    orchestratorPrompt: z.string().min(1).optional(),
    options: z.record(z.string(), z.unknown()).optional(), // provider-specific model options (e.g., textVerbosity, thinking budget)
    displayName: z.string().min(1).optional(),
  })
  .strict();

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

/** Normalized model entry with optional per-model variant. */
export type ModelEntry = { id: string; variant?: string };

export const PresetSchema = z.record(z.string(), AgentOverrideConfigSchema);

export type Preset = z.infer<typeof PresetSchema>;

// Websearch provider configuration
export const WebsearchConfigSchema = z.object({
  provider: z.enum(['exa', 'tavily']).default('exa'),
});
export type WebsearchConfig = z.infer<typeof WebsearchConfigSchema>;

// MCP names
export const McpNameSchema = z.enum([
  'websearch',
  'context7',
  'grep_app',
  'figma',
  'serena',
]);
export type McpName = z.infer<typeof McpNameSchema>;

export const SessionManagerConfigSchema = z.object({
  maxSessionsPerAgent: z.number().int().min(1).max(10).default(2),
  readContextMinLines: z.number().int().min(0).max(1000).default(10),
  readContextMaxFiles: z.number().int().min(0).max(50).default(8),
});

export type SessionManagerConfig = z.infer<typeof SessionManagerConfigSchema>;

export const FailoverConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().min(0).default(15000),
  retryDelayMs: z.number().min(0).default(500),
  chains: FallbackChainsSchema.default({}),
  retry_on_empty: z
    .boolean()
    .default(true)
    .describe(
      'When true (default), empty provider responses are treated as failures, ' +
        'triggering fallback/retry. Set to false to treat them as successes.',
    ),
});

export type FailoverConfig = z.infer<typeof FailoverConfigSchema>;

function validateCustomOnlyPromptFields(
  overrides: Record<string, z.infer<typeof AgentOverrideConfigSchema>>,
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number>,
): void {
  for (const [name, override] of Object.entries(overrides)) {
    const isBuiltInOrAlias =
      (ALL_AGENT_NAMES as readonly string[]).includes(name) ||
      AGENT_ALIASES[name] !== undefined;

    if (!isBuiltInOrAlias) {
      continue;
    }

    if (override.prompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, name, 'prompt'],
        message: 'prompt is only supported for custom agents',
      });
    }

    if (override.orchestratorPrompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, name, 'orchestratorPrompt'],
        message: 'orchestratorPrompt is only supported for custom agents',
      });
    }
  }
}

export const PluginConfigSchema = z
  .object({
    preset: z.string().optional(),
    setDefaultAgent: z.boolean().optional(),
    scoringEngineVersion: z.enum(['v1', 'v2-shadow', 'v2']).optional(),
    balanceProviderUsage: z.boolean().optional(),
    showStartupToast: z
      .boolean()
      .optional()
      .describe(
        'Show the startup activation toast when OpenCode starts. Defaults to true.',
      ),
    autoUpdate: z
      .boolean()
      .optional()
      .describe(
        'Disable automatic installation of plugin updates when false. Defaults to true.',
      ),
    manualPlan: ManualPlanSchema.optional(),
    presets: z.record(z.string(), PresetSchema).optional(),
    agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),
    disabled_agents: z
      .array(z.string())
      .optional()
      .describe(
        'Agent names to disable completely. ' +
          'Disabled agents are not instantiated and cannot be delegated to. ' +
          'Orchestrator and council internal agents (councillor) cannot be disabled. ' +
          "By default, 'observer' is disabled. Remove it from this list and configure a vision-capable model to enable.",
      ),
    disabled_mcps: z.array(z.string()).optional(),
    websearch: WebsearchConfigSchema.optional(),
    sessionManager: SessionManagerConfigSchema.optional(),
    fallback: FailoverConfigSchema.optional(),
    council: CouncilConfigSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.agents) {
      validateCustomOnlyPromptFields(value.agents, ctx, ['agents']);
    }

    if (value.presets) {
      for (const [presetName, preset] of Object.entries(value.presets)) {
        validateCustomOnlyPromptFields(preset, ctx, ['presets', presetName]);
      }
    }
  });

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Agent names - re-exported from constants for convenience
export type { AgentName } from './constants';
