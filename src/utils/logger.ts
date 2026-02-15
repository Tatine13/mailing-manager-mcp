import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

export function createLogger(config?: {
  level?: string;
  file?: string;
}): pino.Logger {
  const level = config?.level || process.env.LOG_LEVEL || 'info';

  // In test mode: silent logger
  if (process.env.NODE_ENV === 'test') {
    loggerInstance = pino({ level: 'silent' });
    return loggerInstance;
  }

  const targets: pino.TransportTargetOptions[] = [];

  // Always log to stderr (fd 2) — MCP uses stdout for protocol
  targets.push({
    target: 'pino-pretty',
    options: {
      destination: 2, // stderr
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    },
    level
  });

  // Optional file logging
  if (config?.file) {
    targets.push({
      target: 'pino/file',
      options: { destination: config.file },
      level
    });
  }

  try {
    loggerInstance = pino({
      level,
      transport: { targets }
    });
  } catch {
    // Fallback if pino-pretty is not available (e.g. production install)
    // Write plain JSON to stderr
    loggerInstance = pino(
      { level },
      pino.destination({ dest: 2, sync: true })
    );
  }

  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    // Create a default logger. Will be replaced when createLogger()
    // is called with actual config during server initialization.
    loggerInstance = createLogger();
  }
  return loggerInstance;
}
