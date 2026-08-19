import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readInstanceConfig, writeInstanceConfig } from "./instance-config";

const SCRATCH_PATH = `${import.meta.dir}/instance-config.test.scratch.yaml`;

beforeEach(() => {
	process.env.OSSPLAY_CONFIG_PATH = SCRATCH_PATH;
	rmSync(SCRATCH_PATH, { force: true, recursive: true });
});

afterEach(() => {
	rmSync(SCRATCH_PATH, { force: true, recursive: true });
});

describe("instance-config", () => {
	it("returns defaults when the file does not exist", () => {
		expect(readInstanceConfig()).toEqual({
			instanceName: null,
			onboardedAt: null,
			domain: {
				name: null,
				configuredAt: null,
				letsEncryptEmail: null,
				certProvider: "letsencrypt",
				customAcmeUrl: null,
			},
			updates: {
				autoCheck: false,
				lastCheckedAt: null,
				lastCheckResult: null,
				lastNotifiedVersion: null,
			},
			serverIp: {
				value: null,
				checkedAt: null,
			},
		});
	});

	it("writes then reads back the instance name", () => {
		writeInstanceConfig({ instanceName: "Acme Inc" });
		expect(readInstanceConfig().instanceName).toBe("Acme Inc");
	});

	it("writes then reads back the same values", () => {
		writeInstanceConfig({ domain: { name: "ossplay.example.com" } });
		const config = readInstanceConfig();
		expect(config.domain.name).toBe("ossplay.example.com");
	});

	it("a later patch merges over, not clobbers, previously-set fields", () => {
		writeInstanceConfig({ domain: { name: "ossplay.example.com" } });
		writeInstanceConfig({ domain: { configuredAt: "2026-01-01T00:00:00.000Z" } });

		const config = readInstanceConfig();
		expect(config.domain.name).toBe("ossplay.example.com");
		expect(config.domain.configuredAt).toBe("2026-01-01T00:00:00.000Z");
	});

	it("a null patch value clears a previously-set field", () => {
		writeInstanceConfig({ domain: { name: "ossplay.example.com" } });
		writeInstanceConfig({ domain: { name: null } });
		expect(readInstanceConfig().domain.name).toBeNull();
	});

	it("a hand-edited file missing fields or whole sections still reads cleanly", () => {
		writeFileSync(SCRATCH_PATH, "domain:\n  name: ossplay.example.com\n", "utf8");
		const config = readInstanceConfig();
		expect(config.domain.name).toBe("ossplay.example.com");
		expect(config.domain.configuredAt).toBeNull();
	});

	// Reproduces a real incident: a Docker bind mount created before the
	// host-side file existed gets auto-vivified as a directory, so every
	// read/write inside the container hits EISDIR instead of ENOENT.
	describe("when the config path is a directory (stale bind mount), not a file", () => {
		beforeEach(() => {
			mkdirSync(SCRATCH_PATH, { recursive: true });
		});

		it("falls back to defaults on read, rather than throwing", () => {
			expect(readInstanceConfig().onboardedAt).toBeNull();
		});

		it("throws a clear, actionable error on write instead of an opaque EISDIR", () => {
			expect(() => writeInstanceConfig({ instanceName: "Acme Inc" })).toThrow(
				/bind mount|directory, not a file/,
			);
		});
	});
});
