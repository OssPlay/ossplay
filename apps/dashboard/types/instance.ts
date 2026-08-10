export type InstanceRepo = {
	version: `v${string}`;
	// Runtime env read server-side by apps/api (OSSPLAY_DOCS_URL/
	// OSSPLAY_WEBSITE_URL), not a NEXT_PUBLIC_* build-time var — the
	// dashboard's image is built once and shipped to every self-hoster, so a
	// build-time var can never reflect a given operator's own .env. See
	// components/layout/account-dropdown.tsx and components/ui/container.tsx.
	docsUrl: string | null;
	websiteUrl: string | null;
	updates: {
		forced: boolean;
		forcedReason: string | null;
		currentVersion: `v${string}`;
		available: boolean;
		latestVersion: string | null;
	};
};
