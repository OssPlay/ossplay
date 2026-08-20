"use client";

import "@ossplay/player/styles.css";
import { type ScrubThumbnails, VideoPlayer, type VideoPlayerTrack } from "@ossplay/player";
import {
	ArrowLeftIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	ExternalLinkIcon,
	InfoIcon,
	LinkIcon,
	PlayIcon,
	XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button, buttonVariants } from "@/components/ui/button";
import { usePolledAsset } from "@/hooks/use-polled-asset";
import { apiFetch } from "@/lib/api";
import { copyPublicAssetLink } from "@/lib/copy-link";
import { useProjectContext } from "@/lib/current-project";
import { cn } from "@/lib/utils";
import type { DriveAsset, DriveBrowseResponse } from "@/types/drive";
import { iconForMimeType } from "./asset-context-menu";
import { AssetDetailsPanel } from "./asset-details-panel";
import { CopyLinkDialog } from "./copy-link-dialog";

// Every browser plays these natively; nothing else is safe to hand to a
// plain <video> — an uploaded .avi/.wmv/.mkv/.mov has no browser decoder at
// all (or an unreliable one), so a preview of one of those requests an
// on-demand mp4 rendition (the same video-transcode spec "Download as…"
// already uses) instead of rendering a player against a source that won't
// actually decode.
const NATIVELY_PLAYABLE_VIDEO_MIMETYPES = new Set(["video/mp4", "video/webm", "video/ogg"]);

// The one preview surface for an asset, shared by the intercepted modal
// route and the full-page route (see app/(app)/project/[projectId]/open/) —
// so client-side navigation and a hard refresh of the same URL render
// identically, just wrapped differently by their respective page.tsx.
export function AssetPreview({
	projectId,
	assetId,
	onClose,
	fullPage,
}: {
	projectId: string;
	assetId: string;
	onClose: () => void;
	/**
	 * The full-page route has no overlay to dismiss (so the header's X is
	 * redundant — Escape/back still works via onClose) and no adjacent
	 * "previous overlay state" to cycle through, so its header trades the
	 * modal's prev/next sibling chevrons for one plain back arrow that
	 * returns to Drive via onClose instead.
	 */
	fullPage?: boolean;
}) {
	const router = useRouter();
	const { effectiveOrgId, project } = useProjectContext(projectId);
	const orgId = effectiveOrgId ?? "";
	const base = `/organizations/${orgId}/projects/${projectId}`;

	const { data } = usePolledAsset(orgId || null, projectId, assetId);
	const asset = data?.asset;

	const [detailsOpen, setDetailsOpen] = useState(false);
	const [copyLinkOpen, setCopyLinkOpen] = useState(false);
	const [playing, setPlaying] = useState(false);

	// A lightweight sibling list for arrow-key prev/next — re-fetches the
	// containing folder's listing rather than threading DriveView's
	// in-memory state across the modal-slot boundary (the intercepted route
	// and the Drive page are separate route trees under the same layout;
	// see the plan's note on this being deliberately self-contained).
	const { data: siblingData } = useSWR<DriveBrowseResponse>(
		orgId && asset ? `${base}/drive${asset.folderId ? `?folderId=${asset.folderId}` : ""}` : null,
	);
	const siblingIds = siblingData?.childAssets.items.map((a) => a.id) ?? [];
	const currentIndex = siblingIds.indexOf(assetId);
	const prevId = currentIndex > 0 ? siblingIds[currentIndex - 1] : null;
	const nextId =
		currentIndex >= 0 && currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : null;

	// Same SWR key the Variants tab and the Add/manage-subtitles dialog
	// already use for this asset — sharing it means attaching a subtitle
	// from either of those makes it show up here too, no extra plumbing.
	// Hooks can't follow the `if (!asset) return` early-return below (Rules
	// of Hooks — every hook must run in the same order every render), so
	// this and its derived `subtitleTracks` live up here instead, guarding
	// on `asset` explicitly rather than relying on the early return.
	const isVideo = asset?.mimeType.startsWith("video/") ?? false;
	const { data: variantsData, mutate: mutateVariants } = useSWR<{ variants: DriveAsset[] }>(
		isVideo && asset ? `${base}/assets/${asset.id}/variants` : null,
		{
			// Only polls while actually watching, and only until the seek-bar
			// preview sprite is done (or fails) — no reason to keep hitting this
			// endpoint once there's nothing pending, or before playback has even
			// started (see the scrub-thumbnails request effect below, which is
			// what puts a "processing" row here in the first place).
			refreshInterval: (d) => {
				if (!playing) return 0;
				const scrub = d?.variants.find((v) => v.metadata?.specKey === "scrub");
				return scrub && (scrub.status === "ready" || scrub.status === "failed") ? 0 : 1500;
			},
		},
	);
	const subtitleTracks: VideoPlayerTrack[] = (variantsData?.variants ?? [])
		.filter((v) => v.metadata?.variant === "subtitle" && v.status === "ready")
		.map((v) => ({
			src: `/api${base}/assets/${v.id}/content`,
			label: String(v.metadata?.label ?? v.metadata?.language ?? "Subtitles"),
			language: String(v.metadata?.language ?? ""),
		}));
	const scrubVariant = variantsData?.variants.find((v) => v.metadata?.specKey === "scrub");
	const scrubThumbnails = scrubThumbnailsFromVariant(scrubVariant, base);

	// Requested lazily, only once the viewer actually starts playing (not on
	// every preview open) — same on-demand shape as ConvertedVideoPreview's
	// video-transcode request below, just for the seek-bar hover sprite
	// instead of a playable rendition.
	const scrubRequestedRef = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: base is derived from orgId/projectId, stable for this component's lifetime; only playing/asset/variantsData deciding whether to fire the one-time request should retrigger this.
	useEffect(() => {
		if (!playing || !asset || !isVideo) return;
		if (!variantsData || scrubVariant || scrubRequestedRef.current) return;
		scrubRequestedRef.current = true;
		apiFetch(`${base}/assets/${asset.id}/variants`, {
			method: "POST",
			body: JSON.stringify({ spec: { kind: "scrub-thumbnails" } }),
		})
			.then(() => mutateVariants())
			.catch(() => {});
	}, [playing, asset, isVideo, variantsData, scrubVariant]);

	function navigateTo(id: string) {
		router.replace(`/project/${projectId}/open?id=${id}`);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: navigateTo (and the router it closes over) are stable enough that including them would just cause redundant listener churn on every render.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowLeft" && prevId) navigateTo(prevId);
			else if (e.key === "ArrowRight" && nextId) navigateTo(nextId);
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [prevId, nextId, onClose]);

	if (!asset) {
		return (
			<div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
				Loading…
			</div>
		);
	}

	const contentUrl = `/api${base}/assets/${asset.id}/content`;
	const downloadUrl = `${contentUrl}?disposition=attachment`;
	const thumbnailUrl = asset.thumbnailAssetId
		? `/api${base}/assets/${asset.thumbnailAssetId}/content`
		: null;

	// Set at upload time from the real decoded stream (apps/worker's
	// processVideo) — used to size the preview player at the video's own
	// aspect ratio instead of stretching it to a fixed 16:9 box.
	const videoWidth = typeof asset.metadata?.width === "number" ? asset.metadata.width : null;
	const videoHeight = typeof asset.metadata?.height === "number" ? asset.metadata.height : null;

	// `asset?.id ?? assetId` rather than `asset.id` — TS can't carry the
	// `if (!asset) return` guard above into this nested function
	// declaration, but `assetId` (the prop) is always the same value once
	// `asset` has loaded, so this is equivalent without an assertion.
	function handleCopyLink() {
		if (project?.visibility === "public") copyPublicAssetLink(projectId, asset?.id ?? assetId);
		else setCopyLinkOpen(true);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between gap-3 border-b p-3">
				<div className="flex min-w-0 items-center gap-2">
					{fullPage ? (
						<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Back to Drive">
							<ArrowLeftIcon />
						</Button>
					) : (
						<>
							{prevId && (
								<Button variant="ghost" size="icon-sm" onClick={() => navigateTo(prevId)}>
									<ChevronLeftIcon />
								</Button>
							)}
							{nextId && (
								<Button variant="ghost" size="icon-sm" onClick={() => navigateTo(nextId)}>
									<ChevronRightIcon />
								</Button>
							)}
						</>
					)}
					<span className="truncate text-sm font-medium">{asset.filename}</span>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{asset.mimeType === "application/pdf" && (
						<a
							href={contentUrl}
							target="_blank"
							rel="noreferrer"
							className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
							aria-label="Open in new tab"
						>
							<ExternalLinkIcon />
						</a>
					)}
					<Button variant="ghost" size="icon-sm" onClick={handleCopyLink}>
						<LinkIcon />
					</Button>
					<a href={downloadUrl} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
						<DownloadIcon />
					</a>
					<Button variant="ghost" size="icon-sm" onClick={() => setDetailsOpen(true)}>
						<InfoIcon />
					</Button>
					{!fullPage && (
						<Button variant="ghost" size="icon-sm" onClick={onClose}>
							<XIcon />
						</Button>
					)}
				</div>
			</div>

			<div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-6">
				<AssetBody
					orgId={orgId}
					projectId={projectId}
					assetId={asset.id}
					mimeType={asset.mimeType}
					filename={asset.filename}
					contentUrl={contentUrl}
					thumbnailUrl={thumbnailUrl}
					tracks={subtitleTracks}
					videoWidth={videoWidth}
					videoHeight={videoHeight}
					scrubThumbnails={scrubThumbnails}
					playing={playing}
					onPlay={() => setPlaying(true)}
				/>
			</div>

			<AssetDetailsPanel
				orgId={orgId}
				projectId={projectId}
				asset={asset}
				open={detailsOpen}
				onOpenChange={setDetailsOpen}
			/>

			{copyLinkOpen && (
				<CopyLinkDialog
					orgId={orgId}
					projectId={projectId}
					asset={asset}
					open={copyLinkOpen}
					onOpenChange={setCopyLinkOpen}
				/>
			)}
		</div>
	);
}

// Thumbnail-first for the types where the original is expensive to load
// sight-unseen (video/PDF can be multi-MB, autoplaying a large video by
// default would be its own problem) — but a preview's whole point is to
// look at the actual file, so an image (never more than a moderate photo)
// just shows the original directly; there's no lower-resolution version
// worth trading a click for.
// Sized intrinsically within a max-height/max-width box at the video's OWN
// aspect ratio — not the package's fixed 16:9 base CSS, which would
// letterbox or stretch anything that isn't actually 16:9.
//
// `width: auto` + an explicit `aspectRatio` reads like "shrink to fit both
// max bounds," but that's only true for a normal in-flow block box. This
// box is a flex item (of AssetPreview's centering container), and a flex
// item's `width: auto` resolves via *content-based* sizing (its
// max-content size), not "fill available space" — so it only reaches the
// 60vh cap when its content happens to be big enough to exceed it. That's
// true for the real <video> element once metadata loads (its native
// resolution), which is why this looked right for the player, but false
// for the pre-play thumbnail: the generated thumbnail JPEG is downscaled to
// at most 1024px, so at anything under roughly 576px tall it never hit the
// cap and just rendered at its own small native size — a visible jump the
// moment playback swapped it for the full-size player.
// `calc(60vh * ratio)` computes the width explicitly instead, so both boxes
// size identically regardless of what's inside them.
function videoPreviewStyle(width: number | null, height: number | null) {
	if (width && height) {
		return {
			aspectRatio: `${width} / ${height}`,
			width: `min(100%, calc(60vh * ${width / height}))`,
			height: "auto",
			maxHeight: "60vh",
		} as const;
	}
	return { height: "60vh", width: "auto", maxWidth: "100%" } as const;
}

// The scrub-thumbnails variant (see apps/worker's packageScrubThumbnails)
// stores its sprite layout in `metadata` and the sprite image itself as the
// variant's own content — this just reshapes a ready one into the exact
// shape @ossplay/player's ProgressBar expects, or `undefined` if it's
// missing/not-yet-ready/malformed.
function scrubThumbnailsFromVariant(
	variant: DriveAsset | undefined,
	base: string,
): ScrubThumbnails | undefined {
	if (variant?.status !== "ready") return undefined;
	const m = variant.metadata ?? {};
	if (
		typeof m.interval !== "number" ||
		typeof m.columns !== "number" ||
		typeof m.rows !== "number" ||
		typeof m.tileWidth !== "number" ||
		typeof m.tileHeight !== "number" ||
		typeof m.count !== "number"
	) {
		return undefined;
	}
	return {
		src: `/api${base}/assets/${variant.id}/content`,
		interval: m.interval,
		columns: m.columns,
		rows: m.rows,
		tileWidth: m.tileWidth,
		tileHeight: m.tileHeight,
		count: m.count,
	};
}

function AssetBody({
	orgId,
	projectId,
	assetId,
	mimeType,
	filename,
	contentUrl,
	thumbnailUrl,
	tracks,
	videoWidth,
	videoHeight,
	scrubThumbnails,
	playing,
	onPlay,
}: {
	orgId: string;
	projectId: string;
	assetId: string;
	mimeType: string;
	filename: string;
	contentUrl: string;
	thumbnailUrl: string | null;
	tracks: VideoPlayerTrack[];
	videoWidth: number | null;
	videoHeight: number | null;
	scrubThumbnails: ScrubThumbnails | undefined;
	playing: boolean;
	onPlay: () => void;
}) {
	if (mimeType.startsWith("image/")) {
		return <PannableImage src={contentUrl} alt={filename} />;
	}

	if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
		if (playing) {
			if (mimeType.startsWith("video/")) {
				// Plays the original directly — a progressive mp4/webm source,
				// never "hls" — so this never requests/triggers HLS packaging
				// (that only happens for the embed player, via OssPlayVideo).
				// Same VideoPlayer component either way, just a different
				// source list, so the Drive preview gets the same controls
				// (quality menu only appears when there's more than one
				// source to switch between, which a plain original doesn't
				// have — captions/speed/fullscreen/PiP still do).
				if (NATIVELY_PLAYABLE_VIDEO_MIMETYPES.has(mimeType)) {
					return (
						<VideoPlayer
							sources={[{ src: contentUrl, type: mimeType.includes("webm") ? "webm" : "mp4" }]}
							tracks={tracks}
							scrubThumbnails={scrubThumbnails}
							autoPlay
							style={videoPreviewStyle(videoWidth, videoHeight)}
						/>
					);
				}
				return (
					<ConvertedVideoPreview
						orgId={orgId}
						projectId={projectId}
						assetId={assetId}
						tracks={tracks}
						scrubThumbnails={scrubThumbnails}
						videoWidth={videoWidth}
						videoHeight={videoHeight}
					/>
				);
			}
			// biome-ignore lint/a11y/useMediaCaption: no captions track exists for user-uploaded originals
			return <audio src={contentUrl} controls autoPlay className="w-full max-w-md" />;
		}
		if (thumbnailUrl) {
			// Sized with the exact same `videoPreviewStyle` box the player itself
			// uses once playing starts — matching sizing algorithms here (instead
			// of this button's own independent Tailwind max-h/max-w) is what
			// keeps the transition from thumbnail to player from visibly
			// jumping size the moment playback begins.
			return (
				// A plain div, not a <button> — role="button" + tabIndex +
				// onKeyDown keep it keyboard-operable without the native
				// element, whose own widget-layout sizing rules fight the
				// explicit box size videoPreviewStyle computes below.
				// biome-ignore lint/a11y/useSemanticElements: a real <button> here sizes to its own content regardless of CSS width/height overrides, breaking the aspect-ratio box below — see videoPreviewStyle's comment.
				<div
					role="button"
					tabIndex={0}
					onClick={onPlay}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onPlay();
						}
					}}
					className="group relative block cursor-pointer"
					style={videoPreviewStyle(videoWidth, videoHeight)}
				>
					{/* biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content */}
					<img src={thumbnailUrl} alt={filename} className="size-full object-contain" />
					<span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
						<span className="flex size-14 items-center justify-center rounded-full bg-background/90">
							<PlayIcon className="size-6 translate-x-0.5" />
						</span>
					</span>
				</div>
			);
		}
		return (
			<Button onClick={onPlay}>
				<PlayIcon /> Play
			</Button>
		);
	}

	if (mimeType === "application/pdf") {
		// Auto-shown, same as images — opening a preview already means "show
		// me the file", so there's no separate click-to-view step. The
		// browser's own PDF viewer toolbar/nav-panes/scrollbar is stripped via
		// the `#toolbar=0...` open-parameters convention every Chromium and
		// Firefox PDF viewer honors, so it reads as part of the app instead of
		// an embedded browser chrome; "Open in new tab" lives in the header
		// now, next to Copy Link/Download, rather than floating above the
		// iframe.
		return (
			<iframe
				src={`${contentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
				title={filename}
				className="h-full w-full rounded-md border bg-white"
			/>
		);
	}

	const Icon = iconForMimeType(mimeType);
	return (
		<div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
			<Icon className="size-16" />
			<p>No inline preview for this file type.</p>
			<a href={contentUrl} className={buttonVariants({ variant: "outline", size: "sm" })}>
				<DownloadIcon /> Download to view
			</a>
		</div>
	);
}

// The original file's container isn't browser-playable (.avi/.wmv/.mkv/a
// codec-incompatible .mov) — requests the same 720p mp4 on-demand
// rendition "Download as…" already offers, polls until it's ready, then
// plays that instead of the raw original. Same request-then-poll shape
// OssPlayVideo (player-js) uses for the embed player, just against the
// dashboard's session-authed route instead of the public /v1 one.
function ConvertedVideoPreview({
	orgId,
	projectId,
	assetId,
	tracks,
	scrubThumbnails,
	videoWidth,
	videoHeight,
}: {
	orgId: string;
	projectId: string;
	assetId: string;
	tracks: VideoPlayerTrack[];
	scrubThumbnails: ScrubThumbnails | undefined;
	videoWidth: number | null;
	videoHeight: number | null;
}) {
	const base = `/organizations/${orgId}/projects/${projectId}`;
	const requestedRef = useRef(false);
	const { data, mutate } = useSWR<{ variants: DriveAsset[] }>(
		`${base}/assets/${assetId}/variants`,
		{
			refreshInterval: (d) => {
				const target = d?.variants.find((v) => v.metadata?.specKey === "720p-mp4");
				return target && (target.status === "ready" || target.status === "failed") ? 0 : 1500;
			},
		},
	);
	const target = data?.variants.find((v) => v.metadata?.specKey === "720p-mp4");

	// biome-ignore lint/correctness/useExhaustiveDependencies: base/assetId/mutate are stable for the lifetime of this component (keyed by assetId itself); only `data`/`target` deciding whether to fire the one-time request should retrigger this.
	useEffect(() => {
		if (data && !target && !requestedRef.current) {
			requestedRef.current = true;
			apiFetch(`${base}/assets/${assetId}/variants`, {
				method: "POST",
				body: JSON.stringify({ spec: { kind: "video-transcode", height: 720, format: "mp4" } }),
			})
				.then(() => mutate())
				.catch(() => {
					// Surfaced by the next poll tick still finding no ready
					// variant — the "failed" branch below covers the visible
					// error state once the worker actually marks it so.
				});
		}
	}, [data, target]);

	if (target?.status === "failed") {
		return (
			<div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
				<p>This video's format couldn't be converted for preview.</p>
			</div>
		);
	}
	if (target?.status !== "ready") {
		return (
			<div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
				<p>Converting for preview…</p>
			</div>
		);
	}
	return (
		<VideoPlayer
			sources={[{ src: `/api${base}/assets/${target.id}/content`, type: "mp4" }]}
			tracks={tracks}
			scrubThumbnails={scrubThumbnails}
			autoPlay
			style={videoPreviewStyle(videoWidth, videoHeight)}
		/>
	);
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.4;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

// Wheel-to-zoom + drag-to-pan for the image preview. A native (non-React)
// wheel listener is required — React 17+ registers onWheel passively for
// scroll perf, so e.preventDefault() inside a JSX handler is silently
// ignored and the page would scroll instead of the image zooming.
function PannableImage({ src, alt }: { src: string; alt: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const dragRef = useRef<{
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		function onWheel(e: WheelEvent) {
			e.preventDefault();
			setScale((s) => clamp(s + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP), MIN_SCALE, MAX_SCALE));
		}
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	function clampOffset(next: { x: number; y: number }, s: number) {
		const el = containerRef.current;
		if (!el || s <= 1) return { x: 0, y: 0 };
		const maxX = ((s - 1) * el.clientWidth) / 2;
		const maxY = ((s - 1) * el.clientHeight) / 2;
		return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
	}

	// Re-clamps (and, at the fully-zoomed-out floor, snaps to dead center)
	// on every scale change — not just while dragging. Without this, zooming
	// out via the wheel left whatever pan offset was already set unchanged,
	// so the image drifted further off-center the more you zoomed out
	// instead of recentering, since only a drag ever re-clamped it before.
	// biome-ignore lint/correctness/useExhaustiveDependencies: clampOffset reads containerRef (a ref, stable identity) and MIN_SCALE (a module constant) — neither needs to be a dependency, only `scale` should re-trigger this.
	useEffect(() => {
		setOffset((prev) => (scale <= MIN_SCALE ? { x: 0, y: 0 } : clampOffset(prev, scale)));
	}, [scale]);

	function handlePointerDown(e: React.PointerEvent) {
		if (scale <= 1) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		setIsDragging(true);
		dragRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			originX: offset.x,
			originY: offset.y,
		};
	}

	function handlePointerMove(e: React.PointerEvent) {
		const drag = dragRef.current;
		if (!drag) return;
		setOffset(
			clampOffset(
				{
					x: drag.originX + (e.clientX - drag.startX),
					y: drag.originY + (e.clientY - drag.startY),
				},
				scale,
			),
		);
	}

	function endDrag() {
		dragRef.current = null;
		setIsDragging(false);
	}

	function handleDoubleClick() {
		// Offset re-clamps itself via the effect above whenever scale changes,
		// so this only needs to set the scale.
		setScale(scale > 1 ? 1 : 2);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a pan/zoom gesture surface is inherently pointer-only (drag position, wheel delta) — there's no keyboard equivalent to require, and the "View original" button already gives full-resolution access without it.
		<div
			ref={containerRef}
			className={cn(
				"relative flex h-full w-full flex-1 touch-none items-center justify-center overflow-hidden",
				scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
			)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerLeave={endDrag}
			onDoubleClick={handleDoubleClick}
		>
			{/* biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content */}
			<img
				src={src}
				alt={alt}
				draggable={false}
				className={cn(
					"max-h-[60vh] max-w-full select-none object-contain",
					!isDragging && "transition-transform duration-150 ease-out",
				)}
				style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
			/>
		</div>
	);
}
