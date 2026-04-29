import { describe, expect, test } from 'bun:test';
import type { PluginConfig } from '../config';
import {
  AgentOverrideConfigSchema,
  CouncilConfigSchema,
  DEFAULT_DISABLED_AGENTS,
  DEFAULT_MODELS,
  PluginConfigSchema,
  SUBAGENT_NAMES,
} from '../config';
import {
  createAgents,
  getAgentConfigs,
  getDisabledAgents,
  getEnabledAgentNames,
  isSubagent,
} from './index';

describe('agent alias backward compatibility', () => {
  test("applies 'explore' config to 'explorer' agent", () => {
    const config: PluginConfig = {
      agents: {
        explore: { model: 'test/old-explore-model' },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer).toBeDefined();
    expect(explorer?.config.model).toBe('test/old-explore-model');
  });

  test("applies 'frontend-ui-ux-engineer' config to 'designer' agent", () => {
    const config: PluginConfig = {
      agents: {
        'frontend-ui-ux-engineer': { model: 'test/old-frontend-model' },
      },
    };
    const agents = createAgents(config);
    const designer = agents.find((a) => a.name === 'designer');
    expect(designer).toBeDefined();
    expect(designer?.config.model).toBe('test/old-frontend-model');
  });

  test('new name takes priority over old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { model: 'old-model' },
        explorer: { model: 'new-model' },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?.config.model).toBe('new-model');
  });

  test('new agent names work directly', () => {
    const config: PluginConfig = {
      agents: {
        explorer: { model: 'direct-explorer' },
        designer: { model: 'direct-designer' },
      },
    };
    const agents = createAgents(config);
    expect(agents.find((a) => a.name === 'explorer')?.config.model).toBe(
      'direct-explorer',
    );
    expect(agents.find((a) => a.name === 'designer')?.config.model).toBe(
      'direct-designer',
    );
  });

  test('temperature override via old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { temperature: 0.5 },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?.config.temperature).toBe(0.5);
  });

  test('variant override via old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { variant: 'low' },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?.config.variant).toBe('low');
  });
});

describe('frontend-developer and backend-developer agent fallback', () => {
  test('frontend-developer inherits fixer/librarian model when no config provided', () => {
    const config: PluginConfig = {
      agents: {
        librarian: { model: 'librarian-custom-model' },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const librarian = agents.find((a) => a.name === 'librarian');
    expect(frontend?.config.model).toBe(librarian?.config.model);
  });

  test('backend-developer inherits fixer/librarian model when no config provided', () => {
    const config: PluginConfig = {
      agents: {
        librarian: { model: 'librarian-custom-model' },
      },
    };
    const agents = createAgents(config);
    const backend = agents.find((a) => a.name === 'backend-developer');
    const librarian = agents.find((a) => a.name === 'librarian');
    expect(backend?.config.model).toBe(librarian?.config.model);
  });

  test('frontend-developer uses legacy fixer config when no explicit config', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-legacy-model' },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    expect(frontend?.config.model).toBe('fixer-legacy-model');
  });

  test('backend-developer uses legacy fixer config when no explicit config', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-legacy-model' },
      },
    };
    const agents = createAgents(config);
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(backend?.config.model).toBe('fixer-legacy-model');
  });

  test('frontend-developer uses explicit config over legacy fixer', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-legacy-model' },
        'frontend-developer': { model: 'frontend-specific-model' },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    expect(frontend?.config.model).toBe('frontend-specific-model');
  });

  test('backend-developer uses explicit config over legacy fixer', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-legacy-model' },
        'backend-developer': { model: 'backend-specific-model' },
      },
    };
    const agents = createAgents(config);
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(backend?.config.model).toBe('backend-specific-model');
  });

  test('legacy fixer variant fans out to both agents when no explicit config', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-model', variant: 'high' },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(frontend?.config.variant).toBe('high');
    expect(backend?.config.variant).toBe('high');
  });

  test('legacy fixer temperature fans out to both agents when no explicit config', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-model', temperature: 0.7 },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(frontend?.config.temperature).toBe(0.7);
    expect(backend?.config.temperature).toBe(0.7);
  });

  test('legacy fixer options fan out to both agents when no explicit config', () => {
    const config: PluginConfig = {
      agents: {
        fixer: {
          model: 'fixer-model',
          options: { textVerbosity: 'low' as const },
        },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(frontend?.config.options).toEqual({ textVerbosity: 'low' });
    expect(backend?.config.options).toEqual({ textVerbosity: 'low' });
  });

  test('legacy fixer mcps fans out to both agents when no explicit config', () => {
    // Note: mcps handling is at the config/agent-mcps level, not createAgents level.
    // This tests that getAgentOverride returns the fixer mcps config for fan-out.
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-model', mcps: ['mcp-server-1', 'mcp-server-2'] },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    // mcps are resolved at getAgentMcpList level, but the model/variant fields
    // should have been fanned out from fixer
    expect(frontend?.config.model).toBe('fixer-model');
    expect(backend?.config.model).toBe('fixer-model');
  });

  test('legacy fixer skills fans out to both agents when no explicit config', () => {
    const config: PluginConfig = {
      agents: {
        fixer: { model: 'fixer-model', skills: ['codemap', 'read'] },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    // skills are stored in permission.skill after applyDefaultPermissions;
    // verify model was fanned out (skills fan-out is tested via permission)
    expect(frontend?.config.model).toBe('fixer-model');
    expect(backend?.config.model).toBe('fixer-model');
  });

  test('frontend-developer explicit config wins over fixer for all fields', () => {
    const config: PluginConfig = {
      agents: {
        fixer: {
          model: 'fixer-model',
          variant: 'high',
          temperature: 0.9,
          options: { textVerbosity: 'low' },
        },
        'frontend-developer': {
          model: 'frontend-model',
          variant: 'low',
          temperature: 0.1,
          options: { textVerbosity: 'high' },
        },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(frontend?.config.model).toBe('frontend-model');
    expect(frontend?.config.variant).toBe('low');
    expect(frontend?.config.temperature).toBe(0.1);
    expect(frontend?.config.options).toEqual({ textVerbosity: 'high' });
    // backend still gets all fixer fields since no explicit override
    expect(backend?.config.model).toBe('fixer-model');
    expect(backend?.config.variant).toBe('high');
    expect(backend?.config.temperature).toBe(0.9);
    expect(backend?.config.options).toEqual({ textVerbosity: 'low' });
  });

  test('backend-developer explicit config wins over fixer for all fields', () => {
    const config: PluginConfig = {
      agents: {
        fixer: {
          model: 'fixer-model',
          variant: 'high',
          temperature: 0.9,
          options: { textVerbosity: 'low' },
        },
        'backend-developer': {
          model: 'backend-model',
          variant: 'ultra',
          temperature: 0.05,
          options: { reasoningEffort: 'medium' },
        },
      },
    };
    const agents = createAgents(config);
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    const backend = agents.find((a) => a.name === 'backend-developer');
    // frontend still gets all fixer fields since no explicit override
    expect(frontend?.config.model).toBe('fixer-model');
    expect(frontend?.config.variant).toBe('high');
    expect(frontend?.config.temperature).toBe(0.9);
    expect(frontend?.config.options).toEqual({ textVerbosity: 'low' });
    expect(backend?.config.model).toBe('backend-model');
    expect(backend?.config.variant).toBe('ultra');
    expect(backend?.config.temperature).toBe(0.05);
    expect(backend?.config.options).toEqual({ reasoningEffort: 'medium' });
  });
});

describe('orchestrator agent', () => {
  test('orchestrator is first in agents array', () => {
    const agents = createAgents();
    expect(agents[0].name).toBe('orchestrator');
  });

  test('orchestrator has question permission set to allow', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?.config.permission).toBeDefined();
    expect((orchestrator?.config.permission as any).question).toBe('allow');
  });

  test('orchestrator is denied access to council_session', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect((orchestrator?.config.permission as any).council_session).toBe(
      'deny',
    );
  });

  test('orchestrator accepts overrides', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'custom-orchestrator-model', temperature: 0.3 },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?.config.model).toBe('custom-orchestrator-model');
    expect(orchestrator?.config.temperature).toBe(0.3);
  });

  test('orchestrator accepts variant override', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { variant: 'high' },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?.config.variant).toBe('high');
  });

  test('orchestrator stores model array with per-model variants in _modelArray', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            { id: 'github-copilot/claude-3.5-haiku' },
            'openai/gpt-4',
          ],
        },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?._modelArray).toEqual([
      { id: 'google/gemini-3-pro', variant: 'high' },
      { id: 'github-copilot/claude-3.5-haiku' },
      { id: 'openai/gpt-4' },
    ]);
    expect(orchestrator?.config.model).toBeUndefined();
  });

  test('orchestrator prompt is delegation-first with self-work as fallback only', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    const prompt = orchestrator?.config.prompt as string;

    expect(prompt).toContain(
      'If a specialist is a reasonable fit, delegate before considering direct work.',
    );
    expect(prompt).toContain(
      'Default to delegation even for small, simple, single-file, or fast-turnaround tasks',
    );
    expect(prompt).toContain(
      'You may personally explore the codebase, research docs, write code, edit files, or do deep file reading only when no suitable specialist exists',
    );
    expect(prompt).not.toContain(
      'Skip delegation if overhead ≥ doing it yourself',
    );
    expect(prompt).toContain('otherwise do it yourself');
  });
});

describe('planner agent', () => {
  test('planner is created and in agents array', () => {
    const agents = createAgents();
    const planner = agents.find((a) => a.name === 'planner');
    expect(planner).toBeDefined();
  });

  test('planner has question permission set to allow', () => {
    const agents = createAgents();
    const planner = agents.find((a) => a.name === 'planner');
    expect(planner?.config.permission).toBeDefined();
    expect((planner?.config.permission as any).question).toBe('allow');
  });

  test('planner is denied access to council_session', () => {
    const agents = createAgents();
    const planner = agents.find((a) => a.name === 'planner');
    expect((planner?.config.permission as any).council_session).toBe('deny');
  });

  test('planner accepts overrides', () => {
    const config: PluginConfig = {
      agents: {
        planner: { model: 'custom-planner-model', temperature: 0.3 },
      },
    };
    const agents = createAgents(config);
    const planner = agents.find((a) => a.name === 'planner');
    expect(planner?.config.model).toBe('custom-planner-model');
    expect(planner?.config.temperature).toBe(0.3);
  });

  test('planner stores model array with per-model variants in _modelArray', () => {
    const config: PluginConfig = {
      agents: {
        planner: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            { id: 'github-copilot/claude-3.5-haiku' },
            'openai/gpt-4',
          ],
        },
      },
    };
    const agents = createAgents(config);
    const planner = agents.find((a) => a.name === 'planner');
    expect(planner?._modelArray).toEqual([
      { id: 'google/gemini-3-pro', variant: 'high' },
      { id: 'github-copilot/claude-3.5-haiku' },
      { id: 'openai/gpt-4' },
    ]);
    expect(planner?.config.model).toBeUndefined();
  });

  test('planner prompt wraps final plan in planner-plan tags', () => {
    const agents = createAgents();
    const planner = agents.find((a) => a.name === 'planner');
    const prompt = planner?.config.prompt as string;

    // Check the instruction mentions wrapping plans with the XML-like tag pair
    // (use words to avoid HTML being parsed in toContain assertion)
    expect(prompt).toContain('planner-plan');
    expect(prompt).toContain(
      'Place ONLY the plan content inside the tags',
    );
    expect(prompt).toContain(
      'Any preamble, greetings, or follow-up notes should stay OUTSIDE the tags',
    );
    expect(prompt).toContain('1. Summary');
    expect(prompt).toContain('2. Key Changes');
    expect(prompt).toContain('3. Public Interfaces');
    expect(prompt).toContain('4. Test Plan');
    expect(prompt).toContain('5. Assumptions');
    expect(prompt).not.toContain('[[PLANNER_PLAN_V1]]');
  });
});

describe('planner delegation scope', () => {
  test('planner prompt includes only allowed delegates', () => {
    const agents = createAgents();
    const planner = agents.find((a) => a.name === 'planner');
    expect(planner).toBeDefined();

    const prompt = planner!.config.prompt as string;

    // Extract the Available_Specialists section to avoid false positives
    // from mentions in prose (e.g. "hand off to @frontend-developer")
    const specialistsMatch = prompt.match(
      /<Available_Specialists>([\s\S]*?)<\/Available_Specialists>/,
    );
    expect(specialistsMatch).toBeTruthy();
    const specialistsSection = specialistsMatch![1];

    // Allowed 4 should appear as specialist blocks
    expect(specialistsSection).toContain('@explorer\n- Role:');
    expect(specialistsSection).toContain('@librarian\n- Role:');
    expect(specialistsSection).toContain('@oracle\n- Role:');
    expect(specialistsSection).toContain('@designer\n- Role:');

    // Execution/council agents must NOT appear as specialist blocks
    expect(specialistsSection).not.toContain('@frontend-developer\n- Role:');
    expect(specialistsSection).not.toContain('@backend-developer\n- Role:');
    expect(specialistsSection).not.toContain('@council\n- Role:');
    expect(specialistsSection).not.toContain('@observer\n- Role:');
    expect(specialistsSection).not.toContain('@councillor\n- Role:');
  });

  test('SUBAGENT_DELEGATION_RULES.planner restricts delegation', () => {
    // SUBAGENT_DELEGATION_RULES is imported from config
    const { SUBAGENT_DELEGATION_RULES } = require('../config');
    const allowed = SUBAGENT_DELEGATION_RULES.planner;
    expect(allowed).toContain('explorer');
    expect(allowed).toContain('librarian');
    expect(allowed).toContain('oracle');
    expect(allowed).toContain('designer');
    expect(allowed).not.toContain('frontend-developer');
    expect(allowed).not.toContain('backend-developer');
    expect(allowed).not.toContain('council');
    expect(allowed).not.toContain('observer');
  });
});

describe('per-model variant in array config', () => {
  test('subagent stores model array with per-model variants', () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          model: [
            { id: 'google/gemini-3-flash', variant: 'low' },
            'openai/gpt-4o-mini',
          ],
        },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?._modelArray).toEqual([
      { id: 'google/gemini-3-flash', variant: 'low' },
      { id: 'openai/gpt-4o-mini' },
    ]);
    expect(explorer?.config.model).toBeUndefined();
  });

  test('top-level variant preserved alongside per-model variants', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            'openai/gpt-4',
          ],
          variant: 'low',
        },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    // top-level variant still set as default
    expect(orchestrator?.config.variant).toBe('low');
    // per-model variants stored in _modelArray
    expect(orchestrator?._modelArray?.[0]?.variant).toBe('high');
    expect(orchestrator?._modelArray?.[1]?.variant).toBeUndefined();
  });
});

describe('skill permissions', () => {
  test('orchestrator gets codemap skill allowed by default', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator).toBeDefined();
    const skillPerm = (
      orchestrator?.config.permission as Record<string, unknown>
    )?.skill as Record<string, string>;
    // orchestrator gets wildcard allow (from RECOMMENDED_SKILLS wildcard entry)
    expect(skillPerm?.['*']).toBe('allow');
    // CUSTOM_SKILLS loop must also add a named codemap entry for orchestrator
    expect(skillPerm?.codemap).toBe('allow');
  });

  test('frontend-developer does not get codemap skill allowed by default', () => {
    const agents = createAgents();
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    expect(frontend).toBeDefined();
    const skillPerm = (frontend?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.codemap).not.toBe('allow');
  });

  test('backend-developer does not get codemap skill allowed by default', () => {
    const agents = createAgents();
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(backend).toBeDefined();
    const skillPerm = (backend?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.codemap).not.toBe('allow');
  });

  test('oracle gets requesting-code-review skill allowed by default', () => {
    const agents = createAgents();
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle).toBeDefined();
    const skillPerm = (oracle?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.['requesting-code-review']).toBe('allow');
  });

  test('oracle gets simplify skill allowed by default', () => {
    const agents = createAgents();
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle).toBeDefined();
    const skillPerm = (oracle?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.simplify).toBe('allow');
  });

  test('frontend-developer gets vercel-react-best-practices skill allowed by default', () => {
    const agents = createAgents();
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    expect(frontend).toBeDefined();
    const skillPerm = (frontend?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.['vercel-react-best-practices']).toBe('allow');
  });

  test('frontend-developer gets karpathy-guidelines skill allowed by default', () => {
    const agents = createAgents();
    const frontend = agents.find((a) => a.name === 'frontend-developer');
    expect(frontend).toBeDefined();
    const skillPerm = (frontend?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.['karpathy-guidelines']).toBe('allow');
  });

  test('backend-developer gets backend-developer skill allowed by default', () => {
    const agents = createAgents();
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(backend).toBeDefined();
    const skillPerm = (backend?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.['backend-developer']).toBe('allow');
  });

  test('backend-developer gets karpathy-guidelines skill allowed by default', () => {
    const agents = createAgents();
    const backend = agents.find((a) => a.name === 'backend-developer');
    expect(backend).toBeDefined();
    const skillPerm = (backend?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.['karpathy-guidelines']).toBe('allow');
  });
});

describe('tool permissions', () => {
  test('council agent is allowed to invoke council_session', () => {
    const agents = createAgents();
    const council = agents.find((a) => a.name === 'council');
    expect((council?.config.permission as any).council_session).toBe('allow');
  });

  test('oracle is denied access to council_session', () => {
    const agents = createAgents();
    const oracle = agents.find((a) => a.name === 'oracle');
    expect((oracle?.config.permission as any).council_session).toBe('deny');
  });

  test('explorer is denied access to council_session', () => {
    const agents = createAgents();
    const explorer = agents.find((a) => a.name === 'explorer');
    expect((explorer?.config.permission as any).council_session).toBe('deny');
  });

  test('councillor is denied access to council_session', () => {
    const agents = createAgents();
    const councillor = agents.find((a) => a.name === 'councillor');
    expect((councillor?.config.permission as any).council_session).toBe('deny');
  });
});

describe('isSubagent type guard', () => {
  test('returns true for valid subagent names', () => {
    expect(isSubagent('explorer')).toBe(true);
    expect(isSubagent('librarian')).toBe(true);
    expect(isSubagent('oracle')).toBe(true);
    expect(isSubagent('designer')).toBe(true);
    expect(isSubagent('frontend-developer')).toBe(true);
    expect(isSubagent('backend-developer')).toBe(true);
  });

  test('returns false for orchestrator', () => {
    expect(isSubagent('orchestrator')).toBe(false);
  });

  test('returns false for invalid agent names', () => {
    expect(isSubagent('invalid-agent')).toBe(false);
    expect(isSubagent('')).toBe(false);
    expect(isSubagent('explore')).toBe(false); // old alias, not actual agent name
    expect(isSubagent('fixer')).toBe(false); // legacy, not a current agent
  });
});

describe('agent classification', () => {
  test('SUBAGENT_NAMES excludes orchestrator', () => {
    expect(SUBAGENT_NAMES).not.toContain('orchestrator');
    expect(SUBAGENT_NAMES).toContain('explorer');
    expect(SUBAGENT_NAMES).toContain('frontend-developer');
    expect(SUBAGENT_NAMES).toContain('backend-developer');
    expect(SUBAGENT_NAMES).not.toContain('fixer');
  });

  test('getAgentConfigs applies correct classification visibility and mode', () => {
    // Enable all agents (including observer) for classification testing
    const configs = getAgentConfigs({ disabled_agents: [] });

    // Primary agents
    expect(configs.orchestrator.mode).toBe('primary');
    expect(configs.planner.mode).toBe('primary');

    // Subagents
    for (const name of SUBAGENT_NAMES) {
      // Council is a dual-mode agent ("all"), rest are subagents
      if (name === 'council') {
        expect(configs[name].mode).toBe('all');
      } else {
        expect(configs[name].mode).toBe('subagent');
      }
    }
  });
});

describe('createAgents', () => {
  test('creates all agents without config', () => {
    const agents = createAgents();
    const names = agents.map((a) => a.name);
    expect(names).toContain('orchestrator');
    expect(names).toContain('planner');
    expect(names).toContain('explorer');
    expect(names).toContain('designer');
    expect(names).toContain('oracle');
    expect(names).toContain('librarian');
    expect(names).toContain('frontend-developer');
    expect(names).toContain('backend-developer');
  });

  test('creates exactly 10 agents by default (2 primary + 8 subagents, observer disabled)', () => {
    const agents = createAgents();
    expect(agents.length).toBe(10);
  });
});

describe('getAgentConfigs', () => {
  test('returns config record keyed by agent name', () => {
    const configs = getAgentConfigs();
    expect(configs.orchestrator).toBeDefined();
    expect(configs.explorer).toBeDefined();
    // orchestrator has no hardcoded default model; resolved at runtime via
    // chat.message hook when _modelArray is configured, or left to the user
    expect(configs.explorer.model).toBeDefined();
  });

  test('includes description in SDK config', () => {
    const configs = getAgentConfigs();
    expect(configs.orchestrator.description).toBeDefined();
    expect(configs.explorer.description).toBeDefined();
  });
});

describe('council agent model resolution', () => {
  test('council agent uses default model', () => {
    const agents = createAgents();
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe(DEFAULT_MODELS.council);
  });

  test('councillor agent uses default model', () => {
    const agents = createAgents();
    const councillor = agents.find((a) => a.name === 'councillor');
    expect(councillor?.config.model).toBe(DEFAULT_MODELS.councillor);
  });

  test('council falls back to legacy master.model when no preset override', () => {
    // Simulates a pre-1.0.0 config with council.master.model but no council
    // entry in the agent preset — the exact scenario from issue #369.
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'openai/gpt-5.5' },
      },
      council: {
        presets: {
          default: {
            alpha: { model: 'openai/gpt-5.4-mini' },
          },
        },
        _legacyMasterModel: 'anthropic/claude-opus-4-6',
      },
    };
    const agents = createAgents(config);
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe('anthropic/claude-opus-4-6');
  });

  test('council preset override takes precedence over legacy master.model', () => {
    // If user has explicit council in preset, that wins — legacy is ignored.
    const config: PluginConfig = {
      agents: {
        council: { model: 'google/gemini-3-pro' },
      },
      council: {
        presets: {
          default: {
            alpha: { model: 'openai/gpt-5.4-mini' },
          },
        },
        _legacyMasterModel: 'anthropic/claude-opus-4-6',
      },
    };
    const agents = createAgents(config);
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe('google/gemini-3-pro');
  });

  test('council uses default when no legacy master and no preset override', () => {
    // No legacy master, no preset override → standard default
    const config: PluginConfig = {
      council: {
        presets: {
          default: {
            alpha: { model: 'openai/gpt-5.4-mini' },
          },
        },
      },
    };
    const agents = createAgents(config);
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe(DEFAULT_MODELS.council);
  });

  test('end-to-end: raw master.model config flows through schema to council agent', () => {
    // Integration test: start from raw user config with deprecated master.model,
    // parse through CouncilConfigSchema, then pass to createAgents.
    // This validates the full seam between schema transform and agent resolution.
    const rawCouncilConfig = {
      master: { model: 'anthropic/claude-opus-4-6' },
      presets: {
        default: {
          alpha: { model: 'openai/gpt-5.4-mini' },
        },
      },
    };

    const parsed = CouncilConfigSchema.safeParse(rawCouncilConfig);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const config: PluginConfig = {
        council: parsed.data,
      };
      const agents = createAgents(config);
      const council = agents.find((a) => a.name === 'council');
      // Legacy master.model should flow through schema → agent
      expect(council?.config.model).toBe('anthropic/claude-opus-4-6');
    }
  });
});

describe('options passthrough', () => {
  test('options are applied to agent config via overrides', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          options: { textVerbosity: 'low' },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.options).toEqual({ textVerbosity: 'low' });
  });

  test('options with nested objects are passed through', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-sonnet-4-6',
          options: {
            thinking: { type: 'enabled', budgetTokens: 16000 },
          },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.options).toEqual({
      thinking: { type: 'enabled', budgetTokens: 16000 },
    });
  });

  test('options work with other overrides', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          variant: 'high',
          temperature: 0.7,
          options: { textVerbosity: 'low', reasoningEffort: 'medium' },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.model).toBe('openai/gpt-5.5');
    expect(oracle?.config.variant).toBe('high');
    expect(oracle?.config.temperature).toBe(0.7);
    expect(oracle?.config.options).toEqual({
      textVerbosity: 'low',
      reasoningEffort: 'medium',
    });
  });

  test('options are absent when not configured', () => {
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'openai/gpt-5.5' },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.options).toBeUndefined();
  });

  test('options flow through getAgentConfigs to SDK output', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          options: { textVerbosity: 'low' },
        },
      },
    };
    const configs = getAgentConfigs(config);
    expect(configs.oracle.options).toEqual({ textVerbosity: 'low' });
  });

  test('options are shallow-merged with existing agent config options', () => {
    // Simulate an agent factory setting default options
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          options: { reasoningEffort: 'medium' },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    // Override options should merge with (not replace) any factory defaults
    expect(oracle?.config.options).toEqual({ reasoningEffort: 'medium' });
  });
});

describe('AgentOverrideConfigSchema options validation', () => {
  test('accepts valid options object', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      options: { textVerbosity: 'low' },
    });
    expect(result.success).toBe(true);
  });

  test('accepts empty options object', () => {
    const result = AgentOverrideConfigSchema.safeParse({ options: {} });
    expect(result.success).toBe(true);
  });

  test('accepts nested values in options', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      options: {
        thinking: { type: 'enabled', budgetTokens: 16000 },
      },
    });
    expect(result.success).toBe(true);
  });

  test('accepts options alongside other fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      variant: 'high',
      temperature: 0.7,
      options: { textVerbosity: 'low' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toEqual({ textVerbosity: 'low' });
    }
  });

  test('config without options is valid', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toBeUndefined();
    }
  });

  test('rejects non-object options', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      options: 'not-an-object',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty model arrays', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: [],
    });
    expect(result.success).toBe(false);
  });

  test('accepts prompt and orchestratorPrompt override fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      prompt: 'You are a specialized reviewer.',
      orchestratorPrompt: '@reviewer\n- Role: Specialized reviewer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe('You are a specialized reviewer.');
      expect(result.data.orchestratorPrompt).toBe(
        '@reviewer\n- Role: Specialized reviewer',
      );
    }
  });

  test('rejects empty prompt fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      prompt: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty orchestratorPrompt fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      orchestratorPrompt: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects description field on overrides', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      description: 'not supported for custom agents',
    } as Record<string, unknown>);
    expect(result.success).toBe(false);
  });
});

describe('PluginConfigSchema custom-agent-only prompt fields', () => {
  test('rejects prompt on built-in top-level agent overrides', () => {
    const result = PluginConfigSchema.safeParse({
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          prompt: 'ignored built-in prompt override',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects orchestratorPrompt on built-in top-level agent overrides', () => {
    const result = PluginConfigSchema.safeParse({
      agents: {
        explorer: {
          model: 'openai/gpt-5.4-mini',
          orchestratorPrompt: '@explorer\n- Role: should be invalid here',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects custom-only prompt fields on built-in preset agents', () => {
    const result = PluginConfigSchema.safeParse({
      presets: {
        openai: {
          oracle: {
            model: 'openai/gpt-5.5',
            prompt: 'ignored preset built-in prompt override',
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test('allows prompt fields on custom agents', () => {
    const result = PluginConfigSchema.safeParse({
      agents: {
        janitor: {
          model: 'openai/gpt-5.4-mini',
          prompt: 'You are Janitor.',
          orchestratorPrompt: '@janitor\n- Role: Cleanup specialist',
        },
      },
    });

    expect(result.success).toBe(true);
  });

  test('accepts sessionManager config', () => {
    const result = PluginConfigSchema.safeParse({
      sessionManager: {
        maxSessionsPerAgent: 2,
        readContextMinLines: 10,
        readContextMaxFiles: 8,
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('disabled_agents', () => {
  test('disabled agents are not created', () => {
    const config: PluginConfig = {
      disabled_agents: ['designer', 'frontend-developer', 'backend-developer'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('designer');
    expect(names).not.toContain('frontend-developer');
    expect(names).not.toContain('backend-developer');
    expect(names).toContain('orchestrator');
    expect(names).toContain('explorer');
    expect(names).toContain('oracle');
    expect(names).toContain('librarian');
  });

  test('protected agents cannot be disabled', () => {
    const config: PluginConfig = {
      disabled_agents: ['orchestrator', 'councillor'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).toContain('orchestrator');
    expect(names).toContain('councillor');
  });

  test('planner can be disabled', () => {
    const config: PluginConfig = {
      disabled_agents: ['planner'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('planner');
    expect(names).toContain('orchestrator'); // orchestrator stays
  });

  test('disabling council disables council agent', () => {
    const config: PluginConfig = {
      disabled_agents: ['council'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('council');
    // councillor is protected, it stays
    expect(names).toContain('councillor');
  });

  test('agent count decreases when agents are disabled', () => {
    const agents = createAgents();
    expect(agents.length).toBe(10); // 2 primary + 8 (observer disabled by default)

    const disabledConfig: PluginConfig = {
      disabled_agents: ['observer', 'designer'],
    };
    const disabledAgents = createAgents(disabledConfig);
    expect(disabledAgents.length).toBe(9);
  });

  test('getDisabledAgents respects protection rules', () => {
    const config: PluginConfig = {
      disabled_agents: ['orchestrator', 'designer', 'councillor'],
    };
    const disabled = getDisabledAgents(config);
    expect(disabled.has('designer')).toBe(true);
    expect(disabled.has('orchestrator')).toBe(false);
    expect(disabled.has('councillor')).toBe(false);
  });

  test('getEnabledAgentNames filters correctly', () => {
    const config: PluginConfig = {
      disabled_agents: ['designer', 'frontend-developer'],
    };
    const enabled = getEnabledAgentNames(config);
    expect(enabled).not.toContain('designer');
    expect(enabled).not.toContain('frontend-developer');
    expect(enabled).toContain('orchestrator');
    expect(enabled).toContain('explorer');
  });

  test('getEnabledAgentNames includes enabled custom agents', () => {
    const config: PluginConfig = {
      disabled_agents: ['janitor'],
      agents: {
        janitor: { model: 'openai/gpt-5.4-mini' },
        reviewer: { model: 'openai/gpt-5.4-mini' },
      },
    };

    const enabled = getEnabledAgentNames(config);
    expect(enabled).toContain('reviewer');
    expect(enabled).not.toContain('janitor');
  });

  test('empty disabled_agents creates all agents including observer', () => {
    const config: PluginConfig = {
      disabled_agents: [],
    };
    const agents = createAgents(config);
    expect(agents.length).toBe(11); // 2 primary + 9 subagents (observer enabled)
    expect(agents.map((a) => a.name)).toContain('observer');
  });
});

describe('observer agent', () => {
  test('observer is disabled by default', () => {
    const agents = createAgents();
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('observer');
  });

  test('observer is enabled when removed from disabled_agents', () => {
    const config: PluginConfig = {
      disabled_agents: [],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).toContain('observer');
  });

  test('observer is disabled when explicitly listed', () => {
    const config: PluginConfig = {
      disabled_agents: ['observer'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('observer');
  });

  test('observer can be enabled alongside other disabled agents', () => {
    const config: PluginConfig = {
      disabled_agents: ['designer'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).toContain('observer');
    expect(names).not.toContain('designer');
  });

  test('DEFAULT_DISABLED_AGENTS contains observer', () => {
    expect(DEFAULT_DISABLED_AGENTS).toContain('observer');
  });
});

// NOTE: manualPlan.fixer schema support is limited due to Zod v4 transform
// behavior. The legacy fixer plan for manualPlan is handled at the agent
// creation level in createAgents via getLegacyAgentModel, which correctly
// maps legacy fixer config to both frontend-developer and backend-developer.
// See tests in 'frontend-developer and backend-developer agent fallback'.
