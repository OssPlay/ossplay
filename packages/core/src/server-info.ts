import { readFileSync } from "node:fs";
import { join } from "node:path";

// api/dashboard/worker/updater/jobs each publish as their own
// `ghcr.io/ossplay/ossplay:<version>-<role>` image (one Dockerfile, one
// version, role-scoped final stages — see infra/ossplay/Dockerfile),
// so there's still exactly one version for the whole running instance, not
// one per app. Releases are tagged,
// not hand-bumped in package.json (see docker-images.yml): the pushed git
// tag (e.g. `v0.0.1`) is stripped of its `v` and baked into the image as
// OSSPLAY_VERSION at build time, which always wins here. Local dev (no
// Docker, no env) falls back to the root package.json's placeholder
// version, then to "dev" if even that can't be read.
function readRootPackageVersion(): string | null {
	try {
		const raw = readFileSync(join(import.meta.dir, "../../../package.json"), "utf8");
		const pkg = JSON.parse(raw) as { version?: string };
		return pkg.version ?? null;
	} catch {
		return null;
	}
}

export function readVersion(): string {
	return process.env.OSSPLAY_VERSION || readRootPackageVersion() || "dev";
}

const IP_LOOKUP_URL = "https://api.ipify.org?format=json";
const IP_LOOKUP_TIMEOUT_MS = 3000;

// Best-effort only — there's no reliable way for a container to know its
// own public IP from the inside (a Docker bridge network IP is not it).
// Asking an external echo service is the same trick every ACME client
// implicitly relies on already (a domain can only get a cert here because
// the world can already reach this box on some public IP). Never throws;
// returns null on any failure so the caller can show an honest "unknown"
// state instead of a stale or wrong address.
export async function detectServerIp(): Promise<string | null> {
	try {
		const res = await fetch(IP_LOOKUP_URL, { signal: AbortSignal.timeout(IP_LOOKUP_TIMEOUT_MS) });
		if (!res.ok) return null;
		const body = (await res.json()) as { ip?: string };
		return body.ip ?? null;
	} catch {
		return null;
	}
}
