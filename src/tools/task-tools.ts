import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskEngine } from '../tasks/task-engine.js';
import { TaskTypeSchema, TaskScheduleTypeSchema } from '../core/types.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerTaskTools(
  server: McpServer,
  taskEngine: TaskEngine,
  isVaultReady: () => boolean
): void {

  server.tool(
    'create_task',
    'Create a scheduled task',
    {
      account_id: z.string().uuid().describe('Account ID'),
      name: z.string().min(1).describe('Task name'),
      type: TaskTypeSchema.describe('Task type'),
      schedule_type: TaskScheduleTypeSchema.describe('cron/interval/immediate'),
      schedule_value: z.string().describe('Cron expression or seconds'),
      parameters: z.string().optional().describe('JSON parameters')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        let params = {};
        if (args.parameters) {
          try { params = JSON.parse(args.parameters); } catch { /* ignore */ }
        }

        const task = taskEngine.create({
          accountId: args.account_id,
          name: args.name,
          description: '',
          type: args.type,
          schedule: {
            type: args.schedule_type,
            value: args.schedule_value,
            timezone: 'UTC'
          },
          parameters: params,
          status: 'active'
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Task created!\nID: ${task.id}\nName: ${task.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create task: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_tasks',
    'List all tasks',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      const tasks = taskEngine.listByAccount(account_id);

      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks found.' }] };
      }

      const list = tasks.map(t =>
        `• ${t.name} (${t.type}) [${t.status}] — Last: ${t.lastRun || 'never'} — ID: ${t.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📅 Tasks (${tasks.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'execute_task',
    'Manually execute a task immediately',
    {
      task_id: z.string().uuid().describe('Task ID')
    },
    async ({ task_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        await taskEngine.execute(task_id);
        return { content: [{ type: 'text', text: '✅ Task executed successfully.' }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Execution failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_task',
    'Delete a task',
    {
      task_id: z.string().uuid()
    },
    async ({ task_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      taskEngine.delete(task_id);
      return { content: [{ type: 'text', text: '✅ Task deleted.' }] };
    }
  );
}
