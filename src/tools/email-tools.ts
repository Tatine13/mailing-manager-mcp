import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConnectionPool } from '../email/connection-pool.js';
import { SyncService } from '../accounts/sync-service.js';
import { DatabaseManager } from '../storage/database.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerEmailTools(
  server: McpServer,
  connectionPool: ConnectionPool,
  syncService: SyncService,
  db: DatabaseManager,
  isVaultReady: () => boolean
): void {

  server.tool(
    'get_email_history',
    'View the history of email actions (read, sent, sync) performed by the MCP',
    {
      account_id: z.string().uuid().optional(),
      limit: z.number().int().default(20)
    },
    async ({ account_id, limit }) => {
      const sqlite = db.getDb();
      let query = 'SELECT * FROM email_activity_log';
      const params: any[] = [];
      
      if (account_id) { query += ' WHERE account_id = ?'; params.push(account_id); }
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const rows = sqlite.prepare(query).all(...params) as any[];
      
      if (rows.length === 0) return { content: [{ type: 'text', text: 'No activity found.' }] };

      const list = rows.map(r => 
        `[${r.timestamp}] ${r.action.toUpperCase()} - Account: ${r.account_id}\n  Msg: ${r.subject || '(no subject)'}\n  Target: ${r.recipient || r.sender || '-'}`
      ).join('\n\n');

      return { content: [{ type: 'text', text: `📜 Email Activity Log:\n\n${list}` }] };
    }
  );

  server.tool(
    'search_local_emails',
    'Search for emails in the local database (offline/fast search). Use this for quick lookups in synced emails.',
    {
      query: z.string().describe('Search query (supports FTS5 syntax like "nvidia AND cookoff")'),
      account_id: z.string().uuid().optional().describe('Filter by account'),
      has_attachments: z.boolean().optional().default(false).describe('Only show emails with attachments'),
      limit: z.number().int().default(20)
    },
    async ({ query, account_id, has_attachments, limit }) => {
      try {
        const rows = db.searchEmails(query, account_id, limit, has_attachments);
        
        if (rows.length === 0) return { content: [{ type: 'text', text: 'No results found in local database.' }] };

        const list = rows.map(r => {
          const attachInfo = r.attachments ? `\n  📎 Attachments: ${r.attachments}` : '';
          return `• [${r.date}] ${r.sender}\n  Subject: ${r.subject}${attachInfo}\n  Snippet: ${r.body_text.substring(0, 100)}...`;
        }).join('\n\n');

        return { content: [{ type: 'text', text: `🔍 Local Search Results (${rows.length}):\n\n${list}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `❌ Local search failed: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'sync_emails',
    'Synchronize emails from a folder to the local search database. Limits: Default 20, Max 100 (configurable via MAILING_MANAGER_SYNC_LIMIT).',
    {
      account_id: z.string().uuid().describe('Account ID'),
      folder: z.string().optional().default('INBOX').describe('Folder to sync')
    },
    async ({ account_id, folder }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const result = await syncService.syncAccount(account_id, folder);
        return {
          content: [{
            type: 'text',
            text: `✅ Synchronization complete!\n\nEmails synced: ${result.synced}/${result.total}\nFolder: ${folder}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Sync failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

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

        db.logEmailActivity({
          account_id: account_id,
          action: 'read',
          message_id: email_id,
          subject: email.subject,
          sender: email.from.address
        });

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
      reply_to_id: z.string().optional().describe('Message ID to reply to'),
      attachments: z.array(z.string()).optional().describe('Array of local file paths to attach')
    },
    async ({ account_id, to, subject, body, html, cc, bcc, reply_to_id, attachments }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const attachmentObjects = [];
        if (attachments && attachments.length > 0) {
          for (const filePath of attachments) {
            const content = await fs.readFile(filePath);
            attachmentObjects.push({
              filename: path.basename(filePath),
              content
            });
          }
        }

        const smtp = await connectionPool.getSmtp(account_id);
        const result = await smtp.sendEmail({
          accountId: account_id,
          to,
          subject,
          body,
          html,
          cc,
          bcc,
          inReplyTo: reply_to_id,
          attachments: attachmentObjects
        });

        db.logEmailActivity({
          account_id: account_id,
          action: 'sent',
          message_id: result.messageId,
          subject: subject,
          recipient: to.join(', '),
          persona_id: undefined // Could be passed if personaId was in args
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Email sent successfully!\nMessage ID: ${result.messageId}\nTo: ${to.join(', ')}\nAttachments: ${attachmentObjects.length}`
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
        
        db.logEmailActivity({
          account_id,
          action: 'move',
          message_id: email_id,
          details: JSON.stringify({ from: from_folder, to: to_folder })
        });

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
        
        db.logEmailActivity({
          account_id,
          action: 'delete',
          message_id: email_id,
          details: JSON.stringify({ folder: folder || 'INBOX' })
        });

        return {
          content: [{ type: 'text', text: `✅ Email deleted.` }]
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
    'download_attachment',
    'Download an email attachment to the local assets folder',
    {
      account_id: z.string().uuid(),
      email_id: z.string(),
      part_id: z.string().describe('Part ID of the attachment (e.g. "2")'),
      folder: z.string().optional().default('INBOX')
    },
    async ({ account_id, email_id, part_id, folder }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const imap = await connectionPool.getImap(account_id);
        
        const { content, filename } = await imap.downloadAttachment(folder, parseInt(email_id, 10), part_id);
        
        const targetDir = '/home/fkomp/Bureau/oracle/generated_assets/documents';
        const targetPath = path.join(targetDir, filename);
        
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(targetPath, content);
        
        db.logEmailActivity({
          account_id,
          action: 'download',
          message_id: email_id,
          details: JSON.stringify({ filename, path: targetPath, part: part_id })
        });

        return {
          content: [{ type: 'text', text: `✅ Attachment downloaded successfully!\n\nFile: ${filename}\nLocal Path: ${targetPath}` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Download failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
