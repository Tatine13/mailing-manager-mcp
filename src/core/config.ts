import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { AppConfig } from './types.js';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.mailing-manager');

const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.1',
  dataDir: DEFAULT_DATA_DIR,
  transport: 'stdio',
  http: {
    port: 3000,
    host: '127.0.0.1'
  },
  webhooks: {
    enabled: false,
    port: 3100,
    host: '127.0.0.1',
    basePath: '/webhooks',
    ssl: {
      enabled: false
    },
    rateLimit: {
      windowMs: 900000, // 15 minutes
      maxRequests: 100
    },
    security: {
      signatureValidation: true,
      signatureHeader: 'x-webhook-signature',
      signatureAlgorithm: 'sha256',
      ipWhitelist: [],
      replayProtection: true,
      replayWindowSeconds: 300
    },
    queue: {
      maxRetries: 3,
      retryBackoff: 'exponential',
      retryDelayMs: 5000,
      persistQueue: true,
      maxQueueSize: 10000
    }
  },
  tasks: {
    schedulerEnabled: true,
    maxConcurrent: 5,
    syncMaxEmails: 20,
    autoSyncOnLoad: false
  },
  security: {
    autoLockTimeoutMinutes: 30,
    keyDerivation: {
      algorithm: 'argon2id',
      timeCost: 3,
      memoryCost: 65536,
      parallelism: 4,
      saltLength: 32
    }
  },
  logging: {
    level: 'info'
  }
};

export class ConfigManager {
  private config: AppConfig;
  private configPath: string;

  constructor(dataDir?: string) {
    const dir = dataDir || process.env.MAILING_MANAGER_DATA_DIR || DEFAULT_DATA_DIR;
    this.configPath = path.join(dir, 'config.json');
    this.config = { ...DEFAULT_CONFIG, dataDir: dir };
  }

  async load(): Promise<AppConfig> {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const loaded = JSON.parse(raw) as Partial<AppConfig>;
      this.config = this.merge(DEFAULT_CONFIG, loaded);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // First run, use defaults
        await this.save();
      } else {
        throw error;
      }
    }

    // Apply Environment Overrides (Priority: Env > Config File > Default)
    if (process.env.MAILING_MANAGER_HTTP_PORT) {
      this.config.http.port = parseInt(process.env.MAILING_MANAGER_HTTP_PORT, 10);
    }
    if (process.env.MAILING_MANAGER_HTTP_HOST) {
      this.config.http.host = process.env.MAILING_MANAGER_HTTP_HOST;
    }
    if (process.env.MAILING_MANAGER_WEBHOOK_PORT) {
      this.config.webhooks.port = parseInt(process.env.MAILING_MANAGER_WEBHOOK_PORT, 10);
    }
    if (process.env.MAILING_MANAGER_WEBHOOK_HOST) {
      this.config.webhooks.host = process.env.MAILING_MANAGER_WEBHOOK_HOST;
    }
    if (process.env.MAILING_MANAGER_WEBHOOK_ENABLED) {
      this.config.webhooks.enabled = process.env.MAILING_MANAGER_WEBHOOK_ENABLED === 'true';
    }
    
    // Sync Limit Logic: Default 20, Hard Max 100
    const HARD_MAX_SYNC = 100;
    const DEFAULT_SYNC = 20;
    const envLimit = process.env.MAILING_MANAGER_SYNC_LIMIT 
      ? parseInt(process.env.MAILING_MANAGER_SYNC_LIMIT, 10) 
      : DEFAULT_SYNC;
    
    this.config.tasks.syncMaxEmails = Math.min(envLimit, HARD_MAX_SYNC);

    if (process.env.MAILING_MANAGER_AUTO_SYNC_ON_LOAD) {
      this.config.tasks.autoSyncOnLoad = process.env.MAILING_MANAGER_AUTO_SYNC_ON_LOAD === 'true';
    }
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL as any;
    }

    return this.config;
  }

  async save(): Promise<void> {
    await fs.mkdir(this.config.dataDir, { recursive: true });
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );
  }

  get(): AppConfig {
    return this.config;
  }

  async update(partial: Partial<AppConfig>): Promise<AppConfig> {
    this.config = this.merge(this.config, partial);
    await this.save();
    return this.config;
  }

  getDataDir(): string {
    return this.config.dataDir;
  }

  getDatabasePath(): string {
    return path.join(this.config.dataDir, 'mailing-manager.db');
  }

  private merge<T extends object>(base: T, override: Partial<T>): T {
    const result = { ...base } as any;
    const ov = override as any;
    for (const key of Object.keys(ov)) {
      const val = ov[key];
      if (
        val !== undefined &&
        typeof val === 'object' &&
        val !== null &&
        !Array.isArray(val) &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = this.merge(
          result[key],
          val
        );
      } else if (val !== undefined) {
        result[key] = val;
      }
    }
    return result as T;
  }
}
