import crypto from 'crypto';
import { DatabaseManager } from '../storage/database.js';
import { EncryptionService } from '../security/encryption.js';
import { InboundWebhook, OutboundWebhook, EncryptedData } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class WebhookManager {
  constructor(
    private db: DatabaseManager,
    private encryption: EncryptionService
  ) {}

  // ─── INBOUND ───

  createInbound(data: Omit<InboundWebhook, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): InboundWebhook {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const secret = this.encryption.generateSecret();
    const encryptedSecret = this.encryption.encrypt(secret);

    this.db.getDb().prepare(`
      INSERT INTO inbound_webhooks (id, name, description, endpoint, provider,
        account_id, secret_encrypted, active, actions, filters,
        trigger_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, data.name, data.description || '', data.endpoint, data.provider,
      data.accountId || null, JSON.stringify(encryptedSecret),
      data.active !== false ? 1 : 0,
      JSON.stringify(data.actions), data.filters ? JSON.stringify(data.filters) : null,
      now, now
    );

    logger.info({ id, name: data.name, endpoint: data.endpoint }, 'Inbound webhook created');
    return this.getInbound(id)!;
  }

  getInbound(id: string): InboundWebhook | null {
    const row = this.db.getDb().prepare('SELECT * FROM inbound_webhooks WHERE id = ?').get(id) as any;
    return row ? this.rowToInbound(row) : null;
  }

  getInboundByEndpoint(endpoint: string): InboundWebhook | null {
    const row = this.db.getDb().prepare('SELECT * FROM inbound_webhooks WHERE endpoint = ?').get(endpoint) as any;
    return row ? this.rowToInbound(row) : null;
  }

  listInbound(): InboundWebhook[] {
    const rows = this.db.getDb().prepare('SELECT * FROM inbound_webhooks ORDER BY name').all() as any[];
    return rows.map(r => this.rowToInbound(r));
  }

  getInboundSecret(id: string): string {
    const row = this.db.getDb().prepare(
      'SELECT secret_encrypted FROM inbound_webhooks WHERE id = ?'
    ).get(id) as { secret_encrypted: string } | undefined;

    if (!row) throw new Error(`Webhook ${id} not found`);
    const encrypted: EncryptedData = JSON.parse(row.secret_encrypted);
    return this.encryption.decrypt(encrypted);
  }

  deleteInbound(id: string): void {
    this.db.getDb().prepare('DELETE FROM inbound_webhooks WHERE id = ?').run(id);
    logger.info({ id }, 'Inbound webhook deleted');
  }

  updateInboundStats(id: string): void {
    const now = new Date().toISOString();
    this.db.getDb().prepare(`
      UPDATE inbound_webhooks SET trigger_count = trigger_count + 1, last_triggered = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
  }

  // ─── OUTBOUND ───

  createOutbound(data: Omit<OutboundWebhook, 'id' | 'createdAt' | 'updatedAt' | 'fireCount' | 'successCount' | 'failureCount'>): OutboundWebhook {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let encryptedCredentials: string | null = null;
    if (data.auth && data.auth.type !== 'none') {
      // Auth credentials should be passed via secure input, then encrypted
      encryptedCredentials = null; // Set later via updateOutboundAuth
    }

    this.db.getDb().prepare(`
      INSERT INTO outbound_webhooks (id, name, description, url, method,
        headers, auth_type, auth_credentials_encrypted,
        events, payload_config, retry_config,
        active, fire_count, success_count, failure_count,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(
      id, data.name, data.description || '', data.url, data.method || 'POST',
      JSON.stringify(data.headers || {}), data.auth?.type || null, encryptedCredentials,
      JSON.stringify(data.events), JSON.stringify(data.payload),
      JSON.stringify(data.retry),
      data.active !== false ? 1 : 0, now, now
    );

    logger.info({ id, name: data.name, url: data.url }, 'Outbound webhook created');
    return this.getOutbound(id)!;
  }

  getOutbound(id: string): OutboundWebhook | null {
    const row = this.db.getDb().prepare('SELECT * FROM outbound_webhooks WHERE id = ?').get(id) as any;
    return row ? this.rowToOutbound(row) : null;
  }

  listOutbound(): OutboundWebhook[] {
    const rows = this.db.getDb().prepare('SELECT * FROM outbound_webhooks ORDER BY name').all() as any[];
    return rows.map(r => this.rowToOutbound(r));
  }

  getOutboundsByEvent(event: string): OutboundWebhook[] {
    const all = this.listOutbound();
    return all.filter(w => w.active && w.events.includes(event as any));
  }

  deleteOutbound(id: string): void {
    this.db.getDb().prepare('DELETE FROM outbound_webhooks WHERE id = ?').run(id);
    logger.info({ id }, 'Outbound webhook deleted');
  }

  updateOutboundAuth(id: string, credentials: string): void {
    const encrypted = this.encryption.encrypt(credentials);
    const now = new Date().toISOString();
    this.db.getDb().prepare(`
      UPDATE outbound_webhooks SET auth_credentials_encrypted = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(encrypted), now, id);
  }

  updateOutboundStats(id: string, success: boolean): void {
    const now = new Date().toISOString();
    if (success) {
      this.db.getDb().prepare(`
        UPDATE outbound_webhooks SET fire_count = fire_count + 1, success_count = success_count + 1, last_fired = ?, updated_at = ? WHERE id = ?
      `).run(now, now, id);
    } else {
      this.db.getDb().prepare(`
        UPDATE outbound_webhooks SET fire_count = fire_count + 1, failure_count = failure_count + 1, updated_at = ? WHERE id = ?
      `).run(now, id);
    }
  }

  // ─── LOGS ───

  logWebhookExecution(log: {
    webhookId: string;
    direction: 'inbound' | 'outbound';
    event?: string;
    status: string;
    requestPayload?: string;
    responseStatus?: number;
    responseBody?: string;
    errorMessage?: string;
    durationMs?: number;
    attempt?: number;
  }): void {
    this.db.getDb().prepare(`
      INSERT INTO webhook_logs (id, webhook_id, direction, event, status,
        request_payload, response_status, response_body, error_message,
        duration_ms, attempt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), log.webhookId, log.direction,
      log.event || null, log.status,
      log.requestPayload || null, log.responseStatus || null,
      log.responseBody || null, log.errorMessage || null,
      log.durationMs || null, log.attempt || 1,
      new Date().toISOString()
    );
  }

  getWebhookLogs(webhookId: string, limit: number = 50): any[] {
    return this.db.getDb().prepare(`
      SELECT * FROM webhook_logs WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(webhookId, limit);
  }

  private rowToInbound(row: any): InboundWebhook {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      endpoint: row.endpoint,
      provider: row.provider,
      accountId: row.account_id || undefined,
      active: !!row.active,
      actions: JSON.parse(row.actions),
      filters: row.filters ? JSON.parse(row.filters) : undefined,
      lastTriggered: row.last_triggered || undefined,
      triggerCount: row.trigger_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToOutbound(row: any): OutboundWebhook {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      url: row.url,
      method: row.method,
      headers: JSON.parse(row.headers),
      auth: row.auth_type ? { type: row.auth_type } : undefined,
      events: JSON.parse(row.events),
      payload: JSON.parse(row.payload_config),
      retry: JSON.parse(row.retry_config),
      active: !!row.active,
      lastFired: row.last_fired || undefined,
      fireCount: row.fire_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
