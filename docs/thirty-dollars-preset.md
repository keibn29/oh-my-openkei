# $30 Preset

This is a budget mixed-provider example for people who want a capable setup without mirroring the installer defaults exactly.

Provider pricing changes often, so treat "$30" as a rough target rather than a guaranteed bill.

---

## The Config

```jsonc
{
  "preset": "thirtydollars",
  "presets": {
    "thirtydollars": {
      "orchestrator": { "model": "openai/gpt-5.5", "skills": ["*"], "mcps": ["*", "!context7"] },
      "planner": { "model": "openai/gpt-5.5", "skills": ["*"], "mcps": ["*", "!context7"] },
      "sprinter": { "model": "openai/gpt-5.3-codex", "variant": "low", "skills": ["*"], "mcps": ["*", "!context7"] },
      "oracle": { "model": "openai/gpt-5.5", "variant": "high", "skills": ["simplify"], "mcps": [] },
      "council": { "model": "openai/gpt-5.5", "variant": "xhigh", "skills": [], "mcps": [] },
      "librarian": { "model": "openai/gpt-5.4-mini", "variant": "low", "skills": [], "mcps": ["websearch", "context7", "grep_app"] },
      "explorer": { "model": "openai/gpt-5.4-mini", "variant": "low", "skills": [], "mcps": ["serena"] },
      "designer": { "model": "github-copilot/gemini-3.1-pro-preview", "skills": ["agent-browser"], "mcps": ["figma"] },
      "frontend-developer": { "model": "openai/gpt-5.4-mini", "variant": "low", "skills": ["vercel-react-best-practices", "karpathy-guidelines"], "mcps": [] },
      "backend-developer": { "model": "openai/gpt-5.4-mini", "variant": "low", "skills": ["backend-developer", "karpathy-guidelines"], "mcps": [] }
    }
  },
  "council": {
    "presets": {
      "default": {
        "alpha": { "model": "github-copilot/claude-sonnet-4.6" },
        "beta": { "model": "github-copilot/gemini-3.1-pro-preview" },
        "gamma": { "model": "openai/gpt-5.5" }
      }
    }
  }
}
```

### Notes

- `frontend-developer` and `backend-developer` include their current default skills.
- `sprinter` is included because it is a first-class primary agent in the current codebase.
- `observer` is omitted here because it is disabled by default unless you explicitly enable it.
