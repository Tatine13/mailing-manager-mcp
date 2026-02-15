import crypto from 'crypto';
import { EncryptedData, KeyDerivationConfig } from '../core/types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const CURRENT_VERSION = 1;

export class EncryptionService {
  private masterKey: Buffer | null = null;

  // Derive master key from password using argon2
  async deriveMasterKey(
    password: string,
    salt?: string,
    config?: Partial<KeyDerivationConfig>
  ): Promise<{ key: Buffer; salt: string; config: KeyDerivationConfig }> {
    let argon2: typeof import('argon2');
    try {
      argon2 = await import('argon2');
    } catch {
      throw new Error(
        'argon2 is required for key derivation. ' +
        'Run: npm install argon2'
      );
    }

    const derivationConfig: KeyDerivationConfig = {
      algorithm: 'argon2id',
      timeCost: config?.timeCost ?? 3,
      memoryCost: config?.memoryCost ?? 65536,
      parallelism: config?.parallelism ?? 4,
      saltLength: config?.saltLength ?? 32
    };

    const saltBuffer = salt
      ? Buffer.from(salt, 'hex')
      : crypto.randomBytes(derivationConfig.saltLength);

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: derivationConfig.timeCost,
      memoryCost: derivationConfig.memoryCost,
      parallelism: derivationConfig.parallelism,
      salt: saltBuffer,
      raw: true,
      hashLength: 32
    });

    return {
      key: hash,
      salt: saltBuffer.toString('hex'),
      config: derivationConfig
    };
  }

  // Set the master key (after derivation or unlock)
  setMasterKey(key: Buffer): void {
    this.masterKey = Buffer.from(key);
  }

  // Clear master key from memory
  clearMasterKey(): void {
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  // Check if master key is loaded
  isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  // Encrypt a string value
  encrypt(plaintext: string): EncryptedData {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv, {
      authTagLength: TAG_LENGTH
    });

    let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      version: CURRENT_VERSION
    };
  }

  // Decrypt an encrypted value
  decrypt(data: EncryptedData): string {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.masterKey,
      Buffer.from(data.iv, 'base64'),
      { authTagLength: TAG_LENGTH }
    );

    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));

    let decrypted = decipher.update(data.ciphertext, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  // Create a hash of the master key for verification (not the key itself)
  async hashMasterKey(password: string, salt: string): Promise<string> {
    let argon2: typeof import('argon2');
    try {
      argon2 = await import('argon2');
    } catch {
      throw new Error('argon2 required');
    }

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 65536,
      parallelism: 4,
      salt: Buffer.from(salt, 'hex')
    });

    return hash;
  }

  // Verify master key password against stored hash
  async verifyMasterKey(password: string, storedHash: string): Promise<boolean> {
    let argon2: typeof import('argon2');
    try {
      argon2 = await import('argon2');
    } catch {
      throw new Error('argon2 required');
    }

    return argon2.verify(storedHash, password);
  }

  // Generate a random secret (for webhook secrets, etc.)
  generateSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // HMAC signature for webhooks
  signPayload(payload: string, secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
    return crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');
  }

  // Verify HMAC signature
  verifySignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): boolean {
    const expected = this.signPayload(payload, secret, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }
}
