import { getDb, type RemoteServer, remoteServers, sshKeys } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { logAudit } from '../lib/audit/log';
import { decryptSecret } from '../lib/crypto/secret-box';
import { testSshConnection } from '../lib/ssh/test-connection';
import { requireAuth } from '../middleware/require-auth';
import { requireInstancePermission } from '../middleware/require-instance-permission';
import type { AppEnv } from '../types';

export const instanceServersRoute = new Hono<AppEnv>();

instanceServersRoute.use('*', requireAuth, requireInstancePermission('instance:manage_workers'));

function serialize(server: RemoteServer) {
  return {
    id: server.id,
    label: server.label,
    host: server.host,
    port: server.port,
    sshUsername: server.sshUsername,
    sshKeyId: server.sshKeyId,
    status: server.status,
    lastCheckedAt: server.lastCheckedAt,
    lastError: server.lastError,
    dockerInstalled: server.dockerInstalled,
    workerProvisionedAt: server.workerProvisionedAt,
    createdAt: server.createdAt,
  };
}

instanceServersRoute.get('/', async (c) => {
  const rows = await getDb().select().from(remoteServers).orderBy(remoteServers.createdAt);
  return c.json({ servers: rows.map(serialize) });
});

const createSchema = z.object({
  label: z.string().trim().min(1).max(200),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  sshUsername: z.string().trim().min(1).max(100),
  sshKeyId: z.uuid(),
});

instanceServersRoute.post('/', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: z.treeifyError(parsed.error) }, 400);
  }

  const [key] = await getDb().select().from(sshKeys).where(eq(sshKeys.id, parsed.data.sshKeyId));
  if (!key) return c.json({ error: 'SSH key not found' }, 400);

  const [server] = await getDb()
    .insert(remoteServers)
    .values({
      label: parsed.data.label,
      host: parsed.data.host,
      port: parsed.data.port,
      sshUsername: parsed.data.sshUsername,
      sshKeyId: parsed.data.sshKeyId,
      createdByUserId: c.get('user').id,
    })
    .returning();
  if (!server) throw new Error('Remote server insert did not return the expected row');

  await logAudit(c, {
    action: 'instance.remote_server.create',
    targetType: 'remote_server',
    targetId: server.id,
    metadata: { label: server.label, host: server.host },
  });

  return c.json({ server: serialize(server) }, 201);
});

instanceServersRoute.delete('/:id', async (c) => {
  const db = getDb();
  const [existing] = await db.select().from(remoteServers).where(eq(remoteServers.id, c.req.param('id')));
  if (!existing) return c.json({ error: 'Remote server not found' }, 404);

  await db.delete(remoteServers).where(eq(remoteServers.id, existing.id));
  await logAudit(c, {
    action: 'instance.remote_server.delete',
    targetType: 'remote_server',
    targetId: existing.id,
    metadata: { label: existing.label, host: existing.host },
  });

  return c.body(null, 204);
});

// The one genuinely real SSH operation this pass: connect + `whoami`, no
// Docker/container involvement. Synchronous — no async/poll-by-status
// infrastructure, status just reflects this test's outcome.
instanceServersRoute.post('/:id/test', async (c) => {
  const db = getDb();
  const [server] = await db.select().from(remoteServers).where(eq(remoteServers.id, c.req.param('id')));
  if (!server) return c.json({ error: 'Remote server not found' }, 404);

  const [key] = await db.select().from(sshKeys).where(eq(sshKeys.id, server.sshKeyId));
  if (!key) return c.json({ error: 'The SSH key for this server no longer exists' }, 409);

  const result = await testSshConnection({
    host: server.host,
    port: server.port,
    username: server.sshUsername,
    privateKeyPem: decryptSecret(key.privateKeyEncrypted),
  });

  const [updated] = await db
    .update(remoteServers)
    .set({
      status: result.ok ? 'online' : 'error',
      lastCheckedAt: new Date(),
      lastError: result.ok ? null : (result.error ?? 'Unknown error'),
    })
    .where(eq(remoteServers.id, server.id))
    .returning();
  if (!updated) throw new Error('Remote server update did not return the expected row');

  await logAudit(c, {
    action: 'instance.remote_server.test',
    targetType: 'remote_server',
    targetId: server.id,
    metadata: { ok: result.ok },
  });

  return c.json({ server: serialize(updated), output: result.output, error: result.error });
});

// Placeholder — see PRD.md §4 / MEMORY.md: real provisioning needs a
// dedicated worker image on the remote server that doesn't exist yet. No
// SSH attempt is made here, so this can't fail in a way that implies
// something was actually tried.
instanceServersRoute.post('/:id/provision', async (c) => {
  const [server] = await getDb()
    .select()
    .from(remoteServers)
    .where(eq(remoteServers.id, c.req.param('id')));
  if (!server) return c.json({ error: 'Remote server not found' }, 404);

  return c.json(
    {
      provisioned: false,
      message:
        'Worker provisioning is not yet available on this instance — it requires a dedicated worker image that has not shipped yet.',
    },
    501,
  );
});
