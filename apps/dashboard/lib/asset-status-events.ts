// A tiny same-tab pub/sub for "an asset's status changed," re-broadcast from
// providers/sse-connection.tsx's single EventSource. Exists specifically
// because SWR's global mutate(keyMatcher) can't revalidate a
// useSWRInfinite-backed list: SWR deliberately skips its synthetic
// `$inf$...` cache key for matcher-based mutation (see
// node_modules/swr/dist/_internal — internalMutate's
// `!/^\$(inf|sub)\$/.test(key)` check), and the individual per-page cache
// entries it also writes have no real revalidator attached (useSWRInfinite
// never mounts a real useSWR() per page — it manages them by hand). Only a
// component holding its own useSWRInfinite-returned `mutate` can correctly
// revalidate itself; this is how an outside event reaches it.
export interface AssetStatusDetail {
	projectId: string;
	assetId: string;
	status: string;
}

const EVENT_NAME = "ossplay:asset-status";

export function emitAssetStatus(detail: AssetStatusDetail): void {
	window.dispatchEvent(new CustomEvent<AssetStatusDetail>(EVENT_NAME, { detail }));
}

// Returns an unsubscribe function — call from a useEffect cleanup.
export function onAssetStatus(handler: (detail: AssetStatusDetail) => void): () => void {
	const listener = (e: Event) => handler((e as CustomEvent<AssetStatusDetail>).detail);
	window.addEventListener(EVENT_NAME, listener);
	return () => window.removeEventListener(EVENT_NAME, listener);
}
