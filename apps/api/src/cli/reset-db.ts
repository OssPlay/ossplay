#!/usr/bin/env bun
// Dev convenience tool: wipes every table this instance owns and resets the
// instance config file back to defaults, so /setup and /onboarding can be
// walked through again from a truly fresh state. Not a production tool —
// see the confirmation prompt below.
//
// Usage:
//   bun run src/cli/reset-db.ts [--yes]
//
// --yes skips the confirmation prompt, for fast repeated use once you trust
// it (e.g. `bun run cli:reset-db -- --yes` in a loop while iterating on the
// setup flow).
import { getDb } from "@ossplay/db";
import { sql } from "drizzle-orm";
import { resetInstanceConfig } from "../lib/config/instance-config";

const TABLES = [
	"sessions",
	"organization_members",
	"organizations",
	"users",
	"two_factor_challenges",
	"user_recovery_codes",
	"password_reset_tokens",
	"invitations",
	"webauthn_credentials",
	"webauthn_challenges",
	// projects/assets/folder_closure are cascade-truncated via FKs to the
	// tables above — no need to list them separately.
];

function fail(message: string): never {
	console.error(`\nError: ${message}`);
	process.exit(1);
}

async function prompt(question: string): Promise<string> {
	process.stdout.write(question);
	for await (const line of console) {
		return line.trim();
	}
	return "";
}

async function main() {
	const skipConfirm = process.argv.includes("--yes");
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) fail("DATABASE_URL is not set.");

	console.log("\nThis will permanently delete ALL data in:");
	console.log(`  ${databaseUrl}`);
	console.log("and reset the instance config file (SMTP, domain) to defaults.");
	console.log("\nThis is a dev convenience tool, not for a real deployment with real data.");

	if (!skipConfirm) {
		const confirmation = await prompt('\nType "reset" to confirm: ');
		if (confirmation !== "reset") fail("Confirmation did not match — nothing was changed.");
	}

	await getDb().execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
	resetInstanceConfig();

	console.log("\nDone. Database and instance config are back to a fresh install.");
	console.log("Visit /setup to walk through onboarding again.");
	process.exit(0);
}

main().catch((err) => {
	fail(err instanceof Error ? err.message : String(err));
});
