import { getDb } from '@ossplay/db';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../app';

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Expected a Set-Cookie header');
  const match = setCookie.match(/ossplay_session=([^;]+)/);
  if (!match) throw new Error('Expected an ossplay_session cookie');
  return `ossplay_session=${match[1]}`;
}

function jsonRequest(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return app.request(path, { ...init, headers });
}

// Requires a real Postgres (DATABASE_URL) — see .github/workflows/ci.yml
// for how CI provides one. Skips locally rather than hard-failing when a
// contributor doesn't have Postgres running.
describe.skipIf(!process.env.DATABASE_URL)('setup + auth flow', () => {
  beforeAll(async () => {
    await getDb().execute(
      sql`TRUNCATE TABLE sessions, organization_members, organizations, users RESTART IDENTITY CASCADE`,
    );
  });

  let sessionCookie: string;

  it('reports needsSetup: true before any admin exists', async () => {
    const res = await jsonRequest('/setup/status');
    expect(await res.json()).toEqual({ needsSetup: true });
  });

  it('bootstraps the admin, default org, and logs in', async () => {
    const res = await jsonRequest('/setup', {
      method: 'POST',
      body: JSON.stringify({
        adminName: 'Ada Admin',
        adminEmail: 'ADA@Example.com',
        adminPassword: 'correct horse battery staple',
        orgName: 'Acme Inc',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe('ada@example.com');
    sessionCookie = extractSessionCookie(res);
  });

  it('reports needsSetup: false after bootstrap', async () => {
    const res = await jsonRequest('/setup/status');
    expect(await res.json()).toEqual({ needsSetup: false });
  });

  it('rejects a second setup attempt with 409', async () => {
    const res = await jsonRequest('/setup', {
      method: 'POST',
      body: JSON.stringify({
        adminName: 'X',
        adminEmail: 'x@example.com',
        adminPassword: 'anothersafepassword123',
        orgName: 'X',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('GET /auth/me returns the root user and their owner membership', async () => {
    const res = await jsonRequest('/auth/me', { cookie: sessionCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { instanceRole: string | null };
      organizations: Array<{ role: string }>;
    };
    expect(body.user.instanceRole).toBe('root');
    expect(body.organizations).toHaveLength(1);
    expect(body.organizations[0]?.role).toBe('owner');
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
});
