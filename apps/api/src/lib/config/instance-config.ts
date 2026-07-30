import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse, stringify } from 'yaml';

// Instance-wide settings, file-backed rather than a DB row — the same file
// works for self-hosted (bind-mounted next to docker-compose.yml) and a
// future SaaS deployment (a per-tenant file/ConfigMap mounted at the same
// well-known path). See OSSPLAY_CONFIG_PATH below.
export interface InstanceConfig {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  // AES-256-GCM via lib/crypto/secret-box.ts, same treatment it always had.
  smtpPasswordEncrypted: string | null;
  smtpFromAddress: string | null;
  smtpFromName: string | null;
  smtpSecure: boolean;
  domain: string | null;
  domainConfiguredAt: string | null; // ISO string — plain YAML has no native Date type
}

const DEFAULTS: InstanceConfig = {
  smtpHost: null,
  smtpPort: null,
  smtpUsername: null,
  smtpPasswordEncrypted: null,
  smtpFromAddress: null,
  smtpFromName: null,
  smtpSecure: true,
  domain: null,
  domainConfiguredAt: null,
};

function configPath(): string {
  return process.env.OSSPLAY_CONFIG_PATH ?? './ossplay.yaml';
}

export function readInstanceConfig(): InstanceConfig {
  const path = configPath();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { ...DEFAULTS };
  }
  return { ...DEFAULTS, ...parse(raw) };
}

// Reads-then-writes, so concurrent writers can clobber each other — fine at
// this scale (one operator submitting one form at a time), same consistency
// the single-row DB table effectively had without transactions either.
export function writeInstanceConfig(patch: Partial<InstanceConfig>): InstanceConfig {
  const next = { ...readInstanceConfig(), ...patch };
  const path = configPath();
  const dir = dirname(path);
  if (dir !== '.') mkdirSync(dir, { recursive: true });

  // Write to a temp file first, so a serialization error can't corrupt the
  // real file, then move it into place. Prefer rename (atomic — a crash
  // mid-write never leaves a torn file behind), but a bind-mounted target
  // (the self-hosted Docker case this file is built for) can't have its
  // directory entry replaced by rename — the kernel returns EBUSY, since
  // that path is itself a mount point. Fall back to an in-place overwrite
  // there; a torn write is still possible on a crash mid-write, but only in
  // that one case, and it's the same risk every other file-based instance
  // config already accepts.
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, stringify(next), 'utf8');
  try {
    renameSync(tmpPath, path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EBUSY') throw err;
    writeFileSync(path, stringify(next), 'utf8');
    rmSync(tmpPath, { force: true });
  }

  return next;
}

// Overwrites (rather than deletes) the file — a Docker bind-mounted target
// has to keep existing as a file (see the EBUSY handling above and the
// README's `touch infra/ossplay.yaml` prerequisite), so reset means "back
// to defaults," not "gone."
export function resetInstanceConfig(): InstanceConfig {
  return writeInstanceConfig({ ...DEFAULTS });
}
