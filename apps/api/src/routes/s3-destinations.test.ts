import { beforeAll, describe, expect, it } from "bun:test";
import {
	bootstrapAdmin,
	createTestS3Destination,
	extractCookie,
	jsonRequest,
	stampInvitationToken,
	truncateAllTables,
} from "../test-support";

type Destination = {
	id: string;
	label: string;
	visibility: string;
	status: string;
	lastError: string | null;
	configStatus: string;
	configError: string | null;
};

describe.skipIf(!process.env.DATABASE_URL)("s3 destinations", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "d".repeat(64);
	});

	let ownerCookie: string;
	let orgId: string;

	it("bootstraps an admin/owner", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());
	});

	it("GET /:orgId/s3-destinations starts empty", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations`, {
			cookie: ownerCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { destinations: Destination[]; total: number };
		expect(body.destinations).toHaveLength(0);
		expect(body.total).toBe(0);
	});

	let destinationId: string;

	it("POST /:orgId/s3-destinations creates a destination, never returning the secret", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				label: "Primary",
				endpoint: "https://s3.test.invalid",
				region: "us-east-1",
				bucket: "my-bucket",
				accessKeyId: "AKIATEST",
				secretAccessKey: "super-secret-value",
				visibility: "private",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { destination: Destination & Record<string, unknown> };
		expect(body.destination.label).toBe("Primary");
		expect(body.destination.status).toBe("untested");
		expect(body.destination).not.toHaveProperty("secretAccessKeyEncrypted");
		expect(body.destination).not.toHaveProperty("secretAccessKey");
		destinationId = body.destination.id;
	});

	it("GET /:orgId/s3-destinations lists the new destination", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations`, {
			cookie: ownerCookie,
		});
		const body = (await res.json()) as { destinations: Destination[] };
		expect(body.destinations).toHaveLength(1);
		expect(body.destinations[0]?.id).toBe(destinationId);
	});

	it("GET /:orgId/s3-destinations?sort=label&order=desc sorts by label", async () => {
		const other = await createTestS3Destination(orgId, { label: "Aardvark" });

		const res = await jsonRequest(
			`/organizations/${orgId}/s3-destinations?sort=label&order=desc`,
			{ cookie: ownerCookie },
		);
		const body = (await res.json()) as { destinations: Destination[] };
		expect(body.destinations.map((d) => d.label)).toEqual(["Primary", "Aardvark"]);

		await jsonRequest(`/organizations/${orgId}/s3-destinations/${other.id}`, {
			method: "DELETE",
			cookie: ownerCookie,
		});
	});

	it("PUT /:orgId/s3-destinations/:id updates a field, visibility stays fixed", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations/${destinationId}`, {
			method: "PUT",
			cookie: ownerCookie,
			body: JSON.stringify({ label: "Renamed", visibility: "public" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { destination: Destination };
		expect(body.destination.label).toBe("Renamed");
		// visibility isn't in the update schema at all — passing it is just
		// ignored, not rejected, since zod strips unknown-to-this-shape keys.
		expect(body.destination.visibility).toBe("private");
	});

	it("POST /:orgId/s3-destinations/:id/test fails clearly against an unreachable endpoint", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/s3-destinations/${destinationId}/test`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { destination: Destination };
		expect(body.destination.status).toBe("error");
		expect(body.destination.lastError?.length).toBeGreaterThan(0);
	});

	it("POST /:orgId/s3-destinations/:id/configure fails clearly against an unreachable endpoint", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/s3-destinations/${destinationId}/configure`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { destination: Destination };
		expect(body.destination.configStatus).toBe("error");
		expect(body.destination.configError?.length).toBeGreaterThan(0);
	});

	let memberCookie: string;

	it("a member is forbidden — org:manage_settings is owner-only", async () => {
		const inviteRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "member@example.com", role: "member" }),
		});
		const inviteBody = (await inviteRes.json()) as { invitation: { id: string } };
		const token = await stampInvitationToken(inviteBody.invitation.id);
		const acceptRes = await jsonRequest(`/invitations/token/${token}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "A Member", password: "a fresh new safe password" }),
		});
		memberCookie = extractCookie(acceptRes, "ossplay_session");

		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations`, {
			method: "POST",
			cookie: memberCookie,
			body: JSON.stringify({
				label: "Nope",
				endpoint: "https://s3.test.invalid",
				region: "us-east-1",
				bucket: "nope",
				accessKeyId: "x",
				secretAccessKey: "x",
				visibility: "private",
			}),
		});
		expect(res.status).toBe(403);
	});

	it("DELETE /:orgId/s3-destinations/:id is blocked while a project references it", async () => {
		const projectRes = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Uses the destination",
				id: "uses-the-destination",
				visibility: "private",
				destinationId,
			}),
		});
		expect(projectRes.status).toBe(201);

		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations/${destinationId}`, {
			method: "DELETE",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(409);
	});

	it("DELETE /:orgId/s3-destinations/:id succeeds once nothing references it", async () => {
		const other = await createTestS3Destination(orgId, { label: "Unreferenced" });
		const res = await jsonRequest(`/organizations/${orgId}/s3-destinations/${other.id}`, {
			method: "DELETE",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest(`/organizations/${orgId}/s3-destinations`, {
			cookie: ownerCookie,
		});
		const listBody = (await listRes.json()) as { destinations: Destination[] };
		expect(listBody.destinations.some((d) => d.id === other.id)).toBe(false);
	});
});
