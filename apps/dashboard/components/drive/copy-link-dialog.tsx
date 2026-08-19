"use client";

import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

// A private project has no public URL to hand back directly (unlike a
// public one — see useDriveActions' copyPublicLink), so "Copy link" here
// asks how long the link should work before creating one. The link itself
// is a /v1 URL carrying a short-lived, single-asset share token (see
// apps/api/src/routes/assets.ts's POST .../share-links and v1.ts's
// verifyAssetShareToken) — it works for whoever it's shared with, not just
// someone logged into this dashboard.
export function CopyLinkDialog({
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
	const create = useAction(
		(duration: Duration) =>
			apiFetch<{ url: string }>(
				`/organizations/${orgId}/projects/${projectId}/assets/${asset.id}/share-links`,
				{ method: "POST", body: JSON.stringify({ duration }) },
			),
		{ error: "Could not create link" },
	);

	async function handleChoose(duration: Duration) {
		try {
			const { url } = await create.trigger(duration);
			await navigator.clipboard.writeText(`${window.location.origin}${url}`);
			toast.success("Link copied");
			onOpenChange(false);
		} catch {
			// toast already shown by useAction, or clipboard write failed silently
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next) create.reset();
		onOpenChange(next);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Copy link</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					This project is private — pick how long the link should work for.
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
				<FormError
					message={create.error ? errorMessage(create.error, "Could not create link") : null}
				/>
			</DialogContent>
		</Dialog>
	);
}
