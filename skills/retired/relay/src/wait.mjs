import { setTimeout as delay } from "node:timers/promises";

export async function waitForEvents(store, {
  relayId,
  client = "agent",
  cursor = 0,
  types = null,
  limit = 50,
  pollIntervalMs = 1000,
  signal = null,
} = {}) {
  if (!relayId) {
    throw new Error("relayId is required");
  }
  const normalizedInterval = Math.max(100, Number(pollIntervalMs || 1000));
  while (true) {
    if (signal?.aborted) {
      throw new Error("relay wait cancelled");
    }
    const events = store.pollEvents({
      relayId,
      client,
      cursor: Number(cursor || 0),
      limit: Number(limit || 50),
      types,
    });
    if (events.length > 0) {
      return {
        type: "events",
        relayId,
        client,
        cursor: Number(cursor || 0),
        events,
        nextCursor: events.at(-1).seq,
      };
    }
    await delay(normalizedInterval, undefined, signal ? { signal } : undefined).catch((error) => {
      if (error.name === "AbortError") {
        throw new Error("relay wait cancelled");
      }
      throw error;
    });
  }
}
