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
    expect(await res.json()).toEqual({
      domain: null,
      domainConfiguredAt: null,
      letsEncryptEmail: null,
      certProvider: 'letsencrypt',
      customAcmeUrl: null,
    });
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
        body: JSON.stringify({ domain, letsEncryptEmail: 'admin@ossplay.example.com' }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('PUT /instance/domain requires an ACME email once a domain is set', async () => {
    const res = await jsonRequest('/instance/domain', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({ domain: 'ossplay.example.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /instance/domain requires a custom ACME URL for the custom provider', async () => {
    const res = await jsonRequest('/instance/domain', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({
        domain: 'ossplay.example.com',
        letsEncryptEmail: 'admin@ossplay.example.com',
        certProvider: 'custom',
      }),
    });
    expect(res.status).toBe(400);
  });

  // No OSSPLAY_CADDY_ADMIN_URL is set in this test process (local/CI, not
  // Docker), so this exercises the real graceful-degradation path — the
  // domain is still saved even though Caddy can't be reached.
  it('PUT /instance/domain saves the domain even when Caddy is unreachable', async () => {
    const res = await jsonRequest('/instance/domain', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({
        domain: 'ossplay.example.com',
        letsEncryptEmail: 'admin@ossplay.example.com',
        certProvider: 'zerossl',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { domain: string; caddyApplied: boolean; message: string };
    expect(body.domain).toBe('ossplay.example.com');
    expect(body.caddyApplied).toBe(false);

    const getRes = await jsonRequest('/instance/domain', { cookie: rootCookie });
    const getBody = (await getRes.json()) as {
      domain: string;
      domainConfiguredAt: string | null;
      letsEncryptEmail: string | null;
      certProvider: string;
    };
    expect(getBody.domain).toBe('ossplay.example.com');
    expect(getBody.domainConfiguredAt).toBeNull();
    expect(getBody.letsEncryptEmail).toBe('admin@ossplay.example.com');
    expect(getBody.certProvider).toBe('zerossl');
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
