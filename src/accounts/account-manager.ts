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

    // Validation: if authMethod is password, ensure password is present
    if (authMethod === 'password' && !credentials.password) {
      throw new Error('Password is required for password authentication');
    }

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
