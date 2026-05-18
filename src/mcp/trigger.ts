import type { LocalMcpConfig } from './types';

/**
 * Trigger.dev MCP - Trigger.dev task management and configuration
 *
 * Provides access to Trigger.dev task definitions, schedules, runs, and
 * environment management via the Trigger.dev CLI's built-in MCP server.
 *
 * @see https://trigger.dev/docs/mcp
 *
 * Caveat: The `LocalMcpConfig` type does not natively support a startup
 * timeout field. If the MCP server times out during initialization (common
 * for first-time npx downloads), increase the global MCP timeout in your
 * OpenCode config or manually run `npx trigger.dev@latest mcp` first to
 * warm the npx cache.
 */
export const trigger: LocalMcpConfig = {
  type: 'local',
  command: ['npx', 'trigger.dev@latest', 'mcp', '--readonly'],
};
