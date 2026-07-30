import { beforeAll, describe, expect, it } from 'bun:test';
import { decryptSecret, encryptSecret } from './secret-box';

beforeAll(() => {
  process.env.OSSPLAY_ENCRYPTION_KEY ??= 'a'.repeat(64);
});

describe('secret-box', () => {
  it('round-trips a plaintext string', () => {
    const plaintext = 'super-secret-smtp-password';
    const encoded = encryptSecret(plaintext);
    expect(decryptSecret(encoded)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'same input';
    expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
  });

  it('throws on tampered ciphertext', () => {
    const encoded = encryptSecret('hello world');
    const [iv, authTag, ciphertext] = encoded.split(':');
    const tampered = [iv, authTag, `${ciphertext?.slice(0, -2)}ff`].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws on a tampered auth tag', () => {
    const encoded = encryptSecret('hello world');
    const [iv, authTag, ciphertext] = encoded.split(':');
    const tampered = [iv, `${authTag?.slice(0, -2)}ff`, ciphertext].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws a clear error when OSSPLAY_ENCRYPTION_KEY is missing', () => {
    const original = process.env.OSSPLAY_ENCRYPTION_KEY;
    delete process.env.OSSPLAY_ENCRYPTION_KEY;
    try {
      expect(() => encryptSecret('x')).toThrow(/OSSPLAY_ENCRYPTION_KEY/);
    } finally {
      process.env.OSSPLAY_ENCRYPTION_KEY = original;
    }
  });
});
