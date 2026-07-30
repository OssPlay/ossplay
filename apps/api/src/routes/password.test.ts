import { beforeAll, describe, expect, it } from 'bun:test';
import { getDb, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { createPasswordResetToken } from '../lib/auth/password-reset';
import { bootstrapAdmin, jsonRequest, truncateAllTables } from '../test-support';

describe.skipIf(!process.env.DATABASE_URL)('password change/forgot/reset', () => {
  beforeAll(truncateAllTables);

  let sessionCookie: string;

  it('bootstraps an admin', async () => {
    ({ sessionCookie } = await bootstrapAdmin());
  });

  it('change-password rejects a wrong current password', async () => {
    const res = await jsonRequest('/auth/change-password', {
      method: 'POST',
      cookie: sessionCookie,
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a whole new safe password' }),
    });
    expect(res.status).toBe(401);
  });

  it('change-password succeeds and keeps the current session', async () => {
    const res = await jsonRequest('/auth/change-password', {
      method: 'POST',
      cookie: sessionCookie,
      body: JSON.stringify({
        currentPassword: 'correct horse battery staple',
        newPassword: 'a whole new safe password',
      }),
    });
    expect(res.status).toBe(204);

    const meRes = await jsonRequest('/auth/me', { cookie: sessionCookie });
    expect(meRes.status).toBe(200);
  });

  it('the old password no longer works', async () => {
    const res = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery staple' }),
    });
    expect(res.status).toBe(401);
  });

  it('forgot-password returns the same generic response whether or not the email exists', async () => {
    const known = await jsonRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com' }),
    });
    const unknown = await jsonRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@example.com' }),
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it('reset-password with a valid token sets the password, revokes sessions, and logs in', async () => {
    const [user] = await getDb().select().from(users).where(eq(users.email, 'ada@example.com'));
    if (!user) throw new Error('expected the bootstrap admin to exist');
    const { token } = await createPasswordResetToken(user.id);

    const res = await jsonRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'yet another safe password' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('ossplay_session');

    // The pre-reset session is revoked.
    const meRes = await jsonRequest('/auth/me', { cookie: sessionCookie });
    expect(meRes.status).toBe(401);

    // The token can't be reused.
    const reuseRes = await jsonRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'yet another password again' }),
    });
    expect(reuseRes.status).toBe(400);

    // The new password logs in.
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'yet another safe password' }),
    });
    expect(loginRes.status).toBe(200);
  });

  it('reset-password rejects an invalid token', async () => {
    const res = await jsonRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'not-a-real-token', newPassword: 'irrelevant password value' }),
    });
    expect(res.status).toBe(400);
  });
});
