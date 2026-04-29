import type { LocalMcpConfig } from './types';

/**
 * Serena - semantic code exploration and editing
 * @see https://github.com/oraios/serena
 */
export const serena: LocalMcpConfig = {
  type: 'local',
  command: [
    'uvx',
    '--from',
    'git+https://github.com/oraios/serena',
    'serena',
    'start-mcp-server',
    '--context',
    'ide',
    '--project-from-cwd',
  ],
};
