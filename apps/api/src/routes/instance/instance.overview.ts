import os from "node:os";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { readInstanceConfig, writeInstanceConfig } from "@/lib/config/instance-config";
import { detectServerIp, readVersion } from "@/lib/server-info";
import { checkForUpdates } from "@/lib/updates/check";
import { applyUpdate, getUpdateJobStatus } from "@/lib/updates/updater-client";
import type { AppEnv } from "@/types";

export const instanceOverviewRoute = new Hono<AppEnv>();

instanceOverviewRoute.get("/", async (c) => {
	const [serverIp, version] = await Promise.all([detectServerIp(), Promise.resolve(readVersion())]);
	const { updates, instanceName } = readInstanceConfig();

	return c.json({
		serverIp,
		version,
		instanceName,
		updates,
		os: {
			arch: os.arch(),
			availableParallelism: os.availableParallelism(),
			cpus: os.cpus(),
			endianness: os.endianness(),
			freeMem: os.freemem(),
			homedir: os.homedir(),
			name: os.hostname(),
			machine: os.machine(),
			networkInterfaces: os.networkInterfaces(),
			platform: os.platform(),
			release: os.release(),
			tmpdir: os.tmpdir(),
			totalMem: os.totalmem(),
			type: os.type(),
			uptime: os.uptime(),
			userInfo: os.userInfo(),
			version: os.version(),
		},
	});
});

const updateInstanceNameSchema = z
	.object({
		instanceName: z.string().trim().min(1).max(200).nullable().optional(),
	})
	.strict();

instanceOverviewRoute.put("/", async (c) => {
	const parsed = updateInstanceNameSchema.safeParse(await c.req.json().catch(() => null));

	if (!parsed.success) {
		return c.json(
			{
				error: "Invalid input",
				details: z.treeifyError(parsed.error),
			},
			400,
		);
	}

	const next = writeInstanceConfig({
		instanceName: parsed.data.instanceName ?? null,
	});

	await logAudit(c, {
		action: "instance.name.update",
		metadata: { instanceName: parsed.data.instanceName },
	});

	return c.json({ instanceName: next.instanceName });
});

instanceOverviewRoute.get("/version", async (c) => {
	const [version] = await Promise.all([Promise.resolve(readVersion())]);
	return c.json({
		version,
	});
});

instanceOverviewRoute.post("/updates", async (c) => {
	const result = await checkForUpdates();
	return c.json(result);
});

instanceOverviewRoute.post("/updates/apply", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { version?: string };
	const result = await applyUpdate(body.version);

	await logAudit(c, {
		action: "instance.updates.apply",
		metadata: { version: body.version ?? "latest", started: result.started },
	});

	if (!result.started) {
		return c.json({ started: false, reason: result.reason }, 503);
	}
	return c.json({ started: true, jobId: result.jobId });
});

instanceOverviewRoute.get("/updates/apply/:jobId", async (c) => {
	const status = await getUpdateJobStatus(c.req.param("jobId"));
	if (!status) return c.json({ error: "Not found" }, 404);
	return c.json(status);
});

const updatesConfigSchema = z.object({ autoCheck: z.boolean() });

instanceOverviewRoute.put("/updates", async (c) => {
	const parsed = updatesConfigSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json(
			{
				error: "Invalid input",
				details: z.treeifyError(parsed.error),
			},
			400,
		);
	}

	const next = writeInstanceConfig({
		updates: { autoCheck: parsed.data.autoCheck },
	});

	await logAudit(c, {
		action: "instance.updates.settings_update",
		metadata: { autoCheck: parsed.data.autoCheck },
	});

	return c.json({ updates: next.updates });
});
