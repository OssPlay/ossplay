"use client";

import { FolderIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { DriveAsset, DriveFolder } from "@/types/drive";

// Same debounce delay as useServerTable's search input
// (hooks/use-server-table.ts) — kept local rather than importing that
// constant since this isn't wired through useServerTable.
const SEARCH_DEBOUNCE_MS = 300;

// Trigram-ranked (apps/api/src/routes/assets.ts's GET /search).
export function SearchBar({ orgId, projectId }: { orgId: string; projectId: string }) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [focused, setFocused] = useState(false);
	const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

	const { data } = useSWR<{ folders: DriveFolder[]; assets: DriveAsset[] }>(
		debouncedQuery.trim()
			? `/organizations/${orgId}/projects/${projectId}/search?q=${encodeURIComponent(debouncedQuery.trim())}`
			: null,
	);

	const showResults = focused && query.trim().length > 0;
	const hasResults = (data?.folders.length ?? 0) > 0 || (data?.assets.length ?? 0) > 0;

	return (
		<div className="relative w-37.5 lg:w-62.5">
			<div className="relative">
				<SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setFocused(true)}
					onBlur={() => setTimeout(() => setFocused(false), 150)}
					placeholder="Search this project…"
					className="h-8 pl-8"
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
										router.push(`/project/${projectId}/open?id=${asset.id}`);
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
