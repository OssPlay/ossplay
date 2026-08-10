export interface DriveFolder {
	id: string;
	projectId: string;
	parentId: string | null;
	name: string;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface DriveAsset {
	id: string;
	projectId: string;
	folderId: string | null;
	filename: string;
	mimeType: string;
	s3Path: string;
	size: number | null;
	status: "pending" | "processing" | "ready" | "failed";
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
	// The worker-generated thumbnail variant's id, if one exists — only
	// present on the drive-browse response (apps/api/src/routes/folders.ts's
	// attachThumbnails), null on responses that don't attach it (trash,
	// single-asset fetch).
	thumbnailAssetId?: string | null;
}

export interface DriveBrowseResponse {
	folder: DriveFolder | null;
	breadcrumb: DriveFolder[];
	childFolders: DriveFolder[];
	childAssets: { items: DriveAsset[]; total: number; page: number; pageSize: number };
}

export interface DriveActivityEntry {
	id: string;
	action: "uploaded" | "renamed" | "moved" | "trashed" | "restored";
	fromValue: string | null;
	toValue: string | null;
	createdAt: string;
	actorName: string | null;
	actorEmail: string | null;
}
