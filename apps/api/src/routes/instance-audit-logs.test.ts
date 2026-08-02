import { beforeAll, describe, expect, it } from 'bun:test';
import { bootstrapAdmin, jsonRequest, truncateAllTables } from '../test-support';

describe.skipIf(!process.env.DATABASE_URL)('instance audit logs', () => {
  beforeAll(async () => {
    await truncateAllTables();
    process.env.OSSPLAY_ENCRYPTION_KEY ??= 'a'.repeat(64);
  });

  let rootCookie: string;
  let rootEmail: string;

  // bootstrapAdmin() itself runs the real POST /organizations flow, so it
  // already leaves one organization.create entry behind — there's no
  // "starts empty" state to assert once a root exists at all.
  it('bootstraps the instance root, which itself logs an organization.create entry', async () => {
    ({ sessionCookie: rootCookie, email: rootEmail } = await bootstrapAdmin());
  });

  it('rejects an unauthenticated request', async () => {
    const res = await jsonRequest('/instance/audit-logs');
    expect(res.status).toBe(401);
  });

  it('GET /instance/audit-logs shows the org-creation entry from bootstrap', async () => {
    const res = await jsonRequest('/instance/audit-logs', { cookie: rootCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: Array<{ action: string; actorEmail: string | null }>;
      total: number;
      page: number;
      pageSize: number;
    };
    expect(body.total).toBe(1);
    expect(body.logs[0]?.action).toBe('organization.create');
    expect(body.logs[0]?.actorEmail).toBe(rootEmail);
    expect(body.page).toBe(0);
    expect(body.pageSize).toBe(25);
  });

  it('records further entries for domain updates and organization creation', async () => {
    await jsonRequest('/instance/domain', {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({
        domain: 'ossplay.example.com',
        letsEncryptEmail: 'admin@ossplay.example.com',
      }),
    });
    await jsonRequest('/organizations', {
      method: 'POST',
      cookie: rootCookie,
      body: JSON.stringify({ name: 'Second Org' }),
    });

    const res = await jsonRequest('/instance/audit-logs', { cookie: rootCookie });
    const body = (await res.json()) as {
      logs: Array<{ action: string; createdAt: string }>;
      total: number;
    };
    expect(body.total).toBe(3);
    const actions = body.logs.map((log) => log.action).sort();
    expect(actions).toEqual(['instance.domain.update', 'organization.create', 'organization.create']);
    // Newest first.
    expect(new Date(body.logs[0]?.createdAt ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(body.logs[1]?.createdAt ?? 0).getTime(),
    );
  });

  it('GET /instance/audit-logs?action filters to a single action', async () => {
    const res = await jsonRequest('/instance/audit-logs?action=instance.domain.update', {
      cookie: rootCookie,
    });
    const body = (await res.json()) as { logs: Array<{ action: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.logs[0]?.action).toBe('instance.domain.update');
  });

  it('GET /instance/audit-logs?actor filters by actor name or email', async () => {
    const res = await jsonRequest(`/instance/audit-logs?actor=${encodeURIComponent(rootEmail)}`, {
      cookie: rootCookie,
    });
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(3);

    const missRes = await jsonRequest('/instance/audit-logs?actor=nobody-matches-this', {
      cookie: rootCookie,
    });
    const missBody = (await missRes.json()) as { total: number };
    expect(missBody.total).toBe(0);
  });

  it('GET /instance/audit-logs?page&pageSize paginates', async () => {
    const res = await jsonRequest('/instance/audit-logs?page=0&pageSize=1', {
      cookie: rootCookie,
    });
    const body = (await res.json()) as { logs: unknown[]; total: number };
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(3);
  });

  it('GET /instance/audit-logs/actions lists the distinct actions seen', async () => {
    const res = await jsonRequest('/instance/audit-logs/actions', { cookie: rootCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { actions: string[] };
    expect(body.actions).toEqual(['instance.domain.update', 'organization.create']);
  });
});
