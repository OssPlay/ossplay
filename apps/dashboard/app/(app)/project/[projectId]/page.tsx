"use client";

import { useParams } from "next/navigation";
import { DriveView } from "@/components/drive/drive-view";

export default function ProjectDriveRootPage() {
	const { projectId } = useParams<{ projectId: string }>();
	return <DriveView projectId={projectId} folderId={null} />;
}
