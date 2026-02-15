import { EncryptionService } from './src/security/encryption.js';
import { DatabaseManager } from './src/storage/database.js';
import { ConfigManager } from './src/core/config.js';

async function main() {
  const configManager = new ConfigManager('/home/fkomp/.mailing-manager');
  const db = new DatabaseManager(configManager.getDatabasePath());
  await db.initialize();
  
  const row = db.getDb().prepare('SELECT * FROM master_key WHERE id = 1').get();
  if (!row) {
    console.log('No master key in DB');
    return;
  }

  const encryption = new EncryptionService();
  const password = 'SimpleKey123456';
  
  console.log('Verifying password:', password);
  console.log('Hash in DB:', row.hash);
  
  try {
    const isValid = await encryption.verifyMasterKey(password, row.hash);
    console.log('Is valid?', isValid);
  } catch (err) {
    console.error('Error verifying:', err);
  }
}

main();
