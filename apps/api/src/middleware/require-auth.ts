import { getDb, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getSessionCookie } from '../lib/auth/cookie';
import { validateSessionToken } from '../lib/auth/session';
import type { AppEnv } from '../types';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getSessionCookie(c);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await validateSessionToken(token);
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [user] = await getDb().select().from(users).where(eq(users.id, session.userId));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  c.set('session', session);
  await next();
};
