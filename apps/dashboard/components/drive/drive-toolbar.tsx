"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
				<DropdownMenuTrigger
					render={
						<Button variant="outline" size="sm">
							{order === "desc" ? <ArrowDownIcon /> : <ArrowUpIcon />}
							{sortLabel}
							<ChevronDownIcon />
						</Button>
					}
				/>
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
					<Button
						key={filter.key}
						type="button"
						size="sm"
						variant={activeType === filter.key ? "secondary" : "outline"}
						onClick={() =>
							url.setQueryParams({
								filter_type: activeType === filter.key ? null : filter.key,
								page: null,
							})
						}
					>
						{filter.label}
					</Button>
				))}
			</div>
		</div>
	);
}
