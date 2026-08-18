"use client";

import ErrorBoundary from "@/components/layout/error-boundary";

export default function ProjectError({
	error,
	unstable_retry,
}: {
	error: Error;
	unstable_retry: () => void;
}) {
	return <ErrorBoundary error={error} actions={[{ text: "Try again", onClick: unstable_retry }]} />;
}
