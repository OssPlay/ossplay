import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

// The one place @aws-sdk/client-lambda is used in this repo — same reasoning
// as s3-config.ts's header comment for @aws-sdk/client-s3: this is AWS-
// specific control-plane work (invoking a function by ARN) that has no Bun-
// native equivalent, unlike object storage where Bun's own S3Client covers
// every data-plane operation.
export interface LambdaTarget {
	region: string;
	functionArn: string;
	accessKeyId: string;
	// Already decrypted by the caller — this module never touches
	// secret-box.ts itself, same convention as s3-config.ts's S3ConfigTarget.
	secretAccessKey: string;
}

function client(target: LambdaTarget): LambdaClient {
	return new LambdaClient({
		region: target.region,
		credentials: {
			accessKeyId: target.accessKeyId,
			secretAccessKey: target.secretAccessKey,
		},
	});
}

// Synchronous connectivity check, mirrors s3-destinations' cheap /test
// endpoint. The deployed Lambda handler is expected to special-case
// `{ ping: true }` and return `{ pong: true }` immediately, without touching
// Postgres/S3 — see apps/worker/src/lambda-handler.ts. Never throws — every
// failure mode (bad credentials, function doesn't exist, function errored,
// unexpected response shape) collapses to { ok: false, error }.
export async function testLambdaConnection(
	target: LambdaTarget,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const result = await client(target).send(
			new InvokeCommand({
				FunctionName: target.functionArn,
				InvocationType: "RequestResponse",
				Payload: new TextEncoder().encode(JSON.stringify({ ping: true })),
			}),
		);

		if (result.FunctionError) {
			return { ok: false, error: `Function returned an error: ${result.FunctionError}` };
		}
		const body = result.Payload ? JSON.parse(new TextDecoder().decode(result.Payload)) : null;
		if (body?.pong !== true) {
			return { ok: false, error: "Function responded but not with the expected { pong: true }" };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
	}
}

// Fire-and-forget dispatch for a real processing job — InvocationType
// "Event" matches BullMQ's own async nature (the caller doesn't wait for the
// job to finish, the Lambda handler reports completion by writing directly
// to Postgres, same as apps/worker's processors do today). Throws on
// anything that means the invoke itself didn't go through (bad credentials,
// function not found) — the caller (compute-dispatch.ts) decides how to
// react to that (e.g. falling back to BullMQ).
export async function invokeLambdaAsync(target: LambdaTarget, payload: unknown): Promise<void> {
	const result = await client(target).send(
		new InvokeCommand({
			FunctionName: target.functionArn,
			InvocationType: "Event",
			Payload: new TextEncoder().encode(JSON.stringify(payload)),
		}),
	);
	if (result.StatusCode !== 202) {
		throw new Error(`Lambda async invoke did not accept the job (status ${result.StatusCode})`);
	}
}
