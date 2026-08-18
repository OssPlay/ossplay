import ErrorBoundary from "@/components/layout/error-boundary";

// Reached via notFound() in file/[assetId]/page.tsx when a shared/bookmarked
// file link's asset no longer exists (deleted, or never did).
export default function ProjectNotFound() {
	return <ErrorBoundary description="This file doesn't exist, or was deleted." />;
}
