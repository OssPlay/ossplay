import { LoaderCircleIcon } from "lucide-react";
import type React from "react";
import ErrorBoundary from "./error-boundary";

export default function ApiLoader({
	isLoading,
	error,
	children,
}: React.PropsWithChildren<{
	isLoading: boolean;
	error?: unknown;
}>) {
	if (isLoading) {
		return (
			<div className="min-h-96 flex items-center justify-center">
				<LoaderCircleIcon className="animate-spin size-8" />
			</div>
		);
	}

	if (error) {
		return <ErrorBoundary error={error as Error} />;
	}

	return children;
}
