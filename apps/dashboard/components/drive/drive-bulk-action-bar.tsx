"use client";

import { DownloadIcon, FolderInputIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tippy } from "@/components/ui/tooltip";

// Fills the same row the search/sort/filter/view-toggle toolbar sits in
// (see drive-view.tsx) whenever something is selected — swapped in place,
// not appended above it, so selecting an item never pushes the grid/list
// down.
export function DriveBulkActionBar({
	count,
	onDownload,
	downloadLoading,
	onMoveTo,
	onTrash,
	trashLoading,
}: {
	count: number;
	onDownload: () => void;
	downloadLoading: boolean;
	onMoveTo: () => void;
	onTrash: () => void;
	trashLoading: boolean;
}) {
	return (
		<div className="flex w-full items-center gap-2">
			<span className="text-sm text-muted-foreground">{count} selected</span>
			<div className="ml-auto flex items-center gap-1">
				<Tippy content="Download">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onDownload}
						disabled={downloadLoading}
						aria-label="Download"
					>
						<DownloadIcon />
					</Button>
				</Tippy>
				<Tippy content="Move to…">
					<Button variant="ghost" size="icon-sm" onClick={onMoveTo} aria-label="Move to…">
						<FolderInputIcon />
					</Button>
				</Tippy>
				<Tippy content="Move to trash">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onTrash}
						disabled={trashLoading}
						aria-label="Move to trash"
						className="text-destructive hover:text-destructive"
					>
						<Trash2Icon />
					</Button>
				</Tippy>
			</div>
		</div>
	);
}
