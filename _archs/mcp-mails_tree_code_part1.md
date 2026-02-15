# Documentation du projet: mcp-mails (Partie 1/2)

> Généré le 14/02/2026 18:42:03

## 📂 Structure du projet

```
└── mcp-mails
    ├── config
    │   └── providers.json
    ├── docs
    ├── migrations
    │   └── 001_initial.sql
    ├── package.json
    ├── src
    │   ├── accounts
    │   │   ├── account-manager.ts
    │   │   └── presets.ts
    │   ├── auth
    │   ├── bin
    │   │   ├── cli.ts
    │   │   └── server.ts
    │   ├── core
    │   │   ├── config.ts
    │   │   ├── event-bus.ts
    │   │   ├── server.ts
    │   │   └── types.ts
    │   ├── directives
    │   │   └── directive-engine.ts
    │   ├── email
    │   │   ├── connection-pool.ts
    │   │   ├── imap-client.ts
    │   │   └── smtp-client.ts
    │   ├── index.ts
    │   ├── personas
    │   │   └── persona-manager.ts
    │   ├── prompts
    │   ├── resources
    │   ├── secure-input
    │   │   ├── browser-launcher.ts
    │   │   ├── ephemeral-server.ts
    │   │   ├── html-templates.ts
    │   │   └── index.ts
    │   ├── security
    │   │   └── encryption.ts
    │   ├── storage
    │   │   └── database.ts
    │   ├── tasks
    │   │   └── task-engine.ts
    │   ├── tools
    │   │   ├── account-tools.ts
    │   │   ├── directive-tools.ts
    │   │   ├── email-tools.ts
    │   │   ├── persona-tools.ts
    │   │   ├── task-tools.ts
    │   │   └── webhook-tools.ts
    │   ├── utils
    │   │   └── logger.ts
    │   └── webhooks
    │       ├── providers
    │       ├── webhook-dispatcher.ts
    │       ├── webhook-manager.ts
    │       └── webhook-server.ts
    ├── tsup.config.ts
    └── vitest.config.ts
```

## 📝 Contenu des fichiers

### 📄 `package.json`

```json
{
  "name": "@mailing-ai/mcp-manager",
  "version": "1.0.0",
  "description": "MCP Server for Multi-Account Email Management with Personas, Directives, Tasks, and Webhooks",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "mailing-manager": "./dist/bin/cli.js",
    "mailing-manager-mcp": "./dist/bin/server.js"
  },
  "exports": {
    ".": "./dist/index.js",
    "./setup": "./dist/bin/cli.js",
    "./server": "./dist/bin/server.js"
  },
  "scripts": {
    "dev": "tsx src/bin/server.ts",
    "dev:http": "tsx src/bin/server.ts --transport http",
    "dev:both": "tsx src/bin/server.ts --transport both",
    "setup": "tsx src/bin/cli.ts setup",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build && npm run test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "imapflow": "^1.0.170",
    "nodemailer": "^6.9.16",
    "googleapis": "^144.0.0",
    "@azure/msal-node": "^2.16.0",
    "argon2": "^0.41.1",
    "better-sqlite3": "^11.7.0",
    "inquirer": "^12.3.0",
    "express": "^4.21.0",
    "croner": "^9.0.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "handlebars": "^4.7.8",
    "zod": "^3.24.0",
    "commander": "^13.0.0",
    "open": "^10.1.0"
  },
  "optionalDependencies": {
    "keytar": "^7.9.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/express": "^5.0.0",
    "@types/nodemailer": "^6.4.17",
    "typescript": "^5.7.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist/",
    "migrations/",
    "config/",
    "README.md",
    "LICENSE"
  ],
  "keywords": [
    "mcp",
    "email",
    "imap",
    "smtp",
    "model-context-protocol",
    "ai",
    "automation"
  ],
  "license": "MIT"
}

```

### 📄 `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/cli': 'src/bin/cli.ts',
    'bin/server': 'src/bin/server.ts'
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  splitting: false,
  treeshake: true,
  banner: {
    js: '#!/usr/bin/env node'
  }
});

```

### 📄 `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/bin/**', 'src/index.ts']
    },
    testTimeout: 30000
  }
});

```

### 📁 config

#### 📄 `config/providers.json`

```json
{
  "gmail": {
    "name": "Gmail",
    "provider": "gmail",
    "imap": { "host": "imap.gmail.com", "port": 993, "tls": true },
    "smtp": { "host": "smtp.gmail.com", "port": 587, "tls": true },
    "supportedAuth": ["oauth2", "app-password"],
    "oauth2": {
      "authUrl": "https://accounts.google.com/o/oauth2/v2/auth",
      "tokenUrl": "https://oauth2.googleapis.com/token",
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send"
      ]
    },
    "notes": "Requires OAuth2 or App Password. Basic password auth is disabled."
  },
  "outlook": {
    "name": "Outlook / Microsoft 365",
    "provider": "outlook",
    "imap": { "host": "outlook.office365.com", "port": 993, "tls": true },
    "smtp": { "host": "smtp.office365.com", "port": 587, "tls": true },
    "supportedAuth": ["oauth2"],
    "oauth2": {
      "authUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      "tokenUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      "scopes": [
        "https://outlook.office365.com/IMAP.AccessAsUser.All",
        "https://outlook.office365.com/SMTP.Send",
        "offline_access"
      ]
    },
    "notes": "Requires OAuth2. Basic auth deprecated since October 2022."
  },
  "yahoo": {
    "name": "Yahoo Mail",
    "provider": "yahoo",
    "imap": { "host": "imap.mail.yahoo.com", "port": 993, "tls": true },
    "smtp": { "host": "smtp.mail.yahoo.com", "port": 587, "tls": true },
    "supportedAuth": ["app-password"],
    "notes": "Requires App Password generated from Yahoo account security."
  },
  "icloud": {
    "name": "iCloud Mail",
    "provider": "icloud",
    "imap": { "host": "imap.mail.me.com", "port": 993, "tls": true },
    "smtp": { "host": "smtp.mail.me.com", "port": 587, "tls": true },
    "supportedAuth": ["app-password"],
    "notes": "Requires App-Specific Password from appleid.apple.com."
  },
  "fastmail": {
    "name": "Fastmail",
    "provider": "fastmail",
    "imap": { "host": "imap.fastmail.com", "port": 993, "tls": true },
    "smtp": { "host": "smtp.fastmail.com", "port": 587, "tls": true },
    "supportedAuth": ["password", "app-password"],
    "notes": "Supports standard password or app password."
  }
}

```

### 📁 docs

### 📁 migrations

#### 📄 `migrations/001_initial.sql`

```sql
-- migrations/001_initial.sql

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL,
  imap_tls INTEGER NOT NULL DEFAULT 1,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_tls INTEGER NOT NULL DEFAULT 1,
  oauth2_client_id TEXT,
  oauth2_token_expiry TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  default_persona_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Encrypted credentials (separate table for security)
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, -- 'password', 'oauth2_client_secret', 'oauth2_refresh_token', 'oauth2_access_token'
  encrypted_value TEXT NOT NULL, -- JSON: { ciphertext, iv, tag, version }
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Allow multiple credential types per account
CREATE INDEX IF NOT EXISTS idx_credentials_account_type ON credentials(account_id, type);

-- Personas table
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL, -- JSON
  behavior TEXT NOT NULL, -- JSON
  capabilities TEXT NOT NULL, -- JSON
  knowledge_base TEXT, -- JSON, nullable
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personas_account ON personas(account_id);

-- Directives table
CREATE TABLE IF NOT EXISTS directives (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  type TEXT NOT NULL, -- 'inbound', 'outbound', 'both'
  active INTEGER NOT NULL DEFAULT 1,
  trigger_config TEXT NOT NULL, -- JSON
  actions TEXT NOT NULL, -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_directives_account ON directives(account_id);
CREATE INDEX IF NOT EXISTS idx_directives_priority ON directives(priority DESC);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL, -- JSON
  parameters TEXT NOT NULL, -- JSON
  persona_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_run TEXT,
  next_run TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_account ON tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run);

-- Inbound webhooks table
CREATE TABLE IF NOT EXISTS inbound_webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  account_id TEXT,
  secret_encrypted TEXT NOT NULL, -- JSON: { ciphertext, iv, tag, version }
  active INTEGER NOT NULL DEFAULT 1,
  actions TEXT NOT NULL, -- JSON array
  filters TEXT, -- JSON array, nullable
  last_triggered TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_endpoint ON inbound_webhooks(endpoint);

-- Outbound webhooks table
CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  headers TEXT NOT NULL DEFAULT '{}', -- JSON
  auth_type TEXT,
  auth_credentials_encrypted TEXT, -- JSON: { ciphertext, iv, tag, version }
  events TEXT NOT NULL, -- JSON array of event names
  payload_config TEXT NOT NULL, -- JSON
  retry_config TEXT NOT NULL, -- JSON
  active INTEGER NOT NULL DEFAULT 1,
  last_fired TEXT,
  fire_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_active ON outbound_webhooks(active);

-- Webhook execution log
CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'inbound' or 'outbound'
  event TEXT,
  status TEXT NOT NULL, -- 'success', 'failed', 'filtered', 'duplicate'
  request_payload TEXT,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at);

-- Dead letter queue for failed webhooks
CREATE TABLE IF NOT EXISTS webhook_dead_letters (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  payload TEXT NOT NULL,
  error_message TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Master key info (only 1 row ever)
CREATE TABLE IF NOT EXISTS master_key (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  derivation_config TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT, -- JSON
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Email cache for search (optional FTS)
CREATE VIRTUAL TABLE IF NOT EXISTS email_search USING fts5(
  message_id,
  account_id,
  folder,
  sender,
  recipients,
  subject,
  body_text,
  date
);

```

### 📁 src

#### 📄 `src/index.ts`

```typescript
export { MailingManagerServer } from './core/server.js';
export type * from './core/types.js';

```

#### 📁 accounts

##### 📄 `src/accounts/account-manager.ts`

```typescript
import crypto from 'crypto';
import { DatabaseManager } from '../storage/database.js';
import { EncryptionService } from '../security/encryption.js';
import { Account, AccountCredentials, EncryptedData } from '../core/types.js';
import { getProviderPreset } from './presets.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class AccountManager {
  constructor(
    private db: DatabaseManager,
    private encryption: EncryptionService
  ) {}

  async addAccount(credentials: AccountCredentials): Promise<Account> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const preset = getProviderPreset(credentials.provider);

    const imapHost = credentials.imapHost || preset?.imap.host;
    const imapPort = credentials.imapPort || preset?.imap.port || 993;
    const smtpHost = credentials.smtpHost || preset?.smtp.host;
    const smtpPort = credentials.smtpPort || preset?.smtp.port || 587;

    if (!imapHost || !smtpHost) {
      throw new Error(
        `Unknown provider "${credentials.provider}". ` +
        'Please provide imapHost and smtpHost for custom providers.'
      );
    }

    const authMethod = credentials.password ? 'password' : 'oauth2';

    // Insert account
    this.db.getDb().prepare(`
      INSERT INTO accounts (id, email, name, provider, auth_method,
        imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls,
        active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, 1, ?, ?)
    `).run(
      id, credentials.email, credentials.email, credentials.provider,
      authMethod, imapHost, imapPort, smtpHost, smtpPort, now, now
    );

    // Store encrypted password
    if (credentials.password) {
      const encrypted = this.encryption.encrypt(credentials.password);
      this.db.getDb().prepare(`
        INSERT INTO credentials (id, account_id, type, encrypted_value, created_at, updated_at)
        VALUES (?, ?, 'password', ?, ?, ?)
      `).run(crypto.randomUUID(), id, JSON.stringify(encrypted), now, now);
    }

    logger.info({ id, email: credentials.email }, 'Account added');

    const account = this.getAccount(id);
    if (!account) throw new Error('Failed to create account');

    getEventBus().emit('account.connected', { accountId: id });

    return account;
  }

  getAccount(id: string): Account | null {
    const row = this.db.getDb().prepare(`
      SELECT * FROM accounts WHERE id = ?
    `).get(id) as any;

    if (!row) return null;
    return this.rowToAccount(row);
  }

  getAccountByEmail(email: string): Account | null {
    const row = this.db.getDb().prepare(`
      SELECT * FROM accounts WHERE email = ?
    `).get(email) as any;

    if (!row) return null;
    return this.rowToAccount(row);
  }

  listAccounts(activeOnly: boolean = false): Account[] {
    const query = activeOnly
      ? 'SELECT * FROM accounts WHERE active = 1 ORDER BY email'
      : 'SELECT * FROM accounts ORDER BY email';

    const rows = this.db.getDb().prepare(query).all() as any[];
    return rows.map(r => this.rowToAccount(r));
  }

  updateAccount(id: string, updates: Partial<Account>): Account {
    const existing = this.getAccount(id);
    if (!existing) throw new Error(`Account ${id} not found`);

    const now = new Date().toISOString();

    if (updates.name !== undefined) {
      this.db.getDb().prepare('UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?')
        .run(updates.name, now, id);
    }
    if (updates.active !== undefined) {
      this.db.getDb().prepare('UPDATE accounts SET active = ?, updated_at = ? WHERE id = ?')
        .run(updates.active ? 1 : 0, now, id);
    }
    if (updates.defaultPersonaId !== undefined) {
      this.db.getDb().prepare('UPDATE accounts SET default_persona_id = ?, updated_at = ? WHERE id = ?')
        .run(updates.defaultPersonaId, now, id);
    }

    return this.getAccount(id)!;
  }

  removeAccount(id: string): void {
    const account = this.getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);

    this.db.transaction(() => {
      this.db.getDb().prepare('DELETE FROM credentials WHERE account_id = ?').run(id);
      this.db.getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
    });

    logger.info({ id, email: account.email }, 'Account removed');
    getEventBus().emit('account.disconnected', { accountId: id });
  }

  getAccountPassword(accountId: string): string {
    const row = this.db.getDb().prepare(`
      SELECT encrypted_value FROM credentials
      WHERE account_id = ? AND type = 'password'
    `).get(accountId) as { encrypted_value: string } | undefined;

    if (!row) throw new Error(`No password found for account ${accountId}`);

    const encrypted: EncryptedData = JSON.parse(row.encrypted_value);
    return this.encryption.decrypt(encrypted);
  }

  updateAccountPassword(accountId: string, newPassword: string): void {
    const encrypted = this.encryption.encrypt(newPassword);
    const now = new Date().toISOString();

    const existing = this.db.getDb().prepare(`
      SELECT id FROM credentials WHERE account_id = ? AND type = 'password'
    `).get(accountId) as { id: string } | undefined;

    if (existing) {
      this.db.getDb().prepare(`
        UPDATE credentials SET encrypted_value = ?, updated_at = ?
        WHERE account_id = ? AND type = 'password'
      `).run(JSON.stringify(encrypted), now, accountId);
    } else {
      this.db.getDb().prepare(`
        INSERT INTO credentials (id, account_id, type, encrypted_value, created_at, updated_at)
        VALUES (?, ?, 'password', ?, ?, ?)
      `).run(crypto.randomUUID(), accountId, JSON.stringify(encrypted), now, now);
    }
  }

  getActiveCount(): number {
    const row = this.db.getDb().prepare(
      'SELECT COUNT(*) as count FROM accounts WHERE active = 1'
    ).get() as { count: number };
    return row.count;
  }

  private rowToAccount(row: any): Account {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      provider: row.provider,
      authMethod: row.auth_method,
      imap: {
        host: row.imap_host,
        port: row.imap_port,
        tls: !!row.imap_tls
      },
      smtp: {
        host: row.smtp_host,
        port: row.smtp_port,
        tls: !!row.smtp_tls
      },
      oauth2: row.oauth2_client_id
        ? { clientId: row.oauth2_client_id, tokenExpiry: row.oauth2_token_expiry }
        : undefined,
      active: !!row.active,
      defaultPersonaId: row.default_persona_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

```

##### 📄 `src/accounts/presets.ts`

```typescript
import { ProviderPreset } from '../core/types.js';
import providersConfig from '../../config/providers.json' assert { type: 'json' };

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

```

#### 📁 auth

#### 📁 bin

##### 📄 `src/bin/cli.ts`

```typescript
import { Command } from 'commander';
import { MailingManagerServer } from '../core/server.js';

const program = new Command();

program
  .name('mailing-manager')
  .description('Mailing Manager MCP — Multi-Account Email Management')
  .version('1.0.0');

program
  .command('setup')
  .description('Run the interactive setup wizard')
  .action(async () => {
    console.log('🚀 Mailing Manager MCP — Setup\n');
    const server = new MailingManagerServer();
    await server.initialize();
    console.log('\n✅ Setup complete. You can now use the MCP server.');
    await server.stop();
  });

program
  .command('server')
  .description('Start the MCP server')
  .option('-t, --transport <type>', 'Transport type (stdio|http|both)', 'stdio')
  .action(async (opts) => {
    const server = new MailingManagerServer();
    const shutdown = async () => { await server.stop(); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await server.initialize();
    await server.start(opts.transport);
  });

program.parse();

```

##### 📄 `src/bin/server.ts`

```typescript
// ----------------------------------------------------------------------------
// CRITICAL FIX: Redirect console.log to stderr to prevent MCP Protocol corruption
// The MCP SDK uses stdout for communication. Any other log breaks the JSON-RPC pipe.
// ----------------------------------------------------------------------------
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
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await server.initialize();
    await server.start(transport);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

```

#### 📁 core

##### 📄 `src/core/config.ts`

```typescript
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { AppConfig } from './types.js';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.mailing-manager');

const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  dataDir: DEFAULT_DATA_DIR,
  transport: 'stdio',
  http: {
    port: 3000,
    host: '127.0.0.1'
  },
  webhooks: {
    enabled: false,
    port: 3100,
    host: '127.0.0.1',
    basePath: '/webhooks',
    ssl: {
      enabled: false
    },
    rateLimit: {
      windowMs: 900000, // 15 minutes
      maxRequests: 100
    },
    security: {
      signatureValidation: true,
      signatureHeader: 'x-webhook-signature',
      signatureAlgorithm: 'sha256',
      ipWhitelist: [],
      replayProtection: true,
      replayWindowSeconds: 300
    },
    queue: {
      maxRetries: 3,
      retryBackoff: 'exponential',
      retryDelayMs: 5000,
      persistQueue: true,
      maxQueueSize: 10000
    }
  },
  tasks: {
    schedulerEnabled: true,
    maxConcurrent: 5
  },
  security: {
    autoLockTimeoutMinutes: 30,
    keyDerivation: {
      algorithm: 'argon2id',
      timeCost: 3,
      memoryCost: 65536,
      parallelism: 4,
      saltLength: 32
    }
  },
  logging: {
    level: 'info'
  }
};

export class ConfigManager {
  private config: AppConfig;
  private configPath: string;

  constructor(dataDir?: string) {
    const dir = dataDir || process.env.MAILING_MANAGER_DATA_DIR || DEFAULT_DATA_DIR;
    this.configPath = path.join(dir, 'config.json');
    this.config = { ...DEFAULT_CONFIG, dataDir: dir };
  }

  async load(): Promise<AppConfig> {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const loaded = JSON.parse(raw) as Partial<AppConfig>;
      this.config = this.merge(DEFAULT_CONFIG, loaded);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // First run, use defaults
        await this.save();
      } else {
        throw error;
      }
    }

    // Apply Environment Overrides (Priority: Env > Config File > Default)
    if (process.env.MAILING_MANAGER_HTTP_PORT) {
      this.config.http.port = parseInt(process.env.MAILING_MANAGER_HTTP_PORT, 10);
    }
    if (process.env.MAILING_MANAGER_HTTP_HOST) {
      this.config.http.host = process.env.MAILING_MANAGER_HTTP_HOST;
    }
    if (process.env.MAILING_MANAGER_WEBHOOK_PORT) {
      this.config.webhooks.port = parseInt(process.env.MAILING_MANAGER_WEBHOOK_PORT, 10);
    }
    if (process.env.MAILING_MANAGER_WEBHOOK_HOST) {
      this.config.webhooks.host = process.env.MAILING_MANAGER_WEBHOOK_HOST;
    }
    if (process.env.MAILING_MANAGER_WEBHOOK_ENABLED) {
      this.config.webhooks.enabled = process.env.MAILING_MANAGER_WEBHOOK_ENABLED === 'true';
    }

    return this.config;
  }

  async save(): Promise<void> {
    await fs.mkdir(this.config.dataDir, { recursive: true });
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );
  }

  get(): AppConfig {
    return this.config;
  }

  async update(partial: Partial<AppConfig>): Promise<AppConfig> {
    this.config = this.merge(this.config, partial);
    await this.save();
    return this.config;
  }

  getDataDir(): string {
    return this.config.dataDir;
  }

  getDatabasePath(): string {
    return path.join(this.config.dataDir, 'mailing-manager.db');
  }

  private merge<T extends object>(base: T, override: Partial<T>): T {
    const result = { ...base } as any;
    const ov = override as any;
    for (const key of Object.keys(ov)) {
      const val = ov[key];
      if (
        val !== undefined &&
        typeof val === 'object' &&
        val !== null &&
        !Array.isArray(val) &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = this.merge(
          result[key],
          val
        );
      } else if (val !== undefined) {
        result[key] = val;
      }
    }
    return result as T;
  }
}

```

##### 📄 `src/core/event-bus.ts`

```typescript
import { EventEmitter } from 'events';
import { EventMap } from './types.js';
import { getLogger } from '../utils/logger.js';

type EventKey = keyof EventMap;

export class EventBus {
  private emitter: EventEmitter;
  private logger = getLogger();

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  emit<K extends EventKey>(event: K, data: EventMap[K]): void {
    this.logger.debug({ event, data }, 'Event emitted');
    this.emitter.emit(event, data);
  }

  on<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    this.emitter.on(event, handler);
  }

  once<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    this.emitter.once(event, handler);
  }

  off<K extends EventKey>(event: K, handler: (data: EventMap[K]) => void): void {
    this.emitter.off(event, handler);
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

// Singleton
let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

```

##### 📄 `src/core/server.ts`

```typescript
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

  constructor(dataDir?: string) {
    this.mcpServer = new McpServer({
      name: 'mailing-manager',
      version: '1.0.0',
    });
    this.configManager = new ConfigManager(dataDir);
    this.eventBus = getEventBus();
  }

  async initialize(): Promise<void> {
    // Load config
    this.config = await this.configManager.load();

    // Init logger
    createLogger({
      level: this.config.logging.level,
      file: this.config.logging.file
    });

    const logger = getLogger();
    logger.info('Initializing Mailing Manager MCP Server');

    // Init database
    this.db = new DatabaseManager(this.configManager.getDatabasePath());
    await this.db.initialize();

    // Init encryption
    this.encryption = new EncryptionService();

    // Init secure input
    const isRemote = !process.stdout.isTTY || !!process.env.REMOTE_MODE;
    this.secureInput = new SecureInput(isRemote ? 'remote' : 'local');

    // Check if master key exists, if not, prompt for setup
    await this.ensureMasterKey();

    // Init managers
    this.accountManager = new AccountManager(this.db, this.encryption);
    this.connectionPool = new ConnectionPool(this.accountManager);
    this.personaManager = new PersonaManager(this.db);
    this.directiveEngine = new DirectiveEngine(this.db);
    this.taskEngine = new TaskEngine(this.db);
    this.webhookManager = new WebhookManager(this.db, this.encryption);
    this.webhookDispatcher = new WebhookDispatcher(this.webhookManager, this.encryption);

    // Register MCP tools
    this.registerAllTools();

    // Setup event bridges
    this.setupEventBridges();

    logger.info('Server initialized');
  }

  private async ensureMasterKey(): Promise<void> {
    const logger = getLogger();
    const row = this.db.getDb().prepare('SELECT * FROM master_key WHERE id = 1').get() as any;
    const envMasterKey = process.env.MAILING_MANAGER_MASTER_KEY;

    if (!row) {
      // First time setup
      logger.info('No master key found. Starting first-time setup.');
      
      let password = envMasterKey;
      if (!password) {
         password = await this.secureInput.masterKeySetup();
      } else {
         logger.info('Using master key from environment variable for setup.');
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
      logger.info('Master key created and set');
    } else {
      // Unlock existing
      let password = envMasterKey;
      
      if (!password) {
        password = await this.secureInput.masterKeyUnlock();
      } else {
        logger.info('Using master key from environment variable for unlock.');
      }

      const isValid = await this.encryption.verifyMasterKey(password, row.hash);

      if (!isValid) {
        throw new Error('Invalid master password (verified against DB hash)');
      }

      const { key } = await this.encryption.deriveMasterKey(password, row.salt);
      this.encryption.setMasterKey(key);
      logger.info('Master key unlocked');
    }
  }

  private registerAllTools(): void {
    registerAccountTools(
      this.mcpServer,
      this.accountManager,
      this.connectionPool,
      this.secureInput
    );

    registerEmailTools(
      this.mcpServer,
      this.connectionPool
    );

    registerPersonaTools(
      this.mcpServer,
      this.personaManager
    );

    registerDirectiveTools(
      this.mcpServer,
      this.directiveEngine,
      this.connectionPool
    );

    registerTaskTools(
      this.mcpServer,
      this.taskEngine
    );

    registerWebhookTools(
      this.mcpServer,
      this.webhookManager
    );
  }

  private setupEventBridges(): void {
    // When an email event occurs, dispatch to outbound webhooks
    const emailEvents: Array<keyof import('./types.js').EventMap> = [
      'email.received', 'email.sent', 'email.deleted',
      'email.moved', 'email.flagged'
    ];

    for (const event of emailEvents) {
      this.eventBus.on(event, (data) => {
        this.webhookDispatcher.dispatch(event as any, data as any).catch(err => {
          getLogger().error({ event, error: err }, 'Webhook dispatch error');
        });
      });
    }

    // When a webhook is received, process its actions
    this.eventBus.on('webhook.received', async (event) => {
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
            // Add more action handlers
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

  async start(transport: 'stdio' | 'http' | 'both' = 'stdio'): Promise<void> {
    const logger = getLogger();

    // Start MCP transport
    if (transport === 'stdio' || transport === 'both') {
      const stdioTransport = new StdioServerTransport();
      await this.mcpServer.connect(stdioTransport);
      logger.info('MCP stdio transport connected');
    }

    // Start webhook server
    if (this.config.webhooks.enabled) {
      this.webhookServer = new WebhookServer(
        this.config.webhooks,
        this.webhookManager,
        this.encryption
      );
      await this.webhookServer.start();
    }

    // Start task scheduler
    if (this.config.tasks.schedulerEnabled) {
      this.taskEngine.startScheduler();
    }

    // Start connection pool cleanup
    this.connectionPool.start();

    logger.info({
      transport,
      webhooksEnabled: this.config.webhooks.enabled,
      schedulerEnabled: this.config.tasks.schedulerEnabled
    }, 'Mailing Manager MCP Server started');
  }

  async stop(): Promise<void> {
    const logger = getLogger();

    this.taskEngine.stopScheduler();
    this.connectionPool.stop();

    if (this.webhookServer) {
      await this.webhookServer.stop();
    }

    this.encryption.clearMasterKey();
    this.db.close();

    logger.info('Server stopped');
  }
}

```

##### 📄 `src/core/types.ts`

```typescript

import { z } from 'zod';

// ═══════════════════════════════════════════════════
// ACCOUNT TYPES
// ═══════════════════════════════════════════════════

export const EmailProviderSchema = z.enum([
  'gmail',
  'outlook',
  'yahoo',
  'icloud',
  'fastmail',
  'protonmail',
  'custom'
]);
export type EmailProvider = z.infer<typeof EmailProviderSchema>;

export const AuthMethodSchema = z.enum([
  'password',
  'oauth2',
  'app-password'
]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  provider: EmailProviderSchema,
  authMethod: AuthMethodSchema,
  imap: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    tls: z.boolean().default(true)
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    tls: z.boolean().default(true)
  }),
  // Credentials are stored encrypted, never in this object
  oauth2: z.object({
    clientId: z.string(),
    // clientSecret, refreshToken, accessToken stored encrypted in DB
    tokenExpiry: z.string().datetime().optional()
  }).optional(),
  active: z.boolean().default(true),
  defaultPersonaId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Account = z.infer<typeof AccountSchema>;

export interface AccountCredentials {
  email: string;
  password?: string;
  provider: EmailProvider;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

// ═══════════════════════════════════════════════════
// EMAIL TYPES
// ═══════════════════════════════════════════════════

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailMessage {
  id: string;
  accountId: string;
  messageId: string;
  folder: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  date: Date;
  flags: string[];
  attachments: EmailAttachment[];
  headers: Record<string, string>;
  size: number;
  read: boolean;
  flagged: boolean;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  content?: Buffer;
}

export interface EmailSearchCriteria {
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  since?: Date;
  before?: Date;
  flagged?: boolean;
  read?: boolean;
  hasAttachments?: boolean;
  limit?: number;
  offset?: number;
}

export interface SendEmailParams {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  replyTo?: string;
  inReplyTo?: string;
  personaId?: string;
}

export interface EmailFolder {
  name: string;
  path: string;
  delimiter: string;
  messageCount: number;
  unseenCount: number;
  flags: string[];
  children?: EmailFolder[];
}

// ═══════════════════════════════════════════════════
// PERSONA TYPES
// ═══════════════════════════════════════════════════

export const PersonaToneSchema = z.enum([
  'professional',
  'casual',
  'formal',
  'friendly',
  'authoritative'
]);
export type PersonaTone = z.infer<typeof PersonaToneSchema>;

export const PersonaStyleSchema = z.enum([
  'concise',
  'detailed',
  'bullet-points',
  'storytelling'
]);
export type PersonaStyle = z.infer<typeof PersonaStyleSchema>;

export const ResponseTimeSchema = z.enum([
  'immediate',
  'within-hour',
  'within-day',
  'deferred'
]);
export type ResponseTime = z.infer<typeof ResponseTimeSchema>;

export const PersonaSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  personality: z.object({
    tone: PersonaToneSchema,
    style: PersonaStyleSchema,
    language: z.string().default('en'),
    timezone: z.string().default('UTC'),
    signature: z.string().optional()
  }),
  behavior: z.object({
    responseTime: ResponseTimeSchema,
    autoReplyEnabled: z.boolean().default(false),
    priorityKeywords: z.array(z.string()).default([])
  }),
  capabilities: z.object({
    canSend: z.boolean().default(true),
    canDelete: z.boolean().default(false),
    canArchive: z.boolean().default(true),
    canMove: z.boolean().default(true),
    canForward: z.boolean().default(true),
    allowedRecipients: z.array(z.string()).optional(),
    blockedRecipients: z.array(z.string()).optional()
  }),
  knowledgeBase: z.object({
    context: z.string(),
    commonPhrases: z.array(z.string()).default([])
  }).optional(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Persona = z.infer<typeof PersonaSchema>;

// ═══════════════════════════════════════════════════
// DIRECTIVE TYPES
// ═══════════════════════════════════════════════════

export const ConditionFieldSchema = z.enum([
  'sender',
  'recipient',
  'subject',
  'body',
  'attachments',
  'folder',
  'date',
  'flags'
]);
export type ConditionField = z.infer<typeof ConditionFieldSchema>;

export const ConditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'regex',
  'in',
  'not_in',
  'greater_than',
  'less_than'
]);
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export const ConditionSchema = z.object({
  field: ConditionFieldSchema,
  operator: ConditionOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]),
  caseSensitive: z.boolean().default(false)
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ActionTypeSchema = z.enum([
  'reply',
  'forward',
  'archive',
  'delete',
  'move',
  'tag',
  'flag',
  'persona_switch',
  'webhook_trigger',
  'task_trigger'
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSchema = z.object({
  type: ActionTypeSchema,
  parameters: z.record(z.unknown()),
  delay: z.number().int().nonnegative().optional()
});
export type Action = z.infer<typeof ActionSchema>;

export const DirectiveTypeSchema = z.enum(['inbound', 'outbound', 'both']);
export type DirectiveType = z.infer<typeof DirectiveTypeSchema>;

export const DirectiveSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  priority: z.number().int().min(0).max(1000).default(100),
  type: DirectiveTypeSchema,
  active: z.boolean().default(true),
  trigger: z.object({
    conditions: z.array(ConditionSchema).min(1),
    matchAll: z.boolean().default(true),
    timeWindow: z.object({
      start: z.string(),
      end: z.string(),
      days: z.array(z.number().int().min(0).max(6))
    }).optional()
  }),
  actions: z.array(ActionSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Directive = z.infer<typeof DirectiveSchema>;

// ═══════════════════════════════════════════════════
// TASK TYPES
// ═══════════════════════════════════════════════════

export const TaskTypeSchema = z.enum([
  'schedule_reply',
  'auto_respond',
  'digest_generation',
  'cleanup',
  'backup',
  'sync',
  'email_filtering',
  'attachment_processing',
  'followup_reminder',
  'custom'
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'failed',
  'running'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskScheduleTypeSchema = z.enum([
  'immediate',
  'cron',
  'interval',
  'trigger'
]);
export type TaskScheduleType = z.infer<typeof TaskScheduleTypeSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  type: TaskTypeSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  schedule: z.object({
    type: TaskScheduleTypeSchema,
    value: z.string().optional(),
    timezone: z.string().default('UTC')
  }),
  parameters: z.record(z.unknown()),
  personaId: z.string().uuid().optional(),
  status: TaskStatusSchema.default('active'),
  lastRun: z.string().datetime().optional(),
  nextRun: z.string().datetime().optional(),
  runCount: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Task = z.infer<typeof TaskSchema>;

// ═══════════════════════════════════════════════════
// WEBHOOK TYPES
// ═══════════════════════════════════════════════════

export const WebhookProviderSchema = z.enum([
  'gmail',
  'outlook',
  'sendgrid',
  'mailgun',
  'postmark',
  'custom',
  'zapier',
  'n8n',
  'make'
]);
export type WebhookProvider = z.infer<typeof WebhookProviderSchema>;

export const WebhookEventSchema = z.enum([
  'email.received',
  'email.sent',
  'email.read',
  'email.deleted',
  'email.moved',
  'email.flagged',
  'email.attachment_received',
  'task.completed',
  'task.failed',
  'task.scheduled',
  'directive.triggered',
  'persona.switched',
  'account.connected',
  'account.disconnected',
  'account.error',
  'digest.generated',
  'security.alert'
]);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookActionTypeSchema = z.enum([
  'process_email',
  'trigger_task',
  'apply_directive',
  'notify',
  'forward_webhook',
  'execute_persona',
  'custom_script'
]);
export type WebhookActionType = z.infer<typeof WebhookActionTypeSchema>;

export const InboundWebhookSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  endpoint: z.string().min(1),
  provider: WebhookProviderSchema,
  accountId: z.string().uuid().optional(),
  active: z.boolean().default(true),
  actions: z.array(z.object({
    type: WebhookActionTypeSchema,
    parameters: z.record(z.unknown()),
    condition: z.string().optional()
  })).min(1),
  filters: z.array(z.object({
    field: z.string(),
    operator: ConditionOperatorSchema,
    value: z.union([z.string(), z.array(z.string())])
  })).optional(),
  lastTriggered: z.string().datetime().optional(),
  triggerCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type InboundWebhook = z.infer<typeof InboundWebhookSchema>;

export const OutboundWebhookAuthTypeSchema = z.enum([
  'bearer',
  'basic',
  'api-key',
  'oauth2',
  'none'
]);
export type OutboundWebhookAuthType = z.infer<typeof OutboundWebhookAuthTypeSchema>;

export const OutboundWebhookSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string()).default({}),
  auth: z.object({
    type: OutboundWebhookAuthTypeSchema,
    // credentials stored encrypted in DB
  }).optional(),
  events: z.array(WebhookEventSchema).min(1),
  payload: z.object({
    format: z.enum(['json', 'form', 'xml']).default('json'),
    template: z.string().optional(),
    includeRawEmail: z.boolean().default(false),
    maxPayloadSizeBytes: z.number().int().positive().default(5242880)
  }),
  retry: z.object({
    enabled: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    backoffMs: z.number().int().positive().default(5000)
  }),
  active: z.boolean().default(true),
  lastFired: z.string().datetime().optional(),
  fireCount: z.number().int().nonnegative().default(0),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type OutboundWebhook = z.infer<typeof OutboundWebhookSchema>;

export interface WebhookEventPayload {
  id: string;
  timestamp: string;
  event: WebhookEvent;
  source: {
    accountId: string;
    accountEmail: string;
    personaId?: string;
  };
  data: Record<string, unknown>;
  metadata: {
    mcpVersion: string;
    webhookId: string;
    attempt: number;
    maxAttempts: number;
  };
}

// ═══════════════════════════════════════════════════
// SECURE INPUT TYPES
// ═══════════════════════════════════════════════════

export interface SecureInputField {
  name: string;
  label: string;
  type: 'password' | 'text' | 'email' | 'select' | 'number';
  required: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    message?: string;
  };
}

export interface SecureInputRequest {
  type: 'password' | 'oauth-callback' | 'account-setup' | 'multi-field';
  title: string;
  message: string;
  fields?: SecureInputField[];
  timeout?: number;
  theme?: 'light' | 'dark' | 'system';
}

export interface SecureSession {
  id: string;
  token: string;
  csrf: string;
  serverPublicKey: string;
  request: SecureInputRequest;
  used: boolean;
  createdAt: number;
  resolve: ((data: Record<string, string>) => void) | null;
  reject: ((error: Error) => void) | null;
}

// ═══════════════════════════════════════════════════
// SECURITY TYPES
// ═══════════════════════════════════════════════════

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
}

export interface KeyDerivationConfig {
  algorithm: 'argon2id';
  timeCost: number;
  memoryCost: number;
  parallelism: number;
  saltLength: number;
}

export interface MasterKeyInfo {
  salt: string;
  hash: string;
  derivation: KeyDerivationConfig;
  createdAt: string;
}

// ═══════════════════════════════════════════════════
// CONFIG TYPES
// ═══════════════════════════════════════════════════

export interface AppConfig {
  version: string;
  dataDir: string;
  transport: 'stdio' | 'http' | 'both';
  http: {
    port: number;
    host: string;
  };
  webhooks: {
    enabled: boolean;
    port: number;
    host: string;
    basePath: string;
    ssl: {
      enabled: boolean;
      certPath?: string;
      keyPath?: string;
    };
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
    security: {
      signatureValidation: boolean;
      signatureHeader: string;
      signatureAlgorithm: 'sha256' | 'sha512';
      ipWhitelist: string[];
      replayProtection: boolean;
      replayWindowSeconds: number;
    };
    queue: {
      maxRetries: number;
      retryBackoff: 'linear' | 'exponential';
      retryDelayMs: number;
      persistQueue: boolean;
      maxQueueSize: number;
    };
  };
  tasks: {
    schedulerEnabled: boolean;
    maxConcurrent: number;
  };
  security: {
    autoLockTimeoutMinutes: number;
    keyDerivation: KeyDerivationConfig;
  };
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    file?: string;
  };
}

// ═══════════════════════════════════════════════════
// EVENT BUS TYPES
// ═══════════════════════════════════════════════════

export interface EventMap {
  'email.received': { accountId: string; message: EmailMessage };
  'email.sent': { accountId: string; messageId: string; to: string[] };
  'email.deleted': { accountId: string; messageId: string };
  'email.moved': { accountId: string; messageId: string; from: string; to: string };
  'email.flagged': { accountId: string; messageId: string; flags: string[] };
  'task.completed': { taskId: string; result: unknown };
  'task.failed': { taskId: string; error: string };
  'directive.triggered': { directiveId: string; emailId: string };
  'persona.switched': { accountId: string; personaId: string };
  'account.connected': { accountId: string };
  'account.disconnected': { accountId: string };
  'account.error': { accountId: string; error: string };
  'webhook.received': { webhookId: string; requestId: string; payload: unknown };
  'webhook.dispatched': { webhookId: string; event: WebhookEvent };
  'security.alert': { type: string; message: string };
}

// ═══════════════════════════════════════════════════
// PROVIDER PRESETS
// ═══════════════════════════════════════════════════

export interface ProviderPreset {
  name: string;
  provider: EmailProvider;
  imap: {
    host: string;
    port: number;
    tls: boolean;
  };
  smtp: {
    host: string;
    port: number;
    tls: boolean;
  };
  supportedAuth: AuthMethod[];
  oauth2?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
  notes?: string;
}

```

#### 📁 directives

##### 📄 `src/directives/directive-engine.ts`

```typescript
import crypto from 'crypto';
import { DatabaseManager } from '../storage/database.js';
import { Directive, Condition, EmailMessage } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class DirectiveEngine {
  constructor(private db: DatabaseManager) {}

  create(data: Omit<Directive, 'id' | 'createdAt' | 'updatedAt'>): Directive {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.getDb().prepare(`
      INSERT INTO directives (id, account_id, name, description, priority,
        type, active, trigger_config, actions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.accountId, data.name, data.description || '',
      data.priority || 100, data.type, data.active !== false ? 1 : 0,
      JSON.stringify(data.trigger), JSON.stringify(data.actions),
      now, now
    );

    logger.info({ id, name: data.name }, 'Directive created');
    return this.get(id)!;
  }

  get(id: string): Directive | null {
    const row = this.db.getDb().prepare('SELECT * FROM directives WHERE id = ?').get(id) as any;
    return row ? this.rowToDirective(row) : null;
  }

  listByAccount(accountId: string): Directive[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM directives WHERE account_id = ? ORDER BY priority ASC'
    ).all(accountId) as any[];
    return rows.map(r => this.rowToDirective(r));
  }

  listAll(): Directive[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM directives ORDER BY priority ASC'
    ).all() as any[];
    return rows.map(r => this.rowToDirective(r));
  }

  update(id: string, updates: Partial<Directive>): Directive {
    const existing = this.get(id);
    if (!existing) throw new Error(`Directive ${id} not found`);

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
    if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
    if (updates.active !== undefined) { fields.push('active = ?'); values.push(updates.active ? 1 : 0); }
    if (updates.trigger !== undefined) { fields.push('trigger_config = ?'); values.push(JSON.stringify(updates.trigger)); }
    if (updates.actions !== undefined) { fields.push('actions = ?'); values.push(JSON.stringify(updates.actions)); }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);
      this.db.getDb().prepare(
        `UPDATE directives SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    return this.get(id)!;
  }

  delete(id: string): void {
    this.db.getDb().prepare('DELETE FROM directives WHERE id = ?').run(id);
    logger.info({ id }, 'Directive deleted');
  }

  // Evaluate which directives match a given email
  evaluateEmail(email: EmailMessage, directives: Directive[]): Directive[] {
    const matching: Directive[] = [];

    for (const directive of directives) {
      if (!directive.active) continue;

      const { conditions, matchAll, timeWindow } = directive.trigger;

      // Check time window
      if (timeWindow) {
        if (!this.isInTimeWindow(timeWindow)) continue;
      }

      // Evaluate conditions
      const results = conditions.map(c => this.evaluateCondition(c, email));

      const passes = matchAll
        ? results.every(Boolean)
        : results.some(Boolean);

      if (passes) {
        matching.push(directive);
      }
    }

    // Sort by priority (lower number = higher priority)
    return matching.sort((a, b) => a.priority - b.priority);
  }

  private evaluateCondition(condition: Condition, email: EmailMessage): boolean {
    let fieldValue: string;

    switch (condition.field) {
      case 'sender':
        fieldValue = email.from.address;
        break;
      case 'recipient':
        fieldValue = email.to.map(t => t.address).join(', ');
        break;
      case 'subject':
        fieldValue = email.subject;
        break;
      case 'body':
        fieldValue = email.body.text || '';
        break;
      case 'folder':
        fieldValue = email.folder;
        break;
      case 'flags':
        fieldValue = email.flags.join(', ');
        break;
      default:
        return false;
    }

    const compareValue = condition.caseSensitive ? fieldValue : fieldValue.toLowerCase();
    const targetValue = condition.caseSensitive
      ? (typeof condition.value === 'string' ? condition.value : '')
      : (typeof condition.value === 'string' ? condition.value.toLowerCase() : '');

    switch (condition.operator) {
      case 'equals':
        return compareValue === targetValue;
      case 'not_equals':
        return compareValue !== targetValue;
      case 'contains':
        return compareValue.includes(targetValue);
      case 'not_contains':
        return !compareValue.includes(targetValue);
      case 'regex':
        try {
          const regex = new RegExp(
            typeof condition.value === 'string' ? condition.value : '',
            condition.caseSensitive ? '' : 'i'
          );
          return regex.test(fieldValue);
        } catch {
          return false;
        }
      case 'in':
        if (Array.isArray(condition.value)) {
          const values = condition.caseSensitive
            ? condition.value
            : condition.value.map(v => v.toLowerCase());
          return values.includes(compareValue);
        }
        return false;
      case 'not_in':
        if (Array.isArray(condition.value)) {
          const values = condition.caseSensitive
            ? condition.value
            : condition.value.map(v => v.toLowerCase());
          return !values.includes(compareValue);
        }
        return true;
      default:
        return false;
    }
  }

  private isInTimeWindow(timeWindow: { start: string; end: string; days: number[] }): boolean {
    const now = new Date();
    const currentDay = now.getDay();

    if (!timeWindow.days.includes(currentDay)) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = timeWindow.start.split(':').map(Number);
    const [endH, endM] = timeWindow.end.split(':').map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  private rowToDirective(row: any): Directive {
    return {
      id: row.id,
      accountId: row.account_id,
      name: row.name,
      description: row.description,
      priority: row.priority,
      type: row.type,
      active: !!row.active,
      trigger: JSON.parse(row.trigger_config),
      actions: JSON.parse(row.actions),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

```

#### 📁 email

##### 📄 `src/email/connection-pool.ts`

```typescript
import { ImapClient } from './imap-client.js';
import { SmtpClient } from './smtp-client.js';
import { AccountManager } from '../accounts/account-manager.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

interface ConnectionEntry {
  imap: ImapClient;
  smtp: SmtpClient;
  lastUsed: number;
}

export class ConnectionPool {
  private connections: Map<string, ConnectionEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private accountManager: AccountManager,
    private maxIdleMs: number = 300_000 // 5 minutes
  ) {}

  start(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Disconnect all
    for (const [, entry] of this.connections) {
      entry.imap.disconnect().catch(() => {});
      entry.smtp.disconnect().catch(() => {});
    }
    this.connections.clear();
  }

  async getImap(accountId: string): Promise<ImapClient> {
    const entry = await this.getOrCreate(accountId);
    entry.lastUsed = Date.now();
    return entry.imap;
  }

  async getSmtp(accountId: string): Promise<SmtpClient> {
    const entry = await this.getOrCreate(accountId);
    entry.lastUsed = Date.now();
    return entry.smtp;
  }

  private async getOrCreate(accountId: string): Promise<ConnectionEntry> {
    let entry = this.connections.get(accountId);
    if (entry) return entry;

    const account = this.accountManager.getAccount(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const password = this.accountManager.getAccountPassword(accountId);

    const imap = new ImapClient(account, password);
    const smtp = new SmtpClient(account, password);

    await imap.connect();
    await smtp.connect();

    entry = { imap, smtp, lastUsed: Date.now() };
    this.connections.set(accountId, entry);

    logger.info({ accountId }, 'Connection pool: new connection');
    return entry;
  }

  async removeConnection(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (entry) {
      await entry.imap.disconnect().catch(() => {});
      await entry.smtp.disconnect().catch(() => {});
      this.connections.delete(accountId);
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.connections) {
      if (now - entry.lastUsed > this.maxIdleMs) {
        logger.info({ accountId: id }, 'Connection pool: closing idle connection');
        await this.removeConnection(id);
      }
    }
  }
}

```

##### 📄 `src/email/imap-client.ts`

```typescript
import { ImapFlow } from 'imapflow';
import { Account, EmailMessage, EmailSearchCriteria, EmailFolder, EmailAddress } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class ImapClient {
  private client: ImapFlow | null = null;
  private account: Account;
  private password: string;

  constructor(account: Account, password: string) {
    this.account = account;
    this.password = password;
  }

  async connect(): Promise<void> {
    this.client = new ImapFlow({
      host: this.account.imap.host,
      port: this.account.imap.port,
      secure: this.account.imap.tls,
      auth: {
        user: this.account.email,
        pass: this.password
      },
      logger: false as any // We use our own logger
    });

    await this.client.connect();
    logger.info({ email: this.account.email }, 'IMAP connected');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
      logger.info({ email: this.account.email }, 'IMAP disconnected');
    }
  }

  private ensureConnected(): ImapFlow {
    if (!this.client) {
      throw new Error('IMAP client not connected. Call connect() first.');
    }
    return this.client;
  }

  async listFolders(): Promise<EmailFolder[]> {
    const client = this.ensureConnected();
    const mailboxes = await client.list();

    return mailboxes.map(mb => ({
      name: mb.name,
      path: mb.path,
      delimiter: mb.delimiter,
      messageCount: 0,
      unseenCount: 0,
      flags: mb.flags ? Array.from(mb.flags) : [],
      children: 'folders' in mb ? this.mapSubfolders(mb.folders as any[]) : undefined
    }));
  }

  private mapSubfolders(folders: any[]): EmailFolder[] {
    return folders.map(f => ({
      name: f.name,
      path: f.path,
      delimiter: f.delimiter,
      messageCount: 0,
      unseenCount: 0,
      flags: f.flags ? Array.from(f.flags) : [],
      children: f.folders ? this.mapSubfolders(f.folders) : undefined
    }));
  }

  async listEmails(
    folder: string = 'INBOX',
    criteria: EmailSearchCriteria = {}
  ): Promise<EmailMessage[]> {
    const client = this.ensureConnected();
    const lock = await client.getMailboxLock(folder);

    try {
      const messages: EmailMessage[] = [];
      const searchQuery = this.buildSearchQuery(criteria);
      const limit = criteria.limit || 50;
      const offset = criteria.offset || 0;

      let count = 0;
      let skipped = 0;

      for await (const msg of client.fetch(searchQuery, {
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
        uid: true
      })) {
        if (skipped < offset) {
          skipped++;
          continue;
        }
        if (count >= limit) break;

        messages.push(this.mapMessage(msg, folder));
        count++;
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  async readEmail(folder: string, uid: number): Promise<EmailMessage | null> {
    const client = this.ensureConnected();
    const lock = await client.getMailboxLock(folder);

    try {
      const msg = await client.fetchOne(String(uid), {
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: true,
        size: true,
        uid: true
      });

      if (!msg) return null;

      const message = this.mapMessage(msg, folder);

      // Get body text
      const bodyParts = await client.download(String(uid), undefined, { uid: true });
      if (bodyParts) {
        const chunks: Buffer[] = [];
        for await (const chunk of bodyParts.content) {
          chunks.push(chunk);
        }
        const bodyBuffer = Buffer.concat(chunks);
        message.body.text = bodyBuffer.toString('utf-8');
      }

      return message;
    } finally {
      lock.release();
    }
  }

  async moveEmail(uid: number, fromFolder: string, toFolder: string): Promise<void> {
    const client = this.ensureConnected();
    const lock = await client.getMailboxLock(fromFolder);

    try {
      await client.messageMove(String(uid), toFolder, { uid: true });
      logger.info({ uid, from: fromFolder, to: toFolder }, 'Email moved');
    } finally {
      lock.release();
    }
  }

  async deleteEmail(uid: number, folder: string): Promise<void> {
    const client = this.ensureConnected();
    const lock = await client.getMailboxLock(folder);

    try {
      await client.messageDelete(String(uid), { uid: true });
      logger.info({ uid, folder }, 'Email deleted');
    } finally {
      lock.release();
    }
  }

  async flagEmail(uid: number, folder: string, flags: string[], add: boolean = true): Promise<void> {
    const client = this.ensureConnected();
    const lock = await client.getMailboxLock(folder);

    try {
      if (add) {
        await client.messageFlagsAdd(String(uid), flags, { uid: true });
      } else {
        await client.messageFlagsRemove(String(uid), flags, { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      const folders = await this.listFolders();
      await this.disconnect();
      return folders.length > 0;
    } catch (error) {
      logger.error({ error, email: this.account.email }, 'IMAP connection test failed');
      try { await this.disconnect(); } catch {}
      return false;
    }
  }

  private buildSearchQuery(criteria: EmailSearchCriteria): any {
    const query: any = { all: true };

    if (criteria.from) query.from = criteria.from;
    if (criteria.to) query.to = criteria.to;
    if (criteria.subject) query.subject = criteria.subject;
    if (criteria.since) query.since = criteria.since;
    if (criteria.before) query.before = criteria.before;
    if (criteria.flagged !== undefined) {
      if (criteria.flagged) query.flagged = true;
      else query.unflagged = true;
    }
    if (criteria.read !== undefined) {
      if (criteria.read) query.seen = true;
      else query.unseen = true;
    }

    return query;
  }

  private mapMessage(msg: any, folder: string): EmailMessage {
    const envelope = msg.envelope || {};

    return {
      id: String(msg.uid),
      accountId: this.account.id,
      messageId: envelope.messageId || '',
      folder,
      from: this.mapAddress(envelope.from?.[0]),
      to: (envelope.to || []).map((a: any) => this.mapAddress(a)),
      cc: envelope.cc ? envelope.cc.map((a: any) => this.mapAddress(a)) : undefined,
      subject: envelope.subject || '(no subject)',
      body: { text: undefined, html: undefined },
      date: envelope.date ? new Date(envelope.date) : new Date(),
      flags: msg.flags ? Array.from(msg.flags) : [],
      attachments: [],
      headers: {},
      size: msg.size || 0,
      read: msg.flags?.has?.('\Seen') || false,
      flagged: msg.flags?.has?.('\Flagged') || false
    };
  }

  private mapAddress(addr: any): EmailAddress {
    if (!addr) return { address: 'unknown' };
    return {
      name: addr.name || undefined,
      address: addr.address || `${addr.mailbox || ''}@${addr.host || ''}`
    };
  }
}

```

##### 📄 `src/email/smtp-client.ts`

```typescript
import nodemailer, { Transporter } from 'nodemailer';
import { Account, SendEmailParams } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class SmtpClient {
  private transporter: Transporter | null = null;

  constructor(
    private account: Account,
    private password: string
  ) {}

  async connect(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: this.account.smtp.host,
      port: this.account.smtp.port,
      secure: this.account.smtp.port === 465,
      auth: {
        user: this.account.email,
        pass: this.password
      },
      tls: {
        rejectUnauthorized: true
      }
    });

    // Verify connection
    await this.transporter.verify();
    logger.info({ email: this.account.email }, 'SMTP connected');
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new Error('SMTP not connected. Call connect() first.');
    }

    const mailOptions: any = {
      from: this.account.email,
      to: params.to.join(', '),
      subject: params.subject,
      text: params.body,
    };

    if (params.cc?.length) mailOptions.cc = params.cc.join(', ');
    if (params.bcc?.length) mailOptions.bcc = params.bcc.join(', ');
    if (params.html) mailOptions.html = params.html;
    if (params.replyTo) mailOptions.replyTo = params.replyTo;
    if (params.inReplyTo) {
      mailOptions.inReplyTo = params.inReplyTo;
      mailOptions.references = params.inReplyTo;
    }

    if (params.attachments?.length) {
      mailOptions.attachments = params.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType
      }));
    }

    const result = await this.transporter.sendMail(mailOptions);

    logger.info({
      to: params.to,
      subject: params.subject,
      messageId: result.messageId
    }, 'Email sent');

    return { messageId: result.messageId };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch (error) {
      logger.error({ error, email: this.account.email }, 'SMTP connection test failed');
      try { await this.disconnect(); } catch {}
      return false;
    }
  }
}

```

#### 📁 personas

##### 📄 `src/personas/persona-manager.ts`

```typescript
import crypto from 'crypto';
import { DatabaseManager } from '../storage/database.js';
import { Persona } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class PersonaManager {
  constructor(private db: DatabaseManager) {}

  create(data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>): Persona {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.getDb().prepare(`
      INSERT INTO personas (id, account_id, name, description,
        personality, behavior, capabilities, knowledge_base,
        active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.accountId, data.name, data.description || '',
      JSON.stringify(data.personality),
      JSON.stringify(data.behavior),
      JSON.stringify(data.capabilities),
      data.knowledgeBase ? JSON.stringify(data.knowledgeBase) : null,
      data.active !== false ? 1 : 0,
      now, now
    );

    logger.info({ id, name: data.name }, 'Persona created');
    return this.get(id)!;
  }

  get(id: string): Persona | null {
    const row = this.db.getDb().prepare('SELECT * FROM personas WHERE id = ?').get(id) as any;
    return row ? this.rowToPersona(row) : null;
  }

  listByAccount(accountId: string): Persona[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM personas WHERE account_id = ? ORDER BY name'
    ).all(accountId) as any[];
    return rows.map(r => this.rowToPersona(r));
  }

  listAll(): Persona[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM personas ORDER BY name'
    ).all() as any[];
    return rows.map(r => this.rowToPersona(r));
  }

  update(id: string, updates: Partial<Persona>): Persona {
    const existing = this.get(id);
    if (!existing) throw new Error(`Persona ${id} not found`);

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.personality !== undefined) { fields.push('personality = ?'); values.push(JSON.stringify(updates.personality)); }
    if (updates.behavior !== undefined) { fields.push('behavior = ?'); values.push(JSON.stringify(updates.behavior)); }
    if (updates.capabilities !== undefined) { fields.push('capabilities = ?'); values.push(JSON.stringify(updates.capabilities)); }
    if (updates.knowledgeBase !== undefined) { fields.push('knowledge_base = ?'); values.push(JSON.stringify(updates.knowledgeBase)); }
    if (updates.active !== undefined) { fields.push('active = ?'); values.push(updates.active ? 1 : 0); }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);
      this.db.getDb().prepare(
        `UPDATE personas SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    return this.get(id)!;
  }

  delete(id: string): void {
    this.db.getDb().prepare('DELETE FROM personas WHERE id = ?').run(id);
    logger.info({ id }, 'Persona deleted');
  }

  private rowToPersona(row: any): Persona {
    return {
      id: row.id,
      accountId: row.account_id,
      name: row.name,
      description: row.description,
      personality: JSON.parse(row.personality),
      behavior: JSON.parse(row.behavior),
      capabilities: JSON.parse(row.capabilities),
      knowledgeBase: row.knowledge_base ? JSON.parse(row.knowledge_base) : undefined,
      active: !!row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

```

#### 📁 prompts

#### 📁 resources

#### 📁 secure-input

##### 📄 `src/secure-input/browser-launcher.ts`

```typescript
import { exec } from 'child_process';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function openBrowser(url: string): Promise<boolean> {
  const commands: Record<string, string> = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
    linux: `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || x-www-browser "${url}" 2>/dev/null`
  };

  const cmd = commands[process.platform];
  if (!cmd) {
    logger.warn({ platform: process.platform }, 'Unsupported platform for browser launch');
    return false;
  }

  return new Promise((resolve) => {
    exec(cmd, (error) => {
      if (error) {
        logger.warn({ error: error.message }, 'Could not open browser automatically');
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

```


---

**📄 Partie 1/2** - Suite dans le prochain message...
