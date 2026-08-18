"use client";

import { LoaderCircleIcon } from "lucide-react";
import { notFound, useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { PreviewOverlay } from "@/components/drive/preview-overlay";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { useProjectContext } from "@/lib/current-project";
import type { DriveAsset } from "@/types/drive";

// Deep-linkable preview — reached via search results or a shared link, not
// only by clicking a grid item (which opens the same overlay purely
// client-side, no navigation). Closing this overlay goes back to the
// drive root rather than trying to reconstruct which folder the asset
// lives in.
export default function ProjectFilePreviewPage() {
	const router = useRouter();
	const { projectId, assetId } = useParams<{ projectId: string; assetId: string }>();
	const { effectiveOrgId } = useProjectContext(projectId);

	const { data, error, isLoading } = useSWR<{ asset: DriveAsset }>(
		effectiveOrgId
			? `/organizations/${effectiveOrgId}/projects/${projectId}/assets/${assetId}`
			: null,
	);

	if (error instanceof ApiError && error.status === 404) notFound();
	if (!effectiveOrgId) return null;

	if (isLoading || !data) {
		return (
			<Dialog open>
				<DialogContent className="sm:max-w-full flex items-center justify-center min-h-96">
					<LoaderCircleIcon className="animate-spin size-8" />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<PreviewOverlay
			orgId={effectiveOrgId}
			projectId={projectId}
			asset={data.asset}
			open
			onOpenChange={(open) => {
				if (!open) router.push(`/project/${projectId}`);
			}}
		/>
	);
}
