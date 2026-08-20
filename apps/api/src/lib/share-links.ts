import { assetShareLinks, getDb } from "@ossplay/db";
import { generateToken, hashToken } from "./auth/tokens";

export const SHARE_LINK_DURATIONS = {
	"1h": 60 * 60,
	"1d": 24 * 60 * 60,
	"7d": 7 * 24 * 60 * 60,
	"30d": 30 * 24 * 60 * 60,
} as const;

export type ShareLinkDuration = keyof typeof SHARE_LINK_DURATIONS;

// The one place an `assetShareLinks` row gets created — used by the
// dashboard's session-authed "Copy link" route (assets.ts) and the public
// /v1 embed-token route (v1.ts), so a private-project video embed and a
// private-project "Copy link" are the exact same grant, just reached from
// two different callers. See packages/db/src/share-link.schema.ts's comment
// for why this is a bearer token (only its hash is ever persisted).
export async function mintAssetShareLink(
	assetId: string,
	duration: ShareLinkDuration,
	createdByUserId: string | null,
): Promise<{ secret: string; expiresAt: Date }> {
	const secret = generateToken();
	const id = await hashToken(secret);
	const expiresAt = new Date(Date.now() + SHARE_LINK_DURATIONS[duration] * 1000);
	await getDb()
		.insert(assetShareLinks)
		.values({ id, assetId, expiresAt, createdByUserId });
	return { secret, expiresAt };
}
