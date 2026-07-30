import { rmSync, writeFileSync } from 'node:fs';
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
      smtp: {
        host: null,
        port: null,
        username: null,
        passwordEncrypted: null,
        from: { address: null, name: null },
        secure: true,
      },
      domain: { name: null, configuredAt: null },
    });
  });

  it('writes then reads back the same values', () => {
    writeInstanceConfig({ smtp: { host: 'smtp.example.com', port: 587 } });
    const config = readInstanceConfig();
    expect(config.smtp.host).toBe('smtp.example.com');
    expect(config.smtp.port).toBe(587);
  });

  it('a later patch merges over, not clobbers, previously-set fields', () => {
    writeInstanceConfig({
      smtp: { host: 'smtp.example.com', from: { address: 'noreply@example.com' } },
    });
    writeInstanceConfig({ domain: { name: 'ossplay.example.com' } });

    const config = readInstanceConfig();
    expect(config.smtp.host).toBe('smtp.example.com');
    expect(config.smtp.from.address).toBe('noreply@example.com');
    expect(config.domain.name).toBe('ossplay.example.com');
  });

  it('patching one smtp field preserves sibling smtp fields already set', () => {
    writeInstanceConfig({ smtp: { host: 'smtp.example.com', port: 587, username: 'apikey' } });
    writeInstanceConfig({ smtp: { port: 2525 } });

    const config = readInstanceConfig();
    expect(config.smtp.host).toBe('smtp.example.com');
    expect(config.smtp.port).toBe(2525);
    expect(config.smtp.username).toBe('apikey');
  });

  it('a null patch value clears a previously-set field', () => {
    writeInstanceConfig({ domain: { name: 'ossplay.example.com' } });
    writeInstanceConfig({ domain: { name: null } });
    expect(readInstanceConfig().domain.name).toBeNull();
  });

  it('a hand-edited file missing fields or whole sections still reads cleanly', () => {
    writeFileSync(SCRATCH_PATH, 'smtp:\n  host: smtp.example.com\n', 'utf8');
    const config = readInstanceConfig();
    expect(config.smtp.host).toBe('smtp.example.com');
    expect(config.smtp.port).toBeNull();
    expect(config.smtp.from).toEqual({ address: null, name: null });
    expect(config.domain).toEqual({ name: null, configuredAt: null });
  });
});
