import { getDb, remoteServers, type SshKey, sshKeys } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { logAudit } from '../lib/audit/log';
import { encryptSecret } from '../lib/crypto/secret-box';
import { generateEd25519KeyPair, parsePastedPrivateKey } from '../lib/ssh/keys';
import { requireAuth } from '../middleware/require-auth';
import { requireInstancePermission } from '../middleware/require-instance-permission';
import type { AppEnv } from '../types';

export const instanceSshKeysRoute = new Hono<AppEnv>();

instanceSshKeysRoute.use('*', requireAuth, requireInstancePermission('instance:manage_workers'));

// Private key never leaves the server after creation — only the public key
// (safe to paste into a target VPS's authorized_keys) and fingerprint are
// ever serialized back.
function serialize(key: SshKey) {
  return {
    id: key.id,
    label: key.label,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
    createdAt: key.createdAt,
  };
}

instanceSshKeysRoute.get('/', async (c) => {
  const db = getDb();
  const [rows, usageRows] = await Promise.all([
    db.select().from(sshKeys).orderBy(sshKeys.createdAt),
    db.select({ sshKeyId: remoteServers.sshKeyId }).from(remoteServers),
  ]);
  const usageCounts = new Map<string, number>();
  for (const { sshKeyId } of usageRows) {
    usageCounts.set(sshKeyId, (usageCounts.get(sshKeyId) ?? 0) + 1);
  }

  return c.json({
    keys: rows.map((key) => ({ ...serialize(key), serverCount: usageCounts.get(key.id) ?? 0 })),
  });
});

// Two shapes, no separate "import" concept: generate creates a fresh
// Ed25519 keypair server-side; paste takes an existing unencrypted private
// key PEM and derives the same public-key/fingerprint material from it.
const createSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('generate'), label: z.string().trim().min(1).max(200) }),
  z.object({
    mode: z.literal('paste'),
    label: z.string().trim().min(1).max(200),
    privateKey: z.string().trim().min(1),
  }),
]);

instanceSshKeysRoute.post('/', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: z.treeifyError(parsed.error) }, 400);
  }

  let material: ReturnType<typeof generateEd25519KeyPair>;
  try {
    material =
      parsed.data.mode === 'generate'
        ? generateEd25519KeyPair()
        : parsePastedPrivateKey(parsed.data.privateKey);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not read this private key' }, 400);
  }

  const [key] = await getDb()
    .insert(sshKeys)
    .values({
      label: parsed.data.label,
      publicKey: material.publicKeyLine,
      privateKeyEncrypted: encryptSecret(material.privateKeyPem),
      fingerprint: material.fingerprint,
      createdByUserId: c.get('user').id,
    })
    .returning();
  if (!key) throw new Error('SSH key insert did not return the expected row');

  await logAudit(c, {
    action: 'instance.ssh_key.create',
    targetType: 'ssh_key',
    targetId: key.id,
    metadata: { label: key.label, mode: parsed.data.mode },
  });

  return c.json({ key: { ...serialize(key), serverCount: 0 } }, 201);
});

instanceSshKeysRoute.delete('/:id', async (c) => {
  const db = getDb();
  const [existing] = await db.select().from(sshKeys).where(eq(sshKeys.id, c.req.param('id')));
  if (!existing) return c.json({ error: 'SSH key not found' }, 404);

  const referencing = await db
    .select({ id: remoteServers.id })
    .from(remoteServers)
    .where(eq(remoteServers.sshKeyId, existing.id))
    .limit(1);
  if (referencing.length > 0) {
    return c.json(
      { error: 'This key is still used by a remote server — remove the server first' },
      409,
    );
  }

  await db.delete(sshKeys).where(eq(sshKeys.id, existing.id));
  await logAudit(c, {
    action: 'instance.ssh_key.delete',
    targetType: 'ssh_key',
    targetId: existing.id,
    metadata: { label: existing.label },
  });

  return c.body(null, 204);
});
