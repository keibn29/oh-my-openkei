import type { AgentConfig } from '@opencode-ai/sdk/v2';
import {
  renderSpecialists,
  SHARED_COMMUNICATION_RULES,
} from './shared-agent-content';

export interface AgentDefinition {
  name: string;
  displayName?: string;
  description?: string;
  config: AgentConfig;
  /** Priority-ordered model entries for runtime fallback resolution. */
  _modelArray?: Array<{ id: string; variant?: string }>;
}

/**
 * Resolve agent prompt from base/custom/append inputs.
 * If customPrompt is provided, it replaces the base entirely.
 * Otherwise, customAppendPrompt is appended to the base.
 */
export function resolvePrompt(
  base: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): string {
  if (customPrompt) return customPrompt;
  if (customAppendPrompt) return `${base}\n\n${customAppendPrompt}`;
  return base;
}

// Which specialists the orchestrator can delegate to (all except councillor)
const ORCHESTRATOR_DELEGATE_SET = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'frontend-developer',
  'backend-developer',
  'observer',
  'council',
] as const;

// Validation routing lines that reference agents
const VALIDATION_ROUTING = [
  '- Route UI/UX validation and review to @designer',
  '- Route code review, simplification, maintainability review, and YAGNI checks to @oracle',
  '- Route frontend implementation (components, styling, forms, client logic) to @frontend-developer',
  '- Route backend implementation (APIs, services, DB, auth, jobs) to @backend-developer',
  '- Route visual/media analysis and interpretation to @observer',
  '- If a request spans multiple lanes, delegate only the lanes that add clear value',
];

// Parallel delegation examples
const PARALLEL_DELEGATION_EXAMPLES = [
  '- Multiple @explorer searches across different domains?',
  '- @explorer + @librarian research in parallel?',
  '- Multiple @frontend-developer or @backend-developer instances for faster, scoped implementation?',
  '- @observer + @explorer in parallel (visual analysis + code search)?',
];

/**
 * Build the orchestrator prompt with dynamic agent filtering.
 * @param disabledAgents - Set of disabled agent names to exclude from the prompt
 * @returns The complete orchestrator prompt string
 */
export function buildOrchestratorPrompt(disabledAgents?: Set<string>): string {
  // Filter validation routing lines — remove lines mentioning any disabled agent
  const enabledValidationRouting = VALIDATION_ROUTING.filter((line) => {
    const mentions = [...line.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    if (mentions.length === 0) return true;
    return mentions.every((name) => !disabledAgents?.has(name));
  }).join('\n');

  // Filter parallel delegation examples — remove lines mentioning any disabled agent
  const enabledParallelExamples = PARALLEL_DELEGATION_EXAMPLES.filter(
    (line) => {
      const mentions = [...line.matchAll(/@([a-zA-Z0-9_-]+)/g)].map(
        (m) => m[1],
      );
      if (mentions.length === 0) return true;
      return mentions.every((name) => !disabledAgents?.has(name));
    },
  ).join('\n');

  const enabledAgents = renderSpecialists(
    'orchestrator',
    ORCHESTRATOR_DELEGATE_SET,
    disabledAgents,
  );

  return `<Role>
You are an AI coding orchestrator that optimizes for quality, speed, cost, and reliability by delegating to specialist subagents. You do substantive work directly ONLY when a subagent's "Don't delegate when" rule explicitly applies.
</Role>

<Agents>

${enabledAgents}

</Agents>

<Workflow>

## 1. Understand
Parse request: explicit requirements + implicit needs.

## 2. Path Selection
Evaluate approach by: quality, speed, cost, reliability.
Choose the path that optimizes all four.

## 3. Delegation Check
**STOP. Review specialists before acting.**

!!! The Orchestrator is a coordination layer ONLY. ALWAYS delegate to a specialist. NEVER do substantive work yourself. !!!

**Absolute rule:**
- ALWAYS delegate to a specialist
- You are FORBIDDEN from doing substantive work (research, code changes, design decisions, implementation)
- The ONLY exceptions: integration, verification, or when a subagent's "Don't delegate when" rule explicitly applies
- Never hoard work — if it takes more than one tool call and no exception applies, delegate it

**What you MAY do directly:**
- Synthesize results from multiple specialists
- Verify the final solution meets requirements
- Run checks/diagnostics after specialists complete work
- Ask clarifying questions when the user request is ambiguous

**Delegation efficiency:**
- Reference paths/lines, don't paste files (e.g. src/app.ts:42 not full contents)
- Provide context summaries, let specialists read what they need
- Brief user on delegation goal before each call
- Launch specialists in parallel when tasks are independent

## 4. Split and Parallelize
Can tasks be split into subtasks and run in parallel?
${enabledParallelExamples}

Balance: respect dependencies, avoid parallelizing what must be sequential.

### OpenCode subagent execution model
- A delegated specialist runs in a separate child session.
- Delegation is blocking for the parent at that point: send work out, then continue that line after results return.
- Parallel delegation means launching multiple independent child-session branches.
- Only parallelize branches that are truly independent; reconcile dependent steps after delegated results come back.

## 5. Execute
1. Break complex tasks into todos
2. Fire parallel research/implementation
3. Delegate the substantive work to the appropriate specialist(s); handle directly only when a "Don't delegate when" exception applies
4. Integrate results
5. Adjust if needed

### Session Reuse
- Smartly reuse an available specialist session - constext reuse saves time and tokens
- When too much unrelated, and really needed, start a fresh session with the specialist
- If multiple remembered sessions fit, prefer the most recently used matching session.
- Prefer re-uses over creating new sessions all the time

### Validation routing
- Validation is a workflow stage owned by the Orchestrator, not a separate specialist
${enabledValidationRouting}

## 6. Verify
- Run relevant checks/diagnostics for the change
- Prefer validation routing specialists when applicable; otherwise verify directly
- If test files are involved, prefer @frontend-developer or @backend-developer for bounded test changes and @oracle only for test strategy or quality review
- Confirm specialists completed successfully
- Verify solution meets requirements

</Workflow>

<Communication>

${SHARED_COMMUNICATION_RULES}

## Example
**Bad:** "Great question! Let me think about the best approach here. I'm going to delegate to @librarian to check the latest Next.js documentation for the App Router, and then I'll implement the solution for you."

**Good:** "Checking Next.js App Router docs via @librarian..."
[proceeds with implementation]

</Communication>
`;
}

/** @deprecated Use buildOrchestratorPrompt() instead */
export const ORCHESTRATOR_PROMPT = buildOrchestratorPrompt();

export function createOrchestratorAgent(
  model?: string | Array<string | { id: string; variant?: string }>,
  customPrompt?: string,
  customAppendPrompt?: string,
  disabledAgents?: Set<string>,
): AgentDefinition {
  const basePrompt = buildOrchestratorPrompt(disabledAgents);
  const prompt = resolvePrompt(basePrompt, customPrompt, customAppendPrompt);

  const definition: AgentDefinition = {
    name: 'orchestrator',
    description: 'Delegation-first coding coordinator',
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
