import ErrorBoundary from "@/components/layout/error-boundary";

export default function OrganizationDetailNotFound() {
	return <ErrorBoundary description="This organization doesn't exist, or was deleted." />;
}
