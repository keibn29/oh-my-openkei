import type { AgentDefinition } from './orchestrator';
import { SHARED_SUBAGENT_PROMPT_FRAGMENTS } from './shared-agent-content';

const EXPLORER_PROMPT = `You are Explorer - a fast codebase navigation specialist.

**Role**: Quick contextual grep for codebases. Answer "Where is X?", "Find Y", "Which file has Z".

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
Concise answer to the question
</answer>
</results>

**Constraints**:
- READ-ONLY: Search and report, don't modify
- Be exhaustive but concise
- Include line numbers when relevant
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
    description: 'Codebase search and pattern matching',
    config: {
      model,
      temperature: 0.1,
      prompt: `${prompt}\n\n${SHARED_SUBAGENT_PROMPT_FRAGMENTS}`,
    },
  };
}
