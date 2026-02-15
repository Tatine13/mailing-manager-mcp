import { describe, it, expect } from 'vitest';
import {
  AccountSchema,
  PersonaSchema,
  DirectiveSchema,
  TaskSchema,
  InboundWebhookSchema,
  OutboundWebhookSchema
} from '../../src/core/types.js';

describe('Schema Validation', () => {
  it('should validate a correct account', () => {
    const account = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      name: 'Test Account',
      provider: 'gmail',
      authMethod: 'oauth2',
      imap: { host: 'imap.gmail.com', port: 993, tls: true },
      smtp: { host: 'smtp.gmail.com', port: 587, tls: true },
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => AccountSchema.parse(account)).not.toThrow();
  });

  it('should reject an account with invalid email', () => {
    const account = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'not-an-email',
      name: 'Test',
      provider: 'gmail',
      authMethod: 'oauth2',
      imap: { host: 'imap.gmail.com', port: 993, tls: true },
      smtp: { host: 'smtp.gmail.com', port: 587, tls: true },
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => AccountSchema.parse(account)).toThrow();
  });

  it('should reject an account with invalid provider', () => {
    const account = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      name: 'Test',
      provider: 'invalid_provider',
      authMethod: 'password',
      imap: { host: 'imap.test.com', port: 993, tls: true },
      smtp: { host: 'smtp.test.com', port: 587, tls: true },
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => AccountSchema.parse(account)).toThrow();
  });

  it('should validate a correct persona', () => {
    const persona = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Executive Assistant',
      description: 'Professional persona',
      personality: {
        tone: 'professional',
        style: 'concise',
        language: 'en',
        timezone: 'UTC'
      },
      behavior: {
        responseTime: 'within-hour',
        autoReplyEnabled: false,
        priorityKeywords: ['urgent']
      },
      capabilities: {
        canSend: true,
        canDelete: false,
        canArchive: true,
        canMove: true,
        canForward: true
      },
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => PersonaSchema.parse(persona)).not.toThrow();
  });

  it('should validate a correct directive', () => {
    const directive = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Urgent Boss Reply',
      priority: 10,
      type: 'inbound',
      active: true,
      trigger: {
        conditions: [
          { field: 'sender', operator: 'contains', value: 'boss@company.com' }
        ],
        matchAll: true
      },
      actions: [
        { type: 'flag', parameters: { flag: 'urgent' } }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => DirectiveSchema.parse(directive)).not.toThrow();
  });

  it('should validate a correct task', () => {
    const task = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      accountId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'digest_generation',
      name: 'Daily Digest',
      schedule: {
        type: 'cron',
        value: '0 9 * * *',
        timezone: 'Europe/Paris'
      },
      parameters: { includeCategories: ['urgent', 'important'] },
      status: 'active',
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => TaskSchema.parse(task)).not.toThrow();
  });

  it('should validate a correct inbound webhook', () => {
    const webhook = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      name: 'CRM Deal Won',
      endpoint: '/crm/deal-won',
      provider: 'custom',
      active: true,
      actions: [
        { type: 'trigger_task', parameters: { taskId: 'abc' } }
      ],
      triggerCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => InboundWebhookSchema.parse(webhook)).not.toThrow();
  });

  it('should validate a correct outbound webhook', () => {
    const webhook = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      name: 'Slack Alert',
      url: 'https://hooks.slack.com/services/T00/B00/xxx',
      method: 'POST',
      headers: {},
      events: ['email.received'],
      payload: { format: 'json' },
      retry: { enabled: true, maxAttempts: 3, backoffMs: 5000 },
      active: true,
      fireCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(() => OutboundWebhookSchema.parse(webhook)).not.toThrow();
  });
});
