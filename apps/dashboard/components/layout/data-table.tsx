"use client";

import type { VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, type buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DataTableFacetedFilter,
	type DataTableFacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ServerTable } from "@/hooks/use-server-table";
import { formatDatetime } from "@/lib/utils";

const formatters = {
	datetime: (value: unknown) => <span>{formatDatetime(value as string | number | Date)}</span>,
	code: (value: unknown) => <code className="text-xs">{String(value)}</code>,
} satisfies Record<string, (value: unknown) => React.ReactNode>;

export interface DataTableColumn<TItem> {
	/** The field this column reads by default (via `formatter`, or plain `String()`). */
	key: Extract<keyof TItem, string>;
	title: string;
	/** Overrides the default cell render entirely — `formatter` is ignored when set. */
	cell?: (row: TItem) => React.ReactNode;
	formatter?: keyof typeof formatters;
	className?: string;
}

export interface DataTableFacet {
	/** Matches the BE `filters` config key for this column → `filter_<key>`. */
	key: string;
	title: string;
	options: DataTableFacetedFilterOption[];
}

export interface DataTableBulkAction<TItem> {
	label: string;
	icon?: LucideIcon;
	variant?: VariantProps<typeof buttonVariants>["variant"];
	onClick: (selected: TItem[]) => void | Promise<void>;
	/** When set, clicking the action opens a confirm dialog instead of firing `onClick` immediately. */
	confirm?: { title: string; description: string };
}

export interface DataTableProps<TItem> {
	table: ServerTable<TItem>;
	rowId: (row: TItem) => string;
	columns: DataTableColumn<TItem>[];
	/** Per-row trailing cell (e.g. a "Manage"/"Delete" button) — kept separate from `columns` rather than a magic `"action"` column id. */
	rowActions?: (row: TItem) => React.ReactNode;
	/** Makes rows clickable (e.g. opening a detail dialog) — the row itself, not a dedicated column. */
	onRowClick?: (row: TItem) => void;
	facets?: DataTableFacet[];
	bulkActions?: DataTableBulkAction<TItem>[];
	searchPlaceholder?: string;
	emptyTitle?: string;
	emptyDescription?: string;
}

// The shared table shell: search + faceted filters + optional multi-select
// bulk-action bar + empty/loading states + pagination footer, all driven by
// a `ServerTable` (see hooks/use-server-table.ts). A page only declares
// columns and what its rows look like — it doesn't re-derive any of this.
export function DataTable<TItem>({
	table,
	rowId,
	columns,
	rowActions,
	onRowClick,
	facets = [],
	bulkActions = [],
	searchPlaceholder = "Search…",
	emptyTitle = "No results",
	emptyDescription,
}: DataTableProps<TItem>) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkActionLoading, setBulkActionLoading] = useState(false);
	const [confirmAction, setConfirmAction] = useState<DataTableBulkAction<TItem> | null>(null);
	const rowIds = useMemo(() => table.items.map(rowId), [table.items, rowId]);
	const rowIdsKey = rowIds.join(",");

	// Selection tracks the currently-visible page — any change to which rows
	// are on screen (page/filter/search change, or a refetch after a bulk
	// action mutates data) invalidates it, rather than risk acting on rows
	// that are no longer shown.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on rowIdsKey only, not the rowIds array/rowId callback identity.
	useEffect(() => {
		setSelected(new Set());
	}, [rowIdsKey]);

	const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
	const someSelected = selected.size > 0 && !allSelected;

	function toggleAll(checked: boolean) {
		setSelected(checked ? new Set(rowIds) : new Set());
	}

	function toggleRow(id: string, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	async function runBulkAction(action: DataTableBulkAction<TItem>) {
		const selectedItems = table.items.filter((item) => selected.has(rowId(item)));
		setBulkActionLoading(true);
		try {
			await action.onClick(selectedItems);
			setSelected(new Set());
		} finally {
			setBulkActionLoading(false);
		}
	}

	function handleBulkActionClick(action: DataTableBulkAction<TItem>) {
		if (action.confirm) {
			setConfirmAction(action);
			return;
		}
		runBulkAction(action);
	}

	async function handleConfirm() {
		if (!confirmAction) return;
		await runBulkAction(confirmAction);
		setConfirmAction(null);
	}

	const columnCount = columns.length + (bulkActions.length > 0 ? 1 : 0) + (rowActions ? 1 : 0);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<InputGroup className="h-8 w-37.5 lg:w-62.5">
					<InputGroupAddon>
						<SearchIcon />
					</InputGroupAddon>
					<InputGroupInput
						placeholder={searchPlaceholder}
						value={table.search}
						onChange={(e) => table.setSearch(e.target.value)}
					/>
				</InputGroup>
				{facets.map((facet) => (
					<DataTableFacetedFilter
						key={facet.key}
						title={facet.title}
						options={facet.options}
						value={table.getFilter(facet.key)}
						onChange={(values) => table.setFilter(facet.key, values)}
					/>
				))}
				{table.hasActiveFilters && (
					<Button variant="ghost" size="sm" onClick={table.resetFilters}>
						Reset
					</Button>
				)}
			</div>

			{bulkActions.length > 0 && selected.size > 0 && (
				<div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
					<span className="px-2 text-sm text-muted-foreground">{selected.size} selected</span>
					{bulkActions.map((action) => (
						<Button
							key={action.label}
							size="sm"
							variant={action.variant ?? "secondary"}
							disabled={bulkActionLoading}
							onClick={() => handleBulkActionClick(action)}
						>
							{action.icon && <action.icon />}
							{action.label}
						</Button>
					))}
				</div>
			)}

			<AlertDialog
				open={confirmAction !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmAction(null);
				}}
			>
				{confirmAction?.confirm && (
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{confirmAction.confirm.title}</AlertDialogTitle>
							<AlertDialogDescription>{confirmAction.confirm.description}</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								variant={confirmAction.variant ?? "secondary"}
								disabled={bulkActionLoading}
								onClick={handleConfirm}
							>
								{confirmAction.label}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				)}
			</AlertDialog>

			<div className="overflow-hidden border rounded-md">
				<Table>
					<TableHeader>
						<TableRow>
							{bulkActions.length > 0 && (
								<TableHead className="w-10">
									<Checkbox
										checked={allSelected}
										indeterminate={someSelected}
										onCheckedChange={(checked) => toggleAll(checked)}
										aria-label="Select all"
										disabled={rowIds.length === 0}
									/>
								</TableHead>
							)}
							{columns.map((column) => (
								<TableHead key={column.key} className={column.className}>
									{column.title}
								</TableHead>
							))}
							{rowActions && <TableHead className="w-10" />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{table.isLoading ? (
							<TableRow>
								<TableCell
									colSpan={columnCount}
									className="h-24 text-sm text-center text-muted-foreground"
								>
									Loading…
								</TableCell>
							</TableRow>
						) : table.items.length === 0 ? (
							<TableRow>
								<TableCell colSpan={columnCount} className="h-24 text-center">
									<p className="text-sm font-medium">{emptyTitle}</p>
									{emptyDescription && (
										<p className="text-sm text-muted-foreground">{emptyDescription}</p>
									)}
								</TableCell>
							</TableRow>
						) : (
							table.items.map((row) => {
								const id = rowId(row);
								return (
									<TableRow
										key={id}
										id={id}
										data-state={selected.has(id) ? "selected" : undefined}
										className={onRowClick ? "cursor-pointer" : undefined}
										onClick={onRowClick ? () => onRowClick(row) : undefined}
									>
										{bulkActions.length > 0 && (
											<TableCell onClick={(e) => e.stopPropagation()}>
												<Checkbox
													checked={selected.has(id)}
													onCheckedChange={(checked) => toggleRow(id, checked)}
													aria-label="Select row"
												/>
											</TableCell>
										)}
										{columns.map((column) => (
											<TableCell key={column.key} className={column.className}>
												{column.cell
													? column.cell(row)
													: column.formatter
														? formatters[column.formatter](row[column.key])
														: String(row[column.key] ?? "")}
											</TableCell>
										))}
										{rowActions && (
											<TableCell
												className="text-right"
												onClick={onRowClick ? (e) => e.stopPropagation() : undefined}
											>
												{rowActions(row)}
											</TableCell>
										)}
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>

			<PaginationBar
				page={table.page}
				totalPages={table.pageCount}
				pageSize={table.pageSize}
				totalCount={table.total}
				onPageChange={table.setPage}
				onPageSizeChange={table.setPageSize}
			/>
		</div>
	);
}
