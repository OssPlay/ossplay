import {
	buildAssetKey,
	findCachedVariant,
	getProjectWithDestination,
	type ImageFormat,
	LocalDiskStorage,
	mimeToExtension,
	permanentlyDeleteSubtree,
	type ProjectWithDestination,
	queueForMimeType,
	resolveStorageDriver,
	shouldServeStatic,
	transformImage,
	tryDispatchToComputeDestination,
} from "@ossplay/core";
import { type Asset, assetShareLinks, assets, folders, getDb } from "@ossplay/db";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { hashToken } from "../lib/auth/tokens";
import { getPublicUrl } from "../lib/auth/request-info";
import { serveLocalDiskAsset } from "../lib/http/serve-asset";
import { getQueue, getRedisConnection, PROCESSING_JOB_OPTS } from "../lib/queue";
import { mintAssetShareLink } from "../lib/share-links";
import {
	listVariants,
	requestVariant,
	triggerEagerVideoVariants,
	variantSpecSchema,
} from "../lib/variants";
import { requireApiKey, verifyProjectApiKey } from "../middleware/require-api-key";
import type { AppEnv } from "../types";

// The public, API-key-authenticated consumer API — see plans/proud-soaring-
// metcalfe.md. Mounted at /v1 (root-level, matching every other route
// group's convention), reachable externally at /api/v1/... through
// infra/caddy/Caddyfile's existing strip-prefix rule. Deliberately separate
// from routes/assets.ts (the session-authed dashboard API): different auth
// (project API key, not a cookie+org-membership check), different route
// shape (project id/slug in the path, not orgId), and a different
// visibility policy (a public project needs no key to read).
export const v1Route = new Hono<AppEnv>();

// A dashboard-issued "Copy link"/embed grant for one asset (see
// packages/db/src/share-link.schema.ts) — checked as a second fallback
// alongside a full project API key, so a share link reuses this route's
// entire existing serving logic (local-disk streaming, S3 redirect,
// disposition, transforms) instead of a parallel code path. Matches the
// token against *either* the requested asset's own id or its parent's —
// a share link is always minted for an original (see assets.ts's POST
// .../share-links and v1.ts's POST .../embed-token), so without the parent
// fallback, fetching one of that original's own variants/thumbnails/
// subtitles directly (their `:item` id differs from the original's) would
// 401 even with a valid token for the original itself.
async function verifyAssetShareToken(
	c: Context<AppEnv>,
	assetId: string,
	parentAssetId?: string | null,
): Promise<boolean> {
	const presented = c.req.query("share");
	if (!presented) return false;
	const hash = await hashToken(presented);
	const candidateIds = parentAssetId ? [assetId, parentAssetId] : [assetId];
	const [link] = await getDb()
		.select({ id: assetShareLinks.id })
		.from(assetShareLinks)
		.where(
			and(
				eq(assetShareLinks.id, hash),
				inArray(assetShareLinks.assetId, candidateIds),
				gt(assetShareLinks.expiresAt, new Date()),
			),
		);
	return Boolean(link);
}

// A public project's reads are open, like a CDN — no secret key required in
// an <img src>. Private projects and every mutation always require a key,
// except a single-asset read carrying a valid share token (see above).
// Returns true if the request may proceed.
async function authorizeRead(
	c: Context<AppEnv>,
	projectId: string,
	visibility: "public" | "private",
	assetId?: string,
	parentAssetId?: string | null,
): Promise<boolean> {
	if (visibility === "public") return true;
	if (assetId && (await verifyAssetShareToken(c, assetId, parentAssetId))) return true;
	return verifyProjectApiKey(c, projectId);
}

// Serves an already-stored asset's bytes — used both for a plain original-
// file download and for an already-promoted (durable) transform variant,
// since both are just `assets` rows with an s3Path/mimeType/filename.
async function respondWithAsset(
	c: Context<AppEnv>,
	project: ProjectWithDestination,
	asset: Pick<Asset, "s3Path" | "mimeType" | "filename">,
	disposition: "inline" | "attachment",
): Promise<Response> {
	const storage = resolveStorageDriver(project);
	if (storage instanceof LocalDiskStorage) {
		return serveLocalDiskAsset(storage, {
			key: asset.s3Path,
			mimeType: asset.mimeType,
			filename: asset.filename,
			disposition,
			rangeHeader: c.req.header("range") ?? null,
		});
	}
	const url = storage.createDownloadUrl(asset.s3Path, {
		disposition,
		static: shouldServeStatic(project, asset.mimeType),
	});
	return c.redirect(url, 302);
}

v1Route.get("/:project", async (c) => {
	const projectId = c.req.param("project");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const folderId = c.req.query("folder") ?? null;
	const db = getDb();
	const [childFolders, childAssets] = await Promise.all([
		db
			.select({ id: folders.id, name: folders.name })
			.from(folders)
			.where(
				and(
					eq(folders.projectId, projectId),
					folderId ? eq(folders.parentId, folderId) : isNull(folders.parentId),
					isNull(folders.deletedAt),
				),
			),
		db
			.select({
				id: assets.id,
				filename: assets.filename,
				mimeType: assets.mimeType,
				size: assets.size,
				status: assets.status,
				createdAt: assets.createdAt,
			})
			.from(assets)
			.where(
				and(
					eq(assets.projectId, projectId),
					folderId ? eq(assets.folderId, folderId) : isNull(assets.folderId),
					isNull(assets.deletedAt),
					isNull(assets.parentAssetId),
				),
			),
	]);

	return c.json({ folders: childFolders, assets: childAssets });
});

// Direct multipart upload — reads the file into memory and writes it
// straight to storage, unlike the dashboard's presigned-URL two-step flow
// (create pending row -> browser PUTs to S3 directly -> confirm). That flow
// exists to keep large browser uploads off the API process; a CLI/server
// SDK caller doesn't have that constraint, so one request is simpler for
// this API's actual callers.
v1Route.post("/:project/upload", requireApiKey, async (c) => {
	const projectId = c.req.param("project");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const body = await c.req.parseBody({ all: true }).catch(() => null);
	if (!body) return c.json({ error: "Invalid multipart body" }, 400);
	const files = Object.values(body).filter((v): v is File => v instanceof File);
	if (files.length === 0) return c.json({ error: "No files provided" }, 400);

	const storage = resolveStorageDriver(project);
	const db = getDb();
	const created: { assetId: string; filename: string; mimeType: string; size: number }[] = [];

	for (const file of files) {
		const mimeType = file.type || "application/octet-stream";
		const assetId = crypto.randomUUID();
		const key = buildAssetKey(projectId, assetId, file.name);
		const bytes = new Uint8Array(await file.arrayBuffer());
		await storage.uploadObject(key, bytes, { mimeType });

		const queueName = queueForMimeType(mimeType);
		const [inserted] = await db
			.insert(assets)
			.values({
				id: assetId,
				projectId,
				folderId: null,
				filename: file.name,
				mimeType,
				s3Path: key,
				size: bytes.byteLength,
				status: queueName ? "processing" : "ready",
			})
			.returning();
		if (queueName) {
			const jobData = { assetId, projectId, s3Path: key, mimeType };
			const dispatched = await tryDispatchToComputeDestination(queueName, "process", jobData);
			if (!dispatched) await getQueue(queueName).add("process", jobData, PROCESSING_JOB_OPTS);
			if (inserted) await triggerEagerVideoVariants(project, inserted);
		}
		created.push({ assetId, filename: file.name, mimeType, size: bytes.byteLength });
	}

	return c.json({ assets: created }, 201);
});

// `:item` is "<assetId>.<ext>" — the extension is cosmetic (for a
// browser's save-as filename), asset identity is the id alone. The literal
// characters after the last "." are never validated against the asset's
// real mimeType; they're just stripped off to recover the id.
function parseItemParam(item: string): string {
	const dot = item.lastIndexOf(".");
	return dot > 0 ? item.slice(0, dot) : item;
}

const ALLOWED_FORMATS = ["webp", "avif", "jpeg", "png", "original"] as const;
// Same ceiling the existing fixed-enum variant system uses (its
// `maxDimension` enum tops out at 4096) — one dimension limit either way.
const MAX_TRANSFORM_DIMENSION = 4096;
const MAX_QUALITY = 100;

interface ParsedTransform {
	format: ImageFormat;
	width: number | null;
	height: number | null;
	quality: number | null;
}

function isImageFormat(value: string): value is ImageFormat {
	return (ALLOWED_FORMATS as readonly string[]).includes(value);
}

function parseDimension(
	raw: string | undefined,
	name: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
	if (!raw) return { ok: true, value: null };
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value <= 0 || value > MAX_TRANSFORM_DIMENSION) {
		return { ok: false, error: `${name} must be a positive integer up to ${MAX_TRANSFORM_DIMENSION}` };
	}
	return { ok: true, value };
}

// null = no transform params present at all (plain download). Never
// silently clamps an out-of-range value — a caller should know their
// request was rejected, not get back something they didn't ask for.
function parseTransformParams(c: Context): { params: ParsedTransform } | { error: string } | null {
	const wRaw = c.req.query("w");
	const hRaw = c.req.query("h");
	const formatRaw = c.req.query("format");
	const qRaw = c.req.query("q");
	if (!wRaw && !hRaw && !formatRaw && !qRaw) return null;

	const formatCandidate = formatRaw ?? "original";
	if (!isImageFormat(formatCandidate)) {
		return { error: `format must be one of: ${ALLOWED_FORMATS.join(", ")}` };
	}

	const width = parseDimension(wRaw, "w");
	if (!width.ok) return { error: width.error };
	const height = parseDimension(hRaw, "h");
	if (!height.ok) return { error: height.error };

	let quality: number | null = null;
	if (qRaw) {
		quality = Number.parseInt(qRaw, 10);
		if (!Number.isFinite(quality) || quality < 1 || quality > MAX_QUALITY) {
			return { error: `q must be an integer between 1 and ${MAX_QUALITY}` };
		}
	}

	return { params: { format: formatCandidate, width: width.value, height: height.value, quality } };
}

// A rarely-requested (asset, params) combination is computed and served but
// not permanently stored; once it's been requested enough times within the
// window to look like real traffic (not a one-off or an abuse probe), it's
// promoted to a durable variant so it's never recomputed again. The counter
// lives in Redis (already in the stack for BullMQ) — no new infra.
const PROMOTION_THRESHOLD = 3;
const HIT_COUNTER_TTL_SECONDS = 60 * 60;
// Caps concurrent in-process Sharp calls so a burst of distinct (not-yet-
// promoted) transform requests can't starve the event loop or exhaust
// memory on a small self-hosted instance — rejects with 503 past the cap
// rather than let every request degrade together.
const MAX_CONCURRENT_TRANSFORMS = 4;
let activeTransforms = 0;

function computeTransformSpecKey(params: ParsedTransform): string {
	return `otf-${params.format}-${params.width ?? "auto"}x${params.height ?? "auto"}-q${params.quality ?? "default"}`;
}

function hitCounterKey(assetId: string, specKey: string): string {
	return `otf-hits:${assetId}:${specKey}`;
}

async function serveTransformed(
	c: Context<AppEnv>,
	project: ProjectWithDestination,
	asset: Asset,
	params: ParsedTransform,
	disposition: "inline" | "attachment",
): Promise<Response> {
	const specKey = computeTransformSpecKey(params);
	const db = getDb();

	// findCachedVariant (packages/core/src/variants.ts) is the same lookup
	// the existing async fixed-enum variant system uses — just keyed by this
	// route's own specKey format instead of jobs.ts's VariantSpec union,
	// which has no arbitrary-width/height shape to reuse here.
	const cached = await findCachedVariant(db, asset.id, specKey);
	if (cached && cached.status === "ready") {
		return respondWithAsset(c, project, cached, disposition);
	}

	if (activeTransforms >= MAX_CONCURRENT_TRANSFORMS) {
		return c.json({ error: "Too many concurrent transforms — try again shortly" }, 503);
	}

	const storage = resolveStorageDriver(project);
	const originalBytes = await storage.downloadObject(asset.s3Path);

	let transformed: Buffer;
	activeTransforms++;
	try {
		transformed = await transformImage(originalBytes, params);
	} finally {
		activeTransforms--;
	}

	const outputMimeType = params.format === "original" ? asset.mimeType : `image/${params.format}`;
	const outputExt = params.format === "original" ? mimeToExtension(asset.mimeType) : params.format;
	const outputFilename = `${asset.filename.replace(/\.[^.]+$/, "")}.${outputExt}`;

	const redis = getRedisConnection();
	const counterKey = hitCounterKey(asset.id, specKey);
	const hits = await redis.incr(counterKey);
	if (hits === 1) await redis.expire(counterKey, HIT_COUNTER_TTL_SECONDS);

	if (hits >= PROMOTION_THRESHOLD) {
		const variantId = crypto.randomUUID();
		const variantKey = buildAssetKey(project.id, variantId, outputFilename);
		await storage.uploadObject(variantKey, transformed, { mimeType: outputMimeType });
		await db.insert(assets).values({
			id: variantId,
			projectId: project.id,
			folderId: asset.folderId,
			filename: outputFilename,
			mimeType: outputMimeType,
			s3Path: variantKey,
			size: transformed.byteLength,
			parentAssetId: asset.id,
			status: "ready",
			metadata: { variant: "on-demand", specKey },
		});
	}

	return new Response(transformed, {
		headers: {
			"content-type": outputMimeType,
			"content-disposition": `${disposition}; filename="${encodeURIComponent(outputFilename)}"`,
		},
	});
}

v1Route.get("/:project/:item", async (c) => {
	const projectId = c.req.param("project");
	const assetId = parseItemParam(c.req.param("item"));

	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const [asset] = await getDb()
		.select()
		.from(assets)
		.where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
	if (!asset || asset.deletedAt) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId, asset.parentAssetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const disposition = c.req.query("disposition") === "attachment" ? "attachment" : "inline";

	const transformResult = parseTransformParams(c);
	if (transformResult && "error" in transformResult) {
		return c.json({ error: transformResult.error }, 400);
	}
	// A transform request against a non-image asset just falls through to
	// serving the original below rather than 400ing — permissive, since
	// "these params don't apply here" isn't malformed input the way an
	// invalid format/dimension value is (checked above regardless of type).
	if (transformResult && asset.mimeType.startsWith("image/")) {
		return serveTransformed(c, project, asset, transformResult.params, disposition);
	}

	return respondWithAsset(c, project, asset, disposition);
});

v1Route.delete("/:project/:assetId", requireApiKey, async (c) => {
	const { project: projectId, assetId } = c.req.param();
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const [asset] = await getDb()
		.select()
		.from(assets)
		.where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
	if (!asset || asset.deletedAt) return c.json({ error: "Asset not found" }, 404);

	// Straight to permanent delete (same helper the dashboard's trash-empty/
	// delete-forever flows use, which also cleans up any derived variants'
	// storage objects) — the recycle-bin/trash flow is a dashboard UX
	// concern (undo affordance), not something a programmatic API caller
	// that already asked to delete needs a second stage for.
	await permanentlyDeleteSubtree(getDb(), project, { kind: "asset", id: assetId });
	return c.body(null, 204);
});

async function requireV1Asset(projectId: string, assetId: string): Promise<Asset | null> {
	const [asset] = await getDb()
		.select()
		.from(assets)
		.where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
	return asset && !asset.deletedAt ? asset : null;
}

// Same on-demand conversion flow assets.ts's session-authed POST
// .../variants uses (requestVariant, lib/variants.ts) — exposed here too so
// an SDK caller (project API key, no dashboard session) and the embed
// player (a share token, no session either) can both request a specific
// rendition, not just a logged-in dashboard user.
v1Route.post("/:project/:assetId/variants", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const original = await requireV1Asset(projectId, assetId);
	if (!original) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const parsed = z
		.object({ spec: variantSpecSchema })
		.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const result = await requestVariant(project, original, parsed.data.spec);
	if (!result.ok) return c.json({ error: result.error }, result.status);
	return c.json(
		{ asset: result.asset },
		result.created ? 202 : result.asset.status === "ready" ? 200 : 202,
	);
});

v1Route.get("/:project/:assetId/variants", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireV1Asset(projectId, assetId);
	if (!asset) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	return c.json({ variants: await listVariants(assetId) });
});

const embedTokenSchema = z.object({ duration: z.enum(["1h", "1d", "7d", "30d"]).default("30d") });

// Returns the ready-to-use embed player URL (apps/dashboard's /embed/:id) —
// a public project's video needs no token at all, same as every other
// public-project read; a private one requires proving project-level access
// (a real API key, never a share token — minting a fresh long-lived grant
// from an existing short-lived one would let a temporary read grant
// escalate into an indefinite one) before minting the share link
// (mintAssetShareLink, lib/share-links.ts — the same grant the dashboard's
// "Copy link"/Embed dialog use) that makes the private embed URL work.
v1Route.post("/:project/:assetId/embed-token", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireV1Asset(projectId, assetId);
	if (!asset) return c.json({ error: "Asset not found" }, 404);

	const embedUrl = `${getPublicUrl(c)}/embed/${projectId}/${assetId}`;
	if (project.visibility === "public") {
		return c.json({ url: embedUrl });
	}

	if (!(await verifyProjectApiKey(c, projectId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}
	const parsed = embedTokenSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
	const { secret } = await mintAssetShareLink(assetId, parsed.data.duration, null);
	return c.json({ url: `${embedUrl}?share=${secret}` });
});

// --- On-demand HLS manifest + segment serving -----------------------------
// Keyed by the ORIGINAL video's assetId everywhere below (never the internal
// hls-package asset's own id) so a caller only ever needs the one id it
// already has from GET .../variants, same as every other route in this file.

const HLS_MIME = "application/vnd.apple.mpegurl";

function shareQuery(c: Context<AppEnv>): string {
	const share = c.req.query("share");
	return share ? `share=${share}` : "";
}

// A relative-URI HLS playlist, fetched with ?share=xyz, does NOT propagate
// that query string to its own relative sub-requests — a browser/hls.js
// resolving a relative URI against a base URL drops the base's query,
// keeping only the path. Without this, a private video's rung-playlist and
// segment requests would silently lose the share token and 401.
function appendQueryToUris(text: string, query: string): string {
	if (!query) return text;
	return text
		.split("\n")
		.map((line) => (line && !line.startsWith("#") ? `${line}?${query}` : line))
		.join("\n");
}

// The AUDIO group's EXT-X-MEDIA lines are baked into the stored master
// playlist at packaging time (unlike the subtitle group, injected fresh
// per request below, whose URI already carries the query at construction)
// — their inline URI="..." attribute still needs the caller's token
// appended at serve time, same reasoning as appendQueryToUris above, just
// for a query embedded inside a line instead of the whole next line. The
// `[^"?]` exclusion makes this safe to run unconditionally after subtitle
// injection without double-appending a query that's already there.
function appendQueryToInlineUris(text: string, query: string): string {
	if (!query) return text;
	return text.replace(/URI="([^"?]+)"/g, `URI="$1?${query}"`);
}

// Injects EXT-X-MEDIA subtitle groups + a SUBTITLES attribute on every
// EXT-X-STREAM-INF line at serve time, not baked into the stored master
// playlist — subtitles can be attached after the HLS package already
// exists, and this keeps them showing up without repackaging video.
function injectSubtitleGroup(masterText: string, subtitles: Asset[], query: string): string {
	if (subtitles.length === 0) return masterText;
	const mediaLines = subtitles.map((sub) => {
		const label = typeof sub.metadata?.label === "string" ? sub.metadata.label : "Subtitles";
		const language = typeof sub.metadata?.language === "string" ? sub.metadata.language : "en";
		const uri = `subs/${sub.id}.m3u8${query ? `?${query}` : ""}`;
		return `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${label}",LANGUAGE="${language}",URI="${uri}",AUTOSELECT=YES`;
	});
	const withGroups = masterText.replace(
		"#EXT-X-VERSION:3\n",
		`#EXT-X-VERSION:3\n${mediaLines.join("\n")}\n`,
	);
	return withGroups.replace(/^#EXT-X-STREAM-INF:(.*)$/gm, `#EXT-X-STREAM-INF:$1,SUBTITLES="subs"`);
}

async function resolveHlsPackage(
	projectId: string,
	assetId: string,
): Promise<{ original: Asset; pkg: Asset } | null> {
	const original = await requireV1Asset(projectId, assetId);
	if (!original) return null;
	const variants = await listVariants(assetId);
	const pkg = variants.find((v) => v.metadata?.specKey === "hls" && v.status === "ready");
	return pkg ? { original, pkg } : null;
}

// Mirrors respondWithAsset's local-disk-stream vs S3-redirect-to-presigned-
// URL split exactly, just against a constructed key instead of an asset
// row's own s3Path (an HLS segment has no `assets` row of its own).
async function respondWithHlsFile(
	c: Context<AppEnv>,
	project: ProjectWithDestination,
	key: string,
	mimeType: string,
): Promise<Response> {
	const storage = resolveStorageDriver(project);
	if (storage instanceof LocalDiskStorage) {
		const stream = await storage.readObject(key);
		if (!stream) return c.json({ error: "File not found in storage" }, 404);
		return new Response(stream, { headers: { "content-type": mimeType } });
	}
	const url = storage.createDownloadUrl(key, { static: shouldServeStatic(project, mimeType) });
	return c.redirect(url, 302);
}

v1Route.get("/:project/:assetId/hls/master.m3u8", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const resolved = await resolveHlsPackage(projectId, assetId);
	if (!resolved) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(`${resolved.pkg.s3Path}/master.m3u8`);
	const text = new TextDecoder().decode(bytes);
	const query = shareQuery(c);
	const subtitles = (await listVariants(assetId)).filter(
		(v) => v.metadata?.variant === "subtitle" && v.status === "ready",
	);
	const withSubtitles = injectSubtitleGroup(text, subtitles, query);
	const rewritten = appendQueryToInlineUris(appendQueryToUris(withSubtitles, query), query);
	return new Response(rewritten, { headers: { "content-type": HLS_MIME } });
});

// Per the HLS spec, an EXT-X-MEDIA subtitle URI must point at a
// sub-playlist wrapping the WebVTT file as a single "segment," not the raw
// .vtt directly — generated on the fly here, its one EXTINF line reusing
// the existing, unmodified asset content route (no new subtitle-serving
// code needed).
v1Route.get("/:project/:assetId/hls/subs/:subtitleAssetId", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const subtitleAssetId = parseItemParam(c.req.param("subtitleAssetId"));
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const original = await requireV1Asset(projectId, assetId);
	if (!original) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const query = shareQuery(c);
	const durationSeconds =
		typeof original.metadata?.durationSeconds === "number" ? original.metadata.durationSeconds : 36000;
	const vttUrl = `/api/v1/${projectId}/${subtitleAssetId}${query ? `?${query}` : ""}`;
	const playlist = [
		"#EXTM3U",
		"#EXT-X-VERSION:3",
		`#EXT-X-TARGETDURATION:${Math.ceil(durationSeconds)}`,
		"#EXT-X-MEDIA-SEQUENCE:0",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXTINF:${durationSeconds},`,
		vttUrl,
		"#EXT-X-ENDLIST",
		"",
	].join("\n");
	return new Response(playlist, { headers: { "content-type": HLS_MIME } });
});

v1Route.get("/:project/:assetId/hls/audio/:lang/index.m3u8", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const lang = c.req.param("lang");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const resolved = await resolveHlsPackage(projectId, assetId);
	if (!resolved) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(`${resolved.pkg.s3Path}/audio/${lang}/index.m3u8`);
	const rewritten = appendQueryToUris(new TextDecoder().decode(bytes), shareQuery(c));
	return new Response(rewritten, { headers: { "content-type": HLS_MIME } });
});

v1Route.get("/:project/:assetId/hls/audio/:lang/:segment", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const lang = c.req.param("lang");
	const segment = c.req.param("segment");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const resolved = await resolveHlsPackage(projectId, assetId);
	if (!resolved) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	return respondWithHlsFile(c, project, `${resolved.pkg.s3Path}/audio/${lang}/${segment}`, "video/mp2t");
});

v1Route.get("/:project/:assetId/hls/:rung/index.m3u8", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const rung = c.req.param("rung");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const resolved = await resolveHlsPackage(projectId, assetId);
	if (!resolved) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(`${resolved.pkg.s3Path}/${rung}/index.m3u8`);
	const rewritten = appendQueryToUris(new TextDecoder().decode(bytes), shareQuery(c));
	return new Response(rewritten, { headers: { "content-type": HLS_MIME } });
});

v1Route.get("/:project/:assetId/hls/:rung/:segment", async (c) => {
	const projectId = c.req.param("project");
	const assetId = c.req.param("assetId");
	const rung = c.req.param("rung");
	const segment = c.req.param("segment");
	const project = await getProjectWithDestination(projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const resolved = await resolveHlsPackage(projectId, assetId);
	if (!resolved) return c.json({ error: "Asset not found" }, 404);
	if (!(await authorizeRead(c, projectId, project.visibility, assetId))) {
		return c.json({ error: "Missing or invalid API key" }, 401);
	}

	return respondWithHlsFile(c, project, `${resolved.pkg.s3Path}/${rung}/${segment}`, "video/mp2t");
});
