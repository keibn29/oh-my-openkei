import { BUSINESS_ANALYST_DELEGATE_SET } from '../config/constants';
import type { AgentDefinition } from './orchestrator';
import {
  renderSpecialists,
  SHARED_COMMUNICATION_RULES,
} from './shared-agent-content';

/**
 * Custom skill-loading instruction for business-analyst.
 * Loads the native 'business-analyst' skill by default.
 * Additional skills are loaded only when the user explicitly requests it.
 */
export const BUSINESS_ANALYST_SKILL_INSTRUCTION =
  "**Skills**: Your native 'business-analyst' skill provides your analysis methodology, frameworks, and output standards. Load it using the `skill` tool as your first action — it is MANDATORY before any substantive work. Additional skills are available — only load them when the user explicitly asks you to use a specific skill. Follow loaded skill instructions for the duration of the task.";

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

<Output>

## Analysis Output — Save to File (Mandatory)

You MUST ALWAYS save your full analysis output to a markdown file.

**Always**:
1. Use the **Write tool** to save the complete analysis to a \`.md\` file
2. If the user explicitly specifies a save location or path, save the file there; otherwise, save under the \`.business-analyts/\` directory (creating it if necessary)
3. Generate a meaningful filename based on the analysis topic (e.g. \`market-analysis-<topic>.md\`, \`requirements-<topic>.md\`, \`strategy-<topic>.md\`)
4. In the chat message, return ONLY a concise confirmation \u2014 e.g. "Analysis saved to \`<path>/<filename>.md\`"
5. Do NOT repeat the full analysis in the chat message when saving to a file

**Never**:
- Return the full analysis content as raw chat text
- Skip the file save

</Output>
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

  // Append custom skill-loading instruction for business-analyst.
  // Primary agents have full skill visibility; this agent loads its native
  // skill by default and additional skills only when user explicitly requests.
  let prompt: string;
  if (customPrompt) {
    prompt = `${customPrompt}\n\n${BUSINESS_ANALYST_SKILL_INSTRUCTION}`;
  } else if (customAppendPrompt) {
    prompt = `${base_prompt}\n\n${customAppendPrompt}\n\n${BUSINESS_ANALYST_SKILL_INSTRUCTION}`;
  } else {
    prompt = `${base_prompt}\n\n${BUSINESS_ANALYST_SKILL_INSTRUCTION}`;
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
