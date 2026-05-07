# MiniMax Coding Plan Preset

This preset configures all agents to use the same model:
`minimax-coding-plan/MiniMax-M2.7`.

---

## The Config

```jsonc
{
  "$schema": "https://unpkg.com/oh-my-openkei@latest/oh-my-openkei.schema.json",
  "preset": "default",
  "presets": {
    "default": {
      "orchestrator": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["*"],
        "mcps": ["*", "!context7"]
      },
      "planner": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["*"],
        "mcps": ["*", "!context7"]
      },
      "sprinter": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["*"],
        "mcps": ["*", "!context7"]
      },
      "oracle": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["simplify", "requesting-code-review"],
        "mcps": []
      },
      "debugger": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": [],
        "mcps": []
      },
      "council": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": [],
        "mcps": []
      },
      "librarian": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": [],
        "mcps": ["websearch", "context7", "grep_app", "atlassian"]
      },
      "explorer": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": [],
        "mcps": []
      },
      "designer": {
        "model": "opencode-go/kimi-k2.6",
        "skills": ["agent-browser"],
        "mcps": ["figma"]
      },
      "frontend-developer": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["vercel-react-best-practices", "karpathy-guidelines"],
        "mcps": ["figma"]
      },
      "backend-developer": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["backend-developer", "karpathy-guidelines"],
        "mcps": []
      },
      "business-analyst": {
        "model": "minimax-coding-plan/MiniMax-M2.7",
        "skills": ["*"],
        "mcps": ["*", "!context7"]
      }
    }
  }
}
```

### Notes

- All listed agents use `minimax-coding-plan/MiniMax-M2.7`.
- Existing skill and MCP assignments are preserved.
- `observer` is omitted because it is disabled by default unless explicitly enabled.
