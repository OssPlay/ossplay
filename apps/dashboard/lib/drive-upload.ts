// A presigned S3 URL is absolute (a different origin — must be fetched
// exactly as given, no /api prefix). LocalDiskStorage's upload target is
// an API-relative route (see packages/core/src/storage/local-disk-storage.ts)
// and needs the same /api prefix apiFetch itself always adds (lib/api.ts) —
// this is the one place that distinction matters, since the raw byte PUT
// below can't go through apiFetch (it always forces
// Content-Type: application/json, wrong for a file body).
function resolveUploadUrl(target: string): string {
	return target.startsWith("http") ? target : `/api${target}`;
}

// XMLHttpRequest, not fetch — this needs upload progress events, which
// fetch's Request/Response streaming doesn't expose on the browser side.
export function uploadToTarget(
	target: string,
	file: File,
	onProgress?: (fraction: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", resolveUploadUrl(target));
		xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve();
			else reject(new Error(`Upload failed (${xhr.status})`));
		};
		xhr.onerror = () => reject(new Error("Upload failed"));
		xhr.send(file);
	});
}
