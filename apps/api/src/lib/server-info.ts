import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every service's Dockerfile COPYs the whole workspace's package.json
// manifests (bun install --frozen-lockfile needs them all, even though
// only one app's full source ends up in any given image) — so this file
// is reachable from apps/api's own container at runtime, not just in dev.
function readPackageVersion(relativePath: string): string | null {
  try {
    const raw = readFileSync(join(import.meta.dir, relativePath), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

export interface ServiceVersions {
  api: string | null;
  dashboard: string | null;
  worker: string | null;
}

export function readServiceVersions(): ServiceVersions {
  return {
    api: readPackageVersion('../../package.json'),
    dashboard: readPackageVersion('../../../dashboard/package.json'),
    worker: readPackageVersion('../../../worker/package.json'),
  };
}

const IP_LOOKUP_URL = 'https://api.ipify.org?format=json';
const IP_LOOKUP_TIMEOUT_MS = 3000;

// Best-effort only — there's no reliable way for a container to know its
// own public IP from the inside (a Docker bridge network IP is not it).
// Asking an external echo service is the same trick every ACME client
// implicitly relies on already (a domain can only get a cert here because
// the world can already reach this box on some public IP). Never throws;
// returns null on any failure so the caller can show an honest "unknown"
// state instead of a stale or wrong address.
export async function detectServerIp(): Promise<string | null> {
  try {
    const res = await fetch(IP_LOOKUP_URL, { signal: AbortSignal.timeout(IP_LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { ip?: string };
    return body.ip ?? null;
  } catch {
    return null;
  }
}
