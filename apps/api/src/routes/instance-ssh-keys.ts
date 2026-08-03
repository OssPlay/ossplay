import { count, desc, eq, inArray } from "drizzle-orm";
import { getDb, remoteServers, type SshKey, sshKeys } from "@ossplay/db";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { encryptSecret } from "../lib/crypto/secret-box";
import { parseListQuery } from "../lib/http/list-query";
import { generateEd25519KeyPair, generateRSAKeyPair, parsePrivateKey } from "../lib/ssh/keys";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceSshKeysRoute = new Hono<AppEnv>();

instanceSshKeysRoute.use("*", requireAuth, requireInstancePermission("instance:manage_workers"));

// Private key never leaves the server after creation — only the public key
// (safe to paste into a target VPS's authorized_keys) and fingerprint are
// ever serialized back.
function serialize(key: SshKey) {
	return {
		id: key.id,
		label: key.label,
		keyType: key.keyType,
		publicKey: key.publicKey,
		fingerprint: key.fingerprint,
		createdAt: key.createdAt,
	};
}

instanceSshKeysRoute.get("/", async (c) => {
	const db = getDb();
	const { where, page, pageSize, limit, offset } = parseListQuery(c, {
		searchable: [sshKeys.label],
		filters: { type: sshKeys.keyType },
		dateRanges: { created_at: sshKeys.createdAt },
		defaultPageSize: 25,
	});

	const [rows, totalRows] = await Promise.all([
		db
			.select()
			.from(sshKeys)
			.where(where)
			.orderBy(desc(sshKeys.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(sshKeys).where(where),
	]);

	const usageRows = rows.length
		? await db
				.select({ sshKeyId: remoteServers.sshKeyId })
				.from(remoteServers)
				.where(
					inArray(
						remoteServers.sshKeyId,
						rows.map((row) => row.id),
					),
				)
		: [];
	const usageCounts = new Map<string, number>();
	for (const { sshKeyId } of usageRows) {
		usageCounts.set(sshKeyId, (usageCounts.get(sshKeyId) ?? 0) + 1);
	}

	return c.json({
		keys: rows.map((key) => ({
			...serialize(key),
			serverCount: usageCounts.get(key.id) ?? 0,
		})),
		total: totalRows[0]?.total ?? 0,
		page,
		pageSize,
	});
});

// Two shapes, no separate "import" concept: generate creates a fresh
// Ed25519 keypair server-side; paste takes an existing unencrypted private
// key PEM and derives the same public-key/fingerprint material from it.
const createSchema = z.object({
	label: z.string().trim().min(1).max(200),
	publicKey: z.string().trim().min(1),
	privateKey: z.string().trim().min(1),
});

instanceSshKeysRoute.post("/", async (c) => {
	const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json(
			{
				error: "Invalid input",
				details: z.treeifyError(parsed.error),
			},
			400,
		);
	}

	let material: ReturnType<typeof parsePrivateKey>;
	try {
		material = parsePrivateKey(parsed.data.privateKey);
	} catch (err) {
		return c.json(
			{ error: err instanceof Error ? err.message : "Could not read this private key" },
			400,
		);
	}

	const [key] = await getDb()
		.insert(sshKeys)
		.values({
			label: parsed.data.label,
			keyType: material.keyType,
			publicKey: material.publicKeyLine,
			privateKeyEncrypted: encryptSecret(material.privateKeyPem),
			fingerprint: material.fingerprint,
			createdByUserId: c.get("user").id,
		})
		.onConflictDoNothing()
		.returning();

	if (!key) throw new Error("SSH key insert did not return the expected row");

	await logAudit(c, {
		action: "instance.ssh_key.create",
		targetType: "ssh_key",
		targetId: key.id,
		metadata: { label: key.label, type: material.keyType },
	});

	return c.json({ id: key.id }, 201);
});

instanceSshKeysRoute.delete("/:id", async (c) => {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(sshKeys)
		.where(eq(sshKeys.id, c.req.param("id")));
	if (!existing) return c.json({ error: "SSH key not found" }, 404);

	const referencing = await db
		.select({ id: remoteServers.id })
		.from(remoteServers)
		.where(eq(remoteServers.sshKeyId, existing.id))
		.limit(1);
	if (referencing.length > 0) {
		return c.json(
			{
				error: "This key is still used by a remote server — remove the server first",
			},
			409,
		);
	}

	await db.delete(sshKeys).where(eq(sshKeys.id, existing.id));
	await logAudit(c, {
		action: "instance.ssh_key.delete",
		targetType: "ssh_key",
		targetId: existing.id,
		metadata: { label: existing.label },
	});

	return c.body(null, 204);
});

const generateSchema = z.object({
	// type : "rsa" | "ed25519"
	type: z.enum(["rsa", "ed25519"]),
});

instanceSshKeysRoute.post("/generate", async (c) => {
	const parsed = generateSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json(
			{
				error: "Invalid input",
				details: z.treeifyError(parsed.error),
			},
			400,
		);
	}

	let keyPair = null;

	switch (parsed.data.type) {
		case "rsa":
			keyPair = generateRSAKeyPair();
			break;
		case "ed25519":
			keyPair = generateEd25519KeyPair();
			break;
		default:
			return c.json({ error: "Invalid key type" }, 400);
	}

	return c.json({
		publicKey: keyPair.publicKeyLine,
		privateKey: keyPair.privateKeyPem,
		fingerprint: keyPair.fingerprint,
		keyType: keyPair.keyType,
	});
});
