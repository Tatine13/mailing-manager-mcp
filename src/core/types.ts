
import { z } from 'zod';

// ═══════════════════════════════════════════════════
// ACCOUNT TYPES
// ═══════════════════════════════════════════════════

export const EmailProviderSchema = z.enum([
  'gmail',
  'outlook',
  'yahoo',
  'icloud',
  'fastmail',
  'protonmail',
  'custom'
]);
export type EmailProvider = z.infer<typeof EmailProviderSchema>;

export const AuthMethodSchema = z.enum([
  'password',
  'oauth2',
  'app-password'
]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  provider: EmailProviderSchema,
  authMethod: AuthMethodSchema,
  imap: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    tls: z.boolean().default(true)
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    tls: z.boolean().default(true)
  }),
  // Credentials are stored encrypted, never in this object
  oauth2: z.object({
    clientId: z.string(),
    // clientSecret, refreshToken, accessToken stored encrypted in DB
    tokenExpiry: z.string().datetime().optional()
  }).optional(),
  active: z.boolean().default(true),
  defaultPersonaId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Account = z.infer<typeof AccountSchema>;

export interface AccountCredentials {
  email: string;
  password?: string;
  provider: EmailProvider;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

// ═══════════════════════════════════════════════════
// EMAIL TYPES
// ═══════════════════════════════════════════════════

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailMessage {
  id: string;
  accountId: string;
  messageId: string;
  folder: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  date: Date;
  flags: string[];
  attachments: EmailAttachment[];
  headers: Record<string, string>;
  size: number;
  read: boolean;
  flagged: boolean;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  part: string;
  contentId?: string;
  content?: Buffer;
}

export interface EmailSearchCriteria {
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  since?: Date;
  before?: Date;
  minUid?: number;
  flagged?: boolean;
  read?: boolean;
  hasAttachments?: boolean;
  limit?: number;
  offset?: number;
}

export interface SendEmailParams {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  replyTo?: string;
  inReplyTo?: string;
  personaId?: string;
}

export interface EmailFolder {
  name: string;
  path: string;
  delimiter: string;
  messageCount: number;
  unseenCount: number;
  flags: string[];
  children?: EmailFolder[];
}

// ═══════════════════════════════════════════════════
// PERSONA TYPES
// ═══════════════════════════════════════════════════

export const PersonaToneSchema = z.enum([
  'professional',
  'casual',
  'formal',
  'friendly',
  'authoritative'
]);
export type PersonaTone = z.infer<typeof PersonaToneSchema>;

export const PersonaStyleSchema = z.enum([
  'concise',
  'detailed',
  'bullet-points',
  'storytelling'
]);
export type PersonaStyle = z.infer<typeof PersonaStyleSchema>;

export const ResponseTimeSchema = z.enum([
  'immediate',
  'within-hour',
  'within-day',
  'deferred'
]);
export type ResponseTime = z.infer<typeof ResponseTimeSchema>;

export const PersonaSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  personality: z.object({
    tone: PersonaToneSchema,
    style: PersonaStyleSchema,
    language: z.string().default('en'),
    timezone: z.string().default('UTC'),
    signature: z.string().optional()
  }),
  behavior: z.object({
    responseTime: ResponseTimeSchema,
    autoReplyEnabled: z.boolean().default(false),
    priorityKeywords: z.array(z.string()).default([])
  }),
  capabilities: z.object({
    canSend: z.boolean().default(true),
    canDelete: z.boolean().default(false),
    canArchive: z.boolean().default(true),
    canMove: z.boolean().default(true),
    canForward: z.boolean().default(true),
    allowedRecipients: z.array(z.string()).optional(),
    blockedRecipients: z.array(z.string()).optional()
  }),
  knowledgeBase: z.object({
    context: z.string(),
    commonPhrases: z.array(z.string()).default([])
  }).optional(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Persona = z.infer<typeof PersonaSchema>;

// ═══════════════════════════════════════════════════
// DIRECTIVE TYPES
// ═══════════════════════════════════════════════════

export const ConditionFieldSchema = z.enum([
  'sender',
  'recipient',
  'subject',
  'body',
  'attachments',
  'folder',
  'date',
  'flags'
]);
export type ConditionField = z.infer<typeof ConditionFieldSchema>;

export const ConditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'regex',
  'in',
  'not_in',
  'greater_than',
  'less_than'
]);
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export const ConditionSchema = z.object({
  field: ConditionFieldSchema,
  operator: ConditionOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]),
  caseSensitive: z.boolean().default(false)
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ActionTypeSchema = z.enum([
  'reply',
  'forward',
  'archive',
  'delete',
  'move',
  'tag',
  'flag',
  'persona_switch',
  'webhook_trigger',
  'task_trigger'
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSchema = z.object({
  type: ActionTypeSchema,
  parameters: z.record(z.unknown()),
  delay: z.number().int().nonnegative().optional()
});
export type Action = z.infer<typeof ActionSchema>;

export const DirectiveTypeSchema = z.enum(['inbound', 'outbound', 'both']);
export type DirectiveType = z.infer<typeof DirectiveTypeSchema>;

export const DirectiveSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  priority: z.number().int().min(0).max(1000).default(100),
  type: DirectiveTypeSchema,
  active: z.boolean().default(true),
  trigger: z.object({
    conditions: z.array(ConditionSchema).min(1),
    matchAll: z.boolean().default(true),
    timeWindow: z.object({
      start: z.string(),
      end: z.string(),
      days: z.array(z.number().int().min(0).max(6))
    }).optional()
  }),
  actions: z.array(ActionSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Directive = z.infer<typeof DirectiveSchema>;

// ═══════════════════════════════════════════════════
// TASK TYPES
// ═══════════════════════════════════════════════════

export const TaskTypeSchema = z.enum([
  'schedule_reply',
  'auto_respond',
  'digest_generation',
  'cleanup',
  'backup',
  'sync',
  'email_filtering',
  'attachment_processing',
  'followup_reminder',
  'custom'
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'failed',
  'running'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskScheduleTypeSchema = z.enum([
  'immediate',
  'cron',
  'interval',
  'trigger'
]);
export type TaskScheduleType = z.infer<typeof TaskScheduleTypeSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  type: TaskTypeSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  schedule: z.object({
    type: TaskScheduleTypeSchema,
    value: z.string().optional(),
    timezone: z.string().default('UTC')
  }),
  parameters: z.record(z.unknown()),
  personaId: z.string().uuid().optional(),
  status: TaskStatusSchema.default('active'),
  lastRun: z.string().datetime().optional(),
  nextRun: z.string().datetime().optional(),
  runCount: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Task = z.infer<typeof TaskSchema>;

// ═══════════════════════════════════════════════════
// WEBHOOK TYPES
// ═══════════════════════════════════════════════════

export const WebhookProviderSchema = z.enum([
  'gmail',
  'outlook',
  'sendgrid',
  'mailgun',
  'postmark',
  'custom',
  'zapier',
  'n8n',
  'make'
]);
export type WebhookProvider = z.infer<typeof WebhookProviderSchema>;

export const WebhookEventSchema = z.enum([
  'email.received',
  'email.sent',
  'email.read',
  'email.deleted',
  'email.moved',
  'email.flagged',
  'email.attachment_received',
  'task.completed',
  'task.failed',
  'task.scheduled',
  'directive.triggered',
  'persona.switched',
  'account.connected',
  'account.disconnected',
  'account.error',
  'digest.generated',
  'security.alert'
]);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookActionTypeSchema = z.enum([
  'process_email',
  'trigger_task',
  'apply_directive',
  'notify',
  'forward_webhook',
  'execute_persona',
  'custom_script'
]);
export type WebhookActionType = z.infer<typeof WebhookActionTypeSchema>;

export const InboundWebhookSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  endpoint: z.string().min(1),
  provider: WebhookProviderSchema,
  accountId: z.string().uuid().optional(),
  active: z.boolean().default(true),
  actions: z.array(z.object({
    type: WebhookActionTypeSchema,
    parameters: z.record(z.unknown()),
    condition: z.string().optional()
  })).min(1),
  filters: z.array(z.object({
    field: z.string(),
    operator: ConditionOperatorSchema,
    value: z.union([z.string(), z.array(z.string())])
  })).optional(),
  lastTriggered: z.string().datetime().optional(),
  triggerCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type InboundWebhook = z.infer<typeof InboundWebhookSchema>;

export const OutboundWebhookAuthTypeSchema = z.enum([
  'bearer',
  'basic',
  'api-key',
  'oauth2',
  'none'
]);
export type OutboundWebhookAuthType = z.infer<typeof OutboundWebhookAuthTypeSchema>;

export const OutboundWebhookSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string()).default({}),
  auth: z.object({
    type: OutboundWebhookAuthTypeSchema,
    // credentials stored encrypted in DB
  }).optional(),
  events: z.array(WebhookEventSchema).min(1),
  payload: z.object({
    format: z.enum(['json', 'form', 'xml']).default('json'),
    template: z.string().optional(),
    includeRawEmail: z.boolean().default(false),
    maxPayloadSizeBytes: z.number().int().positive().default(5242880)
  }),
  retry: z.object({
    enabled: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    backoffMs: z.number().int().positive().default(5000)
  }),
  active: z.boolean().default(true),
  lastFired: z.string().datetime().optional(),
  fireCount: z.number().int().nonnegative().default(0),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type OutboundWebhook = z.infer<typeof OutboundWebhookSchema>;

export interface WebhookEventPayload {
  id: string;
  timestamp: string;
  event: WebhookEvent;
  source: {
    accountId: string;
    accountEmail: string;
    personaId?: string;
  };
  data: Record<string, unknown>;
  metadata: {
    mcpVersion: string;
    webhookId: string;
    attempt: number;
    maxAttempts: number;
  };
}

// ═══════════════════════════════════════════════════
// SECURE INPUT TYPES
// ═══════════════════════════════════════════════════

export interface SecureInputField {
  name: string;
  label: string;
  type: 'password' | 'text' | 'email' | 'select' | 'number';
  required: boolean;
  placeholder?: string;
  value?: string;
  readOnly?: boolean;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    message?: string;
  };
}

export interface SecureInputRequest {
  type: 'password' | 'oauth-callback' | 'account-setup' | 'multi-field';
  title: string;
  message: string;
  fields?: SecureInputField[];
  timeout?: number;
  theme?: 'light' | 'dark' | 'system';
}

export interface SecureSession {
  id: string;
  token: string;
  csrf: string;
  serverPublicKey: string;
  request: SecureInputRequest;
  used: boolean;
  createdAt: number;
  resolve: ((data: Record<string, string>) => void) | null;
  reject: ((error: Error) => void) | null;
}

// ═══════════════════════════════════════════════════
// SECURITY TYPES
// ═══════════════════════════════════════════════════

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
}

export interface KeyDerivationConfig {
  algorithm: 'argon2id';
  timeCost: number;
  memoryCost: number;
  parallelism: number;
  saltLength: number;
}

export interface MasterKeyInfo {
  salt: string;
  hash: string;
  derivation: KeyDerivationConfig;
  createdAt: string;
}

// ═══════════════════════════════════════════════════
// CONFIG TYPES
// ═══════════════════════════════════════════════════

export interface AppConfig {
  version: string;
  dataDir: string;
  transport: 'stdio' | 'http' | 'both';
  http: {
    port: number;
    host: string;
  };
  webhooks: {
    enabled: boolean;
    port: number;
    host: string;
    basePath: string;
    ssl: {
      enabled: boolean;
      certPath?: string;
      keyPath?: string;
    };
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
    security: {
      signatureValidation: boolean;
      signatureHeader: string;
      signatureAlgorithm: 'sha256' | 'sha512';
      ipWhitelist: string[];
      replayProtection: boolean;
      replayWindowSeconds: number;
    };
    queue: {
      maxRetries: number;
      retryBackoff: 'linear' | 'exponential';
      retryDelayMs: number;
      persistQueue: boolean;
      maxQueueSize: number;
    };
  };
  tasks: {
    schedulerEnabled: boolean;
    maxConcurrent: number;
    syncMaxEmails: number;
    autoSyncOnLoad: boolean;
  };
  security: {
    autoLockTimeoutMinutes: number;
    keyDerivation: KeyDerivationConfig;
  };
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    file?: string;
  };
}

// ═══════════════════════════════════════════════════
// EVENT BUS TYPES
// ═══════════════════════════════════════════════════

export interface EventMap {
  'email.received': { accountId: string; message: EmailMessage };
  'email.sent': { accountId: string; messageId: string; to: string[] };
  'email.deleted': { accountId: string; messageId: string };
  'email.moved': { accountId: string; messageId: string; from: string; to: string };
  'email.flagged': { accountId: string; messageId: string; flags: string[] };
  'task.completed': { taskId: string; result: unknown };
  'task.failed': { taskId: string; error: string };
  'directive.triggered': { directiveId: string; emailId: string };
  'persona.switched': { accountId: string; personaId: string };
  'account.connected': { accountId: string };
  'account.disconnected': { accountId: string };
  'account.error': { accountId: string; error: string };
  'webhook.received': { webhookId: string; requestId: string; payload: unknown };
  'webhook.dispatched': { webhookId: string; event: WebhookEvent };
  'security.alert': { type: string; message: string };
}

// ═══════════════════════════════════════════════════
// PROVIDER PRESETS
// ═══════════════════════════════════════════════════

export interface ProviderPreset {
  name: string;
  provider: EmailProvider;
  imap: {
    host: string;
    port: number;
    tls: boolean;
  };
  smtp: {
    host: string;
    port: number;
    tls: boolean;
  };
  supportedAuth: AuthMethod[];
  oauth2?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
  notes?: string;
}
