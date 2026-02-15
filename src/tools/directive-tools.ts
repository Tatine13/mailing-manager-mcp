import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DirectiveEngine } from '../directives/directive-engine.js';
import { DirectiveTypeSchema, ConditionFieldSchema, ConditionOperatorSchema, ActionTypeSchema } from '../core/types.js';
import { ConnectionPool } from '../email/connection-pool.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerDirectiveTools(
  server: McpServer,
  directiveEngine: DirectiveEngine,
  connectionPool: ConnectionPool,
  isVaultReady: () => boolean
): void {

  server.tool(
    'create_directive',
    'Create an automation directive (rule)',
    {
      account_id: z.string().uuid().describe('Account ID'),
      name: z.string().min(1).describe('Directive name'),
      type: DirectiveTypeSchema.describe('Type (inbound/outbound)'),
      priority: z.number().int().default(100).describe('Priority (lower runs first)'),
      condition_field: ConditionFieldSchema.describe('Field to check'),
      condition_operator: ConditionOperatorSchema.describe('Operator'),
      condition_value: z.string().describe('Value to match'),
      action_type: ActionTypeSchema.describe('Action to take'),
      action_params: z.string().optional().describe('JSON string of action parameters')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        let actionParams = {};
        if (args.action_params) {
          try { actionParams = JSON.parse(args.action_params); } catch { /* ignore */ }
        }

        const directive = directiveEngine.create({
          accountId: args.account_id,
          name: args.name,
          description: '',
          type: args.type,
          priority: args.priority,
          active: true,
          trigger: {
            conditions: [{
              field: args.condition_field,
              operator: args.condition_operator,
              value: args.condition_value,
              caseSensitive: false
            }],
            matchAll: true
          },
          actions: [{
            type: args.action_type,
            parameters: actionParams
          }]
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Directive created!\nID: ${directive.id}\nName: ${directive.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create directive: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_directives',
    'List directives for an account',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      const directives = directiveEngine.listByAccount(account_id);

      if (directives.length === 0) {
        return { content: [{ type: 'text', text: 'No directives found.' }] };
      }

      const list = directives.map(d =>
        `• ${d.name} (Priority: ${d.priority}) [${d.active ? '✅' : '⏸️'}] — ID: ${d.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📋 Directives (${directives.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'test_directive',
    'Test which directives match a specific email',
    {
      account_id: z.string().uuid().describe('Account ID'),
      email_id: z.string().describe('Email UID'),
      folder: z.string().optional().default('INBOX')
    },
    async ({ account_id, email_id, folder }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const imap = await connectionPool.getImap(account_id);
        const email = await imap.readEmail(folder, parseInt(email_id, 10));

        if (!email) {
          return { content: [{ type: 'text', text: 'Email not found.' }], isError: true };
        }

        const allDirectives = directiveEngine.listByAccount(account_id);
        const matching = directiveEngine.evaluateEmail(email, allDirectives);

        if (matching.length === 0) {
          return { content: [{ type: 'text', text: 'No directives matched this email.' }] };
        }

        const list = matching.map(d => `✅ ${d.name} (ID: ${d.id})`).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🎯 Matching Directives:\n\n${list}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Error: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_directive',
    'Delete a directive',
    {
      directive_id: z.string().uuid()
    },
    async ({ directive_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      directiveEngine.delete(directive_id);
      return { content: [{ type: 'text', text: '✅ Directive deleted.' }] };
    }
  );
}
