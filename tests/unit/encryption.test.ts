import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from '../../src/security/encryption.js';

describe('EncryptionService', () => {
  let encryption: EncryptionService;

  beforeEach(() => {
    encryption = new EncryptionService();
  });

  it('should derive a master key from password', async () => {
    const result = await encryption.deriveMasterKey('test-password-12345');
    expect(result.key).toBeInstanceOf(Buffer);
    expect(result.key.length).toBe(32);
    expect(result.salt).toBeTruthy();
    expect(result.config.algorithm).toBe('argon2id');
  });

  it('should derive the same key with the same salt', async () => {
    const result1 = await encryption.deriveMasterKey('test-password-12345');
    const result2 = await encryption.deriveMasterKey('test-password-12345', result1.salt);
    expect(result1.key.equals(result2.key)).toBe(true);
  });

  it('should derive different keys with different passwords', async () => {
    const result1 = await encryption.deriveMasterKey('password1');
    const result2 = await encryption.deriveMasterKey('password2', result1.salt);
    expect(result1.key.equals(result2.key)).toBe(false);
  });

  it('should encrypt and decrypt correctly', async () => {
    const { key } = await encryption.deriveMasterKey('test-password');
    encryption.setMasterKey(key);

    const plaintext = 'my-secret-email-password';
    const encrypted = encryption.encrypt(plaintext);

    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(encrypted.version).toBe(1);

    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for the same plaintext', async () => {
    const { key } = await encryption.deriveMasterKey('test-password');
    encryption.setMasterKey(key);

    const encrypted1 = encryption.encrypt('same-text');
    const encrypted2 = encryption.encrypt('same-text');

    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('should throw when encrypting without master key', () => {
    expect(() => encryption.encrypt('test')).toThrow('Master key not set');
  });

  it('should throw when decrypting without master key', () => {
    expect(() => encryption.decrypt({
      ciphertext: 'x',
      iv: 'x',
      tag: 'x',
      version: 1
    })).toThrow('Master key not set');
  });

  it('should clear master key from memory', async () => {
    const { key } = await encryption.deriveMasterKey('test');
    encryption.setMasterKey(key);
    expect(encryption.isUnlocked()).toBe(true);

    encryption.clearMasterKey();
    expect(encryption.isUnlocked()).toBe(false);
  });

  it('should sign and verify webhook payloads', () => {
    const payload = '{"event":"email.received"}';
    const secret = encryption.generateSecret();

    const signature = encryption.signPayload(payload, secret);
    expect(encryption.verifySignature(payload, signature, secret)).toBe(true);
    expect(encryption.verifySignature(payload + 'x', signature, secret)).toBe(false);
  });
});
