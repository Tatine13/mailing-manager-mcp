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
