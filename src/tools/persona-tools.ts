import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PersonaManager } from '../personas/persona-manager.js';
import { PersonaToneSchema, PersonaStyleSchema, ResponseTimeSchema } from '../core/types.js';

const VAULT_LOCKED_MSG = '🔒 Vault is locked. Set MAILING_MANAGER_MASTER_KEY env var and restart.';

export function registerPersonaTools(
  server: McpServer,
  personaManager: PersonaManager,
  isVaultReady: () => boolean
): void {

  server.tool(
    'create_persona',
    'Create a new AI persona for automated email handling',
    {
      account_id: z.string().uuid().describe('Account ID to associate with'),
      name: z.string().min(1).describe('Persona name'),
      description: z.string().optional().describe('Persona description'),
      tone: PersonaToneSchema.describe('Tone of voice'),
      style: PersonaStyleSchema.describe('Writing style'),
      language: z.string().default('en').describe('Language (en, fr, etc.)'),
      response_time: ResponseTimeSchema.default('within-hour').describe('Target response time')
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const persona = personaManager.create({
          accountId: args.account_id,
          name: args.name,
          description: args.description || '',
          personality: {
            tone: args.tone,
            style: args.style,
            language: args.language,
            timezone: 'UTC'
          },
          behavior: {
            responseTime: args.response_time,
            autoReplyEnabled: false,
            priorityKeywords: []
          },
          capabilities: {
            canSend: true,
            canDelete: false,
            canArchive: true,
            canMove: true,
            canForward: true
          },
          active: true
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Persona created successfully!\n\nName: ${persona.name}\nID: ${persona.id}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create persona: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_personas',
    'List all personas for an account',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const personas = personaManager.listByAccount(account_id);

        if (personas.length === 0) {
          return { content: [{ type: 'text', text: 'No personas found for this account.' }] };
        }

        const list = personas.map(p =>
          `• ${p.name} [${p.personality.tone}/${p.personality.style}] — ID: ${p.id}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🤖 Personas (${personas.length}):\n\n${list}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'update_persona',
    'Update an existing persona',
    {
      persona_id: z.string().uuid().describe('Persona ID'),
      name: z.string().optional(),
      description: z.string().optional(),
      active: z.boolean().optional()
    },
    async (args) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        const updates: any = {};
        if (args.name) updates.name = args.name;
        if (args.description) updates.description = args.description;
        if (args.active !== undefined) updates.active = args.active;

        const persona = personaManager.update(args.persona_id, updates);

        return {
          content: [{
            type: 'text',
            text: `✅ Persona updated successfully: ${persona.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Update failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_persona',
    'Delete a persona',
    {
      persona_id: z.string().uuid().describe('Persona ID')
    },
    async ({ persona_id }) => {
      if (!isVaultReady()) return { content: [{ type: 'text', text: VAULT_LOCKED_MSG }], isError: true };
      try {
        personaManager.delete(persona_id);
        return {
          content: [{ type: 'text', text: '✅ Persona deleted.' }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Delete failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
