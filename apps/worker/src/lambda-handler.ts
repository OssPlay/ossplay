import { QUEUE_NAMES } from "@ossplay/core";
import type { Job } from "bullmq";
import { processAudio } from "./processors/audio";
import { processImage } from "./processors/image";
import { processPdf } from "./processors/pdf";
import { processVideo } from "./processors/video";

// The event shape packages/core/src/compute-dispatch.ts sends via Lambda
// InvokeCommand — the same queueName/jobName/data triplet a BullMQ Job
// carries, just delivered by a direct invoke instead of enqueue+poll.
// `ping` backs the /test connectivity check (apps/api/src/routes/
// instance-compute.ts) and doubles as a liveness probe that never touches
// Postgres/S3.
export interface LambdaEvent {
	ping?: boolean;
	queueName?: string;
	jobName?: string;
	data?: unknown;
}

// Each processor's Job<T> differs only in its data shape, which none of them
// narrow beyond destructuring — see the comment below on why a plain
// { data } object is a safe stand-in for the real BullMQ Job.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
type Processor = (job: Job<any>) => Promise<void>;

const PROCESSORS: Record<string, Processor> = {
	[QUEUE_NAMES.imageProcessing]: processImage,
	[QUEUE_NAMES.videoProcessing]: processVideo,
	[QUEUE_NAMES.audioProcessing]: processAudio,
	[QUEUE_NAMES.pdfProcessing]: processPdf,
};

// processImage/processVideo/processAudio/processPdf each only ever read
// `job.data` — none of them call any other BullMQ Job method (updateProgress,
// log, etc.) — so a plain `{ data }` object is a complete, faithful stand-in
// for the real BullMQ Job these functions normally run under, with no
// porting needed.
export async function handleLambdaEvent(event: LambdaEvent): Promise<Record<string, unknown>> {
	if (event.ping) return { pong: true };

	const processor = event.queueName ? PROCESSORS[event.queueName] : undefined;
	if (!processor) throw new Error(`No processor for queue "${event.queueName}"`);

	// biome-ignore lint/suspicious/noExplicitAny: see Processor's comment above
	await processor({ data: event.data } as Job<any>);
	return { ok: true };
}
