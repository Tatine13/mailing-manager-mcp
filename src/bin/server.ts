// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: Redirect ALL console output to stderr.
// The MCP SDK uses stdout exclusively for JSON-RPC communication.
// Any stray console.log WILL corrupt the protocol and crash the connection.
// ─────────────────────────────────────────────────────────────────────────────
const originalConsoleLog = console.log;
console.log = console.error;

import { MailingManagerServer } from '../core/server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let transport: 'stdio' | 'http' | 'both' = 'stdio';
  const transportArg = args.find(a => a.startsWith('--transport'));
  if (transportArg) {
    const idx = args.indexOf(transportArg);
    const value = transportArg.includes('=')
      ? transportArg.split('=')[1]
      : args[idx + 1];
    if (value === 'http' || value === 'both' || value === 'stdio') {
      transport = value;
    }
  }

  const dataDir = process.env.MAILING_MANAGER_DATA_DIR || undefined;

  const server = new MailingManagerServer(dataDir);

  // Handle graceful shutdown
  const shutdown = async () => {
    try {
      await server.stop();
    } catch { /* ignore shutdown errors */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Catch unhandled errors to prevent silent crashes
  process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error);
    // Don't exit — keep MCP transport alive if possible
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
    // Don't exit — keep MCP transport alive if possible
  });

  try {
    // Phase 1: Initialize core (non-blocking, no crypto)
    await server.initialize();

    // Phase 2: Connect transport FIRST, then unlock vault
    await server.start(transport);
  } catch (error) {
    console.error('[STARTUP FAILED]', error);
    // If we reach here, the transport was never connected.
    // Exit with error so the MCP client knows to retry.
    process.exit(1);
  }
}

main();
