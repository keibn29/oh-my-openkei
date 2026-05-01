# MCP Servers

Built-in Model Context Protocol (MCP) servers ship with oh-my-openkei and give agents access to external tools — web search, library documentation, and code search.

---

## Built-in MCPs

| MCP | Purpose | Endpoint |
|-----|---------|----------|
| `websearch` | Real-time web search via Exa AI | `https://mcp.exa.ai/mcp` |
| `context7` | Official library documentation (up-to-date) | `https://mcp.context7.com/mcp` |
| `grep_app` | GitHub code search via grep.app | `https://mcp.grep.app` |
| `figma` | Design file access and management | `https://mcp.figma.com/mcp` |
| `serena` | Semantic code exploration and editing | `uvx --from git+https://github.com/oraios/serena serena start-mcp-server` |

---

## Default Permissions Per Agent

| Agent | Default MCPs |
|-------|-------------|
| `orchestrator` | `*`, `!context7` |
| `planner` | `*`, `!context7` |
| `sprinter` | `*`, `!context7` |
| `librarian` | `websearch`, `context7`, `grep_app` |
| `designer` | `figma` |
| `oracle` | none |
| `debugger` | none |
| `explorer` | `serena` |
| `frontend-developer` | none |
| `backend-developer` | none |
 | `councillor` | none |

---

## Configuring MCP Access

Control which MCPs each agent can use via the `mcps` array in your preset config (`~/.config/opencode/oh-my-openkei.json` or `.jsonc`):

| Syntax | Meaning |
|--------|---------|
| `["*"]` | All MCPs |
| `["*", "!context7"]` | All MCPs except `context7` |
| `["websearch", "context7"]` | Only listed MCPs |
| `[]` | No MCPs |
| `["!*"]` | Deny all MCPs |

**Rules:**
- `*` expands to all available MCPs
- `!item` excludes a specific MCP
- Conflicts (e.g. `["a", "!a"]`) → deny wins

**Example:**

```json
{
  "presets": {
    "my-preset": {
      "orchestrator": {
        "mcps": ["*", "!context7"]
      },
      "sprinter": {
        "mcps": ["*", "!context7"]
      },
      "librarian": {
        "mcps": ["websearch", "context7", "grep_app"]
      },
      "oracle": {
        "mcps": ["*", "!websearch"]
      },
      "frontend-developer": {
        "mcps": []
      },
      "backend-developer": {
        "mcps": []
      }
    }
  }
}
```

---

## Disabling MCPs Globally

To disable specific MCPs for all agents regardless of preset, add them to `disabled_mcps` at the root of your config:

```json
{
  "disabled_mcps": ["websearch"]
}
```

This is useful when you want to cut external network calls entirely (e.g. air-gapped environments or cost control).
