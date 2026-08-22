import { describe, expect, it } from "bun:test";
import {
	buildHlsPrefix,
	buildOriginalKey,
	buildScrubKey,
	buildSubtitleKey,
	buildTempUploadKey,
	buildThumbnailKey,
	buildVariantKey,
	resolveRootAssetId,
} from "./key";

const projectId = "proj123";
const rootAssetId = "a1b2c3";

describe("storage key builders", () => {
	it("buildOriginalKey nests the original under a fixed leaf name, keeping the extension", () => {
		expect(buildOriginalKey(projectId, rootAssetId, "vacation trip.mp4")).toBe(
			`${projectId}/${rootAssetId}/original.mp4`,
		);
	});

	it("buildThumbnailKey is always a fixed .webp leaf", () => {
		expect(buildThumbnailKey(projectId, rootAssetId)).toBe(`${projectId}/${rootAssetId}/thumb.webp`);
	});

	it("buildScrubKey is always a fixed .jpg leaf", () => {
		expect(buildScrubKey(projectId, rootAssetId)).toBe(`${projectId}/${rootAssetId}/scrub.jpg`);
	});

	it("buildSubtitleKey nests under subtitles/ keyed by language", () => {
		expect(buildSubtitleKey(projectId, rootAssetId, "en")).toBe(
			`${projectId}/${rootAssetId}/subtitles/en.vtt`,
		);
	});

	it("buildHlsPrefix is a folder, not a single file", () => {
		expect(buildHlsPrefix(projectId, rootAssetId)).toBe(`${projectId}/${rootAssetId}/hls`);
	});

	it("buildVariantKey nests under variants/ keyed by specKey, preserving the output extension", () => {
		expect(buildVariantKey(projectId, rootAssetId, "720p-mp4", "clip.mp4")).toBe(
			`${projectId}/${rootAssetId}/variants/720p-mp4.mp4`,
		);
	});

	it("buildTempUploadKey lives outside any asset's folder, under a project-scoped tmp/ prefix", () => {
		const key = buildTempUploadKey(projectId, "temp-id", "commentary.mp3");
		expect(key).toBe(`${projectId}/tmp/temp-id.mp3`);
		expect(key).not.toContain(`${rootAssetId}/`);
	});
});

describe("resolveRootAssetId", () => {
	it("returns the asset's own id when it has no parent", () => {
		expect(resolveRootAssetId({ id: "self-id", parentAssetId: null })).toBe("self-id");
	});

	it("returns the parent's id when the asset is a derivative", () => {
		expect(resolveRootAssetId({ id: "derivative-id", parentAssetId: "parent-id" })).toBe("parent-id");
	});
});
