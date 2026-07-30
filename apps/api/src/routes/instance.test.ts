import { beforeAll, describe, expect, it } from 'bun:test';
import { bootstrapAdmin, jsonRequest, truncateAllTables } from '../test-support';

describe.skipIf(!process.env.DATABASE_URL)('instance settings', () => {
  beforeAll(async () => {
    await truncateAllTables();
    process.env.OSSPLAY_ENCRYPTION_KEY ??= 'b'.repeat(64);
  });

  let rootCookie: string;

  it('bootstraps the instance root', async () => {
    ({ sessionCookie: rootCookie } = await bootstrapAdmin());
  });

  it('GET /instance/settings starts unconfigured', async () => {
    const res = await jsonRequest('/instance/settings', { cookie: rootCookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      smtpHost: null,
      smtpPort: null,
      smtpUsername: null,
      smtpPasswordSet: false,
      smtpFromAddress: null,
      smtpFromName: null,
      smtpSecure: true,
      domain: null,
      domainConfiguredAt: null,
    });
  });

  // requireInstancePermission's actual root-vs-not gating (can() with the
  // 'instance:manage_settings' permission) is covered directly by
  // permissions.test.ts; this just confirms the route requires auth at all.
  it('rejects an unauthenticated request', async () => {
    const res = await jsonRequest('/instance/settings');
    expect(res.status).toBe(401);
  });

  it('PUT /instance/settings stores config and never echoes the password back', async () => {
    const putRes = await jsonRequest('/instance/settings', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUsername: 'apikey',
        smtpPassword: 'super-secret-password',
        smtpFromAddress: 'noreply@example.com',
        smtpFromName: 'OSSPlay',
        smtpSecure: true,
      }),
    });
    expect(putRes.status).toBe(204);

    const getRes = await jsonRequest('/instance/settings', { cookie: rootCookie });
    const body = (await getRes.json()) as Record<string, unknown>;
    expect(body.smtpHost).toBe('smtp.example.com');
    expect(body.smtpPasswordSet).toBe(true);
    expect(body).not.toHaveProperty('smtpPassword');
    expect(body).not.toHaveProperty('smtpPasswordEncrypted');
  });

  it('omitting smtpPassword on a later PUT leaves the stored password unchanged', async () => {
    await jsonRequest('/instance/settings', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUsername: 'apikey',
        smtpFromAddress: 'noreply@example.com',
        smtpFromName: 'OSSPlay Renamed',
        smtpSecure: true,
      }),
    });

    const getRes = await jsonRequest('/instance/settings', { cookie: rootCookie });
    const body = (await getRes.json()) as { smtpPasswordSet: boolean; smtpFromName: string };
    expect(body.smtpPasswordSet).toBe(true);
    expect(body.smtpFromName).toBe('OSSPlay Renamed');
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

    const getRes = await jsonRequest('/instance/settings', { cookie: rootCookie });
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

    const getRes = await jsonRequest('/instance/settings', { cookie: rootCookie });
    const getBody = (await getRes.json()) as { domain: string | null };
    expect(getBody.domain).toBeNull();
  });
});
