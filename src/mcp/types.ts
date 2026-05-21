// MCP types - McpName is defined in config/schema.ts to avoid duplication

/**
 * OAuth authentication configuration for an MCP server.
 */
export type McpOAuthConfig = {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
};

export type RemoteMcpConfig = {
  type: 'remote';
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  oauth?: McpOAuthConfig | false;
};

export type LocalMcpConfig = {
  type: 'local';
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

export type McpConfig = RemoteMcpConfig | LocalMcpConfig;
