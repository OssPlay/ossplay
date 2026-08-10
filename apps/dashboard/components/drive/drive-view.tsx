"use client";

import { useState } from "react";
import useSWR from "swr";
import Container from "@/components/ui/container";
import { useProjectContext } from "@/lib/current-project";
import type { DriveBrowseResponse } from "@/types/drive";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { CreateFolderDialog } from "./create-folder-dialog";
import { DriveGrid } from "./drive-grid";
import { SearchBar } from "./search-bar";
import { UploadZone } from "./upload-zone";

// Shared by both the drive root page and the [folderId] page — same fetch/
// render/action logic either way, `folderId` null = project root.
export function DriveView({ projectId, folderId }: { projectId: string; folderId: string | null }) {
	const { effectiveOrgId } = useProjectContext(projectId);
	const [createFolderOpen, setCreateFolderOpen] = useState(false);

	const { data, mutate, isLoading } = useSWR<DriveBrowseResponse>(
		effectiveOrgId
			? `/organizations/${effectiveOrgId}/projects/${projectId}/drive${folderId ? `?folderId=${folderId}` : ""}`
			: null,
	);

	if (!effectiveOrgId) return null;

	return (
		<Container
			header={{
				title: "Drive",
				description: "Browse, upload, and manage this project's files.",
				action: { title: "New folder", onClick: () => setCreateFolderOpen(true) },
			}}
			size="lg"
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<BreadcrumbNav projectId={projectId} breadcrumb={data?.breadcrumb ?? []} />
					<SearchBar orgId={effectiveOrgId} projectId={projectId} />
				</div>
				<UploadZone
					orgId={effectiveOrgId}
					projectId={projectId}
					folderId={folderId}
					onUploaded={() => mutate()}
				/>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<DriveGrid
						orgId={effectiveOrgId}
						projectId={projectId}
						folders={data?.childFolders ?? []}
						assets={data?.childAssets.items ?? []}
						onRefresh={() => mutate()}
					/>
				)}
			</div>
			<CreateFolderDialog
				orgId={effectiveOrgId}
				projectId={projectId}
				parentId={folderId}
				open={createFolderOpen}
				onOpenChange={setCreateFolderOpen}
				onCreated={() => mutate()}
			/>
		</Container>
	);
}
