import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/storage/database.js';
import { PersonaManager } from '../../src/personas/persona-manager.js';
import { DirectiveEngine } from '../../src/directives/directive-engine.js';
import { TaskEngine } from '../../src/tasks/task-engine.js';
import { EmailMessage } from '../../src/core/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Phase 5 Tests', () => {
  let db: DatabaseManager;
  let tmpDir: string;
  let accountId = 'account-123';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailing-test-p5-'));
    db = new DatabaseManager(path.join(tmpDir, 'test.db'));
    await db.initialize();

    // Create dummy account
    db.getDb().prepare(`
      INSERT INTO accounts (id, email, name, provider, auth_method, imap_host, imap_port, smtp_host, smtp_port, created_at, updated_at)
      VALUES (?, 'test@test.com', 'Test', 'custom', 'password', 'imap', 993, 'smtp', 587, ?, ?)
    `).run(accountId, new Date().toISOString(), new Date().toISOString());
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('PersonaManager', () => {
    it('should create and retrieve a persona', () => {
      const manager = new PersonaManager(db);
      const persona = manager.create({
        accountId,
        name: 'Test Persona',
        description: 'Test',
        personality: { tone: 'professional', style: 'concise', language: 'en', timezone: 'UTC' },
        behavior: { responseTime: 'immediate', autoReplyEnabled: false, priorityKeywords: [] },
        capabilities: { canSend: true, canDelete: false, canArchive: true, canMove: true, canForward: true },
        active: true
      });

      expect(persona.id).toBeDefined();
      expect(persona.name).toBe('Test Persona');
      expect(manager.get(persona.id)).toBeDefined();
    });
  });

  describe('DirectiveEngine', () => {
    it('should evaluate email conditions correctly', () => {
      const engine = new DirectiveEngine(db);
      const directive = engine.create({
        accountId,
        name: 'Test Directive',
        priority: 10,
        type: 'inbound',
        active: true,
        trigger: {
          conditions: [
            { field: 'subject', operator: 'contains', value: 'urgent' },
            { field: 'sender', operator: 'contains', value: 'boss' }
          ],
          matchAll: true
        },
        actions: [{ type: 'flag', parameters: { flag: 'urgent' } }]
      });

      const email1 = {
        subject: 'Urgent: Meeting',
        from: { address: 'boss@company.com' }
      } as EmailMessage;

      const email2 = {
        subject: 'Urgent: Lunch',
        from: { address: 'friend@gmail.com' }
      } as EmailMessage;

      const matches1 = engine.evaluateEmail(email1, [directive]);
      const matches2 = engine.evaluateEmail(email2, [directive]);

      expect(matches1.length).toBe(1);
      expect(matches2.length).toBe(0);
    });
  });

  describe('TaskEngine', () => {
    it('should create and schedule tasks', () => {
      const engine = new TaskEngine(db);
      const task = engine.create({
        accountId,
        type: 'custom',
        name: 'Test Task',
        schedule: { type: 'cron', value: '0 0 * * *', timezone: 'UTC' },
        parameters: {},
        status: 'active'
      });

      expect(task.id).toBeDefined();
      expect(task.status).toBe('active');
      
      // Stop scheduler to prevent actual execution during test cleanup
      engine.stopScheduler();
    });
  });
});
