import { beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../app';
import { extractCookie, jsonRequest, truncateAllTables } from '../test-support';

function extractSessionCookie(res: Response): string {
  return extractCookie(res, 'ossplay_session');
}

// Requires a real Postgres (DATABASE_URL) — see .github/workflows/ci.yml
// for how CI provides one. Skips locally rather than hard-failing when a
// contributor doesn't have Postgres running.
describe.skipIf(!process.env.DATABASE_URL)('setup + auth flow', () => {
  beforeAll(truncateAllTables);

  let sessionCookie: string;

  it('reports needsSetup: true before any admin exists', async () => {
    const res = await jsonRequest('/setup/status');
    expect(await res.json()).toEqual({ needsSetup: true, smtpConfigured: false });
  });

  it('bootstraps the admin and logs in', async () => {
    const res = await jsonRequest('/setup', {
      method: 'POST',
      body: JSON.stringify({
        adminName: 'Ada Admin',
        adminEmail: 'ADA@Example.com',
        adminPassword: 'correct horse battery staple',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe('ada@example.com');
    sessionCookie = extractSessionCookie(res);
  });

  it('reports needsSetup: false after bootstrap', async () => {
    const res = await jsonRequest('/setup/status');
    expect(await res.json()).toEqual({ needsSetup: false, smtpConfigured: false });
  });

  it('rejects a second setup attempt with 409', async () => {
    const res = await jsonRequest('/setup', {
      method: 'POST',
      body: JSON.stringify({
        adminName: 'X',
        adminEmail: 'x@example.com',
        adminPassword: 'anothersafepassword123',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('GET /auth/me shows the root user with no organizations yet', async () => {
    const res = await jsonRequest('/auth/me', { cookie: sessionCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { instanceRole: string | null };
      organizations: Array<{ role: string }>;
    };
    expect(body.user.instanceRole).toBe('root');
    expect(body.organizations).toHaveLength(0);
  });

  it('POST /organizations creates the first org, owned by the caller', async () => {
    const res = await jsonRequest('/organizations', {
      method: 'POST',
      cookie: sessionCookie,
      body: JSON.stringify({ name: 'Acme Inc' }),
    });
    expect(res.status).toBe(201);

    const meRes = await jsonRequest('/auth/me', { cookie: sessionCookie });
    const meBody = (await meRes.json()) as { organizations: Array<{ role: string }> };
    expect(meBody.organizations).toHaveLength(1);
    expect(meBody.organizations[0]?.role).toBe('owner');
  });

  it('GET /auth/me without a cookie is 401', async () => {
    const res = await jsonRequest('/auth/me');
    expect(res.status).toBe(401);
  });

  it('logs out and invalidates the session', async () => {
    const logoutRes = await jsonRequest('/auth/logout', { method: 'POST', cookie: sessionCookie });
    expect(logoutRes.status).toBe(204);

    const meRes = await jsonRequest('/auth/me', { cookie: sessionCookie });
    expect(meRes.status).toBe(401);
  });

  it('rejects login with a wrong password using the generic error', async () => {
    const res = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid email or password' });
  });

  it('rejects login for a nonexistent user with the same generic error', async () => {
    const res = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid email or password' });
  });

  it('logs in with correct, case-insensitively-matched credentials', async () => {
    const res = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ADA@example.com', password: 'correct horse battery staple' }),
    });
    expect(res.status).toBe(200);
  });

  it('rate-limits repeated bad login attempts', async () => {
    const email = 'rate-limit-test@example.com';
    let lastRes: Response | undefined;
    for (let i = 0; i < 6; i++) {
      lastRes = await jsonRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'wrong' }),
      });
    }
    expect(lastRes?.status).toBe(429);
  });

  it('blocks a POST with no Content-Type as a CSRF risk', async () => {
    const res = await app.request('/auth/logout', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('GET /auth/sessions lists active sessions and flags the current one', async () => {
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const currentSession = extractSessionCookie(loginRes);

    const res = await jsonRequest('/auth/sessions', { cookie: currentSession });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: Array<{ id: string; isCurrent: boolean; ipAddress: string | null }>;
    };
    expect(body.sessions.length).toBeGreaterThan(0);
    expect(body.sessions.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it('DELETE /auth/sessions/:id revokes that session', async () => {
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const toRevokeCookie = extractSessionCookie(loginRes);
    const listRes = await jsonRequest('/auth/sessions', { cookie: toRevokeCookie });
    const listBody = (await listRes.json()) as {
      sessions: Array<{ id: string; isCurrent: boolean }>;
    };
    const current = listBody.sessions.find((s) => s.isCurrent);
    if (!current) throw new Error('expected a current session');

    const deleteRes = await jsonRequest(`/auth/sessions/${current.id}`, {
      method: 'DELETE',
      cookie: toRevokeCookie,
    });
    expect(deleteRes.status).toBe(204);

    const meRes = await jsonRequest('/auth/me', { cookie: toRevokeCookie });
    expect(meRes.status).toBe(401);
  });

  it("DELETE /auth/sessions/:id 404s for a session that is not the caller's own", async () => {
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    const cookie = extractSessionCookie(loginRes);
    const res = await jsonRequest('/auth/sessions/not-a-real-session-id', {
      method: 'DELETE',
      cookie,
    });
    expect(res.status).toBe(404);
  });
});
