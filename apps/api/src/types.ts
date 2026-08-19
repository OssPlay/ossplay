import type { Session, User } from "@ossplay/db";

export type AppEnv = {
	Variables: {
		user: User;
		session: Session;
		// Set by middleware/require-api-key.ts — only present on /v1 public API
		// requests, which authenticate via a project-scoped key instead of a
		// session and never have `user`/`session` set.
		apiKeyProjectId: string;
	};
};
