import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { authRoute } from './routes/auth';
import { healthRoute } from './routes/health';
import { instanceRoute } from './routes/instance';
import { instanceUsersRoute } from './routes/instance-users';
import { invitationsRoute } from './routes/invitations';
import { onboardingRoute } from './routes/onboarding';
import { organizationsRoute } from './routes/organizations';
import { passkeyRoute } from './routes/passkey';
import { passwordRoute } from './routes/password';
import { projectsRoute } from './routes/projects';
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
app.route('/auth', passwordRoute);
app.route('/auth/passkey', passkeyRoute);
app.route('/instance', instanceRoute);
app.route('/instance/users', instanceUsersRoute);
app.route('/organizations', organizationsRoute);
app.route('/organizations', projectsRoute);
app.route('/invitations', invitationsRoute);
app.route('/onboarding', onboardingRoute);
