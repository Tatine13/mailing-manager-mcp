import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { WebhookManager } from '../webhooks/webhook-manager.js';
import { WebhookProviderSchema, WebhookActionTypeSchema, WebhookEventSchema } from '../core/types.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerWebhookTools(
  server: McpServer,
  webhookManager: WebhookManager,
  isVaultReady: () => boolean
): void {

  server.tool(
    'create_inbound_webhook',
    'Create an endpoint to receive external webhooks',
    {
      name: z.string().min(1).describe('Webhook name'),
      endpoint: z.string().min(1).describe('URL path (e.g. /my-hook)'),
      provider: WebhookProviderSchema.describe('Provider (gmail, custom, etc)'),
      action_type: WebhookActionTypeSchema.describe('Action to trigger'),
      account_id: z.string().uuid().optional().describe('Associated account ID')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const webhook = webhookManager.createInbound({
          name: args.name,
          description: '',
          endpoint: args.endpoint,
          provider: args.provider,
          accountId: args.account_id,
          active: true,
          actions: [{
            type: args.action_type,
            parameters: {}
          }]
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Inbound webhook created!\nID: ${webhook.id}\nEndpoint: ${webhook.endpoint}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'create_outbound_webhook',
    'Create a webhook to notify external systems',
    {
      name: z.string().min(1).describe('Webhook name'),
      url: z.string().url().describe('Target URL'),
      event: WebhookEventSchema.describe('Event to trigger on (e.g. email.received)'),
      secret_header_name: z.string().optional().default('X-Webhook-Secret')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const webhook = webhookManager.createOutbound({
          name: args.name,
          description: '',
          url: args.url,
          method: 'POST',
          events: [args.event],
          headers: {},
          payload: { format: 'json', maxPayloadSizeBytes: 1024 * 1024, includeRawEmail: false },
          retry: { enabled: true, maxAttempts: 3, backoffMs: 5000 },
          active: true
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Outbound webhook created!\nID: ${webhook.id}\nTarget: ${webhook.url}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_webhooks',
    'List configured webhooks',
    {},
    async () => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      const inbound = webhookManager.listInbound();
      const outbound = webhookManager.listOutbound();

      let text = `📡 Webhooks Configured:\n\n`;

      text += `📥 Inbound (${inbound.length}):\n`;
      text += inbound.map(w => `• ${w.name} (${w.endpoint}) [${w.triggerCount} triggers]`).join('\n') || 'None';

      text += `\n\n📤 Outbound (${outbound.length}):\n`;
      text += outbound.map(w => `• ${w.name} (${w.url}) [${w.successCount} ok / ${w.failureCount} fail]`).join('\n') || 'None';

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'webhook_logs',
    'View execution logs for a webhook',
    {
      webhook_id: z.string().uuid()
    },
    async ({ webhook_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      const logs = webhookManager.getWebhookLogs(webhook_id, 10);
      
      if (logs.length === 0) {
        return { content: [{ type: 'text', text: 'No logs found.' }] };
      }

      const list = logs.map((l: any) => 
        `[${l.created_at}] ${l.status.toUpperCase()} (${l.response_status || '-'}) - ${l.duration_ms}ms${l.error_message ? '\nError: ' + l.error_message : ''}`
      ).join('\n');

      return { content: [{ type: 'text', text: `📝 Last 10 executions:\n\n${list}` }] };
    }
  );
}
