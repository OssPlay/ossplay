"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";

// The default rendition every embed requests — mp4/h264 has near-universal
// browser support, so this alone is enough to play anywhere; a webm
// `<source>` is added opportunistically below if one already happens to be
// cached (see asset-context-menu's Download as… / the SDK's own on-demand
// requests), never requested eagerly by this page itself — matching the
// on-demand system's whole point (packages/core/src/jobs.ts's
// computeSpecKey), a rendition nobody asked for never gets generated.
const DEFAULT_SPEC_KEY = "720p-mp4";
const WEBM_SPEC_KEY = "720p-webm";
const POLL_INTERVAL_MS = 1500;

interface EmbedVariant {
	id: string;
	mimeType: string;
	status: "pending" | "processing" | "ready" | "failed";
	metadata: { variant?: string; specKey?: string; language?: string; label?: string } | null;
}

// The public, unauthenticated iframe video player — reached via
// /v1/embed-token's returned URL (apps/api/src/routes/v1.ts), never via a
// dashboard session (a third-party page's iframe visitor has none). Carries
// no chrome of its own — the root layout (app/layout.tsx) is the only
// wrapper, deliberately outside the (app) route group's AuthProvider/
// sidebar/header (see proxy.ts's ALWAYS_PUBLIC_PREFIXES entry for this
// path). Access control lives entirely in the /v1 routes this page calls
// (public project: open; private: the `?share=` token in the URL), not
// here — this page doesn't know or care which case it's in.
export default function EmbedPage() {
	const { projectId, assetId } = useParams<{ projectId: string; assetId: string }>();
	const searchParams = useSearchParams();
	const share = searchParams.get("share");
	const query = share ? `?share=${encodeURIComponent(share)}` : "";
	const base = `/v1/${projectId}/${assetId}`;

	const [requested, setRequested] = useState(false);

	const { data, error } = useSWR<{ variants: EmbedVariant[] }>(`${base}/variants${query}`, {
		refreshInterval: (d) => {
			const target = d?.variants.find((v) => v.metadata?.specKey === DEFAULT_SPEC_KEY);
			return target && (target.status === "ready" || target.status === "failed")
				? 0
				: POLL_INTERVAL_MS;
		},
	});

	const mp4Requested =
		data?.variants.some((v) => v.metadata?.specKey === DEFAULT_SPEC_KEY) ?? false;
	const mp4 = data?.variants.find((v) => v.metadata?.specKey === DEFAULT_SPEC_KEY);
	const webm = data?.variants.find(
		(v) => v.metadata?.specKey === WEBM_SPEC_KEY && v.status === "ready",
	);
	const subtitles =
		data?.variants.filter((v) => v.metadata?.variant === "subtitle" && v.status === "ready") ?? [];

	// biome-ignore lint/correctness/useExhaustiveDependencies: base/query are derived from route params that never change after mount for a given page load — only `data`/`mp4Requested` should re-trigger this.
	useEffect(() => {
		if (!data || requested || mp4Requested) return;
		setRequested(true);
		apiFetch(`${base}/variants${query}`, {
			method: "POST",
			body: JSON.stringify({ spec: { kind: "video-transcode", height: 720, format: "mp4" } }),
		}).catch(() => {
			// Surfaced via the next poll tick's status flip to "failed" —
			// nothing else to do with a request-to-start-transcoding failure.
		});
	}, [data, requested, mp4Requested]);

	function contentUrlFor(id: string): string {
		return `/api/v1/${projectId}/${id}${query}`;
	}

	if (error) {
		return (
			<EmbedMessage>
				This video isn't available — the link may be private or have expired.
			</EmbedMessage>
		);
	}

	if (mp4?.status !== "ready") {
		return (
			<EmbedMessage>
				{mp4?.status === "failed" ? "This video could not be processed." : "Preparing video…"}
			</EmbedMessage>
		);
	}

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-black">
			{/* biome-ignore lint/a11y/useMediaCaption: subtitle tracks are added below when the video actually has any attached — nothing to require when it doesn't. */}
			<video controls className="max-h-full max-w-full">
				<source src={contentUrlFor(mp4.id)} type="video/mp4" />
				{webm && <source src={contentUrlFor(webm.id)} type="video/webm" />}
				{subtitles.map((subtitle) => (
					<track
						key={subtitle.id}
						kind="subtitles"
						srcLang={subtitle.metadata?.language}
						label={subtitle.metadata?.label ?? subtitle.metadata?.language}
						src={contentUrlFor(subtitle.id)}
					/>
				))}
			</video>
		</div>
	);
}

function EmbedMessage({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-screen w-screen items-center justify-center bg-black text-sm text-white/70">
			{children}
		</div>
	);
}
