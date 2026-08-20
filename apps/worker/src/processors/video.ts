import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getProjectWithDestination,
	resolveStorageDriver,
	type StorageDriver,
	type VideoProcessingJob,
} from "@ossplay/core";
import { type Asset, assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import {
	createVariant,
	ffprobeJson,
	type FfprobeStream,
	finalizeHlsVariant,
	finalizeVariant,
	markAssetStatus,
	parseFrameRate,
} from "./shared";
import { run } from "./spawn";

// The rendition ladder for on-demand HLS packaging — filtered down to
// heights at or below the source's own resolution at package time (never
// upscale), same fixed-tier philosophy as VariantSpec's video-transcode
// heights.
const HLS_RUNGS = [1080, 720, 480, 360] as const;

// ffmpeg can transcode these subtitle codecs directly to WebVTT — bitmap
// formats (PGS/VobSub, burned-in image subtitles some MKVs carry) aren't
// text at all, so there's no text to convert; those streams are skipped
// rather than attempted and failed.
const CONVERTIBLE_SUBTITLE_CODECS = new Set(["subrip", "ass", "ssa", "mov_text", "webvtt", "text"]);

// ffprobe reports ISO 639-2 (3-letter) tags; the rest of this app's
// subtitle UI (dashboard's language picker, the player's caption default)
// works in ISO 639-1 (2-letter) — this maps the common ones, since MKV's
// `tags.language` is exactly where an embedded track's language actually
// comes from. An unmapped tag is used as-is rather than dropped.
const ISO_639_2_TO_1: Record<string, { code: string; label: string }> = {
	eng: { code: "en", label: "English" },
	spa: { code: "es", label: "Spanish" },
	fra: { code: "fr", label: "French" },
	fre: { code: "fr", label: "French" },
	deu: { code: "de", label: "German" },
	ger: { code: "de", label: "German" },
	ita: { code: "it", label: "Italian" },
	por: { code: "pt", label: "Portuguese" },
	jpn: { code: "ja", label: "Japanese" },
	kor: { code: "ko", label: "Korean" },
	zho: { code: "zh", label: "Chinese" },
	chi: { code: "zh", label: "Chinese" },
	hin: { code: "hi", label: "Hindi" },
	ara: { code: "ar", label: "Arabic" },
	rus: { code: "ru", label: "Russian" },
};

const SCRUB_TILE_WIDTH = 160;
const SCRUB_TILE_HEIGHT = 90;
const SCRUB_TARGET_COUNT = 100;
const SCRUB_MIN_INTERVAL = 2;
const SCRUB_MAX_INTERVAL = 30;

// Upload-time processing is thumbnail-only by design (see the plan's
// per-mimetype variant matrix) — the eager HLS packaging this used to do
// (segments/manifest/key per upload) is gone; on-demand transcoding (the
// `requestedVariant` branch below, mp4 or webm depending on the requested
// spec) replaces it. ProjectRules' `hlsSegmentDuration`/`drmAes128` fields
// are left in the schema but are still unreachable — a deliberate, flagged
// gap, not a silent removal; true adaptive-bitrate HLS/DASH streaming and
// DRM remain a further follow-up, not something the embed feature
// (2026-08-20) repurposes these fixed-rendition fields for.
export async function processVideo(job: Job<VideoProcessingJob>): Promise<void> {
	const { assetId, projectId, requestedVariant } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	const workDir = await mkdtemp(join(tmpdir(), "ossplay-video-"));
	try {
		const inputPath = join(workDir, "input");
		await writeFile(inputPath, bytes);

		if (requestedVariant) {
			if (requestedVariant.spec.kind === "hls-package") {
				await packageHls(inputPath, workDir, requestedVariant.variantAssetId, storage, original);
				return;
			}
			if (requestedVariant.spec.kind === "scrub-thumbnails") {
				await packageScrubThumbnails(inputPath, workDir, requestedVariant.variantAssetId, storage);
				return;
			}
			if (requestedVariant.spec.kind !== "video-transcode") {
				throw new Error(`Unexpected variant kind for video asset: ${requestedVariant.spec.kind}`);
			}
			const { height, format } = requestedVariant.spec;
			const scaleFilter = `scale=-2:min(${height}\\,ih)`;
			const outputPath = join(workDir, `output.${format}`);
			await run(
				"ffmpeg",
				format === "webm"
					? [
							"-y",
							"-i",
							inputPath,
							"-vf",
							scaleFilter,
							"-c:v",
							"libvpx-vp9",
							"-crf",
							"32",
							"-b:v",
							"0",
							"-c:a",
							"libopus",
							outputPath,
						]
					: [
							"-y",
							"-i",
							inputPath,
							"-vf",
							scaleFilter,
							"-c:v",
							"libx264",
							"-crf",
							"23",
							"-c:a",
							"aac",
							"-movflags",
							"+faststart",
							outputPath,
						],
			);
			const output = await readFile(outputPath);
			await finalizeVariant(requestedVariant.variantAssetId, storage, new Uint8Array(output));
			return;
		}

		const probe = await ffprobeJson(inputPath);
		const videoStream = probe.streams?.find((s) => s.codec_type === "video");
		const durationSeconds = probe.format?.duration
			? Number.parseFloat(probe.format.duration)
			: null;
		// Avoids grabbing a black/title-card frame at 0 — halfway into the
		// clip (capped at 3s for anything short) is a much more
		// representative preview.
		const frameTimestamp = durationSeconds ? Math.min(3, durationSeconds / 2) : 0;

		// ffmpeg outputs a PNG frame, then sharp converts it to webp — not
		// ffmpeg's own webp encoder directly, since ffmpeg only has one when
		// built with libwebp linked in (Homebrew's default ffmpeg formula
		// doesn't), while sharp always bundles its own. Same split PDF
		// thumbnailing already uses (pdftoppm renders, sharp converts).
		const framePath = join(workDir, "frame.png");
		await run("ffmpeg", [
			"-y",
			"-ss",
			String(frameTimestamp),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-vf",
			"scale=512:-1",
			framePath,
		]);
		const frameBytes = await readFile(framePath);
		// The `scale=512:-1` filter above already caps width, but preserves
		// aspect ratio unconditionally — an extreme-aspect-ratio source (e.g.
		// a very tall vertical clip) could still push height past WebP's
		// 16383px-per-side ceiling. Same defensive cap as pdf.ts/audio.ts.
		const thumbWebp = await sharp(frameBytes)
			.resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
			.webp()
			.toBuffer();
		await createVariant({
			projectId,
			folderId: original.folderId,
			parentAssetId: assetId,
			filename: replaceExt(original.filename, "webp", "-thumb"),
			mimeType: "image/webp",
			storage,
			data: thumbWebp,
			metadata: { variant: "thumbnail", frameTimestamp },
		});

		await markAssetStatus(assetId, "ready", {
			width: videoStream?.width ?? null,
			height: videoStream?.height ?? null,
			codec: videoStream?.codec_name ?? null,
			frameRate: parseFrameRate(videoStream?.r_frame_rate),
			durationSeconds,
			bitrate: probe.format?.bit_rate ? Number.parseInt(probe.format.bit_rate, 10) : null,
		});
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

// Encodes an HLS rendition ladder + master playlist and hands every file
// (master + each rung's playlist + segments) to finalizeHlsVariant in one
// batch — see MEMORY.md/the plan doc for why this is generated on-demand
// (first real request through the adaptive player) rather than eagerly.
// Also extracts any text-based subtitle tracks embedded in the source
// container (e.g. an uploaded MKV with muxed subtitle streams) as real
// subtitle assets, same as one added by hand via the dashboard — a
// multi-track source shouldn't need every language re-attached manually
// just because it happened to be muxed in already.
async function packageHls(
	inputPath: string,
	workDir: string,
	variantAssetId: string,
	storage: StorageDriver,
	original: Asset,
): Promise<void> {
	const probe = await ffprobeJson(inputPath);
	const videoStream = probe.streams?.find((s) => s.codec_type === "video");
	const sourceHeight = videoStream?.height ?? 1080;
	const aspect =
		videoStream?.width && videoStream?.height ? videoStream.width / videoStream.height : 16 / 9;

	const ladder: number[] = HLS_RUNGS.filter((h) => h <= sourceHeight);
	if (ladder.length === 0) ladder.push(sourceHeight);

	const audioStreams = (probe.streams ?? []).filter((s) => s.codec_type === "audio");
	// Only worth a separate AUDIO group (and the extra encodes/segments it
	// costs) when there's genuinely a choice to offer — a single audio
	// track stays muxed into each video rendition exactly as before, zero
	// behavior change for the overwhelmingly common case.
	const multiAudio = audioStreams.length > 1;

	const files: { relativePath: string; data: Uint8Array; mimeType: string }[] = [];
	const streamInfLines: string[] = [];
	const audioMediaLines: string[] = [];

	if (multiAudio) {
		const audioResult = await packageAudioTracks(inputPath, workDir, audioStreams);
		files.push(...audioResult.files);
		audioMediaLines.push(...audioResult.mediaLines);
	}

	for (const height of ladder) {
		const rungDir = join(workDir, `${height}p`);
		await mkdir(rungDir, { recursive: true });
		// Forced keyframe interval (-g/-sc_threshold 0) keeps segment
		// boundaries fixed at exactly hls_time regardless of scene cuts —
		// without it, ffmpeg's default GOP placement drifts, which breaks
		// strict HLS clients expecting uniform segment durations. Video-only
		// (-an) when audio ships as its own selectable AUDIO group instead —
		// muxing the default track in too would make it play twice (once
		// from the video rendition, once from the audio group).
		await run("ffmpeg", [
			"-y",
			"-i",
			inputPath,
			"-vf",
			`scale=-2:min(${height}\\,ih)`,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"23",
			"-g",
			"48",
			"-keyint_min",
			"48",
			"-sc_threshold",
			"0",
			...(multiAudio ? ["-an"] : ["-c:a", "aac", "-b:a", "128k"]),
			"-hls_time",
			"6",
			"-hls_playlist_type",
			"vod",
			"-hls_segment_filename",
			join(rungDir, "seg%05d.ts"),
			join(rungDir, "index.m3u8"),
		]);

		const entries = await readdir(rungDir);
		const segmentFiles = entries.filter((f) => f.endsWith(".ts")).sort();
		let rungBytes = 0;
		for (const seg of segmentFiles) {
			const data = await readFile(join(rungDir, seg));
			rungBytes += data.byteLength;
			files.push({ relativePath: `${height}p/${seg}`, data: new Uint8Array(data), mimeType: "video/mp2t" });
		}
		const playlistText = await readFile(join(rungDir, "index.m3u8"), "utf8");
		files.push({
			relativePath: `${height}p/index.m3u8`,
			data: new TextEncoder().encode(playlistText),
			mimeType: "application/vnd.apple.mpegurl",
		});

		const durationSeconds = probe.format?.duration ? Number.parseFloat(probe.format.duration) : null;
		// A real measured bitrate from the actual encoded output, not a
		// guessed constant — falls back only if duration couldn't be probed.
		const bandwidth =
			durationSeconds && durationSeconds > 0 ? Math.round((rungBytes * 8) / durationSeconds) : 2_000_000;
		const width = Math.round((aspect * height) / 2) * 2;
		streamInfLines.push(
			`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height}${multiAudio ? ',AUDIO="audio"' : ""}\n${height}p/index.m3u8`,
		);
	}

	// ffmpeg only produces each rung's own playlist — the master referencing
	// all of them is assembled here since the rungs were encoded as separate
	// invocations, not one multi-output ffmpeg call. Per the HLS spec, an
	// EXT-X-MEDIA group must be declared before any EXT-X-STREAM-INF line
	// that references it via the AUDIO attribute.
	const masterText = `#EXTM3U\n#EXT-X-VERSION:3\n${audioMediaLines.length ? `${audioMediaLines.join("\n")}\n` : ""}${streamInfLines.join("\n")}\n`;
	files.push({
		relativePath: "master.m3u8",
		data: new TextEncoder().encode(masterText),
		mimeType: "application/vnd.apple.mpegurl",
	});

	await finalizeHlsVariant(variantAssetId, storage, files);

	await extractEmbeddedSubtitles(inputPath, workDir, probe.streams ?? [], original, storage);
}

// Encodes every audio stream as its own selectable HLS audio-only
// rendition (AAC, segmented the same way a video rung is) and builds the
// EXT-X-MEDIA:TYPE=AUDIO lines the master playlist references by group —
// only called when there's more than one audio track (see multiAudio
// above); a single-track source stays muxed into the video renditions,
// no separate audio group at all.
async function packageAudioTracks(
	inputPath: string,
	workDir: string,
	audioStreams: FfprobeStream[],
): Promise<{
	files: { relativePath: string; data: Uint8Array; mimeType: string }[];
	mediaLines: string[];
}> {
	const files: { relativePath: string; data: Uint8Array; mimeType: string }[] = [];
	const mediaLines: string[] = [];

	let trackNumber = 0;
	for (const stream of audioStreams) {
		trackNumber += 1;
		const tag = stream.tags?.language;
		const mapped = tag ? ISO_639_2_TO_1[tag.toLowerCase()] : undefined;
		const language = mapped?.code ?? tag ?? `track${trackNumber}`;
		const label = mapped?.label ?? stream.tags?.title ?? tag ?? `Track ${trackNumber}`;

		const audioDir = join(workDir, "audio", language);
		await mkdir(audioDir, { recursive: true });
		await run("ffmpeg", [
			"-y",
			"-i",
			inputPath,
			"-map",
			`0:${stream.index}`,
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-hls_time",
			"6",
			"-hls_playlist_type",
			"vod",
			"-hls_segment_filename",
			join(audioDir, "seg%05d.ts"),
			join(audioDir, "index.m3u8"),
		]);

		const entries = await readdir(audioDir);
		for (const seg of entries.filter((f) => f.endsWith(".ts")).sort()) {
			const data = await readFile(join(audioDir, seg));
			files.push({
				relativePath: `audio/${language}/${seg}`,
				data: new Uint8Array(data),
				mimeType: "video/mp2t",
			});
		}
		const playlistText = await readFile(join(audioDir, "index.m3u8"), "utf8");
		files.push({
			relativePath: `audio/${language}/index.m3u8`,
			data: new TextEncoder().encode(playlistText),
			mimeType: "application/vnd.apple.mpegurl",
		});

		mediaLines.push(
			`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${label}",LANGUAGE="${language}",AUTOSELECT=YES,DEFAULT=${trackNumber === 1 ? "YES" : "NO"},URI="audio/${language}/index.m3u8"`,
		);
	}

	return { files, mediaLines };
}

// Pulls every convertible embedded subtitle stream out of the source
// container and stores each as its own subtitle asset — best-effort: one
// stream failing to extract (an unusual codec variant, a malformed track)
// shouldn't fail the HLS packaging job that already succeeded above, so
// every failure is caught and skipped rather than propagated.
async function extractEmbeddedSubtitles(
	inputPath: string,
	workDir: string,
	streams: FfprobeStream[],
	original: Asset,
	storage: StorageDriver,
): Promise<void> {
	const subtitleStreams = streams.filter(
		(s) =>
			s.codec_type === "subtitle" &&
			s.codec_name &&
			CONVERTIBLE_SUBTITLE_CODECS.has(s.codec_name) &&
			s.index !== undefined,
	);
	if (subtitleStreams.length === 0) return;

	const existingLanguages = new Set(
		(await getDb().select().from(assets).where(eq(assets.parentAssetId, original.id)))
			.filter((a) => a.metadata?.variant === "subtitle")
			.map((a) => a.metadata?.language)
			.filter((l): l is string => typeof l === "string"),
	);

	let trackNumber = 0;
	for (const stream of subtitleStreams) {
		trackNumber += 1;
		const tag = stream.tags?.language;
		const mapped = tag ? ISO_639_2_TO_1[tag.toLowerCase()] : undefined;
		const language = mapped?.code ?? tag ?? `track${trackNumber}`;
		if (existingLanguages.has(language)) continue;
		const label = mapped?.label ?? stream.tags?.title ?? tag ?? `Track ${trackNumber}`;

		try {
			const outputPath = join(workDir, `sub-${stream.index}.vtt`);
			await run("ffmpeg", ["-y", "-i", inputPath, "-map", `0:${stream.index}`, "-c:s", "webvtt", outputPath]);
			const vtt = await readFile(outputPath, "utf8");
			await createVariant({
				projectId: original.projectId,
				folderId: original.folderId,
				parentAssetId: original.id,
				filename: replaceExt(original.filename, "vtt", `-${language}`),
				mimeType: "text/vtt",
				storage,
				data: new TextEncoder().encode(vtt),
				metadata: { variant: "subtitle", language, label },
			});
			existingLanguages.add(language);
		} catch {
			// Unsupported codec variant or malformed track — skip it, the
			// video itself (and any other extractable track) still succeeds.
		}
	}
}

// Builds one sprite image (a grid of small frames sampled at a fixed
// interval) for the embed player's seek-bar hover preview. Grid layout is
// derived from the source's own duration, aiming for ~SCRUB_TARGET_COUNT
// tiles without going below/above a sane per-tile interval.
async function packageScrubThumbnails(
	inputPath: string,
	workDir: string,
	variantAssetId: string,
	storage: StorageDriver,
): Promise<void> {
	const probe = await ffprobeJson(inputPath);
	const duration = probe.format?.duration ? Number.parseFloat(probe.format.duration) : 0;
	if (!duration || duration <= 0) {
		throw new Error("Could not determine video duration for scrub thumbnails");
	}

	const interval = Math.min(
		SCRUB_MAX_INTERVAL,
		Math.max(SCRUB_MIN_INTERVAL, duration / SCRUB_TARGET_COUNT),
	);
	const count = Math.max(1, Math.floor(duration / interval));
	const columns = Math.ceil(Math.sqrt(count));
	const rows = Math.ceil(count / columns);

	const outputPath = join(workDir, "scrub.jpg");
	await run("ffmpeg", [
		"-y",
		"-i",
		inputPath,
		"-vf",
		`fps=1/${interval},scale=${SCRUB_TILE_WIDTH}:${SCRUB_TILE_HEIGHT},tile=${columns}x${rows}`,
		"-frames:v",
		"1",
		"-q:v",
		"4",
		outputPath,
	]);

	const bytes = await readFile(outputPath);
	await finalizeVariant(variantAssetId, storage, new Uint8Array(bytes));
	await markAssetStatus(variantAssetId, "ready", {
		interval,
		columns,
		rows,
		tileWidth: SCRUB_TILE_WIDTH,
		tileHeight: SCRUB_TILE_HEIGHT,
		count,
	});
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	const base = filename.replace(/\.[^.]+$/, "");
	return `${base}${suffix}.${ext}`;
}
