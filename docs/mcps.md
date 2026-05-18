# MCP Servers

Built-in Model Context Protocol (MCP) servers ship with oh-my-openkei and give agents access to external tools — web search, library documentation, and code search.

---

## Built-in MCPs

| MCP | Purpose | Endpoint |
|-----|---------|----------|
| `websearch` | Real-time web search via Exa AI | `https://mcp.exa.ai/mcp` |
| `context7` | Official library documentation (up-to-date) | `https://mcp.context7.com/mcp` |
| `grep_app` | GitHub code search via grep.app | `https://mcp.grep.app` |
| `figma` | Design file access and management | `https://mcp.figma.com/mcp`¹ |
| `serena` | Semantic code exploration and editing | `uvx --from git+https://github.com/oraios/serena serena start-mcp-server` |
| `atlassian` | Read-only access to Confluence and Jira | `https://mcp.atlassian.com/v1/mcp?capabilities=READ_JIRA,SEARCH_JIRA,READ_CONFLUENCE,SEARCH_CONFLUENCE`² |
| `trigger` | Trigger.dev task management and configuration | `npx trigger.dev@latest mcp --readonly`³ |

> ¹ Figma MCP requires the Figma desktop app to be running with **local MCP** enabled. Open Figma Desktop → Settings → Enable local MCP server.
> 
> ² Atlassian MCP uses OAuth authentication. To open the browser and complete the OAuth flow with Atlassian, run command `opencode mcp auth atlassian`.
> 
> ³ The `trigger` MCP runs as a local subprocess via `npx`. First invocation may be slow due to npx caching. Run `npx trigger.dev@latest mcp --readonly` once beforehand to warm the cache. The current MCP type does not support a configurable startup timeout.

---

## Default Permissions Per Agent

| Agent | Default MCPs |
|-------|-------------|
| `orchestrator` | `*`, `!context7` |
| `planner` | `*`, `!context7` |
| `sprinter` | `*`, `!context7` |
| `librarian` | `websearch`, `context7`, `grep_app`, `atlassian` |
| `designer` | `figma` |
| `oracle` | none |
| `debugger` | none |
| `explorer` | `serena` |
| `frontend-developer` | none |
| `backend-developer` | none |
| `trigger-developer` | `trigger` |
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
        "mcps": ["websearch", "context7", "grep_app", "atlassian"]
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
