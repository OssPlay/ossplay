// Talks to the updater sidecar (infra/updater/index.ts) over the compose-
// internal network. Same graceful-degradation shape as
// apps/api/src/lib/caddy/admin.ts: OSSPLAY_UPDATER_URL/_TOKEN are only set
// by infra/docker-compose.yml's `api` service, so local dev (no Docker) and
// any non-Docker-Compose deployment always report "not configured" here
// rather than attempting an unreachable request.
const REQUEST_TIMEOUT_MS = 5000;

function updaterConfig(): { url: string; token: string } | null {
	const url = process.env.OSSPLAY_UPDATER_URL;
	const token = process.env.OSSPLAY_UPDATER_TOKEN;
	return url && token ? { url, token } : null;
}

export interface ApplyUpdateResult {
	started: boolean;
	jobId?: string;
	reason?: string;
}

export async function applyUpdate(version?: string): Promise<ApplyUpdateResult> {
	const config = updaterConfig();
	if (!config) {
		return { started: false, reason: "The update sidecar is not configured on this deployment." };
	}
	try {
		const res = await fetch(`${config.url}/update`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
			body: JSON.stringify({ version }),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		const body = (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null;
		if (!res.ok) {
			return { started: false, reason: body?.error ?? `Update sidecar returned ${res.status}` };
		}
		return { started: true, jobId: body?.jobId };
	} catch (err) {
		return { started: false, reason: err instanceof Error ? err.message : String(err) };
	}
}

export interface UpdateJobStatus {
	id: string;
	status: "pending" | "pulling" | "migrating" | "restarting" | "done" | "failed";
	version: string;
	error: string | null;
}

export async function getUpdateJobStatus(jobId: string): Promise<UpdateJobStatus | null> {
	const config = updaterConfig();
	if (!config) return null;
	try {
		const res = await fetch(`${config.url}/update/${jobId}`, {
			headers: { Authorization: `Bearer ${config.token}` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!res.ok) return null;
		return (await res.json()) as UpdateJobStatus;
	} catch {
		return null;
	}
}
