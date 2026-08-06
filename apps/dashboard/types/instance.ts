export type InstanceRepo = {
	version: `v${string}`;
	updates: {
		forced: boolean;
		forcedReason: string | null;
		currentVersion: `v${string}`;
	};
};
