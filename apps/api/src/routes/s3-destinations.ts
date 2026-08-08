import { createS3Client, decryptSecret, encryptSecret } from "@ossplay/core";
import { getDb, projects, type S3Destination, s3Destinations } from "@ossplay/db";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import { requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const s3DestinationsRoute = new Hono<AppEnv>();

// Credential-bearing, so every route below is gated the same as other
// org-secret configuration — org:manage_settings (owner-only), not
// org:manage_members — passed inline per handler (mirrors projects.ts /
// organizations.ts's convention in this app rather than a blanket `.use()`).
const gate = [requireAuth, requireOrgPermission("org:manage_settings")] as const;

// Never serializes secretAccessKeyEncrypted back to the client.
function serialize(destination: S3Destination) {
	return {
		id: destination.id,
		orgId: destination.orgId,
		label: destination.label,
		endpoint: destination.endpoint,
		region: destination.region,
		bucket: destination.bucket,
		accessKeyId: destination.accessKeyId,
		visibility: destination.visibility,
		cloudfrontUrl: destination.cloudfrontUrl,
		status: destination.status,
		lastCheckedAt: destination.lastCheckedAt,
		lastError: destination.lastError,
		createdAt: destination.createdAt,
	};
}

s3DestinationsRoute.get("/:orgId/s3-destinations", ...gate, async (c) => {
	const db = getDb();
	const orgId = c.req.param("orgId");
	const { where, page, pageSize, limit, offset } = parseListQuery(c, {
		searchable: [s3Destinations.label, s3Destinations.bucket],
		filters: { visibility: s3Destinations.visibility, status: s3Destinations.status },
		defaultPageSize: 25,
	});
	const scoped = and(eq(s3Destinations.orgId, orgId), where);

	const [rows, totalRows] = await Promise.all([
		db
			.select()
			.from(s3Destinations)
			.where(scoped)
			.orderBy(desc(s3Destinations.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(s3Destinations).where(scoped),
	]);

	return c.json({
		destinations: rows.map(serialize),
		total: totalRows[0]?.total ?? 0,
		page,
		pageSize,
	});
});

const createSchema = z.object({
	label: z.string().trim().min(1).max(200),
	endpoint: z.string().trim().min(1).max(500),
	region: z.string().trim().min(1).max(100),
	bucket: z.string().trim().min(1).max(255),
	accessKeyId: z.string().trim().min(1).max(500),
	secretAccessKey: z.string().trim().min(1).max(500),
	visibility: z.enum(["public", "private"]),
	cloudfrontUrl: z.string().trim().max(500).optional(),
});

s3DestinationsRoute.post("/:orgId/s3-destinations", ...gate, async (c) => {
	const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const [destination] = await getDb()
		.insert(s3Destinations)
		.values({
			orgId: c.req.param("orgId"),
			label: parsed.data.label,
			endpoint: parsed.data.endpoint,
			region: parsed.data.region,
			bucket: parsed.data.bucket,
			accessKeyId: parsed.data.accessKeyId,
			secretAccessKeyEncrypted: encryptSecret(parsed.data.secretAccessKey),
			visibility: parsed.data.visibility,
			cloudfrontUrl: parsed.data.cloudfrontUrl || null,
			createdByUserId: c.get("user").id,
		})
		.returning();
	if (!destination) throw new Error("S3 destination insert did not return the expected row");

	await logAudit(c, {
		action: "organization.s3_destination.create",
		targetType: "s3_destination",
		targetId: destination.id,
		metadata: { label: destination.label, bucket: destination.bucket },
	});

	return c.json({ destination: serialize(destination) }, 201);
});

// visibility is deliberately excluded — immutable once created, same as a
// project's own visibility, since a project's locked-in choice only holds
// if the destination it points to can't flip visibility out from under it.
const updateSchema = z.object({
	label: z.string().trim().min(1).max(200).optional(),
	endpoint: z.string().trim().min(1).max(500).optional(),
	region: z.string().trim().min(1).max(100).optional(),
	bucket: z.string().trim().min(1).max(255).optional(),
	accessKeyId: z.string().trim().min(1).max(500).optional(),
	secretAccessKey: z.string().trim().min(1).max(500).optional(),
	cloudfrontUrl: z.string().trim().max(500).optional(),
});

s3DestinationsRoute.put("/:orgId/s3-destinations/:id", ...gate, async (c) => {
	const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const db = getDb();
	const [existing] = await db
		.select({ id: s3Destinations.id })
		.from(s3Destinations)
		.where(
			and(eq(s3Destinations.id, c.req.param("id")), eq(s3Destinations.orgId, c.req.param("orgId"))),
		);
	if (!existing) return c.json({ error: "S3 destination not found" }, 404);

	const { secretAccessKey, ...rest } = parsed.data;
	const [destination] = await db
		.update(s3Destinations)
		.set({
			...rest,
			...(secretAccessKey && { secretAccessKeyEncrypted: encryptSecret(secretAccessKey) }),
		})
		.where(eq(s3Destinations.id, existing.id))
		.returning();
	if (!destination) throw new Error("S3 destination update did not return the expected row");

	await logAudit(c, {
		action: "organization.s3_destination.update",
		targetType: "s3_destination",
		targetId: destination.id,
		metadata: { label: destination.label },
	});

	return c.json({ destination: serialize(destination) });
});

s3DestinationsRoute.delete("/:orgId/s3-destinations/:id", ...gate, async (c) => {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(s3Destinations)
		.where(
			and(eq(s3Destinations.id, c.req.param("id")), eq(s3Destinations.orgId, c.req.param("orgId"))),
		);
	if (!existing) return c.json({ error: "S3 destination not found" }, 404);

	const referencing = await db
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.destinationId, existing.id))
		.limit(1);
	if (referencing.length > 0) {
		return c.json(
			{ error: "This destination is still used by a project — point it elsewhere first" },
			409,
		);
	}

	await db.delete(s3Destinations).where(eq(s3Destinations.id, existing.id));
	await logAudit(c, {
		action: "organization.s3_destination.delete",
		targetType: "s3_destination",
		targetId: existing.id,
		metadata: { label: existing.label },
	});

	return c.body(null, 204);
});

// The one genuinely real S3 operation this pass: a cheap ListObjectsV2 call
// (maxKeys: 1) to confirm the credentials/bucket/endpoint actually work —
// mirrors instance-servers.ts's SSH "Test connection" action. Bun's
// S3Client has no account-level bucket-listing call, so this is the closest
// equivalent connectivity check.
s3DestinationsRoute.post("/:orgId/s3-destinations/:id/test", ...gate, async (c) => {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(s3Destinations)
		.where(
			and(eq(s3Destinations.id, c.req.param("id")), eq(s3Destinations.orgId, c.req.param("orgId"))),
		);
	if (!existing) return c.json({ error: "S3 destination not found" }, 404);

	let ok = true;
	let error: string | null = null;
	try {
		const client = createS3Client({
			endpoint: existing.endpoint,
			bucket: existing.bucket,
			region: existing.region,
			accessKeyId: existing.accessKeyId,
			secretAccessKey: decryptSecret(existing.secretAccessKeyEncrypted),
		});
		await client.list({ maxKeys: 1 });
	} catch (err) {
		// Covers a bad connection just as much as a malformed stored secret
		// (e.g. the migration-seeded placeholder destination's non-encrypted
		// value) — either way this is a clean "test failed," not a 500.
		ok = false;
		error = err instanceof Error ? err.message : String(err);
	}

	const [destination] = await db
		.update(s3Destinations)
		.set({
			status: ok ? "ok" : "error",
			lastCheckedAt: new Date(),
			lastError: ok ? null : error,
		})
		.where(eq(s3Destinations.id, existing.id))
		.returning();
	if (!destination) throw new Error("S3 destination update did not return the expected row");

	await logAudit(c, {
		action: "organization.s3_destination.test",
		targetType: "s3_destination",
		targetId: destination.id,
		metadata: { ok },
	});

	return c.json({ destination: serialize(destination), error });
});
