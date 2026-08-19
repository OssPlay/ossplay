import Container from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

// Mirrors DriveView's real (header-less) layout — a breadcrumb+actions row,
// a search/toolbar row, then either a grid of cards or a table of rows
// depending on which view is currently active — so loading doesn't cause
// the jump a generic `ContainerSkeleton` (shaped for Container's icon/title
// header, which Drive no longer uses) would produce, and switching views
// doesn't flash the wrong shape while the next page loads.
export function DriveSkeleton({ view = "grid" }: { view?: "grid" | "list" }) {
	return (
		<Container size="lg">
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-3 border-b pb-4">
					<div className="flex items-center gap-2">
						<Skeleton className="size-4 rounded" />
						<Skeleton className="h-4 w-16" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-8 w-20 rounded-4xl" />
						<Skeleton className="h-8 w-28 rounded-4xl" />
					</div>
				</div>
				<div className="flex items-center justify-end gap-2">
					<Skeleton className="h-8 w-37.5 rounded-4xl lg:w-62.5" />
					<Skeleton className="h-8 w-24 rounded-4xl" />
					<Skeleton className="h-8 w-20 rounded-4xl" />
					<Skeleton className="h-8 w-16 rounded-4xl" />
				</div>
				{view === "list" ? <ListSkeleton /> : <GridSkeleton />}
			</div>
		</Container>
	);
}

function GridSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{Array.from({ length: 10 }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
				<Skeleton key={`card-${i}`} className="aspect-square rounded-2xl" />
			))}
		</div>
	);
}

// Same column set as drive-list.tsx's real header (Name/Size/Modified/the
// "…" actions column), so the skeleton-to-real-content swap doesn't shift
// the layout.
function ListSkeleton() {
	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead className="text-right">Size</TableHead>
						<TableHead className="text-right">Modified</TableHead>
						<TableHead className="w-10" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{Array.from({ length: 8 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
						<TableRow key={`row-${i}`}>
							<TableCell className="flex items-center gap-3">
								<Skeleton className="size-4 shrink-0 rounded" />
								<Skeleton className="h-4 w-48" />
							</TableCell>
							<TableCell className="text-right">
								<Skeleton className="ml-auto h-4 w-12" />
							</TableCell>
							<TableCell className="text-right">
								<Skeleton className="ml-auto h-4 w-24" />
							</TableCell>
							<TableCell />
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
