"use client";

import { ArrowUpIcon, FolderIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import type { DriveBrowseResponse } from "@/types/drive";

// A searchable folder picker for the "Move to…" action — navigates the
// same browse endpoint the main Drive view uses, one level at a time,
// rather than fetching a full folder tree up front. Also the drop-target
// fallback for keyboard/accessibility users who can't drag a card.
export function MoveToDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	onSelectFolder,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectFolder: (folderId: string | null) => void;
}) {
	const [folderId, setFolderId] = useState<string | null>(null);

	const { data } = useSWR<DriveBrowseResponse>(
		open
			? `/organizations/${orgId}/projects/${projectId}/drive${folderId ? `?folderId=${folderId}` : ""}`
			: null,
	);

	function handleOpenChange(next: boolean) {
		if (!next) setFolderId(null);
		onOpenChange(next);
	}

	function confirm(target: string | null) {
		onSelectFolder(target);
		handleOpenChange(false);
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			title="Move to…"
			description="Choose a destination folder"
		>
			<Command>
				<CommandInput placeholder="Search folders…" />
				<CommandList>
					<CommandEmpty>No folders here</CommandEmpty>
					<CommandGroup>
						<CommandItem onSelect={() => confirm(folderId)}>
							<FolderIcon /> Move to &ldquo;{data?.folder?.name ?? "Root"}&rdquo;
						</CommandItem>
						{data?.folder && (
							<CommandItem onSelect={() => setFolderId(data.folder?.parentId ?? null)}>
								<ArrowUpIcon /> Up one level
							</CommandItem>
						)}
						{data?.childFolders.map((folder) => (
							<CommandItem key={folder.id} onSelect={() => setFolderId(folder.id)}>
								<FolderIcon /> {folder.name}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
