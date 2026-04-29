# Installation Guide

Complete installation instructions for oh-my-openkei.

Published package page: https://www.npmjs.com/package/oh-my-openkei

## Table of Contents

- [For Humans](#for-humans)
- [For LLM Agents](#for-llm-agents)
- [Troubleshooting](#troubleshooting)
- [Uninstallation](#uninstallation)

---

## For Humans

### Prerequisites

- OpenCode installed and working
- `bunx` available on your machine

### Quick Install

Run the interactive installer:

```bash
bunx oh-my-openkei@latest install
```

Or use non-interactive mode:

```bash
bunx oh-my-openkei@latest install --no-tui --skills=yes
```

See the package page for the published install command and latest README:

- https://www.npmjs.com/package/oh-my-openkei

### Configuration Options

The installer supports the following options:

| Option | Description |
|--------|-------------|
| `--skills=yes|no` | Install recommended and bundled skills (default: yes) |
| `--no-tui` | Non-interactive mode |
| `--dry-run` | Simulate install without writing files |
| `--reset` | Force overwrite of existing configuration |

### Non-Destructive Behavior

By default, the installer is non-destructive. If an `oh-my-openkei.json` configuration file already exists, the installer will **not** overwrite it. Instead, it will display a message:

```
[i] Configuration already exists at ~/.config/opencode/oh-my-openkei.json. Use --reset to overwrite.
```

To force overwrite of your existing configuration, use the `--reset` flag:

```bash
bunx oh-my-openkei@latest install --reset
```

**Note:** When using `--reset`, the installer creates a `.bak` backup file before overwriting, so your previous configuration is preserved.

### After Installation

The installer generates a mixed-provider preset by default. To switch providers or build a different mixed setup, use **[Configuration Reference](configuration.md)** for the full option reference and **[$30 Preset](thirty-dollars-preset.md)** for a smaller mixed-provider example.

Then:

```bash
opencode auth login
# Select your provider and complete OAuth flow
```

```bash
opencode models --refresh
```

Open your generated config at `~/.config/opencode/oh-my-openkei.json`
and adjust models if needed.

Then run OpenCode and verify the agents:

```text
ping all agents
```

> **💡 Tip: Models are fully customizable.** The installer sets sensible defaults, but you can assign *any* model to *any* agent. Edit `~/.config/opencode/oh-my-openkei.json` (or `.jsonc` for comments support) to override models, adjust reasoning effort, or disable agents entirely.

### Alternative: Ask Any Coding Agent

Paste this into Claude Code, AmpCode, Cursor, or any coding agent:

```
Install and configure oh-my-openkei by following:
https://www.npmjs.com/package/oh-my-openkei
```

---

## For LLM Agents

If you're an LLM Agent helping set up oh-my-openkei, follow these steps.

### Step 1: Check OpenCode Installation

```bash
opencode --version
```

If not installed, direct the user to https://opencode.ai/docs first.

### Step 2: Run the Installer

The installer generates the mixed-provider default preset:

```bash
bunx oh-my-openkei@latest install --no-tui --skills=yes
```

**Examples:**
```bash
# Non-interactive with default skills
bunx oh-my-openkei@latest install --no-tui --skills=yes

# Non-interactive without skills
bunx oh-my-openkei@latest install --no-tui --skills=no

# Force overwrite existing configuration
bunx oh-my-openkei@latest install --reset
```

The installer automatically:
- Adds the plugin to `~/.config/opencode/opencode.json`
- Disables default OpenCode agents
- Generates agent model mappings in `~/.config/opencode/oh-my-openkei.json` (or `.jsonc`)
- Installs recommended and bundled skills when `--skills=yes`

### Step 3: Authenticate with Providers

Ask user to run the following command. Don't run it yourself, it requires user interaction.

```bash
opencode auth login
# Select your provider and complete OAuth flow
```

### Step 4: Verify Installation

Ask the user to:

1. Authenticate: `opencode auth login`
2. Refresh models: `opencode models --refresh`
3. Start OpenCode: `opencode`
4. Run: `ping all agents`

Verify all agents respond successfully.

**Crucial Advice for the User:**
- They can easily assign **different models to different agents** by editing `~/.config/opencode/oh-my-openkei.json` (or `.jsonc`).
- If they want to add a different provider later (Kimi, GitHub Copilot, ZAI), they can update this file manually. See **[Configuration Reference](configuration.md)** and **[$30 Preset](thirty-dollars-preset.md)** for examples.
- Read the generated `~/.config/opencode/oh-my-openkei.json` (or `.jsonc`) file to understand the current configuration.

---

## Troubleshooting

### Installer Fails

Check the expected config format:
```bash
bunx oh-my-openkei@latest install --help
```

Then manually create the config files at:
- `~/.config/opencode/oh-my-openkei.json` (or `.jsonc`)

### Configuration Already Exists

If the installer reports that the configuration already exists, you have two options:

1. **Keep existing config**: The installer will skip the configuration step and continue with other operations (like adding the plugin or installing skills).

2. **Reset configuration**: Use `--reset` to overwrite:
   ```bash
   bunx oh-my-openkei@latest install --reset
   ```
   A `.bak` backup file will be created automatically.

### Agents Not Responding

1. Check your authentication:
   ```bash
   opencode auth status
   ```

2. Verify your config file exists and is valid:
   ```bash
   cat ~/.config/opencode/oh-my-openkei.json
   ```

3. Check that your provider is configured in `~/.config/opencode/opencode.json`

### Authentication Issues

If providers are not working:

1. Check your authentication status:
   ```bash
   opencode auth status
   ```

2. Re-authenticate if needed:
   ```bash
   opencode auth login
   ```

3. Verify your config file has the correct provider configuration:
   ```bash
   cat ~/.config/opencode/oh-my-openkei.json
   ```

### Editor Validation

Add a `$schema` reference to your config for autocomplete and inline validation:

```jsonc
{
  "$schema": "https://unpkg.com/oh-my-openkei@latest/oh-my-openkei.schema.json",
  // your config...
}
```

Works in VS Code, Neovim (with `jsonls`), and any editor that supports JSON Schema. Catches typos and wrong nesting immediately.

---

## Uninstallation

1. **Remove the plugin from your OpenCode config**:

   Edit `~/.config/opencode/opencode.json` and remove `"oh-my-openkei"` from the `plugin` array.

2. **Remove configuration files (optional)**:
   ```bash
   rm -f ~/.config/opencode/oh-my-openkei.json
   rm -f ~/.config/opencode/oh-my-openkei.json.bak
   ```

3. **Remove skills (optional)**:
   ```bash
   npx skills remove agent-browser
   rm -rf ~/.config/opencode/skills/simplify
   rm -rf ~/.config/opencode/skills/codemap
   ```
