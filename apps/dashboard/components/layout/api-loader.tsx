import { LoaderCircleIcon } from "lucide-react";
import type React from "react";
import ErrorBoundary from "./error-boundary";

export default function ApiLoader({
	isLoading,
	error,
	skeleton,
	children,
}: React.PropsWithChildren<{
	isLoading: boolean;
	error?: unknown;
	/** Content-shaped placeholder (e.g. ContainerSkeleton) shown instead of the generic spinner while loading. */
	skeleton?: React.ReactNode;
}>) {
	if (isLoading) {
		if (skeleton) return skeleton;
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
