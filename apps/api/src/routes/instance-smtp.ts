import { getDb, type SmtpConfig, smtpConfigs } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { logAudit } from '../lib/audit/log';
import { encryptSecret } from '../lib/crypto/secret-box';
import { sendMailWithConfig } from '../lib/mail/send';
import { requireAuth } from '../middleware/require-auth';
import { requireInstancePermission } from '../middleware/require-instance-permission';
import type { AppEnv } from '../types';

export const instanceSmtpRoute = new Hono<AppEnv>();

instanceSmtpRoute.use('*', requireAuth, requireInstancePermission('instance:manage_settings'));

function serialize(config: SmtpConfig) {
  return {
    id: config.id,
    name: config.name,
    host: config.host,
    port: config.port,
    username: config.username,
    passwordSet: Boolean(config.passwordEncrypted),
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    secure: config.secure,
    isDefault: config.isDefault,
    createdAt: config.createdAt,
  };
}

instanceSmtpRoute.get('/', async (c) => {
  const configs = await getDb().select().from(smtpConfigs).orderBy(smtpConfigs.createdAt);
  return c.json({ configs: configs.map(serialize) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().max(255).nullable(),
  password: z.string().max(1000).nullable().optional(),
  fromAddress: z.email(),
  fromName: z.string().trim().max(255).nullable(),
  secure: z.boolean(),
});

instanceSmtpRoute.post('/', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: z.treeifyError(parsed.error) }, 400);
  }

  const db = getDb();
  const { password, ...rest } = parsed.data;
  // The first config an instance ever adds becomes the default automatically
  // — there's no meaningful "configured but not usable" state to leave it
  // in otherwise, and forcing a separate "make default" click for the very
  // first one would just be friction.
  const existingCount = await db.select({ id: smtpConfigs.id }).from(smtpConfigs).limit(1);

  const [config] = await db
    .insert(smtpConfigs)
    .values({
      ...rest,
      passwordEncrypted: password ? encryptSecret(password) : null,
      isDefault: existingCount.length === 0,
    })
    .returning();
  if (!config) throw new Error('SMTP config insert did not return the expected row');

  await logAudit(c, {
    action: 'instance.smtp.create',
    targetType: 'smtp_config',
    targetId: config.id,
    metadata: { name: config.name },
  });

  return c.json({ config: serialize(config) }, 201);
});

const updateSchema = createSchema.partial();

instanceSmtpRoute.put('/:id', async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: z.treeifyError(parsed.error) }, 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(smtpConfigs)
    .where(eq(smtpConfigs.id, c.req.param('id')));
  if (!existing) return c.json({ error: 'SMTP config not found' }, 404);

  const { password, ...rest } = parsed.data;
  const [updated] = await db
    .update(smtpConfigs)
    .set({
      ...rest,
      // Omitted entirely: leave the stored password unchanged. Explicit
      // null: clear it.
      ...(password === undefined
        ? {}
        : { passwordEncrypted: password ? encryptSecret(password) : null }),
    })
    .where(eq(smtpConfigs.id, existing.id))
    .returning();
  if (!updated) throw new Error('SMTP config update did not return the expected row');

  await logAudit(c, {
    action: 'instance.smtp.update',
    targetType: 'smtp_config',
    targetId: updated.id,
  });

  return c.json({ config: serialize(updated) });
});

instanceSmtpRoute.delete('/:id', async (c) => {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(smtpConfigs)
    .where(eq(smtpConfigs.id, c.req.param('id')));
  if (!existing) return c.json({ error: 'SMTP config not found' }, 404);

  await db.delete(smtpConfigs).where(eq(smtpConfigs.id, existing.id));
  await logAudit(c, {
    action: 'instance.smtp.delete',
    targetType: 'smtp_config',
    targetId: existing.id,
    metadata: { name: existing.name },
  });

  // If this was the default, no config is now the default — mirrors the
  // already-existing "no config at all" state (sendMail throws a clear
  // error) rather than silently guessing which remaining config to
  // promote.
  return c.body(null, 204);
});

instanceSmtpRoute.put('/:id/default', async (c) => {
  const db = getDb();
  const [target] = await db
    .select()
    .from(smtpConfigs)
    .where(eq(smtpConfigs.id, c.req.param('id')));
  if (!target) return c.json({ error: 'SMTP config not found' }, 404);

  // Two sequential updates, not a transaction — same "fine at this scale,
  // one operator submitting one form at a time" reasoning already applied
  // to instance-config.ts's read-then-write.
  await db.update(smtpConfigs).set({ isDefault: false }).where(eq(smtpConfigs.isDefault, true));
  await db.update(smtpConfigs).set({ isDefault: true }).where(eq(smtpConfigs.id, target.id));

  await logAudit(c, {
    action: 'instance.smtp.set_default',
    targetType: 'smtp_config',
    targetId: target.id,
  });

  return c.body(null, 204);
});

instanceSmtpRoute.post('/:id/test', async (c) => {
  const [config] = await getDb()
    .select()
    .from(smtpConfigs)
    .where(eq(smtpConfigs.id, c.req.param('id')));
  if (!config) return c.json({ error: 'SMTP config not found' }, 404);

  const actor = c.get('user');
  try {
    await sendMailWithConfig(config, actor.email, {
      subject: 'OSSPlay SMTP test',
      text: `This is a test email sent from the "${config.name}" SMTP config on your OSSPlay instance.`,
      html: `<p>This is a test email sent from the "${config.name}" SMTP config on your OSSPlay instance.</p>`,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not send test email' }, 502);
  }

  return c.body(null, 204);
});
