import crypto from 'crypto';
import { Cron } from 'croner';
import { DatabaseManager } from '../storage/database.js';
import { Task } from '../core/types.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class TaskEngine {
  private scheduledJobs: Map<string, Cron> = new Map();

  constructor(private db: DatabaseManager) {}

  create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Task {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.getDb().prepare(`
      INSERT INTO tasks (id, account_id, type, name, description,
        schedule, parameters, persona_id, status,
        run_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, data.accountId, data.type, data.name, data.description || '',
      JSON.stringify(data.schedule), JSON.stringify(data.parameters),
      data.personaId || null, data.status || 'active',
      now, now
    );

    const task = this.get(id)!;

    // Schedule if active
    if (task.status === 'active') {
      this.scheduleTask(task);
    }

    logger.info({ id, name: data.name, type: data.type }, 'Task created');
    return task;
  }

  get(id: string): Task | null {
    const row = this.db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  listByAccount(accountId: string): Task[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM tasks WHERE account_id = ? ORDER BY created_at DESC'
    ).all(accountId) as any[];
    return rows.map(r => this.rowToTask(r));
  }

  listAll(): Task[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    ).all() as any[];
    return rows.map(r => this.rowToTask(r));
  }

  update(id: string, updates: Partial<Task>): Task {
    const existing = this.get(id);
    if (!existing) throw new Error(`Task ${id} not found`);

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.schedule !== undefined) { fields.push('schedule = ?'); values.push(JSON.stringify(updates.schedule)); }
    if (updates.parameters !== undefined) { fields.push('parameters = ?'); values.push(JSON.stringify(updates.parameters)); }
    if (updates.personaId !== undefined) { fields.push('persona_id = ?'); values.push(updates.personaId); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.lastRun !== undefined) { fields.push('last_run = ?'); values.push(updates.lastRun); }
    if (updates.nextRun !== undefined) { fields.push('next_run = ?'); values.push(updates.nextRun); }
    if (updates.lastError !== undefined) { fields.push('last_error = ?'); values.push(updates.lastError); }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);
      this.db.getDb().prepare(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    // Reschedule if needed
    const updated = this.get(id)!;
    this.unscheduleTask(id);
    if (updated.status === 'active') {
      this.scheduleTask(updated);
    }

    return updated;
  }

  delete(id: string): void {
    this.unscheduleTask(id);
    this.db.getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
    logger.info({ id }, 'Task deleted');
  }

  pause(id: string): Task {
    return this.update(id, { status: 'paused' });
  }

  resume(id: string): Task {
    return this.update(id, { status: 'active' });
  }

  // Execute a task manually
  async execute(id: string): Promise<void> {
    const task = this.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const now = new Date().toISOString();

    try {
      this.update(id, { status: 'running', lastRun: now });
      
      this.db.logEmailActivity({
        account_id: task.accountId,
        action: 'task_start',
        task_id: task.id,
        subject: `Task: ${task.name}`,
        details: JSON.stringify({ type: task.type })
      });

      // TODO: Implement actual task execution logic per task type
      logger.info({ id, type: task.type }, 'Task executed');

      this.db.getDb().prepare(
        'UPDATE tasks SET run_count = run_count + 1, status = ?, last_error = NULL, updated_at = ? WHERE id = ?'
      ).run('active', now, id);

      this.db.logEmailActivity({
        account_id: task.accountId,
        action: 'task_complete',
        task_id: task.id,
        subject: `Task: ${task.name}`,
        details: JSON.stringify({ type: task.type, runCount: task.runCount + 1 })
      });

      getEventBus().emit('task.completed', { taskId: id, result: {} });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.update(id, { status: 'failed', lastError: errorMsg });
      
      this.db.logEmailActivity({
        account_id: task.accountId,
        action: 'task_failed',
        task_id: task.id,
        subject: `Task: ${task.name}`,
        details: JSON.stringify({ type: task.type, error: errorMsg })
      });

      getEventBus().emit('task.failed', { taskId: id, error: errorMsg });
      throw error;
    }
  }

  // Start all active scheduled tasks
  startScheduler(): void {
    const activeTasks = this.db.getDb().prepare(
      "SELECT * FROM tasks WHERE status = 'active'"
    ).all() as any[];

    for (const row of activeTasks) {
      const task = this.rowToTask(row);
      this.scheduleTask(task);
    }

    logger.info({ activeTasks: activeTasks.length }, 'Task scheduler started');
  }

  // Stop all scheduled tasks
  stopScheduler(): void {
    for (const [, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
    logger.info('Task scheduler stopped');
  }

  private scheduleTask(task: Task): void {
    if (task.schedule.type === 'cron' && task.schedule.value) {
      const job = new Cron(task.schedule.value, {
        timezone: task.schedule.timezone || 'UTC'
      }, () => {
        this.execute(task.id).catch(err => {
          logger.error({ taskId: task.id, error: err }, 'Scheduled task failed');
        });
      });

      this.scheduledJobs.set(task.id, job);
      logger.debug({ id: task.id, cron: task.schedule.value }, 'Task scheduled');
    } else if (task.schedule.type === 'interval' && task.schedule.value) {
      const intervalMs = parseInt(task.schedule.value, 10) * 1000;
      const cronExpression = `*/${Math.max(1, Math.floor(intervalMs / 1000))} * * * * *`;

      try {
        const job = new Cron(cronExpression, () => {
          this.execute(task.id).catch(err => {
            logger.error({ taskId: task.id, error: err }, 'Interval task failed');
          });
        });

        this.scheduledJobs.set(task.id, job);
      } catch {
        // Interval too large for cron, use setInterval fallback
        const interval = setInterval(() => {
          this.execute(task.id).catch(err => {
            logger.error({ taskId: task.id, error: err }, 'Interval task failed');
          });
        }, intervalMs);

        // Wrap in a fake Cron-like object for cleanup
        this.scheduledJobs.set(task.id, {
          stop: () => clearInterval(interval)
        } as any);
      }
    }
  }

  private unscheduleTask(id: string): void {
    const job = this.scheduledJobs.get(id);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(id);
    }
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      name: row.name,
      description: row.description || '',
      schedule: JSON.parse(row.schedule),
      parameters: JSON.parse(row.parameters),
      personaId: row.persona_id || undefined,
      status: row.status,
      lastRun: row.last_run || undefined,
      nextRun: row.next_run || undefined,
      runCount: row.run_count,
      lastError: row.last_error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
