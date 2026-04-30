#!/usr/bin/env bun
import { checkUpdate } from './check-update';
import { install } from './install';
import type { BooleanArg, InstallArgs } from './types';
import { getInstalledPluginVersion } from './version';

function parseArgs(args: string[]): InstallArgs {
  const result: InstallArgs = {
    tui: true,
    skills: 'yes',
  };

  for (const arg of args) {
    if (arg === '--no-tui') {
      result.tui = false;
    } else if (arg.startsWith('--skills=')) {
      result.skills = arg.split('=')[1] as BooleanArg;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--reset') {
      result.reset = true;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printVersion(): void {
  const version = getInstalledPluginVersion() ?? 'unknown';
  console.log(`oh-my-openkei v${version}`);
}

function printHelp(): void {
  console.log(`
oh-my-openkei CLI

Usage: bunx oh-my-openkei <command> [OPTIONS]

Commands:
  install               Install or update oh-my-openkei configuration (default)
  check-update          Check if a newer version is available

Options:
  --skills=yes|no        Install recommended and bundled skills (default: yes)
  --no-tui               Non-interactive mode
  --dry-run              Simulate install without writing files
  --reset                Force overwrite of existing configuration
  --version              Show version information
  -h, --help             Show this help message

The installer generates a mixed-provider preset as the default configuration,
using OpenAI, MiniMax, Kimi, and DeepSeek models across agents.
For the full config reference, see docs/configuration.md.

Examples:
  bunx oh-my-openkei install
  bunx oh-my-openkei install --no-tui --skills=yes
  bunx oh-my-openkei install --reset
  bunx oh-my-openkei check-update
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle global flags first (--version, --help)
  if (args.includes('--version')) {
    printVersion();
    process.exit(0);
  }

  if (args.length === 0 || args[0] === 'install') {
    const hasSubcommand = args[0] === 'install';
    const installArgs = parseArgs(args.slice(hasSubcommand ? 1 : 0));
    const exitCode = await install(installArgs);
    process.exit(exitCode);
  } else if (args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  } else if (args[0] === 'check-update') {
    const exitCode = await checkUpdate();
    process.exit(exitCode);
  } else {
    console.error(`Unknown command: ${args[0]}`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
