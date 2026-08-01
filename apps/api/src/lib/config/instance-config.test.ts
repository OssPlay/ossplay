import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rmSync, writeFileSync } from 'node:fs';
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
      domain: { name: null, configuredAt: null },
    });
  });

  it('writes then reads back the same values', () => {
    writeInstanceConfig({ domain: { name: 'ossplay.example.com' } });
    const config = readInstanceConfig();
    expect(config.domain.name).toBe('ossplay.example.com');
  });

  it('a later patch merges over, not clobbers, previously-set fields', () => {
    writeInstanceConfig({ domain: { name: 'ossplay.example.com' } });
    writeInstanceConfig({ domain: { configuredAt: '2026-01-01T00:00:00.000Z' } });

    const config = readInstanceConfig();
    expect(config.domain.name).toBe('ossplay.example.com');
    expect(config.domain.configuredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('a null patch value clears a previously-set field', () => {
    writeInstanceConfig({ domain: { name: 'ossplay.example.com' } });
    writeInstanceConfig({ domain: { name: null } });
    expect(readInstanceConfig().domain.name).toBeNull();
  });

  it('a hand-edited file missing fields or whole sections still reads cleanly', () => {
    writeFileSync(SCRATCH_PATH, 'domain:\n  name: ossplay.example.com\n', 'utf8');
    const config = readInstanceConfig();
    expect(config.domain.name).toBe('ossplay.example.com');
    expect(config.domain.configuredAt).toBeNull();
  });
});
