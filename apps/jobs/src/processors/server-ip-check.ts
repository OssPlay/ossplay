import { detectServerIp, writeInstanceConfig } from "@ossplay/core";

// Same pattern as update-check.ts: detectServerIp() makes a real outbound
// call (ipify.org) with a 3s timeout — running it here instead of on
// GET /instance/overview's request path is what keeps that page fast.
// Never throws: detectServerIp() already degrades to null on any failure.
export async function processServerIpCheck(): Promise<void> {
	const value = await detectServerIp();
	writeInstanceConfig({ serverIp: { value, checkedAt: new Date().toISOString() } });
}
