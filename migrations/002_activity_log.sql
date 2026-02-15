-- migrations/002_activity_log.sql

-- Extended activity log for emails
CREATE TABLE IF NOT EXISTS email_activity_log (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  message_id TEXT, -- UID
  action TEXT NOT NULL, -- 'read', 'sent', 'synced', 'deleted', 'moved', 'download'
  subject TEXT,
  sender TEXT,
  recipient TEXT,
  persona_id TEXT,
  task_id TEXT,
  details TEXT, -- JSON extra info
  timestamp TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_activity_account ON email_activity_log(account_id);
CREATE INDEX IF NOT EXISTS idx_email_activity_action ON email_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_email_activity_timestamp ON email_activity_log(timestamp DESC);
