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
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath, {
      // WAL mode for better concurrent read performance
    });

    // Enable WAL mode
    this.db.pragma('journal_mode = WAL');
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    // Busy timeout 5 seconds
    this.db.pragma('busy_timeout = 5000');

    // Run migrations
    await this.runMigrations();

    this.logger.info({ path: this.dbPath }, 'Database initialized');
  }

  private async runMigrations(): Promise<void> {
    const db = this.getDb();

    // Create migrations tracking table
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

  // Utility: run in transaction
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  // Email storage methods
  saveEmail(data: {
    message_id: string;
    account_id: string;
    folder: string;
    sender: string;
    recipients: string;
    subject: string;
    body_text: string;
    attachments: string;
    date: string;
  }): void {
    const db = this.getDb();
    
    // Check if exists to avoid duplicates
    const existing = db.prepare('SELECT message_id FROM email_search WHERE message_id = ? AND account_id = ?')
      .get(data.message_id, data.account_id);
    
    if (existing) return;

    db.prepare(`
      INSERT INTO email_search (message_id, account_id, folder, sender, recipients, subject, body_text, attachments, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.message_id,
      data.account_id,
      data.folder,
      data.sender,
      data.recipients,
      data.subject,
      data.body_text,
      data.attachments,
      data.date
    );
  }

  getLastSyncedUid(accountId: string, folder: string): number {
    const db = this.getDb();
    const row = db.prepare('SELECT MAX(CAST(message_id AS INTEGER)) as max_uid FROM email_search WHERE account_id = ? AND folder = ?')
      .get(accountId, folder) as { max_uid: number | null };
    return row?.max_uid || 0;
  }

  logEmailActivity(data: {
    account_id: string;
    action: string;
    message_id?: string;
    subject?: string;
    sender?: string;
    recipient?: string;
    persona_id?: string;
    task_id?: string;
    details?: string;
  }): void {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.getDb().prepare(`
      INSERT INTO email_activity_log (id, account_id, message_id, action, subject, sender, recipient, persona_id, task_id, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.account_id, data.message_id || null, data.action, data.subject || null,
      data.sender || null, data.recipient || null, data.persona_id || null, data.task_id || null,
      data.details || null, timestamp
    );
  }

  searchEmails(query: string, accountId?: string, limit: number = 20, hasAttachments: boolean = false): any[] {
    const db = this.getDb();
    // Search across all FTS columns
    let sql = `
      SELECT * FROM email_search 
      WHERE email_search MATCH ?
    `;
    const params: any[] = [query];

    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }

    if (hasAttachments) {
      sql += " AND attachments != ''";
    }

    sql += ' ORDER BY date DESC LIMIT ?';
    params.push(limit);

    return db.prepare(sql).all(...params);
  }
}
