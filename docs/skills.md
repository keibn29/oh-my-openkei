# Skills

Skills are specialized capabilities you can assign to agents. Unlike MCPs (which are running servers), skills are **prompt-based tool configurations** — instructions injected into an agent's system prompt that describe how to use a particular tool.

Skills are installed via the `oh-my-openkei` installer. External skills can also be installed manually with `npx skills add`.

---

## Available Skills

### Recommended (via installer)

| Skill | Description | Assigned to by default |
|-------|-------------|----------------------|
| [`agent-browser`](#agent-browser) | High-performance browser automation | `designer` |

### Bundled in repo

| Skill | Description | Assigned to by default |
|-------|-------------|----------------------|
| [`simplify`](#simplify) | Behavior-preserving code simplification | `oracle` |
| [`codemap`](#codemap) | Repository codemap generation | `orchestrator`, `planner` |
| [`vercel-react-best-practices`](#vercel-react-best-practices) | React and Next.js performance guidelines | `frontend-developer` |
| [`backend-developer`](#backend-developer) | Clean architecture and Python/FastAPI patterns | `backend-developer` |
| [`karpathy-guidelines`](#karpathy-guidelines) | LLM coding pitfall guidelines | `frontend-developer`, `backend-developer` |

---

## simplify

**Behavior-preserving simplification for readability and maintainability.**

`simplify` is a bundled skill for clarity-focused refactoring without behavior changes. It helps `oracle` reduce unnecessary complexity, improve naming and structure, and keep simplification work scoped and reviewable.

By default, this skill is assigned to `oracle`, which owns code review, maintainability review, and simplification guidance. The `orchestrator` should route simplification requests to `oracle` instead of handling them as a top-level specialty itself.

Source: adapted from Addy Osmani's `code-simplification` skill and bundled locally as `simplify`.

---

## agent-browser

**External browser automation for visual verification and testing.**

`agent-browser` provides full high-performance browser automation. It allows agents to browse the web, interact with page elements, take screenshots, and verify visual state — useful for UI/UX work, end-to-end testing, and researching live documentation.

---

## codemap

**Automated repository mapping through hierarchical codemaps.**

`codemap` empowers the Orchestrator or Planner to build and maintain a deep architectural understanding of any codebase. Instead of reading thousands of lines of code on every task, agents refer to hierarchical `codemap.md` files describing the *why* and *how* of each directory.

**How to use:** Ask the primary agent to `run codemap`. It automatically detects whether to initialize a new map or update an existing one.

**Why it's useful:**
- **Instant onboarding** — understand unfamiliar codebases in seconds
- **Efficient context** — agents read architectural summaries, saving tokens and improving accuracy
- **Change detection** — only modified folders are re-analyzed
- **Timeless documentation** — focuses on high-level design, not implementation details

See **[Codemap Skill](codemap.md)** for full documentation including manual commands and technical details.

---

## vercel-react-best-practices

**React and Next.js performance optimization guidelines from Vercel Engineering.**

`vercel-react-best-practices` is a bundled skill containing 68 rules across 8 categories for writing high-performance React and Next.js applications. It helps `frontend-developer` apply Vercel's engineering guidelines for bundle optimization, server-side performance, client-side data fetching, and re-render optimization.

By default, this skill is assigned to `frontend-developer`, which handles client-side implementation work.

Source: bundled locally from Vercel's engineering guidelines.

---

## backend-developer

**Senior backend developer skill with clean architecture and Python/FastAPI patterns.**

`backend-developer` is a bundled skill containing comprehensive backend development guidelines including layered architecture (Repository → Service → API), dependency injection, SOLID principles, and production-grade patterns. It helps `backend-developer` apply consistent architectural standards when implementing server-side logic.

By default, this skill is assigned to `backend-developer`.

Source: bundled locally.

---

## karpathy-guidelines

**Inspired by Andrej Karpathy's observations on LLM coding pitfalls.**

`karpathy-guidelines` is a bundled skill containing four core principles: Think Before Coding, Simplicity First, Surgical Changes, and Goal-Driven Execution. It helps reduce overcomplication, unnecessary rewrites, and common LLM coding mistakes.

By default, this skill is assigned to both `frontend-developer` and `backend-developer`.

Source: inspired by Andrej Karpathy's guidelines, bundled locally.

---

## Skills Assignment

Control which skills each agent can use in `~/.config/opencode/oh-my-openkei.json` (or `.jsonc`):

For `frontend-developer` and `backend-developer`, any skills available after this filtering are treated as **mandatory workflow instructions**. Those agents are prompted to load every available skill via the `skill` tool before doing substantive work.

| Syntax | Meaning |
|--------|---------|
| `["*"]` | All installed skills |
| `["*", "!agent-browser"]` | All skills except `agent-browser` |
| `["simplify"]` | Only `simplify` |
| `[]` | No skills |
| `["!*"]` | Deny all skills |

**Rules:**
- `*` expands to all available installed skills
- `!item` excludes a specific skill
- Conflicts (e.g. `["a", "!a"]`) → deny wins (principle of least privilege)

**Example:**

```json
{
  "presets": {
    "my-preset": {
      "orchestrator": {
        "skills": ["codemap"]
      },
      "planner": {
        "skills": ["codemap"]
      },
      "oracle": {
        "skills": ["simplify"]
      },
      "designer": {
        "skills": ["agent-browser"]
      },
      "frontend-developer": {
        "skills": ["vercel-react-best-practices", "karpathy-guidelines"]
      },
      "backend-developer": {
        "skills": ["backend-developer", "karpathy-guidelines"]
      }
    }
  }
}
```
