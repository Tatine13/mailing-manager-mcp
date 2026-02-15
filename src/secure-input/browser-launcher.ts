import { exec } from 'child_process';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function openBrowser(url: string): Promise<boolean> {
  const commands: Record<string, string> = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
    linux: `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || x-www-browser "${url}" 2>/dev/null`
  };

  const cmd = commands[process.platform];
  if (!cmd) {
    logger.warn({ platform: process.platform }, 'Unsupported platform for browser launch');
    return false;
  }

  return new Promise((resolve) => {
    exec(cmd, (error) => {
      if (error) {
        logger.warn({ error: error.message }, 'Could not open browser automatically');
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
