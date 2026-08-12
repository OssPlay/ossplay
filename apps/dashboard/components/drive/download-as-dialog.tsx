"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { usePolledAsset } from "@/hooks/use-polled-asset";
import { apiFetch, errorMessage } from "@/lib/api";
import type { DriveAsset, VariantSpec } from "@/types/drive";

type Family = "image" | "video" | "audio";

function familyOf(mimeType: string): Family | null {
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("video/")) return "video";
	if (mimeType.startsWith("audio/")) return "audio";
	return null;
}

const FORMAT_LABELS: Record<string, string> = {
	original: "Original format",
	webp: "WebP",
	avif: "AVIF",
	jpeg: "JPEG",
	png: "PNG",
};
const SIZE_LABELS: Record<string, string> = {
	original: "Original size",
	"1024": "1024px",
	"2048": "2048px",
	"4096": "4096px",
};
const HEIGHT_LABELS: Record<string, string> = { "480": "480p", "720": "720p", "1080": "1080p" };
const BITRATE_LABELS: Record<string, string> = {
	"96k": "96 kbps",
	"128k": "128 kbps",
	"192k": "192 kbps",
	"320k": "320 kbps",
};

function specFromSelection(
	family: Family,
	format: string,
	size: string,
	height: string,
	bitrate: string,
): VariantSpec {
	if (family === "image") {
		return {
			kind: "image-format",
			format: format as "webp" | "avif" | "jpeg" | "png" | "original",
			maxDimension: size === "original" ? "original" : (Number(size) as 1024 | 2048 | 4096),
		};
	}
	if (family === "video") {
		return { kind: "video-transcode", height: Number(height) as 480 | 720 | 1080 };
	}
	return { kind: "audio-transcode", bitrate: bitrate as "96k" | "128k" | "192k" | "320k" };
}

// Format+size tiers for images, a single resolution/bitrate pick for
// video/audio (see the plan's per-mimetype variant matrix — PDFs and
// every other family have no on-demand path, so this dialog is only ever
// opened for image/video/audio assets). Requests a variant, polls until
// ready via usePolledAsset, then hands back a real download or a
// copyable link — a repeat request for the exact same spec is an instant
// cache hit server-side (findCachedVariant), so re-opening this dialog
// and picking the same options again doesn't re-run the job.
export function DownloadAsDialog({
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
	const base = `/organizations/${orgId}/projects/${projectId}`;
	const family = familyOf(asset.mimeType);

	const [format, setFormat] = useState("webp");
	const [size, setSize] = useState("2048");
	const [height, setHeight] = useState("720");
	const [bitrate, setBitrate] = useState("192k");
	const [requestedAssetId, setRequestedAssetId] = useState<string | null>(null);

	const polled = usePolledAsset(requestedAssetId ? orgId : null, projectId, requestedAssetId);
	const variant = polled.data?.asset;

	const request = useAction(
		(spec: VariantSpec) =>
			apiFetch<{ asset: DriveAsset }>(`${base}/assets/${asset.id}/variants`, {
				method: "POST",
				body: JSON.stringify({ spec }),
			}),
		{ error: "Could not prepare that download" },
	);

	if (!family) return null;

	async function handlePrepare() {
		try {
			const { asset: created } = await request.trigger(
				specFromSelection(family as Family, format, size, height, bitrate),
			);
			setRequestedAssetId(created.id);
		} catch {
			// toast already shown by useAction
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next) {
			setRequestedAssetId(null);
			request.reset();
		}
		onOpenChange(next);
	}

	const contentUrl = variant ? `/api${base}/assets/${variant.id}/content` : null;

	async function handleCopyLink() {
		if (!contentUrl) return;
		try {
			await navigator.clipboard.writeText(`${window.location.origin}${contentUrl}`);
			toast.success("Link copied");
		} catch {
			toast.error("Could not copy link");
		}
	}

	function handleDownload() {
		if (!contentUrl) return;
		window.location.href = `${contentUrl}?disposition=attachment`;
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Download as…</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{family === "image" && (
						<>
							<div className="flex flex-col gap-1.5">
								<Label>Format</Label>
								<Select value={format} onValueChange={(v) => setFormat(String(v))}>
									<SelectTrigger className="w-full">
										<SelectValue items={FORMAT_LABELS} />
									</SelectTrigger>
									<SelectContent>
										{Object.keys(FORMAT_LABELS).map((key) => (
											<SelectItem key={key} value={key}>
												{FORMAT_LABELS[key]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>Size</Label>
								<Select value={size} onValueChange={(v) => setSize(String(v))}>
									<SelectTrigger className="w-full">
										<SelectValue items={SIZE_LABELS} />
									</SelectTrigger>
									<SelectContent>
										{Object.keys(SIZE_LABELS).map((key) => (
											<SelectItem key={key} value={key}>
												{SIZE_LABELS[key]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</>
					)}
					{family === "video" && (
						<div className="flex flex-col gap-1.5">
							<Label>Resolution</Label>
							<Select value={height} onValueChange={(v) => setHeight(String(v))}>
								<SelectTrigger className="w-full">
									<SelectValue items={HEIGHT_LABELS} />
								</SelectTrigger>
								<SelectContent>
									{Object.keys(HEIGHT_LABELS).map((key) => (
										<SelectItem key={key} value={key}>
											{HEIGHT_LABELS[key]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					{family === "audio" && (
						<div className="flex flex-col gap-1.5">
							<Label>Bitrate</Label>
							<Select value={bitrate} onValueChange={(v) => setBitrate(String(v))}>
								<SelectTrigger className="w-full">
									<SelectValue items={BITRATE_LABELS} />
								</SelectTrigger>
								<SelectContent>
									{Object.keys(BITRATE_LABELS).map((key) => (
										<SelectItem key={key} value={key}>
											{BITRATE_LABELS[key]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<FormError
						message={
							request.error ? errorMessage(request.error, "Could not prepare that download") : null
						}
					/>

					{requestedAssetId && variant?.status === "processing" && (
						<p className="text-sm text-muted-foreground">Processing…</p>
					)}
					{requestedAssetId && variant?.status === "failed" && (
						<p className="text-sm text-destructive" role="alert">
							That conversion failed — try again.
						</p>
					)}
				</div>
				<DialogFooter>
					{variant?.status === "ready" ? (
						<>
							<Button variant="outline" onClick={handleCopyLink}>
								Copy link
							</Button>
							<Button onClick={handleDownload}>Download</Button>
						</>
					) : (
						<LoadingButton
							loading={request.isLoading || variant?.status === "processing"}
							onClick={handlePrepare}
						>
							Prepare download
						</LoadingButton>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
