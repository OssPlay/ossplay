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
});
