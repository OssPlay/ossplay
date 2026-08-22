export const EVENTS_CHANNEL = "ossplay:events";

export type AssetStatusEvent = {
	type: "asset.status";
	projectId: string;
	assetId: string;
	status: "pending" | "processing" | "ready" | "failed";
};

export type NotificationEvent = {
	type: "notification";
	userId: string;
};

export type AppEvent = AssetStatusEvent | NotificationEvent;

// Structurally typed rather than importing ioredis's Redis type — every
// caller already has its own app-scoped connection singleton (apps/api's
// getRedisConnection, apps/worker's), and this file has no reason to pull
// ioredis into packages/core just to describe "something with a publish
// method." A plain PUBLISH is safe on any connection not currently in
// SUBSCRIBE mode (see apps/api/src/lib/events-bus.ts's dedicated
// subscriber, the one connection that actually needs to be separate).
export interface EventPublisher {
	publish(channel: string, message: string): Promise<unknown>;
}

export async function publishEvent(publisher: EventPublisher, event: AppEvent): Promise<void> {
	await publisher.publish(EVENTS_CHANNEL, JSON.stringify(event));
}
