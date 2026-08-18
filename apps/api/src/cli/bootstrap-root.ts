#!/usr/bin/env bun
// Dev convenience tool: gives a fresh instance a working, known-credential
// root account with zero manual /setup click-through. A no-op once a root
// already exists — safe to run on every `bun run dev` (see scripts/dev-all.ts
// in the org-level checkout, which does exactly that), not just once.
//
// Usage:
//   bun run src/cli/bootstrap-root.ts
//
// Reads ROOT_NAME/ROOT_EMAIL/ROOT_PASSWORD from the environment — same
// values every run, so the same login always works after a
// `bun run dev:clean` or `bun test` (both wipe the users table).
//
// Deliberately stops at POST /setup — does NOT also create an organization.
// This tool's only job is a working root login; POST /organizations
// unconditionally stamps onboardedAt (organizations.ts), which would
// silently complete the onboarding wizard before anyone ever saw it. Create
// the org yourself through /onboarding in the browser, same as a real
// first-run instance would.
//
// Deliberately doesn't import test-support.ts even though it has an
// equivalent bootstrapAdmin() helper — that file unconditionally redirects
// OSSPLAY_CONFIG_PATH to a throwaway test yaml on import, which would break
// this tool's use of the real dev ossplay.yaml.
import { app } from "../app";
import { instanceNeedsSetup } from "../routes/setup";

function fail(message: string): never {
	console.error(`\nError: ${message}`);
	process.exit(1);
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) fail(`${name} is not set.`);
	return value;
}

async function main() {
	if (!(await instanceNeedsSetup())) {
		console.log("Root already exists — nothing to do.");
		process.exit(0);
	}

	const adminName = requireEnv("ROOT_NAME");
	const adminEmail = requireEnv("ROOT_EMAIL");
	const adminPassword = requireEnv("ROOT_PASSWORD");

	const setupRes = await app.request("/setup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ adminName, adminEmail, adminPassword }),
	});
	if (!setupRes.ok) {
		fail(`POST /setup failed (${setupRes.status}): ${await setupRes.text()}`);
	}

	console.log(`Root account created — ${adminEmail}. Visit /onboarding to finish setup.`);
	process.exit(0);
}

main().catch((err) => {
	fail(err instanceof Error ? err.message : String(err));
});
