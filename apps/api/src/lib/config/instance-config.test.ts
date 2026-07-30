import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readInstanceConfig, writeInstanceConfig } from './instance-config';

const SCRATCH_PATH = `${import.meta.dir}/instance-config.test.scratch.yaml`;

beforeEach(() => {
  process.env.OSSPLAY_CONFIG_PATH = SCRATCH_PATH;
  rmSync(SCRATCH_PATH, { force: true });
});

afterEach(() => {
  rmSync(SCRATCH_PATH, { force: true });
});

describe('instance-config', () => {
  it('returns defaults when the file does not exist', () => {
    expect(readInstanceConfig()).toEqual({
      smtpHost: null,
      smtpPort: null,
      smtpUsername: null,
      smtpPasswordEncrypted: null,
      smtpFromAddress: null,
      smtpFromName: null,
      smtpSecure: true,
      domain: null,
      domainConfiguredAt: null,
    });
  });

  it('writes then reads back the same values', () => {
    writeInstanceConfig({ smtpHost: 'smtp.example.com', smtpPort: 587 });
    const config = readInstanceConfig();
    expect(config.smtpHost).toBe('smtp.example.com');
    expect(config.smtpPort).toBe(587);
  });

  it('a later patch merges over, not clobbers, previously-set fields', () => {
    writeInstanceConfig({ smtpHost: 'smtp.example.com', smtpFromAddress: 'noreply@example.com' });
    writeInstanceConfig({ domain: 'ossplay.example.com' });

    const config = readInstanceConfig();
    expect(config.smtpHost).toBe('smtp.example.com');
    expect(config.smtpFromAddress).toBe('noreply@example.com');
    expect(config.domain).toBe('ossplay.example.com');
  });

  it('a null patch value clears a previously-set field', () => {
    writeInstanceConfig({ domain: 'ossplay.example.com' });
    writeInstanceConfig({ domain: null });
    expect(readInstanceConfig().domain).toBeNull();
  });
});
