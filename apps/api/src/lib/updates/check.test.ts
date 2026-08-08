import { describe, expect, it } from "bun:test";
import { isNewer, pickLatestReleaseTag } from "./check";

describe("isNewer", () => {
	it("detects a newer patch/minor/major release", () => {
		expect(isNewer("0.0.2", "0.0.1")).toBe(true);
		expect(isNewer("0.1.0", "0.0.9")).toBe(true);
		expect(isNewer("1.0.0", "0.9.9")).toBe(true);
	});

	it("is not newer for an equal or older version", () => {
		expect(isNewer("0.0.1", "0.0.1")).toBe(false);
		expect(isNewer("0.0.1", "0.0.2")).toBe(false);
	});

	// Regression: a real alpha.9 -> alpha.9 update-check falsely reported "up
	// to date" because of a wrong GitHub endpoint, but a follow-on alpha.10
	// would have been reported as OLDER than alpha.9 by the version compare
	// itself — a plain string comparison ("alpha.10" < "alpha.9") rather than
	// a numeric-aware one.
	it("compares numeric prerelease identifiers numerically, not lexically", () => {
		expect(isNewer("0.0.1-alpha.10", "0.0.1-alpha.9")).toBe(true);
		expect(isNewer("0.0.1-alpha.9", "0.0.1-alpha.10")).toBe(false);
		expect(isNewer("0.0.1-alpha.9", "0.0.1-alpha.9")).toBe(false);
	});

	it("treats a real release as newer than any prerelease of the same core version", () => {
		expect(isNewer("0.0.1", "0.0.1-alpha.9")).toBe(true);
		expect(isNewer("0.0.1-alpha.9", "0.0.1")).toBe(false);
	});

	it("handles a leading v on either side", () => {
		expect(isNewer("v0.0.2", "v0.0.1")).toBe(true);
		expect(isNewer("v0.0.1", "0.0.1")).toBe(false);
	});
});

describe("pickLatestReleaseTag", () => {
	// Regression: a real GET /releases response came back with alpha.9 and
	// alpha.8 ahead of alpha.12/alpha.11/alpha.10 (GitHub's list order isn't
	// reliably newest-first). Taking index 0, the previous approach, would
	// report alpha.9 as "latest" while an alpha.11 instance was already
	// ahead of it.
	it("picks the highest version regardless of array order", () => {
		const releases = [
			{ tag_name: "v0.0.1-alpha.9" },
			{ tag_name: "v0.0.1-alpha.8" },
			{ tag_name: "v0.0.1-alpha.12" },
			{ tag_name: "v0.0.1-alpha.11" },
			{ tag_name: "v0.0.1-alpha.10" },
			{ tag_name: "v0.0.1-alpha.7" },
		];
		expect(pickLatestReleaseTag(releases)).toBe("v0.0.1-alpha.12");
	});

	it("ignores entries with no tag_name", () => {
		expect(pickLatestReleaseTag([{}, { tag_name: "v0.0.1-alpha.2" }])).toBe("v0.0.1-alpha.2");
	});

	it("returns null for an empty or missing list", () => {
		expect(pickLatestReleaseTag([])).toBeNull();
		expect(pickLatestReleaseTag(null)).toBeNull();
		expect(pickLatestReleaseTag(undefined)).toBeNull();
	});
});
