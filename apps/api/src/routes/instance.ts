import { Hono } from "hono";
import os from "node:os";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { applyDomainConfig } from "../lib/caddy/admin";
import { readInstanceConfig, writeInstanceConfig } from "../lib/config/instance-config";
import { detectServerIp, readServiceVersions } from "../lib/server-info";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceRoute = new Hono<AppEnv>();

instanceRoute.use("*", requireAuth, requireInstancePermission("instance:manage_settings"));

instanceRoute.get("/overview", async (c) => {
	const [serverIp, versions] = await Promise.all([
		detectServerIp(),
		Promise.resolve(readServiceVersions()),
	]);
	return c.json({
		serverIp,
		versions,
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

// The updater sidecar (infra/updater) is currently a stub with no HTTP
// endpoint of its own (see its own file header) — there's nothing to check
// against yet, so this always degrades gracefully rather than pretending a
// real check happened. Kept as its own endpoint (not folded into GET
// /overview) since a real implementation will be a genuine outbound call,
// not something to run on every page load.
instanceRoute.post("/updates/check", (c) => {
	return c.json({
		available: false,
		reason:
			"Automatic update checks are not available on this deployment yet — the update sidecar has no update-check endpoint implemented.",
	});
});

instanceRoute.get("/domain", (c) => {
	const { domain } = readInstanceConfig();
	return c.json({
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
	const { domain, letsEncryptEmail, customAcmeUrl } = parsed.data;
	const certProvider = parsed.data.certProvider ?? "letsencrypt";

	const result = domain
		? await applyDomainConfig(domain, {
				acmeEmail: letsEncryptEmail ?? undefined,
				certProvider,
				customAcmeUrl: customAcmeUrl ?? undefined,
			})
		: { applied: false as const, reason: "No domain configured" };

	writeInstanceConfig({
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
		metadata: { domain, certProvider, caddyApplied: result.applied },
	});

	return c.json({
		domain,
		caddyApplied: result.applied,
		message: result.applied
			? "Domain saved and applied to the reverse proxy."
			: `Domain saved. ${result.reason ?? "Not applied to the reverse proxy."}`,
	});
});
