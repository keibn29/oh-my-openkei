/**
 * Shared agent content for primary agents (orchestrator and planner).
 *
 * Contains:
 * - Specialist description catalog with {owner} placeholder for primary-agent-specific stats
 * - Shared communication rules text
 * - Shared skill requirement text for agents that use skills
 * - Helper for rendering filtered specialist list for a given allowed set
 */

/**
 * Mandatory skill loading instruction for subagents.
 * Subagents must load all available (permission-filtered) skills before work.
 * Primary agents (orchestrator, planner, sprinter) do not use this;
 * business-analyst uses its own custom skill-loading prompt.
 */
export const SUBAGENT_SKILL_REQUIREMENT =
  '**Skills**: If any skills are available to you, they are MANDATORY. Your FIRST action on every user prompt must be to use the `skill` tool to load all available skills. Do NOT begin any substantive work — analysis, planning, coding, or research — until you have loaded and read every available skill. Follow the loaded skill instructions throughout the entire task.';

/**
 * Specialist description catalog.
 * The {owner} placeholder is substituted at render time with the actual primary agent name.
 * Each entry also has a `restrictedTo` field to indicate which primary agent(s) can expose it.
 *
 * For agents with owner-specific variant text (designer), the `description` field holds
 * the text for primary agents with the full delegate set (orchestrator), and
 * `descriptionForOwner` holds the restricted variant (planner — no mention of
 * @frontend-developer or other agents not in Planner's allowed set).
 */
export const SHARED_SPECIALIST_DESCRIPTIONS: Array<{
  name: string;
  restrictedTo: 'orchestrator' | 'planner' | 'both';
  description: string;
  descriptionForOwner?: Record<string, string>;
}> = [
  {
    name: 'explorer',
    restrictedTo: 'both',
    description: `@explorer
- Role: Parallel search specialist for discovering unknowns across the codebase
- Permissions: Read files
- Stats: 2x faster codebase search than {owner}, 1/2 cost of {owner}
- Capabilities: Glob, grep, AST queries to locate files, symbols, patterns
- **Delegate when:** Need to discover what exists before planning • Parallel searches speed discovery • Need summarized map vs full contents • Broad/uncertain scope
- **Don't delegate when:** Know the path and need actual content • Need full file anyway • Single specific lookup • About to edit the file`,
  },
  {
    name: 'librarian',
    restrictedTo: 'both',
    description: `@librarian
- Role: Authoritative source for current library docs and API references
- Permissions: None
- Stats: 10x better finding up-to-date library docs than {owner}, 1/2 cost of {owner}
- Capabilities: Fetches latest official docs, examples, API signatures, version-specific behavior via grep_app MCP
- **Delegate when:** Libraries with frequent API changes (React, Next.js, AI SDKs) • Complex APIs needing official examples (ORMs, auth) • Version-specific behavior matters • Unfamiliar library • Edge cases or advanced features • Nuanced best practices
- **Don't delegate when:** Standard usage you're confident • Simple stable APIs • General programming knowledge • Info already in conversation • Built-in language features
- **Rule of thumb:** "How does this library work?" → @librarian. "How does programming work?" → yourself.`,
  },
  {
    name: 'debugger',
    restrictedTo: 'orchestrator',
    description: `@debugger
- Role: Bug investigation specialist — finds root causes without implementing fixes
- Permissions: Read files
- Stats: 2x faster targeted debugging than {owner}, 1/2 cost of {owner}
- Capabilities: Systematic code tracing, error path analysis, root cause identification, regression tracing
- **Delegate when:** Bug investigation needed • Error/failure diagnosis • Root cause analysis • Understanding unexpected behavior • Regression tracing • Needs investigation before deciding on a fix approach
- **Don't delegate when:** Need search/discovery only (use @explorer) • Fix implementation is the goal (use @frontend-developer or @backend-developer) • Need architectural guidance for a high-risk bug (use @oracle) • Quick known fix (do it directly or use @frontend-developer/@backend-developer)
- **Rule of thumb:** "Why is this broken?" → @debugger. "Where is the thing?" → @explorer. "How should we fix this high-risk issue?" → @oracle. "Fix this" → @frontend-developer or @backend-developer.`,
  },
  {
    name: 'oracle',
    restrictedTo: 'both',
    description: `@oracle
- Role: Strategic advisor and escalation point for high-stakes decisions, unresolved bugs, and code review
- Permissions: Read files
- Stats: 5x better decision maker, problem solver, investigator than {owner}, 0.8x speed of {owner}, same cost.
- Capabilities: Deep architectural reasoning, system-level trade-offs, code review, simplification, maintainability review, escalation for stubborn bugs
- **Delegate when:** Major architectural decisions with long-term impact • Bugs that persist after @debugger investigation • High-risk multi-system refactors • Costly trade-offs (performance vs maintainability) • Security/scalability/data integrity decisions • Genuinely uncertain and cost of wrong choice is high • When a workflow calls for a **reviewer** subagent • Code needs simplification or YAGNI scrutiny
- **Don't delegate when:** Routine decisions you're confident about • First bug investigation (use @debugger) • Straightforward trade-offs • Tactical "how" vs strategic "should" • Time-sensitive good-enough decisions • Quick research/testing can answer
- **Rule of thumb:** Need senior architect review? → @oracle. Need bug investigation? → @debugger first. Need code review or simplification? → @oracle. Just do it and PR? → yourself.`,
  },
  {
    name: 'designer',
    restrictedTo: 'both',
    description: `@designer
- Role: UI/UX decision specialist — owns direction, layout, interaction decisions, accessibility judgment, and visual polish
- Permissions: Read/write files
- Stats: 10x better UI/UX than {owner}
- Capabilities: Visual relevant edits, interactions, responsive layouts, design systems with aesthetic intent, deep UI/UX knowledge
- **Routing rule:** Delegate design/UX decisions to @designer; delegate implementation execution to @frontend-developer
- **Delegate when:** User-facing interfaces needing direction • Responsive layouts • UX-critical components (forms, nav, dashboards) • Visual consistency systems • Animations/micro-interactions • Landing/marketing pages • Refining functional→delightful • Reviewing existing UI/UX quality • Design decisions when spec is unclear
- **Don't delegate when:** Backend/logic with no visual • Quick prototypes where design doesn't matter yet • Large implementation-only tasks where direction is already established (use @frontend-developer instead)
- **Rule of thumb:** Need a design/UX decision? → @designer. Need implementation of an established direction? → @frontend-developer.`,
    descriptionForOwner: {
      planner: `@designer
- Role: UI/UX decision specialist — owns direction, layout, interaction decisions, accessibility judgment, and visual polish
- Permissions: Read/write files
- Stats: 10x better UI/UX than {owner}
- Capabilities: Visual relevant edits, interactions, responsive layouts, design systems with aesthetic intent, deep UI/UX knowledge
- **Delegate when:** User-facing interfaces needing direction • Responsive layouts • UX-critical components (forms, nav, dashboards) • Visual consistency systems • Animations/micro-interactions • Landing/marketing pages • Refining functional→delightful • Reviewing existing UI/UX quality • Design decisions when spec is unclear
- **Don't delegate when:** Backend/logic with no visual • Quick prototypes where design doesn't matter yet
- **Rule of thumb:** Need a design/UX decision? → @designer.`,
    },
  },
  {
    name: 'frontend-developer',
    restrictedTo: 'orchestrator',
    description: `@frontend-developer
- Role: Fast execution specialist for frontend/client-side code — implements what @designer decides
- Permissions: Read/write files
- Stats: 2x faster code edits, 1/2 cost of {owner}, 0.8x quality of {owner}
- Tools/Constraints: Execution-focused—no research, no architectural decisions
- **Routing rule:** @designer owns UI/UX decisions; @frontend-developer owns client-side implementation execution
- **Decision vs Execution precedence:**
  1. UI/UX decisions, spec refinement, layout/interaction/polish judgment, accessibility judgment, and UI/UX review → @designer FIRST
  2. Once direction is clear: client-side implementation and frontend tests → @frontend-developer
- **Domain scope:** Components, client state, routing, styling, forms, browser-facing behavior, frontend tests
- **Delegate when:** Any client-side implementation work once direction is clear • Small or large frontend changes • Writing or updating frontend tests • Tasks that touch frontend components, styling, or client-side logic. Parallelization benefits: Task involves multiple folders and multiple files modification, scoping work per folder and spawning parallel @frontend-developers for each folder.
- **Don't delegate when:** Needs discovery/research/decisions • Backend/server-side work (use @backend-developer) • Needs a design/UX decision first (route to @designer instead)
- **Stop short when:** UX/visual direction, interaction intent, styling direction, or UX expectations are ambiguous — do not decide autonomously; hand back to {owner} to route through @designer first`,
  },
  {
    name: 'backend-developer',
    restrictedTo: 'orchestrator',
    description: `@backend-developer
- Role: Fast execution specialist for backend/server-side code
- Permissions: Read/write files
- Stats: 2x faster code edits, 1/2 cost of {owner}, 0.8x quality of {owner}
- Tools/Constraints: Execution-focused—no research, no architectural decisions
- **Domain scope:** APIs, services, DB/schema/migrations, auth/permissions, jobs, CLI/server code, backend tests
- **Delegate when:** Any backend/server-side implementation work • Small or large backend changes • Writing or updating backend tests • Tasks that touch APIs, databases, or server-side logic. Parallelization benefits: Task involves multiple folders and multiple files modification, scoping work per folder and spawning parallel @backend-developers for each folder.
- **Don't delegate when:** Needs discovery/research/decisions • Frontend/client-side work (use @frontend-developer)
- **Rule of thumb:** Server/data code? → @backend-developer. Client/UI code? → @frontend-developer. Strategy/review instead of execution? → @oracle.`,
  },
  {
    name: 'council',
    restrictedTo: 'orchestrator',
    description: `@council
- Role: Multi-LLM consensus engine that runs several councillors, synthesizes their views, and returns a structured council report.
- Permissions: Read files
- Stats: 3x slower than {owner}, 3x or more cost of {owner}
- Capabilities: Runs multiple models in parallel, compares their answers, resolves disagreements, and produces a final synthesized answer plus councillor details and consensus summary.
- **Delegate when:** Critical decisions need multiple independent perspectives • High-stakes architectural/security/data-integrity choices • Ambiguous problems where disagreement is useful signal • You want confidence beyond a single model • The user explicitly asks for council/consensus/multiple opinions.
- **Don't delegate when:** Straightforward tasks you're confident about • Speed matters more than confidence • Routine implementation/debugging • A single specialist is clearly the right tool • You only need current docs/search/code review rather than multi-model consensus.
- **How to call:** Send the full question/task and relevant context. Be explicit about what decision, trade-off, or answer the council should resolve. Do not ask council to do routine code edits.
- **Result handling:** Council returns a structured response that may include: synthesized Council Response, individual Councillor Details, and Council Summary/confidence. Preserve that structure when the user asked for council output. Do not pretend the council only returned a final answer. If you need to act on the council result, first briefly state the council's recommendation, then proceed.
- **Rule of thumb:** Need second/third opinions from different models? → @council. Need one expert agent or direct execution? → use the specialist or yourself.`,
  },
  {
    name: 'observer',
    restrictedTo: 'orchestrator',
    description: `@observer
- Role: Visual analysis specialist for images, PDFs, and diagrams
- Permissions: Read files
- Stats: Saves main context tokens — Observer processes raw files, returns structured observations
- Capabilities: Interprets images, screenshots, PDFs, and diagrams via native read tool; extracts UI elements, layouts, text, relationships
- **Delegate when:** Need to analyze a multimedia file• Extract information
- **Don't delegate when:** Plain text files that Read can handle directly • Files that need editing afterward (need literal content from Read)
- **Rule of thumb:** Even if your model supports vision, delegate visual analysis to @observer — it isolates large image/PDF bytes from your context window, returning only concise structured text. Need exact file contents for editing? → Read it yourself.
- **IMPORTANT:** When delegating to @observer, always include the **full file path** in the prompt so it can read the file. Example: "Analyze the screenshot at /path/to/file.png — describe the UI elements and error messages."`,
  },
  {
    name: 'councillor',
    restrictedTo: 'orchestrator',
    description: `@councillor
- Role: Internal specialist used by @council for multi-LLM consensus
- Permissions: Read files
- Note: Do not call @councillor directly; use @council instead`,
  },
];

/**
 * Render the specialist list for a given primary agent and allowed set.
 * Filters by both the allowed set (which agents this primary can delegate to)
 * and the disabledAgents set (which agents are currently disabled).
 * Substitutes {owner} placeholder with the actual primary agent name.
 */
export function renderSpecialists(
  primaryAgent: string,
  allowedSet: readonly string[],
  disabledAgents?: Set<string>,
): string {
  const allowedSet_lower = new Set(allowedSet.map((a) => a.toLowerCase()));

  return SHARED_SPECIALIST_DESCRIPTIONS.filter((s) => {
    // Skip if this specialist is not allowed for this primary agent
    if (s.restrictedTo !== 'both' && s.restrictedTo !== primaryAgent) {
      return false;
    }
    // Skip if this specialist is not in the allowed set
    if (!allowedSet_lower.has(s.name.toLowerCase())) {
      return false;
    }
    // Skip if disabled
    if (disabledAgents?.has(s.name)) {
      return false;
    }
    return true;
  })
    .map((s) => {
      const text = s.descriptionForOwner?.[primaryAgent] ?? s.description;
      return text.replace(/\{owner\}/g, primaryAgent);
    })
    .join('\n\n');
}

/**
 * Shared prompt fragments appended to all applicable agent prompts.
 * Contains common behavioral instructions that apply broadly.
 * Add new shared fragments here as the prompt architecture evolves.
 */
export const SHARED_SUBAGENT_PROMPT_FRAGMENTS =
  'When you need to ask the user a question, you MUST use the `question` tool. Do NOT ask questions as a normal chat message and then wait for the user to answer in a follow-up prompt.';

/**
 * Shared communication rules text used by all primary agents.
 */
export const SHARED_COMMUNICATION_RULES = `## Asking Questions
${SHARED_SUBAGENT_PROMPT_FRAGMENTS}

## Clarity Over Assumptions
- If request is vague or has multiple valid interpretations, ask a targeted question before proceeding
- Don't guess at critical details (file paths, API choices, architectural decisions)
- Do make reasonable assumptions for minor details and state them briefly

## Concise Execution
- Answer directly, no preamble
- Don't summarize what you did unless asked
- Don't explain code unless asked
- One-word answers are fine when appropriate
- Brief delegation notices: "Checking docs via @librarian..." not "I'm going to delegate to @librarian because..."

## No Flattery
Never: "Great question!" "Excellent idea!" "Smart choice!" or any praise of user input.

## Honest Pushback
When user's approach seems problematic:
- State concern + alternative concisely
- Ask if they want to proceed anyway
- Don't lecture, don't blindly implement`;
