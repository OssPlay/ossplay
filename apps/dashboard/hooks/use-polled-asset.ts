"use client";

import useSWR from "swr";
import type { DriveAsset } from "@/types/drive";

const POLL_INTERVAL_MS = 1500;

// Thin useSWR wrapper for watching a single asset through
// processing -> ready/failed — built once, not hand-rolled per call site,
// since a `setInterval` poll is exactly the kind of easy-to-get-wrong
// repetition (miscleared intervals, stale closures) this repo's
// abstraction threshold exists to prevent. Used by both the download-as
// flow (an on-demand variant's placeholder row) and, later, bulk zip
// progress — a 2nd use site from day one, not deferred to a 3rd.
export function usePolledAsset(orgId: string | null, projectId: string, assetId: string | null) {
	return useSWR<{ asset: DriveAsset }>(
		orgId && assetId ? `/organizations/${orgId}/projects/${projectId}/assets/${assetId}` : null,
		{
			refreshInterval: (data) =>
				data && (data.asset.status === "ready" || data.asset.status === "failed")
					? 0
					: POLL_INTERVAL_MS,
		},
	);
}
