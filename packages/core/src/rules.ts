import type { ProjectRules } from "@ossplay/db";
import { z } from "zod";

/**
 * Validates the shape of `projects.rules` (PRD.md §3). Kept structurally in
 * sync with @ossplay/db's `ProjectRules` type by hand for now — if these
 * drift, `projectRulesSchema.parse(...)`'s return type will stop matching
 * `ProjectRules` and TypeScript will flag it at the call site.
 */
export const projectRulesSchema = z.object({
	image: z.object({
		format: z.enum(["webp", "avif", "original"]),
		splitTiles: z.boolean(),
		serving: z.enum(["static", "signed"]),
	}),
	video: z.object({
		resolutions: z.array(z.string()),
		hlsSegmentDuration: z.number().int().positive(),
		drmAes128: z.boolean(),
	}),
});

export type ProjectRulesInput = z.infer<typeof projectRulesSchema>;

// Compile-time guard that the Zod schema's inferred type still matches
// @ossplay/db's ProjectRules. If this line errors, the schema above and the
// Drizzle jsonb type in packages/db/src/schema.ts have drifted apart.
export function assertRulesMatchSchema(rules: ProjectRulesInput): ProjectRules {
	return rules;
}
