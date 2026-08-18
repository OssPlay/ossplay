"use client";

import { RefreshCwIcon } from "lucide-react";
import React from "react";
import ErrorBoundary from "@/components/layout/error-boundary";
import { apiFetch } from "@/lib/api";

type ReportKind = "render" | "unhandledrejection";

// Fire-and-forget: reporting a crash must never itself throw and cause a
// second one. apiFetch already resolves to undefined on a 204, and the
// endpoint (apps/api/src/routes/client-errors.ts) is deliberately built to
// never respond with anything else — this catch is just the client-side
// half of that same guarantee (e.g. the network being down entirely).
function reportClientError(error: Error, kind: ReportKind): void {
	apiFetch("/client-errors", {
		method: "POST",
		body: JSON.stringify({
			message: error.message || String(error),
			stack: error.stack,
			path: typeof window !== "undefined" ? window.location.pathname : undefined,
			kind,
		}),
	}).catch(() => {
		// Swallow — see comment above.
	});
}

interface State {
	error: Error | null;
}

// The one REAL error boundary in the app — componentDidCatch/
// getDerivedStateFromError only exist on class components, there's no hooks
// equivalent (see React docs). Distinct from components/layout/error-
// boundary.tsx, which is just the fallback UI, invoked manually today from
// already-caught SWR errors (api-loader.tsx, auth-provider.tsx). This
// actually catches render-phase exceptions anywhere below it in the tree,
// reports them to the instance error log via POST /client-errors, and
// reuses that same fallback UI to display them. Also doubles as the mount
// point for the window "unhandledrejection" listener — (app)/layout.tsx
// (its only mount site) persists across client-side navigation, so this
// still only attaches once per page load, not once per route.
export class RenderErrorBoundary extends React.Component<React.PropsWithChildren, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error): void {
		reportClientError(error, "render");
	}

	componentDidMount(): void {
		window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
	}

	componentWillUnmount(): void {
		window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
	}

	handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
		const reason: unknown = event.reason;
		const error = reason instanceof Error ? reason : new Error(String(reason));
		reportClientError(error, "unhandledrejection");
	};

	handleReload = (): void => {
		window.location.reload();
	};

	render(): React.ReactNode {
		const { error } = this.state;
		if (error) {
			return (
				<div className="flex flex-col items-center justify-center flex-1 p-8">
					<ErrorBoundary
						error={error}
						description="Something went wrong while rendering this page."
						actions={[{ text: "Reload", icon: RefreshCwIcon, onClick: this.handleReload }]}
					/>
				</div>
			);
		}
		return this.props.children;
	}
}

export default RenderErrorBoundary;
