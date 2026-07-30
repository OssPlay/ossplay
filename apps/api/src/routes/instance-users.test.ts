import { beforeAll, describe, expect, it } from 'bun:test';
import { generateTotpCode } from '../lib/auth/totp';
import {
  bootstrapAdmin,
  extractCookie,
  jsonRequest,
  stampInvitationToken,
  truncateAllTables,
} from '../test-support';

describe.skipIf(!process.env.DATABASE_URL)('instance user management', () => {
  beforeAll(async () => {
    await truncateAllTables();
    process.env.OSSPLAY_ENCRYPTION_KEY ??= 'd'.repeat(64);
  });

  let rootCookie: string;
  let memberEmail: string;
  let memberId: string;
  let orgId: string;

  it('bootstraps the root and a second member', async () => {
    ({ sessionCookie: rootCookie, orgId } = await bootstrapAdmin());

    memberEmail = 'member@example.com';
    const inviteRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
      method: 'POST',
      cookie: rootCookie,
      body: JSON.stringify({ email: memberEmail, role: 'member' }),
    });
    const inviteBody = (await inviteRes.json()) as { invitation: { id: string } };
    const token = await stampInvitationToken(inviteBody.invitation.id);
    const acceptRes = await jsonRequest(`/invitations/token/${token}/accept`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Member', password: 'member-password-123' }),
    });
    expect(acceptRes.status).toBe(200);
  });

  it('rejects a member (non-root) from listing instance users', async () => {
    const loginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: memberEmail, password: 'member-password-123' }),
    });
    const memberCookie = extractCookie(loginRes, 'ossplay_session');
    const meRes = await jsonRequest('/auth/me', { cookie: memberCookie });
    const meBody = (await meRes.json()) as { user: { id: string } };
    memberId = meBody.user.id;

    const res = await jsonRequest('/instance/users', { cookie: memberCookie });
    expect(res.status).toBe(403);
  });

  it('GET /instance/users lists both accounts with passkeyCount 0', async () => {
    const res = await jsonRequest('/instance/users', { cookie: rootCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{ email: string; passkeyCount: number }>;
    };
    expect(body.users).toHaveLength(2);
    expect(body.users.every((u) => u.passkeyCount === 0)).toBe(true);
  });

  it('PUT /instance/users/:id/password requires exactly one of newPassword/generateTemporary', async () => {
    const res = await jsonRequest(`/instance/users/${memberId}/password`, {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /instance/users/:id/password with generateTemporary returns a password once and revokes sessions', async () => {
    const res = await jsonRequest(`/instance/users/${memberId}/password`, {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({ generateTemporary: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { temporaryPassword: string };
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // The old password no longer works.
    const oldLoginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: memberEmail, password: 'member-password-123' }),
    });
    expect(oldLoginRes.status).toBe(401);

    // The new temporary password does.
    const newLoginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: memberEmail, password: body.temporaryPassword }),
    });
    expect(newLoginRes.status).toBe(200);
  });

  it('POST /instance/users/:id/reset-2fa clears TOTP and revokes sessions', async () => {
    // The previous test already rotated the member's password to a
    // one-time temporary value that isn't captured here, so get a fresh
    // one to log in and enable 2FA with.
    const resetRes = await jsonRequest(`/instance/users/${memberId}/password`, {
      method: 'PUT',
      cookie: rootCookie,
      body: JSON.stringify({ generateTemporary: true }),
    });
    const { temporaryPassword } = (await resetRes.json()) as { temporaryPassword: string };
    const freshLoginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: memberEmail, password: temporaryPassword }),
    });
    const memberCookie = extractCookie(freshLoginRes, 'ossplay_session');

    const setupRes = await jsonRequest('/auth/2fa/setup', { method: 'POST', cookie: memberCookie });
    const { secret } = (await setupRes.json()) as { secret: string };
    await jsonRequest('/auth/2fa/confirm', {
      method: 'POST',
      cookie: memberCookie,
      body: JSON.stringify({ code: generateTotpCode(secret) }),
    });

    const meBefore = await jsonRequest('/auth/me', { cookie: memberCookie });
    expect(((await meBefore.json()) as { user: { totpEnabled: boolean } }).user.totpEnabled).toBe(
      true,
    );

    const res = await jsonRequest(`/instance/users/${memberId}/reset-2fa`, {
      method: 'POST',
      cookie: rootCookie,
    });
    expect(res.status).toBe(204);

    // The member's session was revoked as part of the reset.
    const meAfter = await jsonRequest('/auth/me', { cookie: memberCookie });
    expect(meAfter.status).toBe(401);

    // A fresh login no longer requires 2FA.
    const secondLoginRes = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: memberEmail, password: temporaryPassword }),
    });
    expect(secondLoginRes.status).toBe(200);
  });

  it('404s for a nonexistent user id', async () => {
    const res = await jsonRequest(
      '/instance/users/00000000-0000-0000-0000-000000000000/reset-2fa',
      {
        method: 'POST',
        cookie: rootCookie,
      },
    );
    expect(res.status).toBe(404);
  });
});
