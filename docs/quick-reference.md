# Quick Reference

> This page is an index. Each topic has its own dedicated guide.

## 🚀 Getting Started

| Doc | Contents |
|-----|----------|
| [Installation Guide](installation.md) | CLI commands and flags, `--reset`, auth, troubleshooting, update checking |

## ✨ Features

| Doc | Contents |
|-----|----------|
| [Council Agent](council.md) | Multi-LLM consensus, presets, role prompts, timeouts |
| [Codemap Skill](codemap.md) | Hierarchical codemap generation |

### Primary Agents

| Agent | Role |
|-------|------|
| **Orchestrator** | Default primary — delegates ALL substantive work to specialists; acts directly only for integration, verification, or when a subagent's "Don't delegate when" rule applies |
| **Planner** | Interview-first planner — delegates exploration/research to specialists; produces structured `<planner-plan>` output after mandatory user interview |
| **Sprinter** | Fast self-executing agent — optimized for quick Q&A and direct tasks |

## ⚙️ Config & Reference

| Doc | Contents |
|-----|----------|
| [Skills](skills.md) | `simplify`, `agent-browser`, `codemap`, `vercel-react-best-practices`, `backend-developer`, `karpathy-guidelines` — skills assignment syntax |
| [MCPs](mcps.md) | `websearch`, `context7`, `grep_app`, `figma`, `serena` — permissions per agent, global disable |
| [Tools](tools.md) | Background tasks, LSP, code search (`ast_grep`), formatters |
| [Configuration](configuration.md) | Config files, prompt overriding, JSONC, full option reference table |

## 💡 Example Presets

| Doc | Contents |
|-----|----------|
| [$30 Preset](thirty-dollars-preset.md) | Budget mixed-provider example with the current agent roster |
