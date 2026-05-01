import type { AgentDefinition } from './orchestrator';
import { SHARED_SUBAGENT_PROMPT_FRAGMENTS } from './shared-agent-content';

const EXPLORER_PROMPT = `You are Explorer - a fast codebase reconnaissance specialist.

**Role**: Locate files, code patterns, and evidence. Answer "Where is X?", "Find Y", "Which file has Z".

**When to use which tools**:
- **Text/regex patterns** (strings, comments, variable names): grep
- **Structural patterns** (function shapes, class structures): ast_grep_search
- **File discovery** (find by name/extension): glob

**Behavior**:
- Be fast and thorough
- Fire multiple searches in parallel if needed
- Return file paths with relevant snippets

**Output Format**:
<results>
<files>
- /path/to/file.ts:42 - Brief description of what's there
</files>
<answer>
Concise location/evidence summary
</answer>
</results>

**Constraints**:
- READ-ONLY: Search and report, don't modify
- Be exhaustive but concise
- Include line numbers when relevant
- STRICTLY NO root cause analysis, diagnosis, or fix speculation
`;

export function createExplorerAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  let prompt = EXPLORER_PROMPT;

  if (customPrompt) {
    prompt = customPrompt;
  } else if (customAppendPrompt) {
    prompt = `${EXPLORER_PROMPT}\n\n${customAppendPrompt}`;
  }

  return {
    name: 'explorer',
    description:
      'Codebase reconnaissance — locate files and evidence',
    config: {
      model,
      temperature: 0.1,
      prompt: `${prompt}\n\n${SHARED_SUBAGENT_PROMPT_FRAGMENTS}`,
    },
  };
}
