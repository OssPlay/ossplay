import { getDb, systemLogs } from "@ossplay/db";

export interface SystemErrorEntry {
	source: string;
	message: string;
	metadata?: Record<string, unknown>;
}

// Called from a catch block whose error is deliberately kept out of the
// user-facing response (a generic warning, or — for forgot-password — no
// trace at all, to avoid email enumeration) so it isn't lost entirely.
// Distinct from lib/audit/log.ts's logAudit: this records the system trying
// and failing on its own, not an action someone took, so there's no actor.
export async function logSystemError(entry: SystemErrorEntry): Promise<void> {
	await getDb().insert(systemLogs).values(entry);
}
