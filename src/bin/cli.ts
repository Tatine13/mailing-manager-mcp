import { Command } from 'commander';
import { MailingManagerServer } from '../core/server.js';

const program = new Command();

program
  .name('mailing-manager')
  .description('Mailing Manager MCP — Multi-Account Email Management')
  .version('1.0.0');

program
  .command('setup')
  .description('Run the interactive setup wizard')
  .action(async () => {
    console.log('🚀 Mailing Manager MCP — Setup\n');
    const server = new MailingManagerServer();
    await server.initialize();
    console.log('\n✅ Setup complete. You can now use the MCP server.');
    await server.stop();
  });

program
  .command('server')
  .description('Start the MCP server')
  .option('-t, --transport <type>', 'Transport type (stdio|http|both)', 'stdio')
  .action(async (opts) => {
    const server = new MailingManagerServer();
    const shutdown = async () => { await server.stop(); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await server.initialize();
    await server.start(opts.transport);
  });

program.parse();
