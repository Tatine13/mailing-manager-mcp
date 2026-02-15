import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MailingManagerServer } from '../../src/core/server.js';
import { SecureInput } from '../../src/secure-input/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock SecureInput to track calls
const masterKeySetupMock = vi.fn().mockResolvedValue('interactive-password');
const masterKeyUnlockMock = vi.fn().mockResolvedValue('interactive-password');

vi.mock('../../src/secure-input/index.js', () => {
  return {
    SecureInput: vi.fn().mockImplementation(() => ({
      masterKeySetup: masterKeySetupMock,
      masterKeyUnlock: masterKeyUnlockMock
    }))
  };
});

describe('Server Authentication via Env', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailing-env-test-'));
    vi.clearAllMocks();
    process.env.MAILING_MANAGER_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.MAILING_MANAGER_MASTER_KEY;
    delete process.env.MAILING_MANAGER_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should use MAILING_MANAGER_MASTER_KEY for setup if provided', async () => {
    // Setup env var
    process.env.MAILING_MANAGER_MASTER_KEY = 'env-provided-password';

    const server = new MailingManagerServer(tmpDir);
    await server.initialize();

    // Check that interactive setup was NOT called
    expect(masterKeySetupMock).not.toHaveBeenCalled();
    
    await server.stop();
  });

  it('should fallback to interactive setup if env var is missing', async () => {
    // Ensure env var is missing
    delete process.env.MAILING_MANAGER_MASTER_KEY;

    const server = new MailingManagerServer(tmpDir);
    await server.initialize();

    // Check that interactive setup WAS called
    expect(masterKeySetupMock).toHaveBeenCalled();

    await server.stop();
  });
});
