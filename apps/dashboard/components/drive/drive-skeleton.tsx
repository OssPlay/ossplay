import Container from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors DriveView's real (header-less) layout — a breadcrumb+actions row,
// a search/toolbar row, then a grid of cards — so loading doesn't cause the
// jump a generic `ContainerSkeleton` (shaped for Container's icon/title
// header, which Drive no longer uses) would produce.
export function DriveSkeleton() {
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
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{Array.from({ length: 10 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
						<Skeleton key={`card-${i}`} className="aspect-square rounded-2xl" />
					))}
				</div>
			</div>
		</Container>
	);
}
