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
import { SyncService } from '../accounts/sync-service.js';
import { registerAccountTools } from '../tools/account-tools.js';
import { registerEmailTools } from '../tools/email-tools.js';
import { registerPersonaTools } from '../tools/persona-tools.js';
import { registerDirectiveTools } from '../tools/directive-tools.js';
import { registerTaskTools } from '../tools/task-tools.js';
import { registerWebhookTools } from '../tools/webhook-tools.js';
import { createLogger, getLogger } from '../utils/logger.js';
import { AppConfig } from './types.js';
import { initPresets } from '../accounts/presets.js';
import { registerDebugTools } from '../tools/debug-tools.js';

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
  private syncService!: SyncService;
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

    // Init Presets
    await initPresets(this.config.dataDir);

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
    this.syncService = new SyncService(this.db, this.connectionPool, this.config);

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
      logLevel: this.config.logging.level,
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
    // Support alternative env var name to bypass potential CLI security filters on 'KEY'/'PASSWORD'
    const envMasterKey = process.env.MAILING_MANAGER_MASTER_KEY || process.env.MAILING_MANAGER_UNLOCK_CODE;

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

      // Auto-sync if enabled
      if (this.config.tasks.autoSyncOnLoad) {
        logger.info('Auto-sync on load triggered');
        const accounts = this.accountManager.listAccounts(true);
        for (const account of accounts) {
          this.syncService.syncAccount(account.id).catch(err => {
            logger.error({ err, email: account.email }, 'Auto-sync failed for account');
          });
        }
      }
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
          : `🔒 Vault is LOCKED.\n\nSet the MAILING_MANAGER_MASTER_KEY (or MAILING_MANAGER_UNLOCK_CODE) environment variable in your MCP client configuration and restart the server.\n\nExample for gemini-cli (~/.gemini/settings.json):\n{\n  "mcpServers": {\n    "mcp-mails": {\n      "command": "node",\n      "args": ["${process.argv[1] || '/path/to/server.js'}"],\n      "env": {\n        "MAILING_MANAGER_UNLOCK_CODE": "your-secure-password"\n      }\n    }\n  }\n}`;

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
      this.syncService,
      this.db,
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

    // Register debug tools only if enabled in config
    if (['debug', 'trace'].includes(this.config.logging.level)) {
      registerDebugTools(this.mcpServer, this.config);
    }
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
