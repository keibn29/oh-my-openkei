import { DEFAULT_AGENT_MCPS } from '../config/agent-mcps';
import { CUSTOM_SKILLS } from './custom-skills';
import { RECOMMENDED_SKILLS } from './skills';
import type { InstallConfig } from './types';

const SCHEMA_URL =
  'https://unpkg.com/oh-my-openkei@latest/oh-my-openkei.schema.json';

export const MODEL_MAPPINGS = {
  orchestrator: { model: 'opencode-go/qwen3.6-plus' },
  planner: { model: 'openai/gpt-5.5-fast', variant: 'xhigh' },
  sprinter: { model: 'openai/gpt-5.3-codex', variant: 'low' },
  oracle: { model: 'openai/gpt-5.5-fast', variant: 'high' },
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
    const isPrimaryAgent =
      agentName === 'orchestrator' ||
      agentName === 'planner' ||
      agentName === 'sprinter';

    const skills = isPrimaryAgent
      ? ['*']
      : [
          ...RECOMMENDED_SKILLS.filter(
            (s) =>
              s.allowedAgents.includes('*') ||
              s.allowedAgents.includes(agentName),
          ).map((s) => s.skillName),
          ...CUSTOM_SKILLS.filter(
            (s) =>
              s.allowedAgents.includes('*') ||
              s.allowedAgents.includes(agentName),
          ).map((s) => s.name),
        ];

    if (agentName === 'designer' && !skills.includes('agent-browser')) {
      skills.push('agent-browser');
    }

    return {
      model: modelInfo.model,
      variant: modelInfo.variant,
      skills,
      mcps:
        DEFAULT_AGENT_MCPS[agentName as keyof typeof DEFAULT_AGENT_MCPS] ?? [],
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
