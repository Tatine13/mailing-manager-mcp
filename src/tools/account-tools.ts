import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AccountManager } from '../accounts/account-manager.js';
import { ConnectionPool } from '../email/connection-pool.js';
import { SecureInput } from '../secure-input/index.js';
import { getAllProviderPresets, addProviderPreset } from '../accounts/presets.js';
import { AuthMethodSchema } from '../core/types.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set the MAILING_MANAGER_MASTER_KEY (or MAILING_MANAGER_UNLOCK_CODE) environment variable in your MCP client config and restart the server. Use the vault_status tool for details.';

export function registerAccountTools(
  server: McpServer,
  accountManager: AccountManager,
  connectionPool: ConnectionPool,
  secureInput: SecureInput,
  isVaultReady: () => boolean
): void {

  server.tool(
    'add_provider_preset',
    'Add or update an email provider preset (IMAP/SMTP template)',
    {
      name: z.string().describe('Display name (e.g. My Company Mail)'),
      provider: z.string().describe('Unique identifier (e.g. mycompany)'),
      imap_host: z.string().describe('IMAP server host'),
      imap_port: z.number().int().default(993),
      imap_tls: z.boolean().default(true),
      smtp_host: z.string().describe('SMTP server host'),
      smtp_port: z.number().int().default(587),
      smtp_tls: z.boolean().default(true),
      auth_methods: z.array(AuthMethodSchema).default(['password', 'app-password']),
      notes: z.string().optional()
    },
    async (args) => {
      // No vault lock required for presets, as they are not encrypted data
      try {
        await addProviderPreset({
          name: args.name,
          provider: args.provider,
          imap: { host: args.imap_host, port: args.imap_port, tls: args.imap_tls },
          smtp: { host: args.smtp_host, port: args.smtp_port, tls: args.smtp_tls },
          supportedAuth: args.auth_methods as any,
          notes: args.notes
        });
        return {
          content: [{
            type: 'text',
            text: `✅ Provider preset "${args.name}" (${args.provider}) saved successfully.`
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
    'list_provider_presets',
    'List all available email provider presets (IMAP/SMTP templates)',
    {},
    async () => {
      const presets = getAllProviderPresets();
      const list = presets.map(p => 
        `• ${p.name} (${p.provider})\n  IMAP: ${p.imap.host}:${p.imap.port}\n  SMTP: ${p.smtp.host}:${p.smtp.port}\n  Auth: ${p.supportedAuth.join(', ')}`
      ).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `📧 Provider Presets:\n\n${list}\n\nUse these identifiers with add_account.`
        }]
      };
    }
  );

  server.tool(
    'add_account',
    'Add a new email account. Choose the setup method that fits your context.',
    {
      method: z.enum(['direct', 'link_local', 'link_public']).default('link_public').describe('Setup method: "direct" (pass creds), "link_local" (localhost url), "link_public" (tunnel url)'),
      email: z.string().email().optional().describe('Email address (Required for direct)'),
      password: z.string().optional().describe('Password (Required for direct)'),
      provider: z.string().optional().describe('Email provider or preset name'),
      imapHost: z.string().optional().describe('IMAP host (custom)'),
      imapPort: z.number().int().optional().describe('IMAP port (custom)'),
      smtpHost: z.string().optional().describe('SMTP host (custom)'),
      smtpPort: z.number().int().optional().describe('SMTP port (custom)')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      
      try {
        // METHOD 1: DIRECT (Option B)
        if (args.method === 'direct') {
          if (!args.email || !args.password) {
            throw new Error('Email and Password are required for "direct" method.');
          }
          const account = await accountManager.addAccount({
            email: args.email,
            password: args.password,
            provider: (args.provider as any) || 'custom',
            imapHost: args.imapHost,
            imapPort: args.imapPort,
            smtpHost: args.smtpHost,
            smtpPort: args.smtpPort
          });
          return {
            content: [{ type: 'text', text: `✅ Account ${account.email} added successfully (Direct).` }]
          };
        }

        // METHOD 2 & 3: INTERACTIVE (Option A & C)
        // We configure the ephemeral server based on the requested method
        // Actually, the server always starts both if tunnel is enabled in config,
        // but we will only return the requested URL to the agent to avoid confusion.
        
        let publicUrl: string | null = null;
        let localUrl: string | null = null;
        
        // Start background process
        secureInput.accountSetup(args, (pub, loc) => {
          publicUrl = pub;
          localUrl = loc;
        }).then(async (credentials) => {
          const account = await accountManager.addAccount(credentials);
          getLogger().info({ email: account.email }, 'Account added via interactive setup');
        }).catch(err => {
          getLogger().error({ error: err.message }, 'Interactive setup failed');
        });

        // Wait for URLs
        let attempts = 0;
        while ((!publicUrl && !localUrl) && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 250));
          attempts++;
        }

        if (args.method === 'link_local') {
           if (!localUrl) throw new Error('Failed to generate local URL.');
           return {
             content: [{
               type: 'text',
               text: `🏠 LOCAL SETUP\n\nOpen this link on the host machine:\n${localUrl}`
             }]
           };
        }

        if (args.method === 'link_public') {
           if (!publicUrl) throw new Error('Failed to generate public tunnel URL. Check internet connection or fallback to "link_local".');
           return {
             content: [{
               type: 'text',
               text: `🌍 PUBLIC SETUP\n\nOpen this link from anywhere:\n${publicUrl}`
             }]
           };
        }

        return { content: [{ type: 'text', text: 'Invalid method.' }], isError: true };

      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Error: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_accounts',
    'List all configured email accounts',
    {
      active_only: z.boolean().optional().describe('Only show active accounts')
    },
    async ({ active_only }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      const accounts = accountManager.listAccounts(active_only || false);

      if (accounts.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No email accounts configured. Use add_account to add one.'
          }]
        };
      }

      const list = accounts.map(a =>
        `• ${a.email} (${a.provider}) [${a.active ? '✅ active' : '⏸️ paused'}] — ID: ${a.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📧 Email Accounts (${accounts.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'remove_account',
    'Remove an email account',
    {
      account_id: z.string().uuid().describe('Account ID to remove')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const account = accountManager.getAccount(account_id);
        if (!account) {
          return {
            content: [{ type: 'text', text: `❌ Account ${account_id} not found` }],
            isError: true
          };
        }

        await connectionPool.removeConnection(account_id);
        accountManager.removeAccount(account_id);

        return {
          content: [{
            type: 'text',
            text: `✅ Account ${account.email} removed successfully.`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'test_connection',
    'Test the connection to an email account',
    {
      account_id: z.string().uuid().describe('Account ID to test')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const account = accountManager.getAccount(account_id);
        if (!account) {
          return {
            content: [{ type: 'text', text: `❌ Account ${account_id} not found` }],
            isError: true
          };
        }

        const imap = await connectionPool.getImap(account_id);
        const folders = await imap.listFolders();

        return {
          content: [{
            type: 'text',
            text: `✅ Connection successful for ${account.email}\n\nFolders found: ${folders.map(f => f.name).join(', ')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ Connection failed: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    }
  );
}
