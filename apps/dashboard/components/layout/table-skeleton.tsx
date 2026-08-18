import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

// Drop-in replacement for a <TableBody>'s real rows while data is loading —
// matches the real table's column count so the header doesn't reflow.
export default function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
	return (
		<>
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
				<TableRow key={`row-${i}`}>
					{Array.from({ length: columns }, (_, j) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
						<TableCell key={`cell-${j}`}>
							<Skeleton className="h-4 w-full max-w-40" />
						</TableCell>
					))}
				</TableRow>
			))}
		</>
	);
}
