"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { DriveAsset } from "@/types/drive";

type Duration = "1h" | "1d" | "7d" | "30d";
const DURATION_LABELS: Record<Duration, string> = {
	"1h": "1 hour",
	"1d": "1 day",
	"7d": "7 days",
	"30d": "30 days",
};

const EMBED_WIDTH = 640;
const EMBED_HEIGHT = 360;

function iframeSnippet(url: string): string {
	return `<iframe src="${url}" width="${EMBED_WIDTH}" height="${EMBED_HEIGHT}" frameborder="0" allowfullscreen></iframe>`;
}

// A public project's video embeds with a direct, permanent /embed URL, same
// as copy-link-dialog.tsx's public branch — no token, works forever. A
// private one needs the same short-lived, single-asset grant "Copy link"
// already mints (mintAssetShareLink, apps/api/src/lib/share-links.ts), so
// this reuses that exact route rather than the /v1 embed-token endpoint
// (that one exists for an external SDK caller with a project API key, not
// a logged-in dashboard session — see v1.ts's comment on it).
export function EmbedDialog({
	orgId,
	projectId,
	projectVisibility,
	asset,
	open,
	onOpenChange,
}: {
	orgId: string;
	projectId: string;
	projectVisibility: "public" | "private";
	asset: DriveAsset;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [code, setCode] = useState<string | null>(null);

	const create = useAction(
		(duration: Duration) =>
			apiFetch<{ url: string }>(
				`/organizations/${orgId}/projects/${projectId}/assets/${asset.id}/share-links`,
				{ method: "POST", body: JSON.stringify({ duration }) },
			),
		{ error: "Could not create embed link" },
	);

	function publicEmbedUrl(): string {
		return `${window.location.origin}/embed/${projectId}/${asset.id}`;
	}

	async function handleChoose(duration: Duration) {
		try {
			// The share-links route returns a /v1 read URL
			// (/api/v1/:project/:assetId?share=...) built for a direct
			// download/`<img src>`-style consumer — only the token itself is
			// reused here, against the embed player's own URL shape instead.
			const { url } = await create.trigger(duration);
			const share = new URL(url, window.location.origin).searchParams.get("share");
			setCode(iframeSnippet(`${publicEmbedUrl()}?share=${share}`));
		} catch {
			// toast already shown by useAction
		}
	}

	async function handleCopy() {
		if (!code) return;
		try {
			await navigator.clipboard.writeText(code);
			toast.success("Embed code copied");
		} catch {
			toast.error("Could not copy embed code");
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next) {
			create.reset();
			setCode(null);
		}
		onOpenChange(next);
	}

	const publicCode = projectVisibility === "public" ? iframeSnippet(publicEmbedUrl()) : null;
	const displayCode = publicCode ?? code;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Embed video</DialogTitle>
				</DialogHeader>
				{displayCode ? (
					<div className="flex flex-col gap-3">
						<Textarea readOnly rows={3} value={displayCode} className="font-mono text-xs" />
						<Button onClick={handleCopy} className="w-fit">
							Copy code
						</Button>
					</div>
				) : (
					<>
						<p className="text-sm text-muted-foreground">
							This project is private — pick how long the embed should work for.
						</p>
						<div className="grid grid-cols-2 gap-2">
							{(Object.keys(DURATION_LABELS) as Duration[]).map((duration) => (
								<Button
									key={duration}
									variant="outline"
									disabled={create.isLoading}
									onClick={() => handleChoose(duration)}
								>
									{DURATION_LABELS[duration]}
								</Button>
							))}
						</div>
					</>
				)}
				<FormError
					message={create.error ? errorMessage(create.error, "Could not create embed link") : null}
				/>
			</DialogContent>
		</Dialog>
	);
}
