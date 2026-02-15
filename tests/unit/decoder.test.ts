import { describe, it, expect } from 'vitest';
import { EmailDecoder } from '../../src/utils/decoder.js';

describe('EmailDecoder', () => {
  it('should decode simple quoted-printable text', () => {
    const input = 'Hello world';
    expect(EmailDecoder.decode(input, 'quoted-printable')).toBe('Hello world');
  });

  it('should decode French accents in quoted-printable', () => {
    // "pièce" in QP UTF-8
    const input = 'pi=C3=A8ce';
    expect(EmailDecoder.decode(input, 'quoted-printable')).toBe('pièce');
    
    // "élève"
    const input2 = '=C3=A9l=C3=A8ve';
    expect(EmailDecoder.decode(input2, 'quoted-printable')).toBe('élève');
  });

  it('should handle soft line breaks', () => {
    const input = 'This is a long line =\r\nthat continues here';
    expect(EmailDecoder.decode(input, 'quoted-printable')).toBe('This is a long line that continues here');
  });

  it('should decode emojis in quoted-printable', () => {
    // "🎉" in QP UTF-8: =F0=9F=8E=89
    const input = '=F0=9F=8E=89';
    expect(EmailDecoder.decode(input, 'quoted-printable')).toBe('🎉');
  });

  it('should auto-detect quoted-printable encoding', () => {
    const input = 'Mon élève a une pi=C3=A8ce.';
    expect(EmailDecoder.decode(input)).toBe('Mon élève a une pièce.');
  });

  it('should decode Base64', () => {
    // "Hello world" in Base64
    const input = 'SGVsbG8gd29ybGQ=';
    expect(EmailDecoder.decode(input, 'base64')).toBe('Hello world');
  });
});
