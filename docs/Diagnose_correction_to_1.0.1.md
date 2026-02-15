Diagnostic et Corrections du MCP mcp-mails
🔍 Diagnostic
L'erreur MCP error -32000: Connection closed signifie que le processus du serveur MCP se termine avant de compléter le handshake JSON-RPC.

Cause racine — L'ordre d'initialisation dans src/core/server.ts :

text

bin/server.ts → main()
  → server.initialize()     ← appelle ensureMasterKey() qui BLOQUE ou CRASH
    → ensureMasterKey()      ← tente d'ouvrir un navigateur OU throw sans env var
      → process.exit(1)      ← le processus meurt
  → server.start()           ← JAMAIS ATTEINT
    → mcpServer.connect()    ← le transport stdio n'est JAMAIS connecté
Le transport MCP (mcpServer.connect(stdioTransport)) est appelé dans start(), après initialize(). Mais initialize() appelle ensureMasterKey() qui :

Sans MAILING_MANAGER_MASTER_KEY : lance un serveur ephemeral + navigateur → timeout 5min ou crash
Toute erreur → catch dans main() → process.exit(1) → gemini-cli voit "Connection closed"
Problèmes secondaires identifiés :

import ... assert { type: 'json' } — syntaxe dépréciée (Node.js 22+)
getLogger() appelé au top-level des modules avant configuration
pino-pretty peut ne pas être disponible (devDependency vs dependency)
Chemin des migrations fragile après bundling
🔧 Fichiers corrigés
1. src/core/server.ts — Restructuration critique
TypeScript

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigManager } from './config.js';
import { EventBus, getEventBus } from './event-bus.js';
import { DatabaseManager } from '../storage/database.js';
import { EncryptionService } from '../security/encryption.js';
import { AccountManager } from '../accounts/account-manager.js';
import { ConnectionPool } from '../email/connection-pool.js';
import { PersonaManager } from '../personas/persona-manager.js';
import { DirectiveEngine } from '../directives/directive-engine.js';
import { TaskEngine } from '../tasks/task-engine.js';
import { WebhookManager } from '../webhooks/webhook-manager.js';
import { WebhookServer } from '../webhooks/webhook-server.js';
import { WebhookDispatcher } from '../webhooks/webhook-dispatcher.js';
import { SecureInput } from '../secure-input/index.js';
import { registerAccountTools } from '../tools/account-tools.js';
import { registerEmailTools } from '../tools/email-tools.js';
import { registerPersonaTools } from '../tools/persona-tools.js';
import { registerDirectiveTools } from '../tools/directive-tools.js';
import { registerTaskTools } from '../tools/task-tools.js';
import { registerWebhookTools } from '../tools/webhook-tools.js';
import { createLogger, getLogger } from '../utils/logger.js';
import { AppConfig } from './types.js';
import { z } from 'zod';

export class MailingManagerServer {
  private mcpServer: McpServer;
  private configManager: ConfigManager;
  private db!: DatabaseManager;
  private encryption!: EncryptionService;
  private accountManager!: AccountManager;
  private connectionPool!: ConnectionPool;
  private personaManager!: PersonaManager;
  private directiveEngine!: DirectiveEngine;
  private taskEngine!: TaskEngine;
  private webhookManager!: WebhookManager;
  private webhookServer!: WebhookServer;
  private webhookDispatcher!: WebhookDispatcher;
  private secureInput!: SecureInput;
  private eventBus: EventBus;
  private config!: AppConfig;
  private vaultUnlocked: boolean = false;
  private transportMode: 'stdio' | 'http' | 'both' = 'stdio';

  constructor(dataDir?: string) {
    this.mcpServer = new McpServer({
      name: 'mailing-manager',
      version: '1.0.0',
    });
    this.configManager = new ConfigManager(dataDir);
    this.eventBus = getEventBus();
  }

  /**
   * Phase 1: Initialize core components (non-blocking, no crypto needed).
   * Creates database, managers, registers tools.
   * Does NOT attempt master key unlock — that happens in start() AFTER transport.
   */
  async initialize(): Promise<void> {
    // Load config
    this.config = await this.configManager.load();

    // Init logger
    createLogger({
      level: this.config.logging.level,
      file: this.config.logging.file
    });

    const logger = getLogger();
    logger.info('Initializing Mailing Manager MCP Server...');

    // Init database
    this.db = new DatabaseManager(this.configManager.getDatabasePath());
    await this.db.initialize();

    // Init encryption service (without master key — set later)
    this.encryption = new EncryptionService();

    // Init secure input
    const isRemote = !process.stdout.isTTY || !!process.env.REMOTE_MODE;
    this.secureInput = new SecureInput(isRemote ? 'remote' : 'local');

    // Init managers — none of these need the master key at construction time.
    // They only need it when performing encrypt/decrypt operations.
    this.accountManager = new AccountManager(this.db, this.encryption);
    this.connectionPool = new ConnectionPool(this.accountManager);
    this.personaManager = new PersonaManager(this.db);
    this.directiveEngine = new DirectiveEngine(this.db);
    this.taskEngine = new TaskEngine(this.db);
    this.webhookManager = new WebhookManager(this.db, this.encryption);
    this.webhookDispatcher = new WebhookDispatcher(this.webhookManager, this.encryption);

    // Register all MCP tools (they'll check vaultUnlocked at call time)
    this.registerAllTools();

    // Setup event bridges
    this.setupEventBridges();

    logger.info('Core initialization complete (vault not yet unlocked)');
  }

  /**
   * Phase 2: Connect transport FIRST, then unlock vault.
   * This ensures the MCP handshake completes before any blocking operation.
   */
  async start(transport: 'stdio' | 'http' | 'both' = 'stdio'): Promise<void> {
    const logger = getLogger();
    this.transportMode = transport;

    // ── STEP 1: Connect MCP transport IMMEDIATELY ──
    // This completes the JSON-RPC handshake so the client doesn't time out.
    if (transport === 'stdio' || transport === 'both') {
      const stdioTransport = new StdioServerTransport();
      await this.mcpServer.connect(stdioTransport);
      logger.info('MCP stdio transport connected');
    }

    // ── STEP 2: Unlock vault (master key) ──
    // Transport is connected, so even if this fails, the server stays up.
    try {
      await this.ensureMasterKey();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'Failed to unlock vault. Tools requiring encryption will return errors.');
      // Do NOT exit — the server is connected. Tools will report the locked state.
    }

    // ── STEP 3: Start background services (only if vault is unlocked) ──
    if (this.config.webhooks.enabled && this.vaultUnlocked) {
      this.webhookServer = new WebhookServer(
        this.config.webhooks,
        this.webhookManager,
        this.encryption
      );
      await this.webhookServer.start();
    }

    if (this.config.tasks.schedulerEnabled && this.vaultUnlocked) {
      this.taskEngine.startScheduler();
    }

    this.connectionPool.start();

    logger.info({
      transport,
      vaultUnlocked: this.vaultUnlocked,
      webhooksEnabled: this.config.webhooks.enabled,
      schedulerEnabled: this.config.tasks.schedulerEnabled
    }, 'Mailing Manager MCP Server started');
  }

  /**
   * Master key handling — adapted for MCP stdio context.
   * In stdio mode without env var: does NOT attempt browser input, stays locked.
   */
  private async ensureMasterKey(): Promise<void> {
    const logger = getLogger();
    const row = this.db.getDb().prepare('SELECT * FROM master_key WHERE id = 1').get() as any;
    const envMasterKey = process.env.MAILING_MANAGER_MASTER_KEY;

    if (!row) {
      // ── First-time setup ──
      logger.info('No master key found. First-time setup required.');

      let password: string | undefined = envMasterKey;

      if (!password) {
        if (this.transportMode === 'stdio') {
          // Can't do interactive input in stdio MCP mode
          logger.warn(
            '🔒 No MAILING_MANAGER_MASTER_KEY environment variable set. ' +
            'The vault is LOCKED. Add this env var to your MCP client configuration and restart.'
          );
          return; // Stay locked — don't crash
        }
        // HTTP or interactive mode — browser-based input is OK
        password = await this.secureInput.masterKeySetup();
      } else {
        logger.info('Using master key from environment variable for initial setup.');
      }

      const { key, salt, config: derivationConfig } = await this.encryption.deriveMasterKey(password);
      const hash = await this.encryption.hashMasterKey(password, salt);

      this.db.getDb().prepare(`
        INSERT INTO master_key (id, salt, hash, derivation_config, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
      `).run(
        salt, hash, JSON.stringify(derivationConfig),
        new Date().toISOString(), new Date().toISOString()
      );

      this.encryption.setMasterKey(key);
      this.vaultUnlocked = true;
      logger.info('Master key created and vault unlocked');

    } else {
      // ── Unlock existing vault ──
      let password: string | undefined = envMasterKey;

      if (!password) {
        if (this.transportMode === 'stdio') {
          logger.warn(
            '🔒 Vault exists but MAILING_MANAGER_MASTER_KEY is not set. ' +
            'The vault is LOCKED. Add this env var to your MCP client configuration and restart.'
          );
          return; // Stay locked — don't crash
        }
        password = await this.secureInput.masterKeyUnlock();
      } else {
        logger.info('Using master key from environment variable for unlock.');
      }

      const isValid = await this.encryption.verifyMasterKey(password, row.hash);
      if (!isValid) {
        throw new Error(
          'Invalid master password. Check the MAILING_MANAGER_MASTER_KEY environment variable.'
        );
      }

      const { key } = await this.encryption.deriveMasterKey(password, row.salt);
      this.encryption.setMasterKey(key);
      this.vaultUnlocked = true;
      logger.info('Master key verified and vault unlocked');
    }
  }

  isVaultUnlocked(): boolean {
    return this.vaultUnlocked;
  }

  private registerAllTools(): void {
    // ── Vault status tool — always works, even when locked ──
    this.mcpServer.tool(
      'vault_status',
      'Check if the server vault is unlocked and ready',
      {},
      async () => {
        const accountCount = this.vaultUnlocked ? this.accountManager.getActiveCount() : 0;
        const status = this.vaultUnlocked
          ? `✅ Vault is UNLOCKED.\n\nActive accounts: ${accountCount}\nScheduler: ${this.config.tasks.schedulerEnabled ? 'enabled' : 'disabled'}\nWebhooks: ${this.config.webhooks.enabled ? 'enabled' : 'disabled'}`
          : `🔒 Vault is LOCKED.\n\nSet the MAILING_MANAGER_MASTER_KEY environment variable in your MCP client configuration and restart the server.\n\nExample for gemini-cli (~/.gemini/settings.json):\n{\n  "mcpServers": {\n    "mcp-mails": {\n      "command": "node",\n      "args": ["${process.argv[1] || '/path/to/server.js'}"],\n      "env": {\n        "MAILING_MANAGER_MASTER_KEY": "your-secure-password"\n      }\n    }\n  }\n}`;

        return { content: [{ type: 'text' as const, text: status }] };
      }
    );

    // ── All other tools — pass vault checker ──
    registerAccountTools(
      this.mcpServer,
      this.accountManager,
      this.connectionPool,
      this.secureInput,
      () => this.vaultUnlocked
    );

    registerEmailTools(
      this.mcpServer,
      this.connectionPool,
      () => this.vaultUnlocked
    );

    registerPersonaTools(
      this.mcpServer,
      this.personaManager,
      () => this.vaultUnlocked
    );

    registerDirectiveTools(
      this.mcpServer,
      this.directiveEngine,
      this.connectionPool,
      () => this.vaultUnlocked
    );

    registerTaskTools(
      this.mcpServer,
      this.taskEngine,
      () => this.vaultUnlocked
    );

    registerWebhookTools(
      this.mcpServer,
      this.webhookManager,
      () => this.vaultUnlocked
    );
  }

  private setupEventBridges(): void {
    const emailEvents: Array<keyof import('./types.js').EventMap> = [
      'email.received', 'email.sent', 'email.deleted',
      'email.moved', 'email.flagged'
    ];

    for (const event of emailEvents) {
      this.eventBus.on(event, (data) => {
        if (!this.vaultUnlocked) return;
        this.webhookDispatcher.dispatch(event as any, data as any).catch(err => {
          getLogger().error({ event, error: err }, 'Webhook dispatch error');
        });
      });
    }

    this.eventBus.on('webhook.received', async (event) => {
      if (!this.vaultUnlocked) return;
      const webhook = this.webhookManager.getInbound(event.webhookId);
      if (!webhook) return;

      for (const action of webhook.actions) {
        try {
          switch (action.type) {
            case 'trigger_task':
              await this.taskEngine.execute(action.parameters.taskId as string);
              break;
            case 'notify':
              await this.webhookDispatcher.dispatch('email.received', event.payload as any);
              break;
          }
        } catch (error) {
          getLogger().error({
            webhookId: webhook.id,
            action: action.type,
            error
          }, 'Webhook action failed');
        }
      }
    });
  }

  async stop(): Promise<void> {
    const logger = getLogger();

    this.taskEngine?.stopScheduler();
    this.connectionPool?.stop();

    if (this.webhookServer) {
      await this.webhookServer.stop();
    }

    this.encryption?.clearMasterKey();
    this.vaultUnlocked = false;
    this.db?.close();

    logger.info('Server stopped');
  }
}
2. src/bin/server.ts — Startup robuste
TypeScript

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: Redirect ALL console output to stderr.
// The MCP SDK uses stdout exclusively for JSON-RPC communication.
// Any stray console.log WILL corrupt the protocol and crash the connection.
// ─────────────────────────────────────────────────────────────────────────────
const originalConsoleLog = console.log;
console.log = console.error;

import { MailingManagerServer } from '../core/server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let transport: 'stdio' | 'http' | 'both' = 'stdio';
  const transportArg = args.find(a => a.startsWith('--transport'));
  if (transportArg) {
    const idx = args.indexOf(transportArg);
    const value = transportArg.includes('=')
      ? transportArg.split('=')[1]
      : args[idx + 1];
    if (value === 'http' || value === 'both' || value === 'stdio') {
      transport = value;
    }
  }

  const dataDir = process.env.MAILING_MANAGER_DATA_DIR || undefined;

  const server = new MailingManagerServer(dataDir);

  // Handle graceful shutdown
  const shutdown = async () => {
    try {
      await server.stop();
    } catch { /* ignore shutdown errors */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Catch unhandled errors to prevent silent crashes
  process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error);
    // Don't exit — keep MCP transport alive if possible
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
    // Don't exit — keep MCP transport alive if possible
  });

  try {
    // Phase 1: Initialize core (non-blocking, no crypto)
    await server.initialize();

    // Phase 2: Connect transport FIRST, then unlock vault
    await server.start(transport);
  } catch (error) {
    console.error('[STARTUP FAILED]', error);
    // If we reach here, the transport was never connected.
    // Exit with error so the MCP client knows to retry.
    process.exit(1);
  }
}

main();
3. src/accounts/presets.ts — Import JSON compatible toutes versions Node.js
TypeScript

import { createRequire } from 'node:module';
import { ProviderPreset } from '../core/types.js';

// createRequire works in ESM and handles JSON natively across all Node.js 18+ versions.
// This avoids the assert/with import attribute compatibility issues.
const require = createRequire(import.meta.url);

let providersConfig: Record<string, any> = {};
try {
  providersConfig = require('../../config/providers.json');
} catch {
  // Config file not found — presets will be empty.
  // This can happen if the config dir is missing after installation.
}

const presets: Map<string, ProviderPreset> = new Map();

for (const [key, value] of Object.entries(providersConfig)) {
  presets.set(key, value as ProviderPreset);
}

export function getProviderPreset(provider: string): ProviderPreset | undefined {
  return presets.get(provider);
}

export function getAllProviderPresets(): ProviderPreset[] {
  return Array.from(presets.values());
}

export function getProviderNames(): string[] {
  return Array.from(presets.keys());
}
4. src/utils/logger.ts — Initialisation robuste avec fallback
TypeScript

import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

export function createLogger(config?: {
  level?: string;
  file?: string;
}): pino.Logger {
  const level = config?.level || process.env.LOG_LEVEL || 'info';

  // In test mode: silent logger
  if (process.env.NODE_ENV === 'test') {
    loggerInstance = pino({ level: 'silent' });
    return loggerInstance;
  }

  const targets: pino.TransportTargetOptions[] = [];

  // Always log to stderr (fd 2) — MCP uses stdout for protocol
  targets.push({
    target: 'pino-pretty',
    options: {
      destination: 2, // stderr
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    },
    level
  });

  // Optional file logging
  if (config?.file) {
    targets.push({
      target: 'pino/file',
      options: { destination: config.file },
      level
    });
  }

  try {
    loggerInstance = pino({
      level,
      transport: { targets }
    });
  } catch {
    // Fallback if pino-pretty is not available (e.g. production install)
    // Write plain JSON to stderr
    loggerInstance = pino(
      { level },
      pino.destination({ dest: 2, sync: true })
    );
  }

  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    // Create a default logger. Will be replaced when createLogger()
    // is called with actual config during server initialization.
    loggerInstance = createLogger();
  }
  return loggerInstance;
}
5. Tous les fichiers src/tools/*.ts — Ajout du guard isVaultReady
Le pattern est identique pour chaque fichier. Je montre le changement pour les 6 fichiers :

src/tools/account-tools.ts
TypeScript

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AccountManager } from '../accounts/account-manager.js';
import { ConnectionPool } from '../email/connection-pool.js';
import { SecureInput } from '../secure-input/index.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set the MAILING_MANAGER_MASTER_KEY environment variable in your MCP client config and restart the server. Use the vault_status tool for details.';

export function registerAccountTools(
  server: McpServer,
  accountManager: AccountManager,
  connectionPool: ConnectionPool,
  secureInput: SecureInput,
  isVaultReady: () => boolean
): void {

  server.tool(
    'add_account',
    'Add a new email account. Opens a secure browser form to enter credentials.',
    {},
    async () => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const credentials = await secureInput.accountSetup();
        const account = await accountManager.addAccount(credentials);
        return {
          content: [{
            type: 'text',
            text: `✅ Account added successfully!\n\nEmail: ${account.email}\nProvider: ${account.provider}\nID: ${account.id}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ Failed to add account: ${(error as Error).message}`
          }],
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
src/tools/email-tools.ts
TypeScript

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConnectionPool } from '../email/connection-pool.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerEmailTools(
  server: McpServer,
  connectionPool: ConnectionPool,
  isVaultReady: () => boolean
): void {

  server.tool(
    'list_emails',
    'List emails from an account folder',
    {
      account_id: z.string().uuid().describe('Account ID'),
      folder: z.string().optional().describe('Folder name, default INBOX'),
      limit: z.number().int().min(1).max(100).optional().describe('Max emails to return'),
      unread_only: z.boolean().optional().describe('Only show unread emails')
    },
    async ({ account_id, folder, limit, unread_only }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const imap = await connectionPool.getImap(account_id);
        const emails = await imap.listEmails(folder || 'INBOX', {
          limit: limit || 20,
          read: unread_only ? false : undefined
        });

        if (emails.length === 0) {
          return { content: [{ type: 'text', text: 'No emails found.' }] };
        }

        const list = emails.map(e => {
          const flag = e.read ? '📖' : '📩';
          const star = e.flagged ? '⭐' : '';
          return `${flag}${star} From: ${e.from.address}\n   Subject: ${e.subject}\n   Date: ${e.date.toISOString()}\n   ID: ${e.id}`;
        }).join('\n\n');

        return {
          content: [{
            type: 'text',
            text: `📧 Emails in ${folder || 'INBOX'} (${emails.length}):\n\n${list}`
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
    'read_email',
    'Read the full content of an email',
    {
      account_id: z.string().uuid().describe('Account ID'),
      email_id: z.string().describe('Email UID'),
      folder: z.string().optional().describe('Folder name, default INBOX')
    },
    async ({ account_id, email_id, folder }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const imap = await connectionPool.getImap(account_id);
        const email = await imap.readEmail(folder || 'INBOX', parseInt(email_id, 10));

        if (!email) {
          return { content: [{ type: 'text', text: 'Email not found.' }], isError: true };
        }

        const text = [
          `From: ${email.from.name || ''} <${email.from.address}>`,
          `To: ${email.to.map(t => t.address).join(', ')}`,
          email.cc ? `CC: ${email.cc.map(c => c.address).join(', ')}` : '',
          `Subject: ${email.subject}`,
          `Date: ${email.date.toISOString()}`,
          `Flags: ${email.flags.join(', ') || 'none'}`,
          `Attachments: ${email.attachments.length}`,
          '',
          '--- Body ---',
          email.body.text || email.body.html || '(empty)'
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'send_email',
    'Send an email from an account',
    {
      account_id: z.string().uuid().describe('Account ID to send from'),
      to: z.array(z.string().email()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (plain text)'),
      html: z.string().optional().describe('Email body (HTML, optional)'),
      cc: z.array(z.string().email()).optional().describe('CC recipients'),
      bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
      reply_to_id: z.string().optional().describe('Message ID to reply to')
    },
    async ({ account_id, to, subject, body, html, cc, bcc, reply_to_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const smtp = await connectionPool.getSmtp(account_id);
        const result = await smtp.sendEmail({
          accountId: account_id,
          to,
          subject,
          body,
          html,
          cc,
          bcc,
          inReplyTo: reply_to_id
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Email sent successfully!\nMessage ID: ${result.messageId}\nTo: ${to.join(', ')}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Send failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'search_emails',
    'Search emails across folders',
    {
      account_id: z.string().uuid().describe('Account ID'),
      query: z.string().optional().describe('Search query (subject/body)'),
      from: z.string().optional().describe('Filter by sender'),
      folder: z.string().optional().describe('Folder to search in'),
      since: z.string().optional().describe('Emails since date (ISO 8601)'),
      limit: z.number().int().min(1).max(100).optional()
    },
    async ({ account_id, query, from: fromFilter, folder, since, limit }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const imap = await connectionPool.getImap(account_id);
        const emails = await imap.listEmails(folder || 'INBOX', {
          subject: query,
          from: fromFilter,
          since: since ? new Date(since) : undefined,
          limit: limit || 20
        });

        if (emails.length === 0) {
          return { content: [{ type: 'text', text: 'No matching emails found.' }] };
        }

        const list = emails.map(e =>
          `• ${e.from.address} — "${e.subject}" (${e.date.toISOString()}) [ID: ${e.id}]`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🔍 Search results (${emails.length}):\n\n${list}`
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
    'move_email',
    'Move an email to another folder',
    {
      account_id: z.string().uuid(),
      email_id: z.string(),
      from_folder: z.string(),
      to_folder: z.string()
    },
    async ({ account_id, email_id, from_folder, to_folder }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const imap = await connectionPool.getImap(account_id);
        await imap.moveEmail(parseInt(email_id, 10), from_folder, to_folder);
        return {
          content: [{ type: 'text', text: `✅ Email moved from ${from_folder} to ${to_folder}` }]
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
    'delete_email',
    'Delete an email',
    {
      account_id: z.string().uuid(),
      email_id: z.string(),
      folder: z.string().optional()
    },
    async ({ account_id, email_id, folder }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const imap = await connectionPool.getImap(account_id);
        await imap.deleteEmail(parseInt(email_id, 10), folder || 'INBOX');
        return {
          content: [{ type: 'text', text: '✅ Email deleted.' }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
src/tools/persona-tools.ts
TypeScript

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PersonaManager } from '../personas/persona-manager.js';
import { PersonaToneSchema, PersonaStyleSchema, ResponseTimeSchema } from '../core/types.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerPersonaTools(
  server: McpServer,
  personaManager: PersonaManager,
  isVaultReady: () => boolean
): void {

  server.tool(
    'create_persona',
    'Create a new AI persona for automated email handling',
    {
      account_id: z.string().uuid().describe('Account ID to associate with'),
      name: z.string().min(1).describe('Persona name'),
      description: z.string().optional().describe('Persona description'),
      tone: PersonaToneSchema.describe('Tone of voice'),
      style: PersonaStyleSchema.describe('Writing style'),
      language: z.string().default('en').describe('Language (en, fr, etc.)'),
      response_time: ResponseTimeSchema.default('within-hour').describe('Target response time')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const persona = personaManager.create({
          accountId: args.account_id,
          name: args.name,
          description: args.description || '',
          personality: {
            tone: args.tone,
            style: args.style,
            language: args.language,
            timezone: 'UTC'
          },
          behavior: {
            responseTime: args.response_time,
            autoReplyEnabled: false,
            priorityKeywords: []
          },
          capabilities: {
            canSend: true,
            canDelete: false,
            canArchive: true,
            canMove: true,
            canForward: true
          },
          active: true
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Persona created successfully!\n\nName: ${persona.name}\nID: ${persona.id}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create persona: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_personas',
    'List all personas for an account',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const personas = personaManager.listByAccount(account_id);

        if (personas.length === 0) {
          return { content: [{ type: 'text', text: 'No personas found for this account.' }] };
        }

        const list = personas.map(p =>
          `• ${p.name} [${p.personality.tone}/${p.personality.style}] — ID: ${p.id}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🤖 Personas (${personas.length}):\n\n${list}`
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
    'update_persona',
    'Update an existing persona',
    {
      persona_id: z.string().uuid().describe('Persona ID'),
      name: z.string().optional(),
      description: z.string().optional(),
      active: z.boolean().optional()
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const updates: any = {};
        if (args.name) updates.name = args.name;
        if (args.description) updates.description = args.description;
        if (args.active !== undefined) updates.active = args.active;

        const persona = personaManager.update(args.persona_id, updates);

        return {
          content: [{
            type: 'text',
            text: `✅ Persona updated successfully: ${persona.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Update failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_persona',
    'Delete a persona',
    {
      persona_id: z.string().uuid().describe('Persona ID')
    },
    async ({ persona_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        personaManager.delete(persona_id);
        return {
          content: [{ type: 'text', text: '✅ Persona deleted.' }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Delete failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
src/tools/directive-tools.ts
TypeScript

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
src/tools/task-tools.ts
TypeScript

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskEngine } from '../tasks/task-engine.js';
import { TaskTypeSchema, TaskScheduleTypeSchema } from '../core/types.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerTaskTools(
  server: McpServer,
  taskEngine: TaskEngine,
  isVaultReady: () => boolean
): void {

  server.tool(
    'create_task',
    'Create a scheduled task',
    {
      account_id: z.string().uuid().describe('Account ID'),
      name: z.string().min(1).describe('Task name'),
      type: TaskTypeSchema.describe('Task type'),
      schedule_type: TaskScheduleTypeSchema.describe('cron/interval/immediate'),
      schedule_value: z.string().describe('Cron expression or seconds'),
      parameters: z.string().optional().describe('JSON parameters')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        let params = {};
        if (args.parameters) {
          try { params = JSON.parse(args.parameters); } catch { /* ignore */ }
        }

        const task = taskEngine.create({
          accountId: args.account_id,
          name: args.name,
          description: '',
          type: args.type,
          schedule: {
            type: args.schedule_type,
            value: args.schedule_value,
            timezone: 'UTC'
          },
          parameters: params,
          status: 'active'
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Task created!\nID: ${task.id}\nName: ${task.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create task: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_tasks',
    'List all tasks',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      const tasks = taskEngine.listByAccount(account_id);

      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks found.' }] };
      }

      const list = tasks.map(t =>
        `• ${t.name} (${t.type}) [${t.status}] — Last: ${t.lastRun || 'never'} — ID: ${t.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📅 Tasks (${tasks.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'execute_task',
    'Manually execute a task immediately',
    {
      task_id: z.string().uuid().describe('Task ID')
    },
    async ({ task_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        await taskEngine.execute(task_id);
        return { content: [{ type: 'text', text: '✅ Task executed successfully.' }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Execution failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_task',
    'Delete a task',
    {
      task_id: z.string().uuid()
    },
    async ({ task_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      taskEngine.delete(task_id);
      return { content: [{ type: 'text', text: '✅ Task deleted.' }] };
    }
  );
}
src/tools/webhook-tools.ts
TypeScript

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
6. tsup.config.ts — Shebang uniquement sur les binaires
TypeScript

import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry (no shebang)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    splitting: false,
    treeshake: true
  },
  // CLI binaries (with shebang)
  {
    entry: {
      'bin/cli': 'src/bin/cli.ts',
      'bin/server': 'src/bin/server.ts'
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false, // Don't clean — index build already ran
    target: 'node18',
    platform: 'node',
    splitting: false,
    treeshake: true,
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
]);
7. src/storage/database.ts — Chemin migrations robuste
TypeScript

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getLogger } from '../utils/logger.js';
import { fileURLToPath } from 'url';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private logger = getLogger();

  constructor(private dbPath: string) {}

  async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    await this.runMigrations();

    this.logger.info({ path: this.dbPath }, 'Database initialized');
  }

  private async runMigrations(): Promise<void> {
    const db = this.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Try multiple possible locations for migrations directory
    const candidates = [
      // Running from source with tsx: src/storage/database.ts → ../../migrations
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations'),
      // Running from dist/bin/server.js (bundled): dist/bin → ../../migrations
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations'),
      // Relative to process.cwd() (project root)
      path.join(process.cwd(), 'migrations'),
    ];

    let migrationsDir: string | null = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        migrationsDir = candidate;
        break;
      }
    }

    if (!migrationsDir) {
      this.logger.warn('Migrations directory not found in any expected location');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      (db.prepare('SELECT filename FROM migrations')
        .all() as Array<{ filename: string }>)
        .map(row => row.filename)
    );

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
      })();

      this.logger.info({ file }, 'Migration applied');
    }
  }

  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('Database closed');
    }
  }

  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }
}
⚙️ Configuration gemini-cli
Ajoutez dans votre fichier de configuration MCP (généralement ~/.gemini/settings.json) :

Option A — Exécution depuis les sources (développement)
JSON

{
  "mcpServers": {
    "mcp-mails": {
      "command": "npx",
      "args": ["tsx", "/home/fkomp/Bureau/oracle/tools/mcp-mails/src/bin/server.ts"],
      "cwd": "/home/fkomp/Bureau/oracle/tools/mcp-mails",
      "env": {
        "MAILING_MANAGER_MASTER_KEY": "VotreMotDePassePrincipal123!"
      }
    }
  }
}
Option B — Exécution du build (production)
Bash

# D'abord, builder le projet
cd /home/fkomp/Bureau/oracle/tools/mcp-mails
npm install
npm run build
JSON

{
  "mcpServers": {
    "mcp-mails": {
      "command": "node",
      "args": ["/home/fkomp/Bureau/oracle/tools/mcp-mails/dist/bin/server.js"],
      "cwd": "/home/fkomp/Bureau/oracle/tools/mcp-mails",
      "env": {
        "MAILING_MANAGER_MASTER_KEY": "VotreMotDePassePrincipal123!"
      }
    }
  }
}
⚠️ MAILING_MANAGER_MASTER_KEY est obligatoire en mode stdio. C'est le mot de passe qui chiffre toutes les credentials email. Au premier lancement, il crée le vault. Aux lancements suivants, il le déverrouille.

✅ Checklist de vérification
Bash

cd /home/fkomp/Bureau/oracle/tools/mcp-mails

# 1. Vérifier que les dépendances sont installées
npm install

# 2. Vérifier que les modules natifs compilent
node -e "require('better-sqlite3')" && echo "✅ better-sqlite3 OK"
node -e "import('argon2').then(() => console.log('✅ argon2 OK'))"

# 3. Test direct en mode stdio (doit afficher des logs sur stderr et ne PAS crash)
MAILING_MANAGER_MASTER_KEY="test123password" npx tsx src/bin/server.ts 2>/tmp/mcp-mails.log &
sleep 3
# Si le processus tourne toujours → OK
kill %1 2>/dev/null

# 4. Vérifier les logs
cat /tmp/mcp-mails.log
# Doit contenir : "MCP stdio transport connected" et "vault unlocked"

# 5. Builder et tester le build
npm run build
MAILING_MANAGER_MASTER_KEY="test123password" node dist/bin/server.js 2>/tmp/mcp-mails-built.log &
sleep 3
kill %1 2>/dev/null
cat /tmp/mcp-mails-built.log
📊 Résumé des changements
Fichier	Problème	Fix
src/core/server.ts	Transport connecté APRÈS master key → crash avant handshake	Transport connecté EN PREMIER, master key déférée
src/bin/server.ts	process.exit(1) tue le processus immédiatement	Handlers uncaughtException/unhandledRejection
src/accounts/presets.ts	import assert { type: 'json' } incompatible Node 22+	createRequire() universel
src/utils/logger.ts	Crash si pino-pretty absent	Fallback vers stderr brut
src/tools/*.ts	Pas de check si vault verrouillé	Guard isVaultReady() sur chaque tool
tsup.config.ts	Shebang sur tous les fichiers	Shebang uniquement sur les binaires
src/storage/database.ts	Chemin migrations fragile après build	Recherche multi-chemins avec fallback cwd()
