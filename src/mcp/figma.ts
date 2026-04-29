import type { RemoteMcpConfig } from './types';

/**
 * Figma MCP - design file access and management
 * @see https://www.figma.com/developers/mcp
 */
export const figma: RemoteMcpConfig = {
  type: 'remote',
  url: 'http://127.0.0.1:3845/mcp',
};
