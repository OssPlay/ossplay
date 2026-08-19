"use client";

import { useEffect } from "react";
import useURL from "@/hooks/use-url";
import { MODAL_REGISTRY } from "@/lib/modal-router";

// Lets a URL like /?modal=update-instance open a specific dialog on load —
// e.g. a link from an email notification. Strips the param immediately
// after triggering so refresh/back doesn't repeat it and it doesn't linger
// in the address bar.
export function ModalRouter() {
	const url = useURL();
	const modal = url.getQueryParam("modal");

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `url` — see hooks/use-server-table.ts's identical pattern (a fresh object every render).
	useEffect(() => {
		if (!modal) return;
		const open = MODAL_REGISTRY[modal];
		if (open) open();
		url.setQueryParams({ modal: null });
	}, [modal]);

	return null;
}
