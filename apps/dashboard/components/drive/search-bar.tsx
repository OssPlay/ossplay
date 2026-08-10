"use client";

import { FolderIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import type { DriveAsset, DriveFolder } from "@/types/drive";

// Plain ilike for now (apps/api/src/routes/assets.ts's GET /search) —
// upgraded to trigram-ranked matching once Phase 5's pg_trgm migration
// lands, with no change needed here.
export function SearchBar({ orgId, projectId }: { orgId: string; projectId: string }) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [focused, setFocused] = useState(false);

	const { data } = useSWR<{ folders: DriveFolder[]; assets: DriveAsset[] }>(
		query.trim()
			? `/organizations/${orgId}/projects/${projectId}/search?q=${encodeURIComponent(query.trim())}`
			: null,
	);

	const showResults = focused && query.trim().length > 0;
	const hasResults = (data?.folders.length ?? 0) > 0 || (data?.assets.length ?? 0) > 0;

	return (
		<div className="relative w-full max-w-xs">
			<div className="relative">
				<SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setFocused(true)}
					onBlur={() => setTimeout(() => setFocused(false), 150)}
					placeholder="Search this project…"
					className="pl-8"
				/>
			</div>
			{showResults && (
				<div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
					{!hasResults ? (
						<p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
					) : (
						<>
							{data?.folders.map((folder) => (
								<button
									key={folder.id}
									type="button"
									onClick={() => {
										router.push(`/project/${projectId}/${folder.id}`);
										setQuery("");
									}}
									className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
								>
									<FolderIcon className="size-3.5 text-muted-foreground" /> {folder.name}
								</button>
							))}
							{data?.assets.map((asset) => (
								<button
									key={asset.id}
									type="button"
									onClick={() => {
										router.push(`/project/${projectId}/file/${asset.id}`);
										setQuery("");
									}}
									className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
								>
									{asset.filename}
								</button>
							))}
						</>
					)}
				</div>
			)}
		</div>
	);
}
