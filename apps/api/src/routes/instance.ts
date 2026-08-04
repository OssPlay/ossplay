import os from "node:os";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { applyDomainConfig } from "../lib/caddy/admin";
import { readInstanceConfig, writeInstanceConfig } from "../lib/config/instance-config";
import { detectServerIp, readVersion } from "../lib/server-info";
import { checkForUpdates } from "../lib/updates/check";
import { applyUpdate, getUpdateJobStatus } from "../lib/updates/updater-client";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceRoute = new Hono<AppEnv>();

instanceRoute.use("*", requireAuth, requireInstancePermission("instance:manage_settings"));

instanceRoute.get("/overview", async (c) => {
	const [serverIp, version] = await Promise.all([detectServerIp(), Promise.resolve(readVersion())]);
	const { updates } = readInstanceConfig();
	return c.json({
		serverIp,
		version,
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

// Kept as its own endpoint (not folded into GET /overview) since it makes
// real outbound calls (GitHub Releases API + RELEASES.json) — not something
// to run on every page load. See apps/api/src/lib/updates/check.ts.
instanceRoute.post("/updates/check", async (c) => {
	const result = await checkForUpdates();
	return c.json(result);
});

instanceRoute.post("/updates/apply", async (c) => {
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

instanceRoute.get("/updates/apply/:jobId", async (c) => {
	const status = await getUpdateJobStatus(c.req.param("jobId"));
	if (!status) return c.json({ error: "Not found" }, 404);
	return c.json(status);
});

const updatesConfigSchema = z.object({ autoCheck: z.boolean() });

// Persists the dashboard's "Check for updates automatically" checkbox — see
// apps/api/src/index.ts for the background timer this gates.
instanceRoute.put("/updates", async (c) => {
	const parsed = updatesConfigSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ error: "Invalid input", details: z.treeifyError(parsed.error) }, 400);
	}

	const next = writeInstanceConfig({ updates: { autoCheck: parsed.data.autoCheck } });

	await logAudit(c, {
		action: "instance.updates.settings_update",
		metadata: { autoCheck: parsed.data.autoCheck },
	});

	return c.json({ updates: next.updates });
});

instanceRoute.get("/domain", (c) => {
	const { instanceName, domain } = readInstanceConfig();
	return c.json({
		instanceName,
		domain: domain.name,
		domainConfiguredAt: domain.configuredAt,
		letsEncryptEmail: domain.letsEncryptEmail,
		certProvider: domain.certProvider,
		customAcmeUrl: domain.customAcmeUrl,
	});
});

// A single label with no dot ("localhost") or an IPv4 literal can't get a
// Let's Encrypt certificate — reject those early with a clear message
// rather than letting them reach Caddy and fail obscurely there.
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

const CERT_PROVIDERS = ["letsencrypt", "zerossl", "custom"] as const;

const domainSchema = z
	.object({
		instanceName: z.string().trim().min(1).max(200).nullable().optional(),
		domain: z
			.string()
			.trim()
			.toLowerCase()
			.nullable()
			.refine(
				(value) => value === null || (HOSTNAME_PATTERN.test(value) && !IPV4_PATTERN.test(value)),
				"Enter a real domain (e.g. ossplay.example.com) — localhost and bare IP addresses cannot get a certificate",
			),
		letsEncryptEmail: z.email().nullable().optional(),
		certProvider: z.enum(CERT_PROVIDERS).optional(),
		customAcmeUrl: z.url().nullable().optional(),
	})
	.refine((data) => data.domain === null || !!data.letsEncryptEmail, {
		message: "An ACME contact email is required when a domain is configured",
		path: ["letsEncryptEmail"],
	})
	.refine((data) => data.certProvider !== "custom" || !!data.customAcmeUrl, {
		message: "A custom ACME directory URL is required for the custom provider",
		path: ["customAcmeUrl"],
	});

instanceRoute.put("/domain", async (c) => {
	const parsed = domainSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json(
			{
				error: "Invalid input",
				details: z.treeifyError(parsed.error),
			},
			400,
		);
	}
	const { domain, letsEncryptEmail, customAcmeUrl, instanceName } = parsed.data;
	const certProvider = parsed.data.certProvider ?? "letsencrypt";

	const result = domain
		? await applyDomainConfig(domain, {
				acmeEmail: letsEncryptEmail ?? undefined,
				certProvider,
				customAcmeUrl: customAcmeUrl ?? undefined,
			})
		: { applied: false as const, reason: "No domain configured" };

	writeInstanceConfig({
		instanceName: instanceName ?? null,
		domain: {
			name: domain,
			configuredAt: result.applied ? new Date().toISOString() : null,
			letsEncryptEmail: letsEncryptEmail ?? null,
			certProvider,
			customAcmeUrl: customAcmeUrl ?? null,
		},
	});

	await logAudit(c, {
		action: "instance.domain.update",
		targetType: "domain",
		targetId: domain ?? undefined,
		metadata: { domain, certProvider, caddyApplied: result.applied, instanceName },
	});

	return c.json({
		domain,
		instanceName: instanceName ?? null,
		caddyApplied: result.applied,
		message: result.applied
			? "Domain saved and applied to the reverse proxy."
			: `Domain saved. ${result.reason ?? "Not applied to the reverse proxy."}`,
	});
});
