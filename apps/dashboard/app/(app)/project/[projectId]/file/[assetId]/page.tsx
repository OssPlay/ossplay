"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { PreviewOverlay } from "@/components/drive/preview-overlay";
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

	const { data } = useSWR<{ asset: DriveAsset }>(
		effectiveOrgId
			? `/organizations/${effectiveOrgId}/projects/${projectId}/assets/${assetId}`
			: null,
	);

	if (!effectiveOrgId || !data) return null;

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
