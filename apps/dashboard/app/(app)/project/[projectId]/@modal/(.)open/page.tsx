"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AssetPreview } from "@/components/drive/asset-preview";

// The intercepted counterpart to open/page.tsx — matches when navigating
// here *client-side* from within /project/[projectId]/... (Next.js
// parallel + intercepting routes: this file lives under @modal/(.)open,
// composed by ../layout.tsx alongside `children`). Renders the same
// AssetPreview as an overlay on top of whatever page you were just on,
// instead of a full navigation — closing goes back to that page via
// router.back() rather than a hardcoded Drive URL. A hard refresh or a
// direct link to /project/[projectId]/open lands on the real page.tsx
// instead, since interception only applies to in-app navigation.
export default function InterceptedOpenAssetModal() {
	const { projectId } = useParams<{ projectId: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const assetId = searchParams.get("id");

	if (!assetId) return null;

	function handleClose() {
		router.back();
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: click-to-dismiss on the backdrop is a mouse-only convenience — the keyboard-equivalent close action is Escape, handled globally inside AssetPreview.
		// biome-ignore lint/a11y/useKeyWithClickEvents: same reasoning — Escape (not a key event on this element) is the documented keyboard path.
		<div
			className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
			onClick={(e) => {
				if (e.target === e.currentTarget) handleClose();
			}}
		>
			<div className="absolute inset-0 flex flex-col overflow-hidden bg-popover shadow-2xl sm:inset-6 sm:rounded-2xl sm:border lg:inset-10">
				<AssetPreview
					projectId={projectId}
					assetId={assetId}
					showDetails={searchParams.get("panel") === "details"}
					onClose={handleClose}
				/>
			</div>
		</div>
	);
}
