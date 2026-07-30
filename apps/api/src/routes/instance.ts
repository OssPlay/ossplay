import { getDb, instanceSettings } from '@ossplay/db';
import { Hono } from 'hono';
import { z } from 'zod';
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
  const values = {
    id: 1,
    ...rest,
    updatedAt: new Date(),
    ...(smtpPassword === undefined
      ? {}
      : { smtpPasswordEncrypted: smtpPassword ? encryptSecret(smtpPassword) : null }),
  };

  await getDb()
    .insert(instanceSettings)
    .values(values)
    .onConflictDoUpdate({ target: instanceSettings.id, set: values });

  return c.body(null, 204);
});
