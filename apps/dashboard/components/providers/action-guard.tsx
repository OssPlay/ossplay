"use client";

import { useEffect } from "react";
import { useActiveActionCount } from "@/lib/action-store";

// Mounted once (see components/providers.tsx). No markup of its own — just
// keeps a beforeunload listener registered for as long as any useAction
// call is in flight, so closing/reloading/navigating away from the tab
// shows the browser's native "leave site?" confirmation instead of
// silently cutting off an in-progress action.
export function ActionGuard() {
	const activeCount = useActiveActionCount();

	useEffect(() => {
		if (activeCount === 0) return;

		function handleBeforeUnload(event: BeforeUnloadEvent) {
			event.preventDefault();
		}

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [activeCount]);

	return null;
}
