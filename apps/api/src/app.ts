import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { authRoute } from './routes/auth';
import { healthRoute } from './routes/health';
import { instanceRoute } from './routes/instance';
import { setupRoute } from './routes/setup';
import { twoFactorRoute } from './routes/two-factor';
import type { AppEnv } from './types';

export const app = new Hono<AppEnv>();

// Same-origin only, no config needed — dashboard and api are always
// same-origin (via Caddy in prod, via Next.js rewrites in dev). See
// ARCHITECTURE.md's Authorization Model section.
app.use('*', csrf());

app.route('/health', healthRoute);
app.route('/setup', setupRoute);
app.route('/auth', authRoute);
app.route('/auth/2fa', twoFactorRoute);
app.route('/instance', instanceRoute);
