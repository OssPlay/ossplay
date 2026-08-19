// Human labels for the fixed-enum variant spec values — shared by
// download-as-dialog.tsx (picking a spec to request) and the Variants tab
// of asset-details-panel.tsx (labeling an already-created variant parsed
// back from its specKey, see packages/core/src/jobs.ts's computeSpecKey).
export const FORMAT_LABELS: Record<string, string> = {
	original: "Original format",
	webp: "WebP",
	avif: "AVIF",
	jpeg: "JPEG",
	png: "PNG",
};
export const SIZE_LABELS: Record<string, string> = {
	original: "Original size",
	"1024": "1024px",
	"2048": "2048px",
	"4096": "4096px",
};
export const HEIGHT_LABELS: Record<string, string> = {
	"480": "480p",
	"720": "720p",
	"1080": "1080p",
};
export const BITRATE_LABELS: Record<string, string> = {
	"96k": "96 kbps",
	"128k": "128 kbps",
	"192k": "192 kbps",
	"320k": "320 kbps",
};
