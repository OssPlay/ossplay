import { getDb, invitations } from '@ossplay/db';
import { eq, sql } from 'drizzle-orm';
import { app } from './app';
import { resetAllRateLimitsForTests } from './lib/auth/rate-limit';
import { generateToken, hashToken } from './lib/auth/tokens';

export function jsonRequest(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return app.request(path, { ...init, headers });
}

export function extractCookie(res: Response, name: string): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Expected a Set-Cookie header');
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`Expected a ${name} cookie`);
  return `${name}=${match[1]}`;
}

export async function truncateAllTables(): Promise<void> {
  resetAllRateLimitsForTests();
  await getDb().execute(
    sql`TRUNCATE TABLE sessions, organization_members, organizations, users, two_factor_challenges, user_recovery_codes, instance_settings, password_reset_tokens, invitations RESTART IDENTITY CASCADE`,
  );
}

export const DEFAULT_ADMIN = {
  adminName: 'Ada Admin',
  adminEmail: 'ada@example.com',
  adminPassword: 'correct horse battery staple',
  orgName: 'Acme Inc',
};

// Runs the real /setup flow (not a DB shortcut) so every test file exercises
// the actual bootstrap path, matching how it behaves in production.
export async function bootstrapAdmin(overrides: Partial<typeof DEFAULT_ADMIN> = {}) {
  const body = { ...DEFAULT_ADMIN, ...overrides };
  const res = await jsonRequest('/setup', { method: 'POST', body: JSON.stringify(body) });
  const sessionCookie = extractCookie(res, 'ossplay_session');
  const meRes = await jsonRequest('/auth/me', { cookie: sessionCookie });
  const me = (await meRes.json()) as { organizations: Array<{ orgId: string }> };
  const orgId = me.organizations[0]?.orgId;
  if (!orgId) throw new Error('Expected the bootstrap admin to have an organization');
  return { sessionCookie, orgId, email: body.adminEmail, password: body.adminPassword };
}

// The API only ever exposes an invitation's token via the (in tests,
// unsent) email — it stores just the hash. Test-only escape hatch: stamp a
// known token onto an existing invitation row so accept-flow tests can
// drive the real /invitations/token/:token endpoints end to end.
export async function stampInvitationToken(invitationId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  await getDb().update(invitations).set({ tokenHash }).where(eq(invitations.id, invitationId));
  return token;
}
