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
