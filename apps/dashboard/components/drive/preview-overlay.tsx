"use client";

import { DownloadIcon } from "lucide-react";
import useSWR from "swr";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DriveActivityEntry, DriveAsset } from "@/types/drive";

// Plays/renders the *original* asset directly, not a processed HLS variant
// — wiring adaptive HLS playback (hls.js, since only Safari supports it
// natively) is a separate, larger piece of UI work than this pass covers.
// Every browser this app targets plays a directly-served mp4/webm/etc. of
// the original just fine via a plain <video> tag, which is what this does.
export function PreviewOverlay({
	orgId,
	projectId,
	asset,
	open,
	onOpenChange,
}: {
	orgId: string;
	projectId: string;
	asset: DriveAsset;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const contentUrl = `/api/organizations/${orgId}/projects/${projectId}/assets/${asset.id}/content`;
	const downloadUrl = `${contentUrl}?disposition=attachment`;

	const { data: activityData } = useSWR<{ activity: DriveActivityEntry[] }>(
		open ? `/organizations/${orgId}/projects/${projectId}/assets/${asset.id}/activity` : null,
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-full">
				<DialogHeader className="flex-row items-center justify-between">
					<DialogTitle className="truncate">{asset.filename}</DialogTitle>
					<a href={downloadUrl} className={buttonVariants({ variant: "outline", size: "sm" })}>
						<DownloadIcon /> Download
					</a>
				</DialogHeader>

				<div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-md bg-muted/30">
					<AssetViewer
						mimeType={asset.mimeType}
						contentUrl={contentUrl}
						filename={asset.filename}
					/>
				</div>

				{activityData && activityData.activity.length > 0 && (
					<div className="flex flex-col gap-1 border-t pt-3">
						<p className="text-xs font-medium text-muted-foreground">Activity</p>
						<ul className="flex flex-col gap-1 max-h-32 overflow-auto">
							{activityData.activity.map((entry) => (
								<li key={entry.id} className="text-xs text-muted-foreground">
									{describeActivity(entry)} — {new Date(entry.createdAt).toLocaleString()}
									{entry.actorName ? ` by ${entry.actorName}` : ""}
								</li>
							))}
						</ul>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
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

function AssetViewer({
	mimeType,
	contentUrl,
	filename,
}: {
	mimeType: string;
	contentUrl: string;
	filename: string;
}) {
	if (mimeType.startsWith("image/")) {
		return (
			// biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content — next/image's optimizer isn't set up for this
			<img src={contentUrl} alt={filename} className="max-h-[60vh] max-w-full object-contain" />
		);
	}
	if (mimeType.startsWith("video/")) {
		// biome-ignore lint/a11y/useMediaCaption: no captions track exists for user-uploaded originals
		return <video src={contentUrl} controls className="max-h-[60vh] max-w-full" />;
	}
	if (mimeType.startsWith("audio/")) {
		// biome-ignore lint/a11y/useMediaCaption: no captions track exists for user-uploaded originals
		return <audio src={contentUrl} controls className="w-full" />;
	}
	if (mimeType === "application/pdf") {
		return <iframe src={contentUrl} title={filename} className="h-[60vh] w-full" />;
	}
	return (
		<div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
			<p>No inline preview for this file type.</p>
			<a href={contentUrl} className={buttonVariants({ variant: "outline", size: "sm" })}>
				<DownloadIcon /> Download to view
			</a>
		</div>
	);
}
