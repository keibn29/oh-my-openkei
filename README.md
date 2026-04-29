# oh-my-openkei

**Open Multi Agent Suite** · Mix any models · Auto delegate tasks

by **Kei** · [boringdystopia.ai](https://boringdystopia.ai/) · [X @alvinunreal](https://x.com/alvinunreal) · [Telegram](https://t.me/boringdystopiadevelopment)

---

## What's This Plugin

oh-my-openkei is an agent orchestration plugin for OpenCode. It includes a built-in team of specialized agents that scout codebases, look up documentation, review architecture, handle UI work, and execute implementation tasks under one orchestrator.

Instead of forcing one model to do everything, the plugin routes each part of the job to the best-suited agent, balancing **quality, speed, and cost**.

To explore the agents, see **[Meet the Pantheon](#meet-the-pantheon)**. For the full feature set, see **[Features & Workflows](#features-and-workflows)**.

---

### Quick Start

Copy and paste this prompt to your LLM agent:

```
Install and configure oh-my-openkei: https://raw.githubusercontent.com/keibn29/oh-my-openkei/refs/heads/master/README.md
```

### Manual Installation

```bash
bunx oh-my-openkei@latest install
```

### Getting Started

The installer generates a mixed-provider preset by default, using `openai/gpt-5.4-fast` / `openai/gpt-5.5-fast` for Orchestrator and Planner, `openai/gpt-5.3-codex` (`low`) for Sprinter, `minimax-coding-plan/MiniMax-M2.7` for librarian/explorer, and `opencode-go/kimi-k2.6` / `opencode-go/deepseek-v4-flash` for specialist agents.

1. **Log in to providers**:
   ```bash
   opencode auth login
   ```
2. **Refresh available models**:
   ```bash
   opencode models --refresh
   ```
3. **Open your plugin config** at `~/.config/opencode/oh-my-openkei.json`
4. **Update the models you want for each agent**

> [!TIP]
> Want to understand how automatic delegation works in practice? Review the **[Orchestrator prompt](https://github.com/keibn29/oh-my-openkei/blob/master/src/agents/orchestrator.ts#L28)** — it contains the delegation rules, specialist routing logic, and the delegation-first operating model for the main agent.

The default generated configuration:

```jsonc
{
  "$schema": "https://unpkg.com/oh-my-openkei@latest/oh-my-openkei.schema.json",
  "preset": "default",
  "presets": {
    "default": {
      "orchestrator": { "model": "openai/gpt-5.4-fast", "variant": "xhigh", "skills": ["*"], "mcps": ["*", "!context7"] },
      "planner": { "model": "openai/gpt-5.5-fast", "variant": "xhigh", "skills": ["*"], "mcps": ["*", "!context7"] },
      "sprinter": { "model": "openai/gpt-5.3-codex", "variant": "low", "skills": ["*"], "mcps": ["*", "!context7"] },
      "oracle": { "model": "openai/gpt-5.5-fast", "variant": "high", "skills": ["simplify"], "mcps": [] },
      "council": { "model": "openai/gpt-5.4-fast", "variant": "xhigh", "skills": [], "mcps": [] },
      "librarian": { "model": "minimax-coding-plan/MiniMax-M2.7", "skills": [], "mcps": ["websearch", "context7", "grep_app"] },
      "explorer": { "model": "minimax-coding-plan/MiniMax-M2.7", "skills": [], "mcps": [] },
      "designer": { "model": "opencode-go/kimi-k2.6", "skills": ["agent-browser"], "mcps": [] },
      "frontend-developer": { "model": "opencode-go/deepseek-v4-flash", "skills": ["vercel-react-best-practices", "karpathy-guidelines"], "mcps": [] },
      "backend-developer": { "model": "opencode-go/deepseek-v4-flash", "skills": ["backend-developer", "karpathy-guidelines"], "mcps": [] }
    }
  }
}
```

Session management is enabled by default even though it is not shown in the starter config. See **[Session Management](docs/session-management.md)** if you want to customize how many resumable child-agent sessions are remembered.

### For Alternative Providers

To use Kimi, GitHub Copilot, ZAI Coding Plan, or a mixed-provider setup, use **[Configuration](docs/configuration.md)** for the full reference. For ready-made starting points, check the **[Author's Preset](docs/authors-preset.md)** and **[$30 Preset](docs/thirty-dollars-preset.md)** — the `$30` preset is the best cheap setup.

The configuration guide also covers custom subagents via `agents.<name>`, where you can define both a normal `prompt` and an `orchestratorPrompt` block for delegation.

You can also mix and match any models per agent. For model suggestions, see the **Recommended Models** listed under each agent below.

### ✅ Verify Your Setup

After installation and authentication, verify all agents are configured and responding:

```bash
opencode
```

Then run:

```
ping all agents
```

If any agent fails to respond, check your provider authentication and config file.

---

<a id="meet-the-pantheon"></a>

## 🏛️ Meet the Pantheon

### Primary Agents

**Orchestrator**, **Planner**, and **Sprinter** are the primary agents. You choose which one to use based on your workflow. All other agents are subagents delegated to by the primary when needed.

- **Orchestrator** (default): Delegation-first coordinator. Handles intake, planning, routing, and result integration. Falls back to direct work only when no suitable subagent exists.
- **Planner**: Mandatory-interview planning specialist. Always asks at least one clarifying question before producing any plan, gathers requirements through structured questioning, produces plans wrapped in `<planner-plan>` tags (or saves to a file when requested), and delegates research/clarification to subagents. Does not implement code itself. If the user specifies a plan structure, Planner follows it; otherwise it uses the default (Summary, Key Changes, Public Interfaces, Test Plan, Assumptions). Best for ambiguous or high-stakes work where careful upfront planning pays off.
- **Sprinter**: Fast self-executing primary agent. Optimized for quick Q&A, light coding tasks, and direct execution with minimal thinking overhead. Does not delegate to subagents — handles everything directly itself.

#### Interaction Flow

```
User / OpenCode → Primary Agent (Orchestrator, Planner, or Sprinter)
                        │
      ┌─────────────────┼─────────────────┐
      ▼                 ▼                 ▼
  Explorer          Oracle           Librarian
  (scout)        (architecture)    (research)
      │                 │                 │
      └─────────────────┼─────────────────┘
                        ▼
                   ┌─────────┐
                   │ Designer│
                   │ (UI/UX) │
                   └────┬────┘
                  ┌─────┴─────┐
                  ▼           ▼
            Frontend      Backend
            Developer     Developer

On-demand (not auto-delegated): Council · Observer
```

#### Orchestrator

**Role:** Master delegator and strategic coordinator  
**Prompt:** [orchestrator.ts](src/agents/orchestrator.ts)  
**Default Model:** `openai/gpt-5.5`  
**Recommended Models:** `openai/gpt-5.5`, `anthropic/claude-opus-4.6`  
**Model Guidance:** Choose your strongest coordination model. Orchestrator should excel at routing, delegation discipline, judgment, and reliable instruction-following; direct implementation ability is still useful, but mainly as a fallback when no suitable subagent exists.

#### Planner

**Role:** Mandatory-interview planning specialist — always asks at least one clarifying question before producing any plan, gathers requirements through structured questioning, produces `<planner-plan>` wrapped plans (or saves to a file when requested), follows user-specified structure or defaults to Summary/Key Changes/Public Interfaces/Test Plan/Assumptions, delegates research, does not implement
**Prompt:** [planner.ts](src/agents/planner.ts)
**Default Model:** `openai/gpt-5.5`  
**Recommended Models:** `openai/gpt-5.5`, `anthropic/claude-opus-4.6`  
**Model Guidance:** Choose your strongest all-around coding model. Planner drives planning and delegation, so it needs excellent judgment, structured thinking, and reliable instruction-following. Implementation ability is not required.

#### Sprinter

**Role:** Fast self-executing primary agent for quick Q&A and direct task execution  
**Prompt:** [sprinter.ts](src/agents/sprinter.ts)  
**Default Model:** `openai/gpt-5.3-codex` (`low`)  
**Recommended Models:** `openai/gpt-5.3-codex`, `github-copilot/grok-code-fast-1`, `kimi-for-coding/k2p5`  
**Model Guidance:** Choose a fast, low-latency model. Sprinter handles everything directly and does not delegate — use it when you want direct answers and quick execution rather than heavy planning or delegation.

---

### Subagents

The following agents are delegated to by the primary agents based on task type.

#### Explorer

**Role:** Codebase reconnaissance  
**Prompt:** [explorer.ts](src/agents/explorer.ts)  
**Default Model:** `openai/gpt-5.4-mini`  
**Recommended Models:** `cerebras/zai-glm-4.7`, `fireworks-ai/accounts/fireworks/routers/kimi-k2p5-turbo`, `openai/gpt-5.4-mini`  
**Model Guidance:** Choose a fast, low-cost model. Explorer handles broad scouting work, so speed and efficiency usually matter more than using your strongest reasoning model.

#### Oracle

**Role:** Strategic advisor and debugger of last resort  
**Prompt:** [oracle.ts](src/agents/oracle.ts)  
**Default Model:** `openai/gpt-5.5` (high)  
**Recommended Models:** `openai/gpt-5.5` (high), `google/gemini-3.1-pro-preview` (high)  
**Model Guidance:** Choose your strongest high-reasoning model for architecture, hard debugging, trade-offs, and code review.

---

### Supporting Agents

#### Council

> [!NOTE]
> **Why doesn't Orchestrator auto-call Council more often?** This is intentional. Council runs multiple models at once, so automatic delegation is kept strict because it is usually the highest-cost path in the system. In practice, Council is meant to be used manually when you want it, for example: `@council compare these two architectures`.

**Role:** Multi-LLM consensus and synthesis  
**Prompt:** [council.ts](src/agents/council.ts)  
**Guide:** [docs/council.md](docs/council.md)  
**Default Setup:** Config-driven — councillors come from `council.presets` and the Council agent model comes from your normal `council` agent config  
**Recommended Setup:** Strong Council model + diverse councillors across providers  
**Model Guidance:** Use a strong synthesis model for the Council agent and diverse models as councillors. The value of Council comes from comparing different model perspectives, not just picking the single strongest model everywhere.

#### Librarian

**Role:** External knowledge retrieval  
**Prompt:** [librarian.ts](src/agents/librarian.ts)  
**Default Model:** `openai/gpt-5.4-mini`  
**Recommended Models:** `cerebras/zai-glm-4.7`, `fireworks-ai/accounts/fireworks/routers/kimi-k2p5-turbo`, `openai/gpt-5.4-mini`  
**Model Guidance:** Choose a fast, low-cost model. Librarian handles research and documentation lookups, so speed and efficiency usually matter more than using your strongest reasoning model.

#### Designer

**Role:** UI/UX direction, layout/interaction decisions, visual polish, and accessibility judgment  
**Prompt:** [designer.ts](src/agents/designer.ts)  
**Default Model:** `openai/gpt-5.4-mini`  
**Recommended Models:** `google/gemini-3.1-pro-preview`, `kimi-for-coding/k2p5`  
**Model Guidance:** Choose a model strong at UI/UX direction, layout/interaction judgment, visual polish, and design decision-making. Designer serves as the spec/decision authority; implementation work with clear direction goes to `@frontend-developer`.

#### Frontend Developer

**Role:** Client-side implementation and frontend tests — executes what @designer decides  
**Prompt:** [frontend-developer.ts](src/agents/frontend-developer.ts)  
**Default Model:** `openai/gpt-5.4-mini`  
**Recommended Models:** `google/gemini-3.1-pro-preview`, `kimi-for-coding/k2p5`  
**Model Guidance:** Choose a model strong at client-side implementation, component architecture, and styling execution. Receives bounded frontend tasks from Orchestrator once design direction is established.

#### Backend Developer

**Role:** Backend implementation specialist  
**Prompt:** [backend-developer.ts](src/agents/backend-developer.ts)  
**Default Model:** `openai/gpt-5.4-mini`  
**Recommended Models:** `cerebras/zai-glm-4.7`, `fireworks-ai/accounts/fireworks/routers/kimi-k2p5-turbo`, `openai/gpt-5.4-mini`  
**Model Guidance:** Choose a fast, reliable coding model for routine backend tasks. Receives bounded server-side tasks from Orchestrator such as API implementation, database work, and service logic changes.

#### Observer

> [!NOTE]
> **Why a separate agent?** If your Orchestrator model is not multimodal, enable Observer to handle images, screenshots, PDFs, and other visual files. Observer is disabled by default and gives the Orchestrator a dedicated multimodal reader without forcing you to change your main reasoning model. Set `disabled_agents: []` and an `observer` model in your configuration.

**Role:** Read-only visual analysis — interprets images, screenshots, PDFs, and diagrams. Returns structured observations to the orchestrator without loading raw file bytes into the main context window.

- Images, screenshots, diagrams → `read` tool (native image support)
- PDFs and binary documents → `read` tool (text + structure extraction)
- **Disabled by default** — enable with `"disabled_agents": []` and configure a vision-capable model

**Prompt:** [observer.ts](src/agents/observer.ts)  
**Default Model:** `openai/gpt-5.4-mini` — configure a vision-capable model to enable  
**Model Guidance:** Choose a vision-capable model if you want the agent to read screenshots, images, PDFs, and other visual files.

---

<a id="features-and-workflows"></a>

## 📚 Documentation

Use this section as a map: start with installation, then jump to features, configuration, or example presets depending on what you need.

### 🚀 Start Here

| Doc | What it covers |
|-----|----------------|
| **[Installation Guide](docs/installation.md)** | Install the plugin, use CLI flags, reset config, and troubleshoot setup |

### ✨ Features & Workflows

| Doc | What it covers |
|-----|----------------|
| **[Council](docs/council.md)** | Run multiple models in parallel and synthesize a single answer with `@council` |
| **[Session Management](docs/session-management.md)** | Reuse recent child-agent sessions with short aliases instead of starting over |
| **[Codemap](docs/codemap.md)** | Generate hierarchical codemaps to understand large codebases faster |

### ⚙️ Config & Reference

| Doc | What it covers |
|-----|----------------|
| **[Configuration](docs/configuration.md)** | Config file locations, JSONC support, prompt overrides, and full option reference |
| **[Maintainer Guide](docs/maintainers.md)** | Issue triage rules, label meanings, support routing, and repo maintenance workflow |
| **[Skills](docs/skills.md)** | Built-in and recommended skills such as `simplify`, `agent-browser`, and `codemap` |
| **[MCPs](docs/mcps.md)** | `websearch`, `context7`, `grep_app`, and how MCP permissions work per agent |
| **[Tools](docs/tools.md)** | Built-in tool capabilities like `webfetch`, LSP tools, code search, and formatters |

### 💡 Example Presets

| Doc | What it covers |
|-----|----------------|
| **[Author's Preset](docs/authors-preset.md)** | The author's daily mixed-provider setup |
| **[$30 Preset](docs/thirty-dollars-preset.md)** | A budget mixed-provider setup for around $30/month |

---

## 🏛️ Contributors

Thanks to all the builders, debuggers, writers, and wanderers who have earned their place in the pantheon. Every merged contribution leaves a mark on the realm.

[View all 44 contributors on GitHub](https://github.com/keibn29/oh-my-openkei/graphs/contributors)

---

## 📄 License

MIT

---
