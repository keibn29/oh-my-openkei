import { getDefaultAgentMcps } from '../config/agent-mcps';
import { getDefaultAgentSkills } from '../config/agent-skills';
import type { InstallConfig } from './types';

const SCHEMA_URL =
  'https://unpkg.com/oh-my-openkei@latest/oh-my-openkei.schema.json';

export const MODEL_MAPPINGS = {
  orchestrator: { model: 'openai/gpt-5.4-fast', variant: 'high' },
  planner: { model: 'openai/gpt-5.5-fast', variant: 'xhigh' },
  sprinter: { model: 'openai/gpt-5.3-codex', variant: 'low' },
  oracle: { model: 'openai/gpt-5.5-fast', variant: 'high' },
  debugger: { model: 'openai/gpt-5.3-codex', variant: 'high' },
  council: { model: 'openai/gpt-5.4-fast', variant: 'xhigh' },
  librarian: { model: 'minimax-coding-plan/MiniMax-M2.7' },
  explorer: { model: 'minimax-coding-plan/MiniMax-M2.7' },
  designer: { model: 'opencode-go/kimi-k2.6' },
  'frontend-developer': {
    model: 'opencode-go/deepseek-v4-flash',
    variant: 'high',
  },
  'backend-developer': {
    model: 'opencode-go/deepseek-v4-flash',
    variant: 'high',
  },
  'business-analyst': {
    model: 'openai/gpt-5.5-fast',
    variant: 'high',
  },
} as const;

export function generateLiteConfig(
  _installConfig: InstallConfig,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    $schema: SCHEMA_URL,
    preset: 'default',
    presets: {},
  };

  const createAgentConfig = (
    agentName: string,
    modelInfo: { model: string; variant?: string },
  ) => {
    return {
      model: modelInfo.model,
      variant: modelInfo.variant,
      skills: [...getDefaultAgentSkills(agentName)],
      mcps: [...getDefaultAgentMcps(agentName)],
    };
  };

  const buildPreset = () => {
    return Object.fromEntries(
      Object.entries(MODEL_MAPPINGS).map(([agentName, modelInfo]) => [
        agentName,
        createAgentConfig(agentName, modelInfo),
      ]),
    );
  };

  (config.presets as Record<string, unknown>).default = buildPreset();

  return config;
}
