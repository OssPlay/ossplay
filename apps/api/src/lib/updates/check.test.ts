import { describe, expect, it } from "bun:test";
import { isNewer } from "./check";

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
