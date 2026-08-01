import { Hono } from 'hono';
import { z } from 'zod';
import { applyDomainConfig } from '../lib/caddy/admin';
import { readInstanceConfig, writeInstanceConfig } from '../lib/config/instance-config';
import { requireAuth } from '../middleware/require-auth';
import { requireInstancePermission } from '../middleware/require-instance-permission';
import type { AppEnv } from '../types';

export const instanceRoute = new Hono<AppEnv>();

instanceRoute.use('*', requireAuth, requireInstancePermission('instance:manage_settings'));

instanceRoute.get('/domain', (c) => {
  const { domain } = readInstanceConfig();
  return c.json({
    domain: domain.name,
    domainConfiguredAt: domain.configuredAt,
  });
});

// A single label with no dot ("localhost") or an IPv4 literal can't get a
// Let's Encrypt certificate — reject those early with a clear message
// rather than letting them reach Caddy and fail obscurely there.
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .nullable()
    .refine(
      (value) => value === null || (HOSTNAME_PATTERN.test(value) && !IPV4_PATTERN.test(value)),
      'Enter a real domain (e.g. ossplay.example.com) — localhost and bare IP addresses cannot get a certificate',
    ),
});

instanceRoute.put('/domain', async (c) => {
  const parsed = domainSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: z.treeifyError(parsed.error) }, 400);
  }
  const { domain } = parsed.data;

  const result = domain
    ? await applyDomainConfig(domain)
    : { applied: false as const, reason: 'No domain configured' };

  writeInstanceConfig({
    domain: {
      name: domain,
      configuredAt: result.applied ? new Date().toISOString() : null,
    },
  });

  return c.json({
    domain,
    caddyApplied: result.applied,
    message: result.applied
      ? 'Domain saved and applied to the reverse proxy.'
      : `Domain saved. ${result.reason ?? 'Not applied to the reverse proxy.'}`,
  });
});
