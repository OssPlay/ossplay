"use client";

import {
	ArrowLeftIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	ExternalLinkIcon,
	EyeIcon,
	FileTextIcon,
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
import { copyPublicAssetLink } from "@/lib/copy-link";
import { useProjectContext } from "@/lib/current-project";
import { cn } from "@/lib/utils";
import type { DriveBrowseResponse } from "@/types/drive";
import { iconForMimeType } from "./asset-context-menu";
import { AssetDetailsPanel } from "./asset-details-panel";
import { CopyLinkDialog } from "./copy-link-dialog";

// The one preview surface for an asset, shared by the intercepted modal
// route and the full-page route (see app/(app)/project/[projectId]/open/) —
// so client-side navigation and a hard refresh of the same URL render
// identically, just wrapped differently by their respective page.tsx.
export function AssetPreview({
	projectId,
	assetId,
	showDetails,
	onClose,
	fullPage,
}: {
	projectId: string;
	assetId: string;
	showDetails?: boolean;
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

	const [detailsOpen, setDetailsOpen] = useState(Boolean(showDetails));
	const [copyLinkOpen, setCopyLinkOpen] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [viewOriginal, setViewOriginal] = useState(false);

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
					mimeType={asset.mimeType}
					filename={asset.filename}
					contentUrl={contentUrl}
					thumbnailUrl={thumbnailUrl}
					playing={playing}
					onPlay={() => setPlaying(true)}
					viewOriginal={viewOriginal}
					onViewOriginal={() => setViewOriginal(true)}
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

// Thumbnail-first for every type that has one — the original bytes (a
// multi-MB video/PDF/audio file, or even just a large photo) are never
// loaded just to preview it. Each type has its own "give me the real
// thing" affordance instead: video/audio swap in a real player on click,
// images offer a full-resolution view, PDFs open the real file in a new
// tab (no in-app PDF viewer — that's real extra scope, not this pass's).
function AssetBody({
	mimeType,
	filename,
	contentUrl,
	thumbnailUrl,
	playing,
	onPlay,
	viewOriginal,
	onViewOriginal,
}: {
	mimeType: string;
	filename: string;
	contentUrl: string;
	thumbnailUrl: string | null;
	playing: boolean;
	onPlay: () => void;
	viewOriginal: boolean;
	onViewOriginal: () => void;
}) {
	if (mimeType.startsWith("image/")) {
		const src = viewOriginal || !thumbnailUrl ? contentUrl : thumbnailUrl;
		return (
			<div className="flex h-full w-full flex-col items-center gap-3">
				{/* key={src} remounts (instead of an effect resetting state) whenever the
				    image itself changes — a different asset or the view-original toggle —
				    so stale zoom/pan never carries over to the new image. */}
				<PannableImage key={src} src={src} alt={filename} />
				{!viewOriginal && thumbnailUrl && (
					<Button variant="outline" size="sm" onClick={onViewOriginal}>
						View original
					</Button>
				)}
			</div>
		);
	}

	if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
		if (playing) {
			return mimeType.startsWith("video/") ? (
				// biome-ignore lint/a11y/useMediaCaption: no captions track exists for user-uploaded originals
				<video src={contentUrl} controls autoPlay className="max-h-[60vh] max-w-full" />
			) : (
				// biome-ignore lint/a11y/useMediaCaption: no captions track exists for user-uploaded originals
				<audio src={contentUrl} controls autoPlay className="w-full max-w-md" />
			);
		}
		if (thumbnailUrl) {
			return (
				<button
					type="button"
					onClick={onPlay}
					className="group relative flex max-h-[60vh] max-w-full items-center justify-center"
				>
					{/* biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content */}
					<img
						src={thumbnailUrl}
						alt={filename}
						className="max-h-[60vh] max-w-full object-contain"
					/>
					<span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
						<span className="flex size-14 items-center justify-center rounded-full bg-background/90">
							<PlayIcon className="size-6 translate-x-0.5" />
						</span>
					</span>
				</button>
			);
		}
		return (
			<Button onClick={onPlay}>
				<PlayIcon /> Play
			</Button>
		);
	}

	if (mimeType === "application/pdf") {
		// Shown in-app (not a new-tab link) once the user opts in, same
		// thumbnail-first-then-click pattern as video/audio above — but with
		// the browser's own PDF viewer toolbar/nav-panes/scrollbar stripped
		// via the `#toolbar=0...` open-parameters convention every Chromium
		// and Firefox PDF viewer honors, so it reads as part of the app
		// instead of an embedded browser chrome.
		if (playing) {
			return (
				<div className="flex h-full w-full flex-col gap-2">
					<div className="flex shrink-0 justify-end">
						<a
							href={contentUrl}
							target="_blank"
							rel="noreferrer"
							className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
						>
							<ExternalLinkIcon /> Open in new tab
						</a>
					</div>
					<iframe
						src={`${contentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
						title={filename}
						className="min-h-0 w-full flex-1 rounded-md border bg-white"
					/>
				</div>
			);
		}
		if (thumbnailUrl) {
			return (
				<button
					type="button"
					onClick={onPlay}
					className="group relative flex max-h-[60vh] max-w-full items-center justify-center"
				>
					{/* biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content */}
					<img
						src={thumbnailUrl}
						alt={filename}
						className="max-h-[60vh] max-w-full rounded-md border object-contain shadow-sm"
					/>
					<span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
						<span className="flex size-14 items-center justify-center rounded-full bg-background/90">
							<EyeIcon className="size-6" />
						</span>
					</span>
				</button>
			);
		}
		return (
			<div className="flex flex-col items-center gap-3">
				<FileTextIcon className="size-16 text-muted-foreground" />
				<Button onClick={onPlay}>
					<EyeIcon /> View PDF
				</Button>
			</div>
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
		if (scale > 1) {
			setScale(1);
			setOffset({ x: 0, y: 0 });
		} else {
			setScale(2);
		}
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
