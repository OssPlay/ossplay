"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { emitAssetStatus } from "@/lib/asset-status-events";

// Mirrors packages/core/src/events/channel.ts's AppEvent union by hand
// rather than importing it — this app deliberately doesn't depend on
// @ossplay/core (see asset-preview.tsx's NATIVELY_PLAYABLE_VIDEO_MIMETYPES
// comment: its barrel re-exports Node-only storage drivers a client bundle
// shouldn't pull in for a couple of type-only shapes).
type AppEvent =
	| { type: "asset.status"; projectId: string; assetId: string; status: string }
	| { type: "notification"; userId: string };

// One EventSource per authenticated session, not one per component that
// wants live updates — every polling site (usePolledAsset, asset-preview.tsx
// x2, add-audio-track-dialog.tsx, drive-view.tsx, the notification bell)
// keeps its own SWR key and its own (now much coarser) refreshInterval
// fallback as a safety net. For a plain useSWR key, this calls the shared
// cache's mutate() directly — SWR keys here are the same un-prefixed path
// strings apiFetch takes (see lib/api.ts), so mutate() needs no /api prefix.
// drive-view.tsx's listing is useSWRInfinite, which global mutate() can't
// reach at all (see lib/asset-status-events.ts) — that one goes out as a
// same-tab CustomEvent instead, for the component itself to act on.
export function SseConnection() {
	const { mutate } = useSWRConfig();

	// biome-ignore lint/correctness/useExhaustiveDependencies: mutate is SWR's stable global mutate, not a value this effect should reconnect on.
	useEffect(() => {
		const source = new EventSource("/api/events");

		source.onmessage = (message) => {
			let event: AppEvent;
			try {
				event = JSON.parse(message.data);
			} catch {
				return;
			}

			if (event.type === "asset.status") {
				const { projectId, assetId, status } = event;
				mutate(
					(key) =>
						typeof key === "string" && key.includes(`/projects/${projectId}/assets/${assetId}`),
				);
				// Drive's listing is a useSWRInfinite list — global mutate() can't
				// reach it (see lib/asset-status-events.ts's comment); re-broadcast
				// as a same-tab event so drive-view.tsx can revalidate itself with
				// its own useSWRInfinite-returned mutate instead.
				emitAssetStatus({ projectId, assetId, status });
			} else if (event.type === "notification") {
				mutate("/notifications/unread-count");
				mutate((key) => typeof key === "string" && key.startsWith("/notifications?"));
			}
		};

		return () => source.close();
	}, []);

	return null;
}
