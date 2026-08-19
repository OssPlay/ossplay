"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBytes } from "@/lib/format-bytes";
import { cn, formatDatetime } from "@/lib/utils";
import { BITRATE_LABELS, FORMAT_LABELS, HEIGHT_LABELS, SIZE_LABELS } from "@/lib/variant-labels";
import type { DriveActivityEntry, DriveAsset } from "@/types/drive";

type Tab = "details" | "variants" | "activity";
const TABS: { value: Tab; label: string }[] = [
	{ value: "details", label: "Details" },
	{ value: "variants", label: "Variants" },
	{ value: "activity", label: "Activity" },
];

// Turns a variant's metadata.specKey back into a human label, reusing the
// same lookup tables Download as… uses to build one — see
// v1.ts's computeTransformSpecKey (the "otf-" prefixed on-the-fly form) and
// packages/core/src/jobs.ts's computeSpecKey (the fixed-enum form) for the
// two shapes this has to handle.
function labelForSpecKey(specKey: string): string {
	const otf = specKey.match(/^otf-(\w+)-(\w+)x(\w+)-q(\w+)$/);
	if (otf) {
		const [, format, w, h, q] = otf;
		const dims = w === "auto" && h === "auto" ? "" : ` ${w}×${h}`;
		const quality = q === "default" ? "" : ` q${q}`;
		return `${format}${dims}${quality}`.trim();
	}
	if (specKey.endsWith("p-mp4")) {
		const height = specKey.replace("p-mp4", "");
		return HEIGHT_LABELS[height] ? `${HEIGHT_LABELS[height]} video` : specKey;
	}
	if (specKey.endsWith("-mp3")) {
		const bitrate = specKey.replace("-mp3", "");
		return BITRATE_LABELS[bitrate] ? `${BITRATE_LABELS[bitrate]} MP3` : specKey;
	}
	const [format, size] = specKey.split("-");
	if (format && FORMAT_LABELS[format]) {
		return size && SIZE_LABELS[size]
			? `${FORMAT_LABELS[format]}, ${SIZE_LABELS[size]}`
			: FORMAT_LABELS[format];
	}
	return specKey;
}

function describeActivity(entry: DriveActivityEntry): string {
	switch (entry.action) {
		case "uploaded":
			return "Uploaded";
		case "renamed":
			return `Renamed from "${entry.fromValue}" to "${entry.toValue}"`;
		case "moved":
			return "Moved";
		case "trashed":
			return "Moved to trash";
		case "restored":
			return "Restored from trash";
		default:
			return entry.action;
	}
}

// One consolidated right-side panel instead of separate Variants/Activity
// sheets — scales as more sections get added later without the context
// menu growing a new item each time. Opened from the preview page (see
// asset-preview.tsx), not directly from the grid/list context menu — the
// "Details" menu item routes to the preview with `panel=details` set
// instead, since a variant/activity list only makes sense next to the
// asset it's about.
export function AssetDetailsPanel({
	orgId,
	projectId,
	asset,
	open,
	onOpenChange,
	initialTab = "details",
}: {
	orgId: string;
	projectId: string;
	asset: DriveAsset;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialTab?: Tab;
}) {
	const [tab, setTab] = useState<Tab>(initialTab);
	const base = `/organizations/${orgId}/projects/${projectId}`;

	// Fetched lazily, only once its tab is actually viewed — most panel
	// opens only ever look at Details, so there's no reason to always pay
	// for both extra requests.
	const { data: variantsData } = useSWR<{ variants: DriveAsset[] }>(
		open && tab === "variants" ? `${base}/assets/${asset.id}/variants` : null,
	);
	const { data: activityData } = useSWR<{ activity: DriveActivityEntry[] }>(
		open && tab === "activity" ? `${base}/assets/${asset.id}/activity` : null,
	);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="gap-4">
				<SheetHeader>
					<SheetTitle className="truncate pr-8">{asset.filename}</SheetTitle>
				</SheetHeader>
				<div className="flex gap-1 border-b px-6">
					{TABS.map((t) => (
						<button
							key={t.value}
							type="button"
							onClick={() => setTab(t.value)}
							className={cn(
								"border-b-2 px-3 pb-2 text-sm font-medium text-muted-foreground transition-colors",
								tab === t.value
									? "border-primary text-foreground"
									: "border-transparent hover:text-foreground",
							)}
						>
							{t.label}
						</button>
					))}
				</div>
				<div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
					{tab === "details" && (
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
							<dt className="text-muted-foreground">Type</dt>
							<dd>{asset.mimeType}</dd>
							<dt className="text-muted-foreground">Size</dt>
							<dd>{asset.size != null ? formatBytes(asset.size) : "—"}</dd>
							<dt className="text-muted-foreground">Status</dt>
							<dd className="capitalize">{asset.status}</dd>
							<dt className="text-muted-foreground">Created</dt>
							<dd>{formatDatetime(asset.createdAt)}</dd>
							<dt className="text-muted-foreground">Modified</dt>
							<dd>{formatDatetime(asset.updatedAt)}</dd>
							<dt className="text-muted-foreground">Asset ID</dt>
							<dd className="break-all font-mono text-xs">{asset.id}</dd>
						</dl>
					)}

					{tab === "variants" && (
						<>
							{!variantsData && <p className="text-sm text-muted-foreground">Loading…</p>}
							{variantsData?.variants.length === 0 && (
								<p className="text-sm text-muted-foreground">No variants yet.</p>
							)}
							<ul className="flex flex-col gap-2">
								{variantsData?.variants.map((variant) => (
									<li
										key={variant.id}
										className="flex items-center justify-between gap-2 rounded-md border p-2"
									>
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm">
												{variant.metadata?.variant === "thumbnail"
													? "Thumbnail"
													: variant.metadata?.specKey
														? labelForSpecKey(variant.metadata.specKey)
														: variant.filename}
											</span>
											<span className="text-xs text-muted-foreground">
												{variant.size != null ? formatBytes(variant.size) : "—"} · {variant.status}
											</span>
										</div>
										<a
											href={`/api${base}/assets/${variant.id}/content?disposition=attachment`}
											className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
										>
											<DownloadIcon />
										</a>
									</li>
								))}
							</ul>
						</>
					)}

					{tab === "activity" && (
						<>
							{!activityData && <p className="text-sm text-muted-foreground">Loading…</p>}
							{activityData?.activity.length === 0 && (
								<p className="text-sm text-muted-foreground">No activity yet.</p>
							)}
							<ul className="flex flex-col gap-2">
								{activityData?.activity.map((entry) => (
									<li key={entry.id} className="text-sm text-muted-foreground">
										{describeActivity(entry)} — {formatDatetime(entry.createdAt)}
										{entry.actorName ? ` by ${entry.actorName}` : ""}
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
