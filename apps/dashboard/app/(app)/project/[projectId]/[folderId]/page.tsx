"use client";

import { useParams } from "next/navigation";
import { DriveView } from "@/components/drive/drive-view";

// Safe as a sibling of the static `settings`/`trash`/`file` segments —
// Next.js matches static path segments before a dynamic one, and a real
// folder id (uuid) can never collide with those literal strings anyway.
export default function ProjectDriveFolderPage() {
	const { projectId, folderId } = useParams<{ projectId: string; folderId: string }>();
	return <DriveView projectId={projectId} folderId={folderId} />;
}
