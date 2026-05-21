import type { RemoteMcpConfig } from './types';

/**
 * Atlassian Rovo MCP - read-only access to Confluence and Jira
 * @see https://mcp.atlassian.com
 */
export const atlassian: RemoteMcpConfig = {
  type: 'remote',
  url: 'https://mcp.atlassian.com/v1/mcp?capabilities=READ_JIRA,SEARCH_JIRA,READ_CONFLUENCE,SEARCH_CONFLUENCE',
};
