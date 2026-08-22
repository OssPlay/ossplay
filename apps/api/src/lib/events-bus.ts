import { type AppEvent, EVENTS_CHANNEL } from "@ossplay/core";
import { EventEmitter } from "node:events";
import { getRedisConnection } from "./queue";

// One dedicated subscriber for the whole apps/api process, not one per
// connected SSE client — a connection in SUBSCRIBE mode can only run
// pub/sub commands, so this can't be the same connection getQueue()/
// getRedisConnection() hands out for BullMQ ops and the bulk-download
// ticket's plain SET/GET/EXPIRE. Every event.ts route handler registers its
// own filtered listener here instead of opening its own Redis connection —
// this is the in-process fanout that makes that cheap.
export const appEventBus = new EventEmitter();

let subscribed = false;

// Idempotent — safe to call from every new SSE connection; only the first
// call actually subscribes.
export function ensureSubscribed(): void {
	if (subscribed) return;
	subscribed = true;
	const subscriber = getRedisConnection().duplicate();
	subscriber.subscribe(EVENTS_CHANNEL).catch((err) => {
		console.error(`[events-bus] failed to subscribe to ${EVENTS_CHANNEL}:`, err);
	});
	subscriber.on("message", (_channel, message) => {
		try {
			const event = JSON.parse(message) as AppEvent;
			appEventBus.emit("event", event);
		} catch (err) {
			console.error("[events-bus] failed to parse event message:", err);
		}
	});
}
