"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AssetPreview } from "@/components/drive/asset-preview";
import Container from "@/components/ui/container";

// The full-page counterpart to @modal/(.)open — reached on a hard refresh
// or a direct link to this same URL, since an intercepted route only
// intercepts *client-side* navigation. Renders the identical AssetPreview,
// just inside the normal project layout chrome (Section's sidepanel/
// breadcrumb) instead of an overlay, and closes by going back to Drive
// rather than router.back() (there's no "previous overlay state" to return
// to when this page was reached directly).
export default function OpenAssetPage() {
	const { projectId } = useParams<{ projectId: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const assetId = searchParams.get("id");

	if (!assetId) return null;

	return (
		<Container size="lg" inner={{ className: "overflow-hidden" }} container={{ className: "p-0" }}>
			<div className="h-[calc(100vh-10rem)] min-h-[32rem]">
				<AssetPreview
					projectId={projectId}
					assetId={assetId}
					showDetails={searchParams.get("panel") === "details"}
					onClose={() => router.push(`/project/${projectId}`)}
					hideCloseButton
				/>
			</div>
		</Container>
	);
}
