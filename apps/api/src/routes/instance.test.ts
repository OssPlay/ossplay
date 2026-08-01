import { beforeAll, describe, expect, it } from 'bun:test';
import { bootstrapAdmin, jsonRequest, truncateAllTables } from '../test-support';

describe.skipIf(!process.env.DATABASE_URL)('instance domain settings', () => {
  beforeAll(async () => {
    await truncateAllTables();
    process.env.OSSPLAY_ENCRYPTION_KEY ??= 'b'.repeat(64);
  });

  let rootCookie: string;

  it('bootstraps the instance root', async () => {
    ({ sessionCookie: rootCookie } = await bootstrapAdmin());
  });

  it('GET /instance/domain starts unconfigured', async () => {
    const res = await jsonRequest('/instance/domain', { cookie: rootCookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ domain: null, domainConfiguredAt: null });
  });

  // requireInstancePermission's actual root-vs-not gating (can() with the
  // 'instance:manage_settings' permission) is covered directly by
  // permissions.test.ts; this just confirms the route requires auth at all.
  it('rejects an unauthenticated request', async () => {
    const res = await jsonRequest('/instance/domain');
    expect(res.status).toBe(401);
  });

  it('PUT /instance/domain rejects localhost and bare IPs', async () => {
    for (const domain of ['localhost', '127.0.0.1', 'not a domain']) {
      const res = await jsonRequest('/instance/domain', {
        method: 'PUT',
        cookie: rootCookie,
        body: JSON.stringify({ domain }),
      });
      expect(res.status).toBe(400);
    }
  });

  // No OSSPLAY_CADDY_ADMIN_URL is set in this test process (local/CI, not
  // Docker), so this exercises the real graceful-degradation path — the
  // domain is still saved even though Caddy can't be reached.
  it('PUT /instance/domain saves the domain even when Caddy is unreachable', async () => {
    const res = await jsonRequest('/instance/domain', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({ domain: 'ossplay.example.com' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { domain: string; caddyApplied: boolean; message: string };
    expect(body.domain).toBe('ossplay.example.com');
    expect(body.caddyApplied).toBe(false);

    const getRes = await jsonRequest('/instance/domain', { cookie: rootCookie });
    const getBody = (await getRes.json()) as { domain: string; domainConfiguredAt: string | null };
    expect(getBody.domain).toBe('ossplay.example.com');
    expect(getBody.domainConfiguredAt).toBeNull();
  });

  it('PUT /instance/domain with null clears the stored domain', async () => {
    const res = await jsonRequest('/instance/domain', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({ domain: null }),
    });
    expect(res.status).toBe(200);

    const getRes = await jsonRequest('/instance/domain', { cookie: rootCookie });
    const getBody = (await getRes.json()) as { domain: string | null };
    expect(getBody.domain).toBeNull();
  });
});
