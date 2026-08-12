"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useURL from "@/hooks/use-url";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
	{ key: "name", label: "Name" },
	{ key: "size", label: "Size" },
	{ key: "updatedAt", label: "Modified" },
	{ key: "createdAt", label: "Uploaded" },
] as const;

const TYPE_FILTERS = [
	{ key: "image", label: "Images" },
	{ key: "video", label: "Video" },
	{ key: "audio", label: "Audio" },
	{ key: "pdf", label: "PDF" },
] as const;

// Sort/filter apply to the assets list only — folders stay eagerly loaded
// and alphabetical (no size/mimeType column to sort by, and a folder count
// per directory is typically small enough that pagination doesn't matter).
export function DriveToolbar() {
	const url = useURL();
	const sort = url.getQueryParam("sort") ?? "name";
	const order = url.getQueryParam("order") === "desc" ? "desc" : "asc";
	const activeType = url.getQueryParam("filter_type");
	const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Name";

	return (
		<div className="flex flex-wrap items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">
					{order === "desc" ? (
						<ArrowDownIcon className="size-3.5" />
					) : (
						<ArrowUpIcon className="size-3.5" />
					)}
					{sortLabel}
					<ChevronDownIcon className="size-3.5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					</DropdownMenuGroup>
					<DropdownMenuRadioGroup
						value={sort}
						onValueChange={(value) =>
							url.setQueryParams({ sort: value === "name" ? null : String(value), page: null })
						}
					>
						{SORT_OPTIONS.map((option) => (
							<DropdownMenuRadioItem key={option.key} value={option.key}>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup
						value={order}
						onValueChange={(value) =>
							url.setQueryParams({ order: value === "asc" ? null : String(value), page: null })
						}
					>
						<DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="flex flex-wrap items-center gap-1">
				{TYPE_FILTERS.map((filter) => (
					<button
						key={filter.key}
						type="button"
						onClick={() =>
							url.setQueryParams({
								filter_type: activeType === filter.key ? null : filter.key,
								page: null,
							})
						}
						className={cn(
							"rounded-full border px-2.5 py-1 text-xs",
							activeType === filter.key
								? "border-primary bg-primary/10 text-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{filter.label}
					</button>
				))}
			</div>
		</div>
	);
}
