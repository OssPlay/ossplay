import { Hono } from 'hono';
import { z } from 'zod';
import { applyDomainConfig } from '../lib/caddy/admin';
import { writeInstanceConfig } from '../lib/config/instance-config';
import { encryptSecret } from '../lib/crypto/secret-box';
import { getInstanceSettings } from '../lib/mail/send';
import { requireAuth } from '../middleware/require-auth';
import { requireInstancePermission } from '../middleware/require-instance-permission';
import type { AppEnv } from '../types';

export const instanceRoute = new Hono<AppEnv>();

instanceRoute.use('*', requireAuth, requireInstancePermission('instance:manage_settings'));

instanceRoute.get('/settings', async (c) => {
  const settings = await getInstanceSettings();
  return c.json({
    smtpHost: settings?.smtpHost ?? null,
    smtpPort: settings?.smtpPort ?? null,
    smtpUsername: settings?.smtpUsername ?? null,
    smtpPasswordSet: Boolean(settings?.smtpPasswordEncrypted),
    smtpFromAddress: settings?.smtpFromAddress ?? null,
    smtpFromName: settings?.smtpFromName ?? null,
    smtpSecure: settings?.smtpSecure ?? true,
    domain: settings?.domain ?? null,
    domainConfiguredAt: settings?.domainConfiguredAt ?? null,
  });
});

const settingsSchema = z.object({
  smtpHost: z.string().trim().min(1).max(255).nullable(),
  smtpPort: z.number().int().min(1).max(65535).nullable(),
  smtpUsername: z.string().trim().max(255).nullable(),
  // Omitted or empty: leave the stored password unchanged. Set to null
  // explicitly to clear it.
  smtpPassword: z.string().max(1000).optional().nullable(),
  smtpFromAddress: z.string().trim().email().nullable(),
  smtpFromName: z.string().trim().max(255).nullable(),
  smtpSecure: z.boolean(),
});

instanceRoute.put('/settings', async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { smtpPassword, ...rest } = parsed.data;
  writeInstanceConfig({
    ...rest,
    ...(smtpPassword === undefined
      ? {}
      : { smtpPasswordEncrypted: smtpPassword ? encryptSecret(smtpPassword) : null }),
  });

  return c.body(null, 204);
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
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }
  const { domain } = parsed.data;

  const result = domain
    ? await applyDomainConfig(domain)
    : { applied: false as const, reason: 'No domain configured' };

  writeInstanceConfig({
    domain,
    domainConfiguredAt: result.applied ? new Date().toISOString() : null,
  });

  return c.json({
    domain,
    caddyApplied: result.applied,
    message: result.applied
      ? 'Domain saved and applied to the reverse proxy.'
      : `Domain saved. ${result.reason ?? 'Not applied to the reverse proxy.'}`,
  });
});
