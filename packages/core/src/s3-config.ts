import {
	GetBucketPolicyCommand,
	GetPublicAccessBlockCommand,
	PutBucketPolicyCommand,
	PutPublicAccessBlockCommand,
	S3Client as AwsS3Client,
	S3ServiceException,
} from "@aws-sdk/client-s3";

// The one place @aws-sdk/client-s3 is used in this repo — see s3.ts's
// header comment for why. Every object-level S3 operation stays on Bun's
// native client; this file exists purely because Bun's client has no
// bucket-policy/Block-Public-Access API at all.
export interface S3ConfigTarget {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	visibility: "public" | "private";
}

export type ConfigStatus = "unconfigured" | "configured" | "drifted" | "error";
export interface ConfigResult {
	configStatus: ConfigStatus;
	configError: string | null;
}

// Fixed Sid so re-running Configure is idempotent (replaces only this
// statement) and never clobbers other statements a bucket owner added for
// unrelated reasons.
const PUBLIC_READ_SID = "OSSPlayPublicRead";

function client(target: S3ConfigTarget): AwsS3Client {
	// forcePathStyle matters for non-AWS S3-compatible endpoints (MinIO and
	// similar typically require it); real AWS endpoints tolerate it fine.
	return new AwsS3Client({
		endpoint: target.endpoint,
		region: target.region,
		forcePathStyle: true,
		credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey },
	});
}

function isNotImplemented(err: unknown): boolean {
	// Some S3-compatible providers (MinIO, R2, B2) don't implement the
	// Block-Public-Access APIs at all — that's an AWS-specific concept
	// layered on top of core S3, not part of the base spec every provider
	// has to support. Verified against a real MinIO instance: GetPublicAccessBlock
	// cleanly returns 501/NotImplemented, but PutPublicAccessBlock instead
	// rejects with a generic 400 MalformedXML ("did not validate against our
	// published schema") — MinIO's real error for "this element isn't
	// recognized," not an actually malformed request. Scoped safely because
	// every call site of this helper is a PAB call; PutBucketPolicy errors
	// (which could legitimately be MalformedXML) never go through it.
	if (!(err instanceof S3ServiceException)) return false;
	return (
		err.name === "NotImplemented" ||
		err.$metadata.httpStatusCode === 501 ||
		err.name === "MalformedXML"
	);
}

function publicReadPolicyStatement(bucket: string) {
	return {
		Sid: PUBLIC_READ_SID,
		Effect: "Allow",
		Principal: "*",
		Action: "s3:GetObject",
		Resource: `arn:aws:s3:::${bucket}/*`,
	};
}

interface PolicyStatement {
	Sid?: string;
	Effect?: string;
	Principal?: unknown;
	Action?: string | string[];
	Resource?: string | string[];
}

function isPublicPrincipal(principal: unknown): boolean {
	if (principal === "*") return true;
	if (typeof principal === "object" && principal !== null && "AWS" in principal) {
		const aws = (principal as { AWS: unknown }).AWS;
		return aws === "*" || (Array.isArray(aws) && aws.includes("*"));
	}
	return false;
}

// GetBucketPolicyStatus's IsPublic field is itself an AWS-specific policy
// analyzer, not something every S3-compatible provider computes correctly —
// verified against a real MinIO instance, which returns IsPublic: false for
// a policy that demonstrably does grant public s3:GetObject (confirmed by
// reading the policy JSON directly). Checking the policy document itself for
// our own OSSPlayPublicRead statement is the more portable ground truth: it
// works on any provider that implements core GetBucketPolicy, which every
// S3-compatible provider does (unlike the analyzer-style status endpoint).
function hasPublicReadStatement(policyJson: string, bucket: string): boolean {
	let parsed: { Statement?: PolicyStatement[] };
	try {
		parsed = JSON.parse(policyJson);
	} catch {
		return false;
	}
	const resourceArn = `arn:aws:s3:::${bucket}/*`;
	return (parsed.Statement ?? []).some((s) => {
		if (s.Sid !== PUBLIC_READ_SID || s.Effect !== "Allow") return false;
		const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
		const resources = Array.isArray(s.Resource) ? s.Resource : [s.Resource];
		return actions.includes("s3:GetObject") && resources.includes(resourceArn) && isPublicPrincipal(s.Principal);
	});
}

async function mergePublicReadPolicy(s3: AwsS3Client, bucket: string): Promise<string> {
	let statements: unknown[] = [];
	try {
		const existing = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }));
		if (existing.Policy) {
			const parsed = JSON.parse(existing.Policy) as { Statement?: unknown[] };
			statements = (parsed.Statement ?? []).filter(
				(s) => (s as { Sid?: string }).Sid !== PUBLIC_READ_SID,
			);
		}
	} catch (err) {
		// NoSuchBucketPolicy just means the bucket has no policy yet — not a
		// failure, the fresh policy below is the whole thing.
		if (!(err instanceof S3ServiceException && err.name === "NoSuchBucketPolicy")) throw err;
	}
	statements.push(publicReadPolicyStatement(bucket));
	return JSON.stringify({ Version: "2012-10-17", Statement: statements });
}

// Applies real bucket-level permissions matching `target.visibility`, then
// verifies the result rather than trusting the PUT calls alone. Each SDK
// call is independently wrapped so a provider that only supports part of
// this (e.g. bucket policy but not Block Public Access) still gets a
// partial, clearly-recorded result instead of one opaque failure.
export async function applyBucketConfig(target: S3ConfigTarget): Promise<ConfigResult> {
	const s3 = client(target);
	const errors: string[] = [];

	if (target.visibility === "public") {
		try {
			await s3.send(
				new PutPublicAccessBlockCommand({
					Bucket: target.bucket,
					PublicAccessBlockConfiguration: {
						BlockPublicAcls: false,
						IgnorePublicAcls: false,
						BlockPublicPolicy: false,
						RestrictPublicBuckets: false,
					},
				}),
			);
		} catch (err) {
			if (!isNotImplemented(err)) errors.push(`PutPublicAccessBlock: ${errorMessage(err)}`);
		}
		try {
			const policy = await mergePublicReadPolicy(s3, target.bucket);
			await s3.send(new PutBucketPolicyCommand({ Bucket: target.bucket, Policy: policy }));
		} catch (err) {
			errors.push(`PutBucketPolicy: ${errorMessage(err)}`);
		}
	} else {
		try {
			await s3.send(
				new PutPublicAccessBlockCommand({
					Bucket: target.bucket,
					PublicAccessBlockConfiguration: {
						BlockPublicAcls: true,
						IgnorePublicAcls: true,
						BlockPublicPolicy: true,
						RestrictPublicBuckets: true,
					},
				}),
			);
		} catch (err) {
			if (!isNotImplemented(err)) errors.push(`PutPublicAccessBlock: ${errorMessage(err)}`);
		}
	}

	if (errors.length > 0) {
		return { configStatus: "error", configError: errors.join("; ") };
	}
	return verifyBucketConfig(target);
}

// Read-only — no PUT calls. Used both right after applyBucketConfig (to
// confirm the real resulting state) and by the periodic drift check, which
// must never silently re-apply anything on a timer.
export async function verifyBucketConfig(target: S3ConfigTarget): Promise<ConfigResult> {
	const s3 = client(target);
	let publicAccessBlocked: boolean | null = null;
	// Surfaced as a caveat on an otherwise-"configured" result (see the two
	// return sites below) rather than silently swallowed — a private
	// destination whose PAB state literally couldn't be checked is a real
	// gap worth the operator knowing about, not indistinguishable from one
	// that was fully verified.
	let pabUnsupportedNote: string | null = null;
	try {
		const pab = await s3.send(new GetPublicAccessBlockCommand({ Bucket: target.bucket }));
		const cfg = pab.PublicAccessBlockConfiguration;
		publicAccessBlocked = Boolean(
			cfg?.BlockPublicAcls && cfg?.IgnorePublicAcls && cfg?.BlockPublicPolicy && cfg?.RestrictPublicBuckets,
		);
	} catch (err) {
		if (!isNotImplemented(err)) {
			return { configStatus: "error", configError: `GetPublicAccessBlock: ${errorMessage(err)}` };
		}
		// Provider doesn't support PAB at all — fall through to policy-only
		// verification for "public", and treat "private" as unverifiable via
		// this call (see below).
		pabUnsupportedNote =
			"Block Public Access isn't supported by this provider — verified via bucket policy only, not confirmed at the provider level.";
	}

	if (target.visibility === "private") {
		if (publicAccessBlocked === false) {
			return { configStatus: "drifted", configError: "Block Public Access is not fully enabled" };
		}
		return { configStatus: "configured", configError: pabUnsupportedNote };
	}

	// public: PAB (if the provider supports it) must be OFF, and our own
	// OSSPlayPublicRead statement must still be present in the policy — see
	// hasPublicReadStatement's comment for why this is checked directly
	// rather than via GetBucketPolicyStatus.
	if (publicAccessBlocked === true) {
		return { configStatus: "drifted", configError: "Block Public Access is enabled on a public destination" };
	}
	try {
		const policy = await s3.send(new GetBucketPolicyCommand({ Bucket: target.bucket }));
		if (!policy.Policy || !hasPublicReadStatement(policy.Policy, target.bucket)) {
			return { configStatus: "drifted", configError: "Bucket policy no longer grants public read access" };
		}
	} catch (err) {
		if (err instanceof S3ServiceException && err.name === "NoSuchBucketPolicy") {
			return { configStatus: "drifted", configError: "Bucket policy no longer grants public read access" };
		}
		return { configStatus: "error", configError: `GetBucketPolicy: ${errorMessage(err)}` };
	}
	return { configStatus: "configured", configError: null };
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
