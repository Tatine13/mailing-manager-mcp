import { DatabaseManager } from '../storage/database.js';
import { ConnectionPool } from '../email/connection-pool.js';
import { getLogger } from '../utils/logger.js';
import { AppConfig } from '../core/types.js';

const logger = getLogger();

export class SyncService {
  constructor(
    private db: DatabaseManager,
    private connectionPool: ConnectionPool,
    private config: AppConfig
  ) {}

  async syncAccount(accountId: string, folder: string = 'INBOX'): Promise<{ synced: number; total: number }> {
    logger.info({ accountId, folder }, 'Starting email synchronization');
    
    const imap = await this.connectionPool.getImap(accountId);
    const lastUid = this.db.getLastSyncedUid(accountId, folder);
    const maxEmails = this.config.tasks.syncMaxEmails || 100;

    // Search for emails newer than lastUid. Use lastUid + 1 to avoid re-syncing the same last message.
    const criteria = {
      limit: maxEmails,
      minUid: lastUid > 0 ? lastUid + 1 : undefined
    };

    const emails = await imap.listEmails(folder, criteria);
    let syncedCount = 0;

    for (const email of emails) {
      try {
        // Since we now fetch newest first, if we hit an email that exists in DB,
        // it means we are caught up. We can stop.
        const sqlite = this.db.getDb();
        const existing = sqlite.prepare('SELECT message_id FROM email_search WHERE message_id = ? AND account_id = ?')
          .get(email.id, accountId);
        
        if (existing) {
          logger.info({ accountId, folder, emailId: email.id }, 'Reached already synced emails. Catch-up complete.');
          break;
        }

        // For sync, we need the body text
        const fullEmail = await imap.readEmail(folder, parseInt(email.id, 10));
        if (!fullEmail) continue;

        this.db.saveEmail({
          message_id: email.id, // UID
          account_id: accountId,
          folder: folder,
          sender: email.from.address,
          recipients: email.to.map(t => t.address).join(', '),
          subject: email.subject,
          body_text: fullEmail.body.text || '',
          attachments: fullEmail.attachments.map(a => a.filename).join(', '),
          date: email.date.toISOString()
        });
        
        syncedCount++;
      } catch (err) {
        logger.error({ err, emailId: email.id }, 'Failed to sync individual email');
      }
    }

    if (syncedCount > 0) {
      this.db.logEmailActivity({
        account_id: accountId,
        action: 'sync',
        details: JSON.stringify({ synced: syncedCount, folder })
      });
    }

    logger.info({ accountId, folder, synced: syncedCount }, 'Synchronization complete');
    return { synced: syncedCount, total: emails.length };
  }
}
