import { describe, expect, it, mock } from "bun:test";
import { EVENTS_CHANNEL, publishEvent } from "./channel";

describe("publishEvent", () => {
	it("publishes a JSON-serialized event on the shared channel", async () => {
		const publish = mock(async (_channel: string, _message: string) => 1);
		await publishEvent({ publish }, { type: "asset.status", projectId: "p1", assetId: "a1", status: "ready" });

		expect(publish).toHaveBeenCalledTimes(1);
		const [channel, message] = publish.mock.calls[0] as [string, string];
		expect(channel).toBe(EVENTS_CHANNEL);
		expect(JSON.parse(message)).toEqual({
			type: "asset.status",
			projectId: "p1",
			assetId: "a1",
			status: "ready",
		});
	});

	it("publishes a notification event with just a userId", async () => {
		const publish = mock(async (_channel: string, _message: string) => 1);
		await publishEvent({ publish }, { type: "notification", userId: "u1" });

		const [, message] = publish.mock.calls[0] as [string, string];
		expect(JSON.parse(message)).toEqual({ type: "notification", userId: "u1" });
	});
});
