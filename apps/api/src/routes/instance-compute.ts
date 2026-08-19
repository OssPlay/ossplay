import { decryptSecret, encryptSecret, testLambdaConnection } from "@ossplay/core";
import { type ComputeDestination, computeDestinations, getDb } from "@ossplay/db";
import { count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

// Instance-wide, same as instance-servers.ts — a compute destination is a
// serverless execution backend for the whole instance's asset-processing
// jobs (packages/core/src/compute-dispatch.ts picks one via rotation), not
// an org- or project-scoped resource, so this shares that route's gate
// rather than s3-destinations.ts's org:manage_settings.
export const instanceComputeRoute = new Hono<AppEnv>();

instanceComputeRoute.use("*", requireAuth, requireInstancePermission("instance:manage_workers"));

// Exported so instance-remote-workers.ts can reuse the exact same field set
// when it merges this table with remote servers into one list.
export function serializeComputeDestination(destination: ComputeDestination) {
	return {
		id: destination.id,
		provider: destination.provider,
		label: destination.label,
		region: destination.region,
		functionArn: destination.functionArn,
		accessKeyId: destination.accessKeyId,
		enabled: destination.enabled,
		status: destination.status,
		lastCheckedAt: destination.lastCheckedAt,
		lastError: destination.lastError,
		lastUsedAt: destination.lastUsedAt,
		createdAt: destination.createdAt,
	};
}

instanceComputeRoute.get("/", async (c) => {
	const db = getDb();
	const { where, orderBy, page, pageSize, limit, offset } = parseListQuery(c, {
		searchable: [computeDestinations.label, computeDestinations.functionArn],
		filters: { status: computeDestinations.status, provider: computeDestinations.provider },
		sortable: {
			label: computeDestinations.label,
			createdAt: computeDestinations.createdAt,
		},
		defaultSort: { key: "createdAt", order: "desc" },
		defaultPageSize: 25,
	});

	const [rows, totalRows] = await Promise.all([
		db
			.select()
			.from(computeDestinations)
			.where(where)
			.orderBy(orderBy ?? desc(computeDestinations.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(computeDestinations).where(where),
	]);

	return c.json({
		destinations: rows.map(serializeComputeDestination),
		total: totalRows[0]?.total ?? 0,
		page,
		pageSize,
	});
});

const createSchema = z.object({
	provider: z.literal("lambda"),
	label: z.string().trim().min(1).max(200),
	region: z.string().trim().min(1).max(100),
	functionArn: z.string().trim().min(1).max(500),
	accessKeyId: z.string().trim().min(1).max(200),
	secretAccessKey: z.string().trim().min(1),
});

instanceComputeRoute.post("/", async (c) => {
	const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ error: "Invalid input", details: z.treeifyError(parsed.error) }, 400);
	}

	const [destination] = await getDb()
		.insert(computeDestinations)
		.values({
			provider: parsed.data.provider,
			label: parsed.data.label,
			region: parsed.data.region,
			functionArn: parsed.data.functionArn,
			accessKeyId: parsed.data.accessKeyId,
			secretAccessKeyEncrypted: encryptSecret(parsed.data.secretAccessKey),
			createdByUserId: c.get("user").id,
		})
		.returning();
	if (!destination) throw new Error("Compute destination insert did not return the expected row");

	await logAudit(c, {
		action: "instance.compute_destination.create",
		targetType: "compute_destination",
		targetId: destination.id,
		metadata: { label: destination.label, provider: destination.provider },
	});

	return c.json({ destination: serializeComputeDestination(destination) }, 201);
});

const updateSchema = z.object({
	label: z.string().trim().min(1).max(200).optional(),
	region: z.string().trim().min(1).max(100).optional(),
	functionArn: z.string().trim().min(1).max(500).optional(),
	accessKeyId: z.string().trim().min(1).max(200).optional(),
	secretAccessKey: z.string().trim().min(1).optional(),
	enabled: z.boolean().optional(),
});

instanceComputeRoute.put("/:id", async (c) => {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(computeDestinations)
		.where(eq(computeDestinations.id, c.req.param("id")));
	if (!existing) return c.json({ error: "Compute destination not found" }, 404);

	const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ error: "Invalid input", details: z.treeifyError(parsed.error) }, 400);
	}

	const { secretAccessKey, ...rest } = parsed.data;
	const [updated] = await db
		.update(computeDestinations)
		.set({
			...rest,
			...(secretAccessKey ? { secretAccessKeyEncrypted: encryptSecret(secretAccessKey) } : {}),
		})
		.where(eq(computeDestinations.id, existing.id))
		.returning();
	if (!updated) throw new Error("Compute destination update did not return the expected row");

	await logAudit(c, {
		action: "instance.compute_destination.update",
		targetType: "compute_destination",
		targetId: updated.id,
		metadata: { label: updated.label },
	});

	return c.json({ destination: serializeComputeDestination(updated) });
});

instanceComputeRoute.delete("/:id", async (c) => {
	const db = getDb();
	const [existing] = await db
		.select()
		.from(computeDestinations)
		.where(eq(computeDestinations.id, c.req.param("id")));
	if (!existing) return c.json({ error: "Compute destination not found" }, 404);

	await db.delete(computeDestinations).where(eq(computeDestinations.id, existing.id));
	await logAudit(c, {
		action: "instance.compute_destination.delete",
		targetType: "compute_destination",
		targetId: existing.id,
		metadata: { label: existing.label },
	});

	return c.body(null, 204);
});

// Cheap connectivity check — invokes the deployed function synchronously
// with { ping: true }, same never-500s-to-the-caller convention as
// instance-servers.ts's /test.
instanceComputeRoute.post("/:id/test", async (c) => {
	const db = getDb();
	const [destination] = await db
		.select()
		.from(computeDestinations)
		.where(eq(computeDestinations.id, c.req.param("id")));
	if (!destination) return c.json({ error: "Compute destination not found" }, 404);

	const result = await testLambdaConnection({
		region: destination.region,
		functionArn: destination.functionArn,
		accessKeyId: destination.accessKeyId,
		secretAccessKey: decryptSecret(destination.secretAccessKeyEncrypted),
	});

	const [updated] = await db
		.update(computeDestinations)
		.set({
			status: result.ok ? "online" : "error",
			lastCheckedAt: new Date(),
			lastError: result.ok ? null : (result.error ?? "Unknown error"),
		})
		.where(eq(computeDestinations.id, destination.id))
		.returning();
	if (!updated) throw new Error("Compute destination update did not return the expected row");

	await logAudit(c, {
		action: "instance.compute_destination.test",
		targetType: "compute_destination",
		targetId: destination.id,
		metadata: { ok: result.ok },
	});

	return c.json({ destination: serializeComputeDestination(updated), error: result.error });
});
