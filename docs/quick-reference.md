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
| **Planner** | Interview-first planner — asks clarifying questions and returns structured `<planner-plan>` output |
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
