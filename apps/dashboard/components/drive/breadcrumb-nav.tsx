import { HardDriveIcon } from "lucide-react";
import Link from "next/link";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { DriveFolder } from "@/types/drive";

// Built from the browse endpoint's own `breadcrumb` array (root -> self),
// never parsed out of the URL — the URL only ever carries the *current*
// folder's id (see the plan's routing decision), so ancestry always comes
// from the API, not client-side path-splitting.
export function BreadcrumbNav({
	projectId,
	breadcrumb,
}: {
	projectId: string;
	breadcrumb: DriveFolder[];
}) {
	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					{breadcrumb.length === 0 ? (
						<BreadcrumbPage className="flex items-center gap-1.5">
							<HardDriveIcon className="size-3.5" />
							Drive
						</BreadcrumbPage>
					) : (
						<BreadcrumbLink
							render={
								<Link href={`/project/${projectId}`} className="flex items-center gap-1.5">
									<HardDriveIcon className="size-3.5" />
									Drive
								</Link>
							}
						/>
					)}
				</BreadcrumbItem>
				{breadcrumb.map((folder, index) => {
					const isLast = index === breadcrumb.length - 1;
					return (
						<span key={folder.id} className="contents">
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								{isLast ? (
									<BreadcrumbPage>{folder.name}</BreadcrumbPage>
								) : (
									<BreadcrumbLink
										render={<Link href={`/project/${projectId}/${folder.id}`}>{folder.name}</Link>}
									/>
								)}
							</BreadcrumbItem>
						</span>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
