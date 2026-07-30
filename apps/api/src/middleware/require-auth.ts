import { getDb, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { clearSessionCookie, getSessionCookie } from '../lib/auth/cookie';
import { validateSessionToken } from '../lib/auth/session';
import type { AppEnv } from '../types';

// Any 401 below clears the cookie: the dashboard's proxy only checks cookie
// *presence* to gate the /setup and /login redirects (a cheap check, not
// full auth enforcement — see proxy.ts). A stale cookie left over from an
// expired/revoked session would otherwise make the proxy treat the browser
// as authenticated forever, skip the redirect, and leave the client stuck
// bouncing between `/` and `/login` since `/login` itself redirects away
// whenever the cookie is present.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getSessionCookie(c);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await validateSessionToken(token);
  if (!session) {
    clearSessionCookie(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [user] = await getDb().select().from(users).where(eq(users.id, session.userId));
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  c.set('session', session);
  await next();
};
