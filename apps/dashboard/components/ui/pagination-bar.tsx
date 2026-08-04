"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50];

export interface PaginationBarProps {
	page: number;
	totalPages: number;
	pageSize: number;
	pageSizeOptions?: number[];
	totalCount: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
}

export function PaginationBar({
	page,
	totalPages,
	pageSize,
	pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
	totalCount,
	onPageChange,
	onPageSizeChange,
}: PaginationBarProps) {
	const start = totalCount === 0 ? 0 : page * pageSize + 1;
	const end = Math.min(totalCount, (page + 1) * pageSize);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<span>{totalCount === 0 ? "No results" : `${start}–${end} of ${totalCount}`}</span>
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<span>Rows per page</span>
					<Select
						value={String(pageSize)}
						onValueChange={(value) => onPageSizeChange(Number(value))}
					>
						<SelectTrigger size="sm" className="w-18">
							<SelectValue
								items={pageSizeOptions.map((size) => ({ value: String(size), label: size }))}
							/>
						</SelectTrigger>
						<SelectContent>
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={page === 0}
						onClick={() => onPageChange(page - 1)}
						aria-label="Previous page"
					>
						<ChevronLeftIcon />
					</Button>
					<span>
						Page {totalCount === 0 ? 0 : page + 1} of {totalPages}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={page >= totalPages - 1}
						onClick={() => onPageChange(page + 1)}
						aria-label="Next page"
					>
						<ChevronRightIcon />
					</Button>
				</div>
			</div>
		</div>
	);
}
