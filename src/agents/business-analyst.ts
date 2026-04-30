import { BUSINESS_ANALYST_DELEGATE_SET } from '../config/constants';
import type { AgentDefinition } from './orchestrator';
import {
  renderSpecialists,
  SHARED_COMMUNICATION_RULES,
  SKILL_REQUIREMENT,
} from './shared-agent-content';

/**
 * Build the business-analyst prompt with a restricted delegate set.
 *
 * Key principles:
 * - business analyst for market research, competitive analysis, requirements
 *   elicitation, and strategic planning
 * - delegate research to subagents (explorer, librarian, oracle)
 * - produce structured analysis with actionable recommendations
 */
export function buildBusinessAnalystPrompt(
  disabledAgents?: Set<string>,
): string {
  const enabledAgents = renderSpecialists(
    'business-analyst',
    BUSINESS_ANALYST_DELEGATE_SET,
    disabledAgents,
  );

  return `You are Business-Analyst — a senior business analyst specialist for market research,
competitive analysis, requirements elicitation, and strategic planning.

**Role**: Transform abstract ideas into concrete, actionable product plans. Follow your
loaded skill's workflow, frameworks, and documentation standards for all analysis work.

<Available_Specialists>

${enabledAgents}

</Available_Specialists>

<When_to_Delegate>

## Delegate to specialists when:
- Need to discover codebase context → @explorer
- Need current library/API docs → @librarian
- Need architectural feasibility or technical trade-offs → @oracle

## Do NOT delegate when:
- Standard business analysis frameworks you know well
- Simple requirement documentation
- General market knowledge

</When_to_Delegate>

<Communication>

${SHARED_COMMUNICATION_RULES}

</Communication>
`;
}

export const BUSINESS_ANALYST_PROMPT = buildBusinessAnalystPrompt();

export function createBusinessAnalystAgent(
  model?: string | Array<string | { id: string; variant?: string }>,
  customPrompt?: string,
  customAppendPrompt?: string,
  disabledAgents?: Set<string>,
): AgentDefinition {
  const base_prompt = buildBusinessAnalystPrompt(disabledAgents);

  // Append skill requirement in all cases, matching frontend/backend-developer pattern
  let prompt: string;
  if (customPrompt) {
    prompt = `${customPrompt}\n\n${SKILL_REQUIREMENT}`;
  } else if (customAppendPrompt) {
    prompt = `${base_prompt}\n\n${customAppendPrompt}\n\n${SKILL_REQUIREMENT}`;
  } else {
    prompt = `${base_prompt}\n\n${SKILL_REQUIREMENT}`;
  }

  const definition: AgentDefinition = {
    name: 'business-analyst',
    description: 'Market research and strategic analysis specialist',
    config: {
      temperature: 0.1,
      prompt,
    },
  };

  if (Array.isArray(model)) {
    definition._modelArray = model.map((m) =>
      typeof m === 'string' ? { id: m } : m,
    );
  } else if (typeof model === 'string' && model) {
    definition.config.model = model;
  }

  return definition;
}
