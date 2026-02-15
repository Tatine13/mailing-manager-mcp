import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import crypto from 'crypto';
import { WebhookManager } from './webhook-manager.js';
import { EncryptionService } from '../security/encryption.js';
import { AppConfig } from '../core/types.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class WebhookServer {
  private server: Server | null = null;
  private replayCache: Map<string, number> = new Map();
  private requestCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private config: AppConfig['webhooks'],
    private webhookManager: WebhookManager,
    private encryption: EncryptionService
  ) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        logger.info({
          host: this.config.host,
          port: this.config.port,
          basePath: this.config.basePath
        }, 'Webhook server started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Rate limiting
      const clientIP = req.socket.remoteAddress || 'unknown';
      if (!this.checkRateLimit(clientIP)) {
        res.writeHead(429, { 'Retry-After': '60', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests' }));
        return;
      }

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature, X-Webhook-Id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // Only POST for webhooks
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Extract endpoint path
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const webhookPath = url.pathname.replace(this.config.basePath, '').replace(/^\/+/, '/');

      // Find matching webhook
      const webhook = this.webhookManager.getInboundByEndpoint(webhookPath);
      if (!webhook || !webhook.active) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Webhook not found' }));
        return;
      }

      // Read body
      const body = await this.readBody(req);

      // Signature validation
      if (this.config.security.signatureValidation) {
        const signature = req.headers[this.config.security.signatureHeader] as string;
        if (signature) {
          const secret = this.webhookManager.getInboundSecret(webhook.id);
          const isValid = this.encryption.verifySignature(
            body, signature, secret,
            this.config.security.signatureAlgorithm
          );
          if (!isValid) {
            logger.warn({ webhookId: webhook.id, requestId }, 'Invalid webhook signature');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
          }
        }
      }

      // IP whitelist
      if (this.config.security.ipWhitelist.length > 0) {
        if (!this.config.security.ipWhitelist.includes(clientIP)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
      }

      // Replay protection
      if (this.config.security.replayProtection) {
        const eventId = req.headers['x-webhook-id'] as string;
        if (eventId && this.isReplay(eventId)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'duplicate', requestId }));
          return;
        }
        if (eventId) {
          this.markProcessed(eventId);
        }
      }

      // Parse payload
      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { raw: body };
      }

      // Apply filters
      if (webhook.filters?.length) {
        const passes = this.applyFilters(payload, webhook.filters);
        if (!passes) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'filtered', requestId }));

          this.webhookManager.logWebhookExecution({
            webhookId: webhook.id,
            direction: 'inbound',
            status: 'filtered',
            requestPayload: body.substring(0, 10000),
            durationMs: Date.now() - startTime
          });
          return;
        }
      }

      // Accept immediately
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted', requestId }));

      // Update stats
      this.webhookManager.updateInboundStats(webhook.id);

      // Log
      this.webhookManager.logWebhookExecution({
        webhookId: webhook.id,
        direction: 'inbound',
        status: 'success',
        requestPayload: body.substring(0, 10000),
        responseStatus: 200,
        durationMs: Date.now() - startTime
      });

      // Emit event for processing
      getEventBus().emit('webhook.received', {
        webhookId: webhook.id,
        requestId,
        payload
      });

    } catch (error) {
      logger.error({ requestId, error }, 'Webhook server error');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', requestId }));
      }
    }
  }

  private applyFilters(payload: any, filters: any[]): boolean {
    for (const filter of filters) {
      const value = this.getNestedValue(payload, filter.field);
      if (value === undefined) return false;

      const stringValue = String(value);
      switch (filter.operator) {
        case 'equals':
          if (stringValue !== filter.value) return false;
          break;
        case 'contains':
          if (!stringValue.includes(filter.value)) return false;
          break;
        case 'not_contains':
          if (stringValue.includes(filter.value)) return false;
          break;
        default:
          break;
      }
    }
    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, key) => o?.[key], obj);
  }

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      this.requestCounts.set(ip, {
        count: 1,
        resetAt: now + this.config.rateLimit.windowMs
      });
      return true;
    }

    entry.count++;
    return entry.count <= this.config.rateLimit.maxRequests;
  }

  private isReplay(eventId: string): boolean {
    return this.replayCache.has(eventId);
  }

  private markProcessed(eventId: string): void {
    this.replayCache.set(eventId, Date.now());
    // Cleanup old entries
    const cutoff = Date.now() - (this.config.security.replayWindowSeconds * 1000);
    for (const [id, timestamp] of this.replayCache) {
      if (timestamp < cutoff) this.replayCache.delete(id);
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) {
          reject(new Error('Payload too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  getActiveCount(): number {
    return this.webhookManager.listInbound().filter(w => w.active).length;
  }
}
