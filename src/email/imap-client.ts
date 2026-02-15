import { ImapFlow } from 'imapflow';
import { Account, EmailMessage, EmailSearchCriteria, EmailFolder, EmailAddress, EmailAttachment } from '../core/types.js';
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
      logger: false as any
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
      const limit = criteria.limit || 50;
      
      const totalMessages = client.mailbox?.exists || 0;
      if (totalMessages === 0) return [];

      const start = Math.max(1, totalMessages - limit + 1);
      const sequence = `${totalMessages}:${start}`;

      for await (const msg of client.fetch(sequence, {
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
        uid: true
      })) {
        messages.push(this.mapMessage(msg, folder));
      }

      return messages.reverse();
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

      const bodyResult = await client.download(String(uid), undefined, { uid: true });
      if (bodyResult) {
        const chunks: Buffer[] = [];
        for await (const chunk of bodyResult.content) {
          chunks.push(chunk);
        }
        const fullContent = Buffer.concat(chunks).toString('utf-8');
        message.body.text = this.stripRawHeaders(fullContent);
      }

      return message;
    } finally {
      lock.release();
    }
  }

  private stripRawHeaders(content: string): string {
    const parts = content.split(/\r?\n\r?\n/);
    if (parts.length > 1) {
      if (content.includes('Content-Type: multipart')) {
        const subParts = content.split(/--_NmP-[a-f0-9]+/);
        const textPart = subParts.find(p => p.includes('Content-Type: text/plain'));
        if (textPart) {
          return textPart.split(/\r?\n\r?\n/).slice(1).join('\n\n').split(/--/)[0].trim();
        }
      }
      return parts.slice(1).join('\n\n').split(/--_NmP/)[0].trim();
    }
    return content.trim();
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

  async downloadAttachment(folder: string, uid: number, part: string): Promise<{ content: Buffer; filename: string }> {
    const client = this.ensureConnected();
    const lock = await client.getMailboxLock(folder);

    try {
      const partData = await client.download(String(uid), part, { uid: true });
      if (!partData) throw new Error(`Attachment part ${part} not found`);

      const chunks: Buffer[] = [];
      for await (const chunk of partData.content) {
        chunks.push(chunk);
      }
      
      return {
        content: Buffer.concat(chunks),
        filename: partData.meta.filename || 'attachment'
      };
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
    if (criteria.minUid) query.uid = `${criteria.minUid}:*`;
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
    const attachments = this.extractAttachments(msg.bodyStructure);

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
      attachments,
      headers: {},
      size: msg.size || 0,
      read: msg.flags?.has?.('\\Seen') || msg.flags?.includes?.('\\Seen') || false,
      flagged: msg.flags?.has?.('\\Flagged') || msg.flags?.includes?.('\\Flagged') || false
    };
  }

  private extractAttachments(structure: any): any[] {
    const attachments: any[] = [];
    if (!structure) return attachments;

    const walk = (part: any) => {
      const isAttachment = part.disposition === 'attachment' || part.disposition?.type === 'attachment' || part.filename || part.parameters?.name;
      if (isAttachment) {
        attachments.push({
          filename: part.filename || part.parameters?.name || 'unnamed',
          contentType: part.type || 'application/octet-stream',
          size: part.size || 0,
          part: part.part
        });
      }
      if (part.childNodes) {
        part.childNodes.forEach(walk);
      }
    };

    walk(structure);
    return attachments;
  }

  private mapAddress(addr: any): EmailAddress {
    if (!addr) return { address: 'unknown' };
    return {
      name: addr.name || undefined,
      address: addr.address || `${addr.mailbox || ''}@${addr.host || ''}`
    };
  }
}
