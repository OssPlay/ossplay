"use client";

import { FolderPlusIcon, LayoutGridIcon, ListIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { Tippy } from "@/components/ui/tooltip";
import { useDriveActions } from "@/hooks/use-drive-actions";
import { useDriveSelection } from "@/hooks/use-drive-selection";
import useURL from "@/hooks/use-url";
import { useProjectContext } from "@/lib/current-project";
import { cn } from "@/lib/utils";
import type { DriveBrowseResponse } from "@/types/drive";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { CreateFolderDialog } from "./create-folder-dialog";
import { DriveBulkActionBar } from "./drive-bulk-action-bar";
import { DriveGrid } from "./drive-grid";
import { DriveList } from "./drive-list";
import { DriveSkeleton } from "./drive-skeleton";
import { DriveToolbar } from "./drive-toolbar";
import { MoveToDialog } from "./move-to-dialog";
import { SearchBar } from "./search-bar";
import { UploadMenuButton } from "./upload-menu-button";
import { UploadZone, type UploadZoneHandle } from "./upload-zone";

// Shared by both the drive root page and the [folderId] page — same fetch/
// render/action logic either way, `folderId` null = project root.
export function DriveView({ projectId, folderId }: { projectId: string; folderId: string | null }) {
	const { effectiveOrgId } = useProjectContext(projectId);
	const [createFolderOpen, setCreateFolderOpen] = useState(false);
	const [moveToOpen, setMoveToOpen] = useState(false);
	const uploadRef = useRef<UploadZoneHandle>(null);
	const url = useURL();
	const view = url.getQueryParam("view") === "list" ? "list" : "grid";

	// Drive keeps its own SWR key (rather than adopting useServerTable
	// wholesale) since the browse response isn't a single-item-type
	// envelope — but it borrows useServerTable's convention of reading
	// sort/filter state from the URL so it's shareable.
	const sort = url.getQueryParam("sort");
	const order = url.getQueryParam("order");
	const filterType = url.getQueryParam("filter_type");

	// Folders/breadcrumb are read from page 0 only (they're eagerly loaded
	// and unpaginated per the plan — see folders.ts); only childAssets pages
	// across requests, accumulating as `size` grows.
	const getKey = (pageIndex: number, previousPageData: DriveBrowseResponse | null) => {
		if (!effectiveOrgId) return null;
		if (
			previousPageData &&
			previousPageData.childAssets.items.length < previousPageData.childAssets.pageSize
		) {
			return null;
		}
		const params = new URLSearchParams();
		if (folderId) params.set("folderId", folderId);
		if (sort) params.set("sort", sort);
		if (order) params.set("order", order);
		if (filterType) params.set("filter_type", filterType);
		if (pageIndex > 0) params.set("page", String(pageIndex));
		const qs = params.toString();
		return `/organizations/${effectiveOrgId}/projects/${projectId}/drive${qs ? `?${qs}` : ""}`;
	};

	const { data, mutate, isLoading, setSize, isValidating } =
		useSWRInfinite<DriveBrowseResponse>(getKey);

	// A folder navigation or a sort/filter change must restart pagination at
	// page 1 — otherwise a stale `size` from the previous view keeps
	// requesting page indices that don't line up with the new key sequence.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes setSize — it's the setter from useSWRInfinite, not a value this reset should re-run on.
	useEffect(() => {
		setSize(1);
	}, [folderId, sort, order, filterType]);

	// A page index whose getKey resolved to null (past the real last page)
	// still occupies a slot in `data`, as `undefined` — filter those out
	// rather than indexing into them.
	const loadedPages = useMemo(() => (data ?? []).filter((page) => page != null), [data]);
	const firstPage = loadedPages[0];
	const lastPage = loadedPages[loadedPages.length - 1];
	const hasMore = lastPage
		? lastPage.childAssets.items.length >= lastPage.childAssets.pageSize
		: false;
	const assetItems = useMemo(
		() => loadedPages.flatMap((page) => page.childAssets.items),
		[loadedPages],
	);
	const folders = firstPage?.childFolders ?? [];

	// A bare `IntersectionObserver` fires immediately on `observe()` if the
	// node already satisfies the threshold — since the sentinel is often
	// still on-screen right after a page loads, an observer rebuilt on every
	// `size`/`isValidating` change would re-fire before the isValidating
	// flag has a chance to flip, spiking `size` well past the real page
	// count in a single tick. A plain ref (checked-and-set synchronously,
	// not inside a setState updater) closes that race without nesting one
	// setState call inside another's functional updater — the previous
	// version called `setSize` from inside `setLoadingMore`'s updater, which
	// triggered React's "Cannot update a component while rendering a
	// different component" warning. Keeping the observer's own dependency
	// list to just `hasMore` stops it from being torn down and rebuilt on
	// every fetch.
	const [loadingMore, setLoadingMore] = useState(false);
	const loadingMoreRef = useRef(false);
	useEffect(() => {
		if (!isValidating) {
			loadingMoreRef.current = false;
			setLoadingMore(false);
		}
	}, [isValidating]);

	const sentinelRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!hasMore) return;
		const node = sentinelRef.current;
		if (!node) return;
		const observer = new IntersectionObserver((entries) => {
			if (!entries[0]?.isIntersecting) return;
			if (loadingMoreRef.current) return;
			loadingMoreRef.current = true;
			setLoadingMore(true);
			setSize((s) => s + 1);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [hasMore, setSize]);

	// Owned here (not inside DriveGrid/DriveList) so toggling grid/list
	// doesn't reset the current selection. Folders first, then assets —
	// matches both views' render order, which is what shift-range walks.
	const selectionItems = useMemo(
		() => [...folders.map((f) => ({ id: f.id })), ...assetItems.map((a) => ({ id: a.id }))],
		[folders, assetItems],
	);
	const selection = useDriveSelection(selectionItems);

	// A background revalidation (after trash/move/bulk actions call
	// mutate()) can drop ids that were selected — without this, the "N
	// selected" bar keeps counting ids no longer in view.
	useEffect(() => {
		const liveIds = new Set(selectionItems.map((item) => item.id));
		selection.setSelected((prev) => {
			const next = new Set([...prev].filter((id) => liveIds.has(id)));
			return next.size === prev.size ? prev : next;
		});
	}, [selectionItems, selection.setSelected]);

	// Owned here, not inside DriveGrid/DriveList, so the bulk-action bar
	// (which now lives in this component's toolbar row, see below) and both
	// views' per-row context menus share one instance instead of each view
	// duplicating its own `useDriveActions()` call + `MoveToDialog`.
	const driveActions = useDriveActions({
		orgId: effectiveOrgId ?? "",
		projectId,
		folders,
		assets: assetItems,
		selected: selection.selected,
		onRefresh: () => mutate(),
	});

	async function handleBulkTrash() {
		await driveActions.bulkTrash
			.trigger()
			.then(() => {
				selection.clear();
				mutate();
			})
			.catch(() => {});
	}

	if (!effectiveOrgId) return null;

	if (isLoading) {
		return <DriveSkeleton />;
	}

	const breadcrumb = firstPage?.breadcrumb ?? [];

	return (
		<Container size="lg">
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
					<BreadcrumbNav projectId={projectId} breadcrumb={breadcrumb} />
					<div className="flex flex-wrap items-center gap-2">
						<UploadMenuButton
							onUploadFiles={() => uploadRef.current?.openFilePicker()}
							onUploadFolder={() => uploadRef.current?.openFolderPicker()}
						/>
						<Button size="sm" onClick={() => setCreateFolderOpen(true)}>
							<FolderPlusIcon /> New folder
						</Button>
					</div>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{selection.selected.size > 0 ? (
						<DriveBulkActionBar
							count={selection.selected.size}
							onDownload={() => driveActions.downloadSelectionAndOpen(selection.selected)}
							downloadLoading={driveActions.bulkDownload.isLoading}
							onMoveTo={() => setMoveToOpen(true)}
							onTrash={handleBulkTrash}
							trashLoading={driveActions.bulkTrash.isLoading}
						/>
					) : (
						<>
							<SearchBar orgId={effectiveOrgId} projectId={projectId} />
							<DriveToolbar />
							<div className="flex h-8 items-center gap-0.5 rounded-4xl border p-0.5">
								<Tippy content="Grid view">
									<button
										type="button"
										aria-label="Grid view"
										onClick={() => url.setQueryParams({ view: null })}
										className={cn(
											"rounded-full p-1.5 text-muted-foreground hover:text-foreground",
											view === "grid" && "bg-muted text-foreground",
										)}
									>
										<LayoutGridIcon className="size-4" />
									</button>
								</Tippy>
								<Tippy content="List view">
									<button
										type="button"
										aria-label="List view"
										onClick={() => url.setQueryParams({ view: "list" })}
										className={cn(
											"rounded-full p-1.5 text-muted-foreground hover:text-foreground",
											view === "list" && "bg-muted text-foreground",
										)}
									>
										<ListIcon className="size-4" />
									</button>
								</Tippy>
							</div>
						</>
					)}
				</div>
				<UploadZone
					ref={uploadRef}
					orgId={effectiveOrgId}
					projectId={projectId}
					folderId={folderId}
					onUploaded={() => mutate()}
				>
					{view === "list" ? (
						<DriveList
							orgId={effectiveOrgId}
							projectId={projectId}
							folders={folders}
							assets={assetItems}
							selection={selection}
							driveActions={driveActions}
							onMoveTo={() => setMoveToOpen(true)}
							onRefresh={() => mutate()}
						/>
					) : (
						<DriveGrid
							orgId={effectiveOrgId}
							projectId={projectId}
							folders={folders}
							assets={assetItems}
							selection={selection}
							driveActions={driveActions}
							onMoveTo={() => setMoveToOpen(true)}
							onRefresh={() => mutate()}
						/>
					)}
					{hasMore && (
						<div ref={sentinelRef} className="flex justify-center py-4">
							{loadingMore && <p className="text-sm text-muted-foreground">Loading more…</p>}
						</div>
					)}
				</UploadZone>
			</div>
			<CreateFolderDialog
				orgId={effectiveOrgId}
				projectId={projectId}
				parentId={folderId}
				open={createFolderOpen}
				onOpenChange={setCreateFolderOpen}
				onCreated={() => mutate()}
			/>
			<MoveToDialog
				orgId={effectiveOrgId}
				projectId={projectId}
				open={moveToOpen}
				onOpenChange={setMoveToOpen}
				onSelectFolder={(target) => driveActions.moveItemsAndRefresh(selection.selected, target)}
			/>
		</Container>
	);
}
