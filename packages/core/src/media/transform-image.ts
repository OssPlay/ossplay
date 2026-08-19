import sharp from "sharp";

export type ImageFormat = "webp" | "avif" | "jpeg" | "png" | "original";

export interface ImageTransformParams {
	format: ImageFormat;
	width: number | null;
	height: number | null;
	quality: number | null;
}

// The actual pixel-pushing, with no queue/job/HTTP awareness — shared by
// apps/worker's async, fixed-enum requestedVariant branch and apps/api's
// synchronous /v1 on-the-fly transform path (routes/v1.ts), so there's one
// implementation of "given bytes and params, produce transformed bytes,"
// not two that can drift.
export async function transformImage(
	bytes: Uint8Array,
	params: ImageTransformParams,
): Promise<Buffer> {
	let pipeline = sharp(bytes);
	if (params.width || params.height) {
		pipeline = pipeline.resize(params.width, params.height, {
			fit: "inside",
			withoutEnlargement: true,
		});
	}
	if (params.format !== "original") {
		pipeline = pipeline.toFormat(params.format, params.quality ? { quality: params.quality } : undefined);
	}
	return pipeline.toBuffer();
}
