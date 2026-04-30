/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { generateLiteConfig, MODEL_MAPPINGS } from './providers';

describe('providers', () => {
  test('MODEL_MAPPINGS maps all agents to default models', () => {
    const keys = Object.keys(MODEL_MAPPINGS);
    expect(keys).toContain('orchestrator');
    expect(keys).toContain('planner');
    expect(keys).toContain('sprinter');
    expect(keys).toContain('oracle');
    expect(keys).toContain('council');
    expect(keys).toContain('librarian');
    expect(keys).toContain('explorer');
    expect(keys).toContain('designer');
    expect(keys).toContain('frontend-developer');
    expect(keys).toContain('backend-developer');
    expect(keys).toContain('business-analyst');
    // Each entry has model and optional variant
    for (const entry of Object.values(MODEL_MAPPINGS)) {
      expect(typeof entry.model).toBe('string');
    }
  });

  test('generateLiteConfig always generates default preset', () => {
    const config = generateLiteConfig({
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    expect(config.$schema).toBe(
      'https://unpkg.com/oh-my-openkei@latest/oh-my-openkei.schema.json',
    );
    expect(config.preset).toBe('default');
    const agents = (config.presets as any).default;
    expect(agents).toBeDefined();
    expect(agents.orchestrator.model).toBe('opencode-go/qwen3.6-plus');
    expect(agents.orchestrator.skills).toEqual(['*']);
    expect(agents.planner.model).toBe('openai/gpt-5.5-fast');
    expect(agents.planner.variant).toBe('xhigh');
    expect(agents.planner.skills).toEqual(['*']);
    expect(agents.sprinter.model).toBe('openai/gpt-5.3-codex');
    expect(agents.sprinter.variant).toBe('low');
    expect(agents.sprinter.skills).toEqual(['*']);
    expect(agents.oracle.model).toBe('openai/gpt-5.5-fast');
    expect(agents.oracle.variant).toBe('high');
    expect(agents.council.model).toBe('openai/gpt-5.4-fast');
    expect(agents.council.variant).toBe('xhigh');
    expect(agents.librarian.model).toBe('minimax-coding-plan/MiniMax-M2.7');
    expect(agents.librarian.variant).toBeUndefined();
    expect(agents.explorer.model).toBe('minimax-coding-plan/MiniMax-M2.7');
    expect(agents.explorer.variant).toBeUndefined();
    expect(agents.designer.model).toBe('opencode-go/kimi-k2.6');
    expect(agents.designer.variant).toBeUndefined();
    expect(agents['frontend-developer'].model).toBe(
      'opencode-go/deepseek-v4-flash',
    );
    expect(agents['frontend-developer'].variant).toBe('high');
    expect(agents['backend-developer'].model).toBe(
      'opencode-go/deepseek-v4-flash',
    );
    expect(agents['backend-developer'].variant).toBe('high');
    expect(agents['business-analyst'].model).toBe('openai/gpt-5.5-fast');
    expect(agents['business-analyst'].variant).toBe('high');

    // Default colors for select agents
    expect(agents.orchestrator.color).toBe('success');
    expect(agents.planner.color).toBe('primary');
    expect(agents.council.color).toBe('info');
    expect(agents['business-analyst'].color).toBe('warning');
    expect(agents.sprinter.color).toBe('error');
    // Agents without explicit color should not have one
    expect(agents.oracle.color).toBeUndefined();
    expect(agents.designer.color).toBeUndefined();
    expect(agents['frontend-developer'].color).toBeUndefined();
    expect(agents['backend-developer'].color).toBeUndefined();
  });

  test('generateLiteConfig uses correct OpenAI models', () => {
    const config = generateLiteConfig({
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).default;
    expect(agents.orchestrator.model).toBe('opencode-go/qwen3.6-plus');
    expect(agents.planner.model).toBe('openai/gpt-5.5-fast');
    expect(agents.planner.variant).toBe('xhigh');
    expect(agents.sprinter.model).toBe('openai/gpt-5.3-codex');
    expect(agents.sprinter.variant).toBe('low');
    expect(agents.oracle.model).toBe('openai/gpt-5.5-fast');
    expect(agents.oracle.variant).toBe('high');
    expect(agents.council.model).toBe('openai/gpt-5.4-fast');
    expect(agents.council.variant).toBe('xhigh');
    expect(agents.librarian.model).toBe('minimax-coding-plan/MiniMax-M2.7');
    expect(agents.explorer.model).toBe('minimax-coding-plan/MiniMax-M2.7');
    expect(agents.designer.model).toBe('opencode-go/kimi-k2.6');
    expect(agents['business-analyst'].model).toBe('openai/gpt-5.5-fast');
    expect(agents['business-analyst'].variant).toBe('high');
  });

  test('generateLiteConfig includes default skills', () => {
    const config = generateLiteConfig({
      installSkills: true,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).default;
    // Orchestrator should always have '*'
    expect(agents.orchestrator.skills).toEqual(['*']);

    // Planner should also have '*' like orchestrator
    expect(agents.planner.skills).toEqual(['*']);

    // Oracle should have bundled simplify
    expect(agents.oracle.skills).toContain('simplify');

    // Orchestrator should implicitly cover bundled codemap via '*'
    expect(agents.orchestrator.skills).toContain('*');

    // Designer should have 'agent-browser'
    expect(agents.designer.skills).toContain('agent-browser');

    // Explorer should have no bundled skills by default
    expect(agents.explorer.skills).toEqual([]);

    // Frontend-developer should have bundled skills assigned
    expect(agents['frontend-developer'].skills).toContain(
      'vercel-react-best-practices',
    );
    expect(agents['frontend-developer'].skills).toContain(
      'karpathy-guidelines',
    );
    // Backend-developer should have bundled skills assigned
    expect(agents['backend-developer'].skills).toContain('backend-developer');
    expect(agents['backend-developer'].skills).toContain('karpathy-guidelines');

    // Business-analyst should have exactly its own skill
    expect(agents['business-analyst'].skills).toEqual(['business-analyst']);
  });

  test('generateLiteConfig includes mcps field', () => {
    const config = generateLiteConfig({
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).default;
    expect(agents.orchestrator.mcps).toBeDefined();
    expect(Array.isArray(agents.orchestrator.mcps)).toBe(true);
    expect(agents.librarian.mcps).toBeDefined();
    expect(Array.isArray(agents.librarian.mcps)).toBe(true);
  });

  test('generateLiteConfig default includes correct mcps', () => {
    const config = generateLiteConfig({
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).default;
    expect(agents.orchestrator.mcps).toEqual(['*', '!context7']);
    expect(agents.librarian.mcps).toContain('websearch');
    expect(agents.librarian.mcps).toContain('context7');
    expect(agents.librarian.mcps).toContain('grep_app');
    expect(agents.designer.mcps).toEqual(['figma']);
    expect(agents.explorer.mcps).toEqual(['serena']);
  });
});
