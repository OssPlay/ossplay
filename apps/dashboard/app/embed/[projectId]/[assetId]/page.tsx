"use client";

import "@ossplay/player/styles.css";
import { OssPlayVideo } from "@ossplay/player";
import { useParams, useSearchParams } from "next/navigation";

// The public, unauthenticated iframe video player — reached via
// /v1/embed-token's returned URL (apps/api/src/routes/v1.ts), never via a
// dashboard session (a third-party page's iframe visitor has none). Carries
// no chrome of its own — the root layout (app/layout.tsx) is the only
// wrapper, deliberately outside the (app) route group's AuthProvider/
// sidebar/header (see proxy.ts's ALWAYS_PUBLIC_PREFIXES entry for this
// path). Access control lives entirely in the /v1 routes OssPlayVideo calls
// (public project: open; private: the `?share=` token in the URL), not
// here — this page doesn't know or care which case it's in.
//
// OssPlayVideo (from the standalone player-js repo/package — see MEMORY.md)
// owns the request-hls-rendition-then-poll-until-ready flow that used to be
// hand-rolled here directly against SWR; this page is now just wiring.
export default function EmbedPage() {
	const { projectId, assetId } = useParams<{ projectId: string; assetId: string }>();
	const searchParams = useSearchParams();
	const share = searchParams.get("share") ?? undefined;

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-black">
			{/* h-full/w-full override the package's default 16:9 aspect-ratio
			box — here the container IS already sized to the iframe's exact
			dimensions, so the player should fill it exactly rather than
			letterbox to a fixed ratio. */}
			<OssPlayVideo
				apiBaseUrl="/api"
				project={projectId}
				assetId={assetId}
				share={share}
				autoPlay
				className="h-full w-full"
			/>
		</div>
	);
}
