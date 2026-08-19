import { toast } from "sonner";

// Public-project case only — a permanent /v1 URL, no key needed, works for
// anyone (not just someone logged into this dashboard). Shared by
// useDriveActions (grid/list context menus) and asset-preview.tsx (the
// preview page's own Copy Link button) so both produce the exact same URL.
// The private case needs a signing-duration choice first — see
// components/drive/copy-link-dialog.tsx.
export async function copyPublicAssetLink(projectId: string, assetId: string): Promise<void> {
	const url = `${window.location.origin}/api/v1/${projectId}/${assetId}`;
	try {
		await navigator.clipboard.writeText(url);
		toast.success("Link copied");
	} catch {
		toast.error("Could not copy link");
	}
}
