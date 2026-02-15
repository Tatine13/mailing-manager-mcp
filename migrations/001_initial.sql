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
  attachments,
  date
);
