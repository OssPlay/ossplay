// Matches the API's PROJECT_ID_PATTERN (apps/api/src/routes/projects.ts) —
// lowercase, digits, hyphens, 2-63 chars. Used to auto-suggest a project id
// from its name; the field stays freely editable afterward.
export function slugify(input: string): string {
	const slug = input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63)
		.replace(/-+$/, "");
	return slug;
}
