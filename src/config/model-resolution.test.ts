import { describe, expect, test } from 'bun:test';
import type { ModelEntry } from '../config/schema';

/**
 * Test the model array resolution logic that runs in the config hook.
 * This logic determines which model to use from an effective model array.
 *
 * The resolver always picks the first model in the effective array,
 * regardless of provider configuration. This is correct because:
 * - Not all providers require entries in opencodeConfig.provider — some are
 *   loaded automatically by opencode (e.g. github-copilot, openrouter).
 * - We cannot distinguish "auto-loaded provider" from "provider not configured"
 *   without calling the API, which isn't available at config-hook time.
 * - Runtime failover (rate-limit handling) is handled separately by
 *   ForegroundFallbackManager.
 */

describe('model array resolution', () => {
  /**
   * Simulates the resolution logic from src/index.ts.
   * Always returns the first model in the array.
   */
  function resolveModelFromArray(
    modelArray: Array<{ id: string; variant?: string }>,
  ): { model: string; variant?: string } | null {
    if (!modelArray || modelArray.length === 0) return null;

    const chosen = modelArray[0];
    return {
      model: chosen.id,
      variant: chosen.variant,
    };
  }

  test('uses first model when no provider config exists', () => {
    const modelArray: ModelEntry[] = [
      { id: 'opencode/big-pickle', variant: 'high' },
      { id: 'iflowcn/qwen3-235b-a22b-thinking-2507', variant: 'high' },
    ];

    const result = resolveModelFromArray(modelArray);

    expect(result?.model).toBe('opencode/big-pickle');
    expect(result?.variant).toBe('high');
  });

  test('uses first model even when other providers are configured', () => {
    const modelArray: ModelEntry[] = [
      { id: 'github-copilot/claude-opus-4.6', variant: 'high' },
      { id: 'zai-coding-plan/glm-5' },
    ];

    const result = resolveModelFromArray(modelArray);

    // Auto-loaded provider should not be skipped in favor of configured one
    expect(result?.model).toBe('github-copilot/claude-opus-4.6');
    expect(result?.variant).toBe('high');
  });

  test('returns null for empty model array', () => {
    const modelArray: ModelEntry[] = [];

    const result = resolveModelFromArray(modelArray);

    expect(result).toBeNull();
  });
});

/**
 * Tests for the fallback.chains merging logic that runs in the config hook.
 * Mirrors the effectiveArrays construction in src/index.ts.
 */
describe('fallback.chains merging for foreground agents', () => {
  /**
   * Simulates the effectiveArrays construction + resolution from src/index.ts.
   * Returns the resolved model string or null.
   */
  function resolveWithChains(opts: {
    modelArray?: Array<{ id: string; variant?: string }>;
    currentModel?: string;
    chainModels?: string[];
    fallbackEnabled?: boolean;
  }): string | null {
    const {
      modelArray,
      currentModel,
      chainModels,
      fallbackEnabled = true,
    } = opts;

    // Build effectiveArrays (mirrors index.ts logic)
    const effectiveArray: Array<{ id: string; variant?: string }> = modelArray
      ? [...modelArray]
      : [];

    if (fallbackEnabled && chainModels && chainModels.length > 0) {
      if (effectiveArray.length === 0 && currentModel) {
        effectiveArray.push({ id: currentModel });
      }
      const seen = new Set(effectiveArray.map((m) => m.id));
      for (const chainModel of chainModels) {
        if (!seen.has(chainModel)) {
          seen.add(chainModel);
          effectiveArray.push({ id: chainModel });
        }
      }
    }

    if (effectiveArray.length === 0) return null;

    // Resolution: always use first model in effective array
    return effectiveArray[0].id;
  }

  test('primary model wins regardless of provider config', () => {
    const result = resolveWithChains({
      currentModel: 'anthropic/claude-opus-4-5',
      chainModels: ['openai/gpt-4o'],
    });
    expect(result).toBe('anthropic/claude-opus-4-5');
  });

  test('chain is ignored when fallback disabled', () => {
    const result = resolveWithChains({
      currentModel: 'anthropic/claude-opus-4-5',
      chainModels: ['openai/gpt-4o'],
      fallbackEnabled: false,
    });
    // chain not applied; no effectiveArray entry → falls through to null (no _modelArray either)
    expect(result).toBeNull();
  });

  test('_modelArray entries take precedence and chain appends after', () => {
    const result = resolveWithChains({
      modelArray: [
        { id: 'anthropic/claude-opus-4-5' },
        { id: 'anthropic/claude-sonnet-4-5' },
      ],
      chainModels: ['openai/gpt-4o'],
    });
    // First entry in _modelArray wins; chain only used for runtime failover
    expect(result).toBe('anthropic/claude-opus-4-5');
  });

  test('duplicate model ids across array and chain are deduplicated', () => {
    const result = resolveWithChains({
      modelArray: [
        { id: 'anthropic/claude-opus-4-5' },
        { id: 'openai/gpt-4o' },
      ],
      chainModels: ['openai/gpt-4o', 'google/gemini-pro'],
    });
    expect(result).toBe('anthropic/claude-opus-4-5');
  });

  test('no currentModel and no _modelArray with chain still resolves', () => {
    const result = resolveWithChains({
      chainModels: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-5'],
    });
    expect(result).toBe('openai/gpt-4o');
  });

  test('built-in provider not skipped when other providers are configured', () => {
    // Regression test: github-copilot is auto-loaded by opencode and doesn't
    // need an entry in opencodeConfig.provider. The resolver must not skip
    // it in favor of a configured provider later in the chain.
    const result = resolveWithChains({
      currentModel: 'github-copilot/claude-opus-4.6',
      chainModels: [
        'github-copilot/gemini-3.1-pro-preview',
        'zai-coding-plan/glm-5',
      ],
    });
    expect(result).toBe('github-copilot/claude-opus-4.6');
  });
});

describe('fallback.chains fixer backward compatibility', () => {
  /**
   * Simulates the runtime chain construction from src/index.ts including
   * the legacy fixer chain mapping.
   */
  function buildRuntimeChains(opts: {
    modelArrayMap?: Record<string, Array<{ id: string; variant?: string }>>;
    fallbackChains?: Record<string, string[] | undefined>;
    fallbackEnabled?: boolean;
  }): Record<string, string[]> {
    const {
      modelArrayMap = {},
      fallbackChains = {},
      fallbackEnabled = true,
    } = opts;

    const runtimeChains: Record<string, string[]> = {};

    // Seed from _modelArray entries
    for (const [name, models] of Object.entries(modelArrayMap)) {
      if (models.length > 0) {
        runtimeChains[name] = models.map((m) => m.id);
      }
    }

    if (fallbackEnabled) {
      // Backward compat: map legacy 'fixer' chain to 'frontend-developer'
      // and 'backend-developer' when no explicit chains exist for either.
      const legacyFixerChain = fallbackChains.fixer;
      if (legacyFixerChain) {
        if (
          !('frontend-developer' in fallbackChains) ||
          (fallbackChains['frontend-developer']?.length ?? 0) === 0
        ) {
          fallbackChains['frontend-developer'] = legacyFixerChain;
        }
        if (
          !('backend-developer' in fallbackChains) ||
          (fallbackChains['backend-developer']?.length ?? 0) === 0
        ) {
          fallbackChains['backend-developer'] = legacyFixerChain;
        }
      }

      for (const [agentName, chainModels] of Object.entries(fallbackChains)) {
        if (!chainModels?.length) continue;
        const existing = runtimeChains[agentName] ?? [];
        const seen = new Set(existing);
        for (const m of chainModels) {
          if (!seen.has(m)) {
            seen.add(m);
            existing.push(m);
          }
        }
        runtimeChains[agentName] = existing;
      }
    }

    return runtimeChains;
  }

  test('legacy fixer chain maps to both agents when no explicit chains', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model', 'fixer/legacy-fallback'],
      },
    });
    // Full fixer chain is mapped to both agents
    expect(chains['frontend-developer']).toEqual([
      'fixer/legacy-model',
      'fixer/legacy-fallback',
    ]);
    expect(chains['backend-developer']).toEqual([
      'fixer/legacy-model',
      'fixer/legacy-fallback',
    ]);
  });

  test('explicit frontend-developer chain wins over legacy fixer', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'frontend-developer': ['explicit/frontend-model'],
      },
    });
    expect(chains['frontend-developer']).toEqual(['explicit/frontend-model']);
    expect(chains['backend-developer']).toEqual(['fixer/legacy-model']);
  });

  test('explicit backend-developer chain wins over legacy fixer', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'backend-developer': ['explicit/backend-model'],
      },
    });
    expect(chains['frontend-developer']).toEqual(['fixer/legacy-model']);
    expect(chains['backend-developer']).toEqual(['explicit/backend-model']);
  });

  test('both explicit chains override legacy fixer completely', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'frontend-developer': ['explicit/frontend-model'],
        'backend-developer': ['explicit/backend-model'],
      },
    });
    expect(chains['frontend-developer']).toEqual(['explicit/frontend-model']);
    expect(chains['backend-developer']).toEqual(['explicit/backend-model']);
  });

  test('fixer chain is ignored when fallback is disabled', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
      fallbackEnabled: false,
    });
    // No frontend/backend chains since fallback is disabled and no model arrays
    expect(chains['frontend-developer']).toBeUndefined();
    expect(chains['backend-developer']).toBeUndefined();
  });

  test('runtime chains are deduplicated when fixer and explicit share models', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['shared/model-a', 'shared/model-b'],
        'frontend-developer': ['shared/model-a', 'explicit/frontend'],
      },
    });
    // First occurrence wins; duplicate not added
    expect(chains['frontend-developer']).toEqual([
      'shared/model-a',
      'explicit/frontend',
    ]);
  });

  test('existing runtime chain is preserved when fixer chain added', () => {
    const chains = buildRuntimeChains({
      modelArrayMap: {
        'frontend-developer': [{ id: 'primary/frontend-model' }],
        'backend-developer': [{ id: 'primary/backend-model' }],
      },
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
    });
    // existing _modelArray entries preserved; fixer appended after
    expect(chains['frontend-developer']).toEqual([
      'primary/frontend-model',
      'fixer/legacy-model',
    ]);
    expect(chains['backend-developer']).toEqual([
      'primary/backend-model',
      'fixer/legacy-model',
    ]);
  });
});

describe('effectiveArrays fixer backward compatibility', () => {
  /**
   * Simulates the effectiveArrays construction from src/index.ts config hook
   * including the legacy fixer chain mapping for startup model resolution.
   */
  function buildEffectiveArrays(opts: {
    modelArrayMap?: Record<string, Array<{ id: string; variant?: string }>>;
    currentModels?: Record<string, string>;
    fallbackChains?: Record<string, string[] | undefined>;
    fallbackEnabled?: boolean;
  }): Record<string, Array<{ id: string; variant?: string }>> {
    const {
      modelArrayMap = {},
      currentModels = {},
      fallbackChains = {},
      fallbackEnabled = true,
    } = opts;

    const effectiveArrays: Record<
      string,
      Array<{ id: string; variant?: string }>
    > = {};

    for (const [agentName, models] of Object.entries(modelArrayMap)) {
      effectiveArrays[agentName] = [...models];
    }

    if (!fallbackEnabled) return effectiveArrays;

    // Apply legacy fixer compat to a working copy of fallbackChains
    const chains = { ...fallbackChains };
    const legacyFixerChain = chains.fixer;
    if (legacyFixerChain) {
      if (
        !('frontend-developer' in chains) ||
        (chains['frontend-developer']?.length ?? 0) === 0
      ) {
        chains['frontend-developer'] = legacyFixerChain;
      }
      if (
        !('backend-developer' in chains) ||
        (chains['backend-developer']?.length ?? 0) === 0
      ) {
        chains['backend-developer'] = legacyFixerChain;
      }
    }

    for (const [agentName, chainModels] of Object.entries(chains)) {
      if (!chainModels || chainModels.length === 0) continue;

      if (!effectiveArrays[agentName]) {
        const currentModel = currentModels[agentName];
        effectiveArrays[agentName] = currentModel ? [{ id: currentModel }] : [];
      }

      const seen = new Set(effectiveArrays[agentName].map((m) => m.id));
      for (const chainModel of chainModels) {
        if (!seen.has(chainModel)) {
          seen.add(chainModel);
          effectiveArrays[agentName].push({ id: chainModel });
        }
      }
    }

    return effectiveArrays;
  }

  test('legacy fixer chain maps to both agents in effectiveArrays when no explicit chains', () => {
    const arrays = buildEffectiveArrays({
      fallbackChains: {
        fixer: ['fixer/legacy-model', 'fixer/legacy-fallback'],
      },
    });
    expect(arrays['frontend-developer']).toEqual([
      { id: 'fixer/legacy-model' },
      { id: 'fixer/legacy-fallback' },
    ]);
    expect(arrays['backend-developer']).toEqual([
      { id: 'fixer/legacy-model' },
      { id: 'fixer/legacy-fallback' },
    ]);
  });

  test('explicit frontend-developer chain wins over legacy fixer in effectiveArrays', () => {
    const arrays = buildEffectiveArrays({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'frontend-developer': ['explicit/frontend-model'],
      },
    });
    expect(arrays['frontend-developer']).toEqual([
      { id: 'explicit/frontend-model' },
    ]);
    expect(arrays['backend-developer']).toEqual([{ id: 'fixer/legacy-model' }]);
  });

  test('explicit backend-developer chain wins over legacy fixer in effectiveArrays', () => {
    const arrays = buildEffectiveArrays({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'backend-developer': ['explicit/backend-model'],
      },
    });
    expect(arrays['frontend-developer']).toEqual([
      { id: 'fixer/legacy-model' },
    ]);
    expect(arrays['backend-developer']).toEqual([
      { id: 'explicit/backend-model' },
    ]);
  });

  test('both explicit chains override legacy fixer in effectiveArrays', () => {
    const arrays = buildEffectiveArrays({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'frontend-developer': ['explicit/frontend-model'],
        'backend-developer': ['explicit/backend-model'],
      },
    });
    expect(arrays['frontend-developer']).toEqual([
      { id: 'explicit/frontend-model' },
    ]);
    expect(arrays['backend-developer']).toEqual([
      { id: 'explicit/backend-model' },
    ]);
  });

  test('modelArray seeds are preserved in effectiveArrays with fixer fallback', () => {
    const arrays = buildEffectiveArrays({
      modelArrayMap: {
        'frontend-developer': [{ id: 'primary/frontend-model' }],
        'backend-developer': [{ id: 'primary/backend-model' }],
      },
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
    });
    // _modelArray seeds first; fixer chain appended after
    expect(arrays['frontend-developer']).toEqual([
      { id: 'primary/frontend-model' },
      { id: 'fixer/legacy-model' },
    ]);
    expect(arrays['backend-developer']).toEqual([
      { id: 'primary/backend-model' },
      { id: 'fixer/legacy-model' },
    ]);
  });

  test('first model in effectiveArrays is used for startup resolution', () => {
    const arrays = buildEffectiveArrays({
      fallbackChains: {
        fixer: ['fixer/first-choice', 'fixer/second-choice'],
      },
    });
    const chosen = arrays['frontend-developer']?.[0];
    expect(chosen?.id).toBe('fixer/first-choice');
  });

  test('fixer chain in effectiveArrays is ignored when fallback disabled', () => {
    const arrays = buildEffectiveArrays({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
      fallbackEnabled: false,
    });
    expect(arrays['frontend-developer']).toBeUndefined();
    expect(arrays['backend-developer']).toBeUndefined();
  });
});

describe('no phantom agent.fixer entry', () => {
  /**
   * Verifies that the runtime chain construction never produces a phantom
   * 'agent.fixer' entry — fixer is only used for backward compat mapping.
   */
  function buildRuntimeChains(opts: {
    fallbackChains?: Record<string, string[] | undefined>;
  }): Record<string, string[]> {
    const { fallbackChains = {} } = opts;

    const runtimeChains: Record<string, string[]> = {};

    const chains = { ...fallbackChains };
    const legacyFixerChain = chains.fixer;
    if (legacyFixerChain) {
      if (
        !('frontend-developer' in chains) ||
        (chains['frontend-developer']?.length ?? 0) === 0
      ) {
        chains['frontend-developer'] = legacyFixerChain;
      }
      if (
        !('backend-developer' in chains) ||
        (chains['backend-developer']?.length ?? 0) === 0
      ) {
        chains['backend-developer'] = legacyFixerChain;
      }
    }

    for (const [agentName, chainModels] of Object.entries(chains)) {
      if (!chainModels?.length) continue;
      // Skip legacy fixer — it was already used for backward-compat mapping
      if (agentName === 'fixer') continue;
      const existing = runtimeChains[agentName] ?? [];
      const seen = new Set(existing);
      for (const m of chainModels) {
        if (!seen.has(m)) {
          seen.add(m);
          existing.push(m);
        }
      }
      runtimeChains[agentName] = existing;
    }

    return runtimeChains;
  }

  test('runtime chains never contain a fixer key', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
    });
    expect(chains).not.toHaveProperty('fixer');
  });

  test('explicit fixer chain maps to frontend/backend without phantom entry', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
    });
    // fixer itself should not appear as a runtime chain key
    expect(Object.keys(chains)).not.toContain('fixer');
    expect(chains['frontend-developer']).toEqual(['fixer/legacy-model']);
    expect(chains['backend-developer']).toEqual(['fixer/legacy-model']);
  });

  test('empty fixer chain does not create phantom entries', () => {
    const chains = buildRuntimeChains({
      fallbackChains: {
        fixer: [],
      },
    });
    expect(chains['frontend-developer']).toBeUndefined();
    expect(chains['backend-developer']).toBeUndefined();
    expect(Object.keys(chains)).not.toContain('fixer');
  });

  test('phantom agent.fixer entry is never created in config-hook path', () => {
    /**
     * Simulates the full config-hook effectiveArrays construction +
     * model resolution + configAgent assignment from src/index.ts.
     * This test would fail if 'fixer' leaked into effectiveArrays or
     * configAgent after the legacy compat mapping.
     */
    function simulateConfigHook(opts: {
      modelArrayMap?: Record<string, Array<{ id: string; variant?: string }>>;
      configAgent?: Record<string, unknown>;
      fallbackChains?: Record<string, string[] | undefined>;
      fallbackEnabled?: boolean;
    }): Record<string, unknown> {
      const {
        modelArrayMap = {},
        configAgent = {},
        fallbackChains = {},
        fallbackEnabled = true,
      } = opts;

      const effectiveArrays: Record<
        string,
        Array<{ id: string; variant?: string }>
      > = {};

      for (const [agentName, models] of Object.entries(modelArrayMap)) {
        effectiveArrays[agentName] = [...models];
      }

      if (!fallbackEnabled) return effectiveArrays;

      // Build a working copy so we don't mutate the caller's object
      const chains = { ...fallbackChains };

      // Backward compat: map legacy 'fixer' to frontend-developer / backend-developer
      const legacyFixerChain = chains.fixer;
      if (legacyFixerChain) {
        if (
          !('frontend-developer' in chains) ||
          (chains['frontend-developer']?.length ?? 0) === 0
        ) {
          chains['frontend-developer'] = legacyFixerChain;
        }
        if (
          !('backend-developer' in chains) ||
          (chains['backend-developer']?.length ?? 0) === 0
        ) {
          chains['backend-developer'] = legacyFixerChain;
        }
      }

      for (const [agentName, chainModels] of Object.entries(chains)) {
        if (!chainModels || chainModels.length === 0) continue;
        // Skip legacy fixer — compat mapping already done above
        if (agentName === 'fixer') continue;

        if (!effectiveArrays[agentName]) {
          const entry = configAgent[agentName] as
            | Record<string, unknown>
            | undefined;
          const currentModel =
            typeof entry?.model === 'string' ? entry.model : undefined;
          effectiveArrays[agentName] = currentModel
            ? [{ id: currentModel }]
            : [];
        }

        const seen = new Set(effectiveArrays[agentName].map((m) => m.id));
        for (const chainModel of chainModels) {
          if (!seen.has(chainModel)) {
            seen.add(chainModel);
            effectiveArrays[agentName].push({ id: chainModel });
          }
        }
      }

      // Apply resolved models back to configAgent (mimics config hook behavior)
      for (const [agentName, modelArray] of Object.entries(effectiveArrays)) {
        if (modelArray.length === 0) continue;
        const chosen = modelArray[0];
        const entry = configAgent[agentName] as
          | Record<string, unknown>
          | undefined;
        if (entry) {
          entry.model = chosen.id;
          if (chosen.variant) entry.variant = chosen.variant;
        } else {
          (configAgent as Record<string, unknown>)[agentName] = {
            model: chosen.id,
            ...(chosen.variant ? { variant: chosen.variant } : {}),
          };
        }
      }

      return configAgent;
    }

    // Case 1: legacy fixer only — no phantom fixer entry should appear
    const agent1: Record<string, unknown> = {};
    simulateConfigHook({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
      },
      configAgent: agent1,
    });
    expect(Object.keys(agent1)).not.toContain('fixer');
    expect(agent1['frontend-developer']).toEqual({
      model: 'fixer/legacy-model',
    });
    expect(agent1['backend-developer']).toEqual({
      model: 'fixer/legacy-model',
    });

    // Case 2: explicit frontend-developer wins over legacy fixer
    const agent2: Record<string, unknown> = {};
    simulateConfigHook({
      fallbackChains: {
        fixer: ['fixer/legacy-model'],
        'frontend-developer': ['explicit/frontend-model'],
      },
      configAgent: agent2,
    });
    expect(Object.keys(agent2)).not.toContain('fixer');
    expect(agent2['frontend-developer']).toEqual({
      model: 'explicit/frontend-model',
    });
    expect(agent2['backend-developer']).toEqual({
      model: 'fixer/legacy-model',
    });

    // Case 3: empty fixer chain — no entries created
    const agent3: Record<string, unknown> = {};
    simulateConfigHook({
      fallbackChains: {
        fixer: [],
      },
      configAgent: agent3,
    });
    expect(Object.keys(agent3)).not.toContain('fixer');
    expect(agent3['frontend-developer']).toBeUndefined();
    expect(agent3['backend-developer']).toBeUndefined();
  });
});
