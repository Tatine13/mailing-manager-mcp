import crypto from 'crypto';
import Handlebars from 'handlebars';
import { WebhookManager } from './webhook-manager.js';
import { EncryptionService } from '../security/encryption.js';
import { WebhookEvent, WebhookEventPayload, OutboundWebhook } from '../core/types.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class WebhookDispatcher {
  constructor(
    private webhookManager: WebhookManager,
    private encryption: EncryptionService
  ) {}

  async dispatch(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    const webhooks = this.webhookManager.getOutboundsByEvent(event);

    for (const webhook of webhooks) {
      try {
        await this.sendWebhook(webhook, event, data);
      } catch (error) {
        logger.error({
          webhookId: webhook.id,
          event,
          error
        }, 'Webhook dispatch failed');
      }
    }
  }

  private async sendWebhook(
    webhook: OutboundWebhook,
    event: WebhookEvent,
    data: Record<string, unknown>,
    attempt: number = 1
  ): Promise<void> {
    const startTime = Date.now();
    const payload: WebhookEventPayload = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      source: {
        accountId: (data.accountId as string) || '',
        accountEmail: (data.accountEmail as string) || '',
        personaId: data.personaId as string | undefined
      },
      data,
      metadata: {
        mcpVersion: '1.0.0',
        webhookId: webhook.id,
        attempt,
        maxAttempts: webhook.retry.maxAttempts
      }
    };

    let body: string;
    if (webhook.payload.template) {
      const template = Handlebars.compile(webhook.payload.template);
      body = template(payload);
    } else {
      body = JSON.stringify(payload);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MailingManager-MCP/1.0',
      'X-Webhook-Id': payload.id,
      'X-Webhook-Timestamp': payload.timestamp,
      ...webhook.headers
    };

    // Auth headers
    if (webhook.auth && webhook.auth.type !== 'none') {
      const authHeaders = await this.getAuthHeaders(webhook);
      Object.assign(headers, authHeaders);
    }

    // Sign payload
    const signature = this.encryption.signPayload(
      body,
      this.encryption.generateSecret() // Use webhook-specific secret in production
    );
    headers['X-Webhook-Signature'] = signature;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(webhook.url, {
        method: webhook.method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody.substring(0, 500)}`);
      }

      // Success
      this.webhookManager.updateOutboundStats(webhook.id, true);
      this.webhookManager.logWebhookExecution({
        webhookId: webhook.id,
        direction: 'outbound',
        event,
        status: 'success',
        requestPayload: body.substring(0, 10000),
        responseStatus: response.status,
        responseBody: responseBody.substring(0, 5000),
        durationMs: Date.now() - startTime,
        attempt
      });

      logger.info({
        webhookId: webhook.id,
        url: webhook.url,
        event
      }, 'Webhook dispatched');

      getEventBus().emit('webhook.dispatched', {
        webhookId: webhook.id,
        event
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.webhookManager.logWebhookExecution({
        webhookId: webhook.id,
        direction: 'outbound',
        event,
        status: 'failed',
        requestPayload: body.substring(0, 10000),
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        attempt
      });

      // Retry
      if (webhook.retry.enabled && attempt < webhook.retry.maxAttempts) {
        const delayMs = webhook.retry.backoffMs * Math.pow(2, attempt - 1);
        logger.warn({
          webhookId: webhook.id,
          attempt: attempt + 1,
          delayMs
        }, 'Webhook retry scheduled');

        setTimeout(() => {
          this.sendWebhook(webhook, event, data, attempt + 1).catch(() => {});
        }, delayMs);
      } else {
        this.webhookManager.updateOutboundStats(webhook.id, false);
        logger.error({
          webhookId: webhook.id,
          error: errorMsg
        }, 'Webhook failed permanently');
      }
    }
  }

  private async getAuthHeaders(webhook: OutboundWebhook): Promise<Record<string, string>> {
    if (!webhook.auth) return {};

    // Get encrypted credentials from DB
    const row = this.webhookManager.getOutbound(webhook.id);
    if (!row?.auth) return {};

    // Note: credentials are decrypted from DB when needed
    // For now return empty; the credential decryption happens via webhook-manager
    return {};
  }
}
