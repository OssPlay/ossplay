import { handleLambdaEvent, type LambdaEvent } from "./lambda-handler";

// A minimal AWS Lambda custom runtime, written directly in Bun rather than
// pulling in the Node-specific `aws-lambda-ric` package — this repo's
// Bun-first convention (CLAUDE.md), and the Runtime API itself is a public,
// stable HTTP contract (https://docs.aws.amazon.com/lambda/latest/dg/
// runtimes-api.html), not an SDK. This is the ENTRYPOINT for the
// runner-lambda Dockerfile stage — everything else (job routing, the actual
// processing) lives in lambda-handler.ts and the shared processors it calls.
const runtimeApi = process.env.AWS_LAMBDA_RUNTIME_API;
if (!runtimeApi) {
	throw new Error(
		"AWS_LAMBDA_RUNTIME_API is not set — this entrypoint only runs inside a real Lambda execution environment",
	);
}
const base = `http://${runtimeApi}/2018-06-01/runtime`;

async function processNextInvocation(): Promise<void> {
	const next = await fetch(`${base}/invocation/next`);
	const requestId = next.headers.get("Lambda-Runtime-Aws-Request-Id");
	if (!requestId) throw new Error("Runtime API response is missing Lambda-Runtime-Aws-Request-Id");

	try {
		// Every field on LambdaEvent is optional, and the payload only ever
		// comes from our own dispatcher (packages/core/src/compute-dispatch.ts)
		// or the /test endpoint's { ping: true } — trusted input, not
		// externally-supplied, so a plain cast is enough here.
		const event = (await next.json()) as LambdaEvent;
		const result = await handleLambdaEvent(event);
		await fetch(`${base}/invocation/${requestId}/response`, {
			method: "POST",
			body: JSON.stringify(result),
		});
	} catch (err) {
		console.error(`Invocation ${requestId} failed:`, err);
		await fetch(`${base}/invocation/${requestId}/error`, {
			method: "POST",
			body: JSON.stringify({
				errorMessage: err instanceof Error ? err.message : String(err),
				errorType: err instanceof Error ? err.name : "Error",
			}),
		});
	}
}

async function main(): Promise<void> {
	// One long-lived loop for the container's whole lifetime — AWS freezes
	// this process between invocations and thaws it for the next one, so
	// packages/db's lazily-created connection pool (getDb()) stays warm
	// across invocations instead of reconnecting every time, same benefit a
	// long-running BullMQ worker gets.
	for (;;) {
		await processNextInvocation();
	}
}

main().catch(async (err) => {
	// A failure here means the runtime loop itself broke (not a single
	// invocation) — report it as an init error so Lambda surfaces it clearly
	// instead of the container just going silent.
	console.error("Lambda runtime loop crashed:", err);
	await fetch(`${base}/init/error`, {
		method: "POST",
		body: JSON.stringify({
			errorMessage: err instanceof Error ? err.message : String(err),
			errorType: "InitError",
		}),
	}).catch(() => {});
	process.exit(1);
});
