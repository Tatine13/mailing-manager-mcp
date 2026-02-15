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
