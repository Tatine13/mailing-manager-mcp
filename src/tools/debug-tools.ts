import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AppConfig } from '../core/types.js';

export function registerDebugTools(server: McpServer, config: AppConfig): void {
  server.tool(
    'get_server_info',
    'Get server version, configuration and environment information (Debug Mode Only)',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            version: config.version,
            build_timestamp: new Date().toISOString(),
            environment: {
              node: process.version,
              platform: process.platform,
              pid: process.pid
            },
            config: {
              transport: config.transport,
              logLevel: config.logging.level,
              webhooks: config.webhooks.enabled,
              scheduler: config.tasks.schedulerEnabled
            },
            features: {
              tunneling: true,
              interactive_mode: true
            }
          }, null, 2)
        }]
      };
    }
  );
}
