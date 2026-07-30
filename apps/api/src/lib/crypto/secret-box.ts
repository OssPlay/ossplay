import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Used for instance-level secrets at rest (currently: the SMTP password in
// instanceSettings). Flagging, not fixing here: organizations.s3Config's
// secretAccessKey is stored in plaintext today and would benefit from the
// same treatment — out of scope for this pass, see MEMORY.md.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const keyHex = process.env.OSSPLAY_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'OSSPLAY_ENCRYPTION_KEY is not set — required to encrypt/decrypt secrets at rest. ' +
        'Generate one with `openssl rand -hex 32` and set it in the environment.',
    );
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `OSSPLAY_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes).`,
    );
  }
  return key;
}

// Returns "iv:authTag:ciphertext", all hex-encoded.
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptSecret(encoded: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
