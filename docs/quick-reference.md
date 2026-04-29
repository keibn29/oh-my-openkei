# Quick Reference

> This page is an index. Each topic has its own dedicated guide.

## 🚀 Getting Started

| Doc | Contents |
|-----|----------|
| [Installation Guide](installation.md) | CLI flags, `--reset`, auth, troubleshooting |

## ✨ Features

| Doc | Contents |
|-----|----------|
| [Council Agent](council.md) | Multi-LLM consensus, presets, role prompts, timeouts |
| [Codemap Skill](codemap.md) | Hierarchical codemap generation |

### Primary Agents

| Agent | Role |
|-------|------|
| **Orchestrator** | Default primary — delegation-first coordinator for planning, routing, integration, and fallback execution |
| **Planner** | Mandatory-interview planning specialist — always asks at least one clarifying question before any plan, produces `<planner-plan>...</planner-plan>` wrapped plans (or saves to file), delegates research/clarification, does not implement |
| **Sprinter** | Fast self-executing specialist — handles Q&A and tasks directly, prioritizes speed over delegation |

## ⚙️ Config & Reference

| Doc | Contents |
|-----|----------|
| [Skills](skills.md) | `simplify`, `agent-browser`, `codemap`, `vercel-react-best-practices`, `backend-developer`, `karpathy-guidelines` — skills assignment syntax |
| [MCPs](mcps.md) | `websearch`, `context7`, `grep_app` — permissions per agent, global disable |
| [Tools](tools.md) | Background tasks, LSP, code search (`ast_grep`), formatters |
| [Configuration](configuration.md) | Config files, prompt overriding, JSONC, full option reference table |

## 💡 Author's Setup

| Doc | Contents |
|-----|----------|
| [Author's Preset](authors-preset.md) | The exact config the author runs daily — OpenAI + Fireworks AI + GitHub Copilot |
