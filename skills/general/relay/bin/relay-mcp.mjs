#!/usr/bin/env node
import readline from "node:readline";
import { ensureRelayService } from "../src/service.mjs";
import { RelayStore, relayRoot } from "../src/store.mjs";
import { waitForEvents } from "../src/wait.mjs";

const PROTOCOL_VERSION = "2025-11-25";
const CLIENT = "agent";
const RELAY_EVENTS = ["relay.message", "relay.closed"];
const ENVELOPE_KEYS = new Set(["relayId", "reply"]);
const TOOL = {
  name: "relay",
  description: "List Relay sessions, wait on a specific relayId, or reply on that relayId and wait again.",
  inputSchema: {
    type: "object",
    description: "Use {} to list relays. Use { relayId } to wait. Use { relayId, reply } to reply and wait again.",
    additionalProperties: false,
    properties: {
      relayId: { type: "string" },
      reply: {},
    },
  },
};

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, value) {
  write({ jsonrpc: "2.0", id, result: value });
}

function fail(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

const root = relayRoot();
let service;
try {
  service = await ensureRelayService({ root });
} catch (error) {
  console.error(`Relay startup failed: ${error.message}`);
  process.exit(1);
}
const store = new RelayStore({ root });
const waits = new Map();

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Relay arguments must be an object.");
  }
  const unknown = Object.keys(input).filter((key) => !ENVELOPE_KEYS.has(key));
  if (unknown.length) {
    throw new Error(`Unknown Relay argument: ${unknown[0]}`);
  }
  if (Object.hasOwn(input, "reply") && !input.relayId) {
    throw new Error("relayId is required when reply is provided.");
  }
}

function formatEvent(relay, event) {
  const payload = event?.payload;
  if (event?.type === "relay.closed" || relay.status === "closed") {
    const envelope = payload && typeof payload === "object" ? payload : {};
    return {
      status: "closed",
      relayId: relay.relayId,
      appName: relay.appName,
      reason: envelope.reason || "closed",
      payload: Object.hasOwn(envelope, "payload") ? envelope.payload : {},
    };
  }
  return {
    status: "message",
    relayId: relay.relayId,
    appName: relay.appName,
    payload,
  };
}

function closeResult(relay, closeEvent = null) {
  return formatEvent(relay, closeEvent || store.closeEvent({ relayId: relay.relayId }));
}

function ackAndFormat(relay, event) {
  if (event?.type === "relay.message" || event?.type === "relay.closed") {
    store.ackEvents({ relayId: relay.relayId, client: CLIENT, through: event.seq });
  }
  return formatEvent(relay, event);
}

function recoverPending(relay) {
  const delivered = store.deliveredMessageSeq({ relayId: relay.relayId });
  const cursor = store.ackThrough({ relayId: relay.relayId, client: CLIENT });
  if (delivered) {
    const closeAfter = store.closeEventAfter({ relayId: relay.relayId, seq: delivered });
    if (closeAfter) return { event: closeAfter, ack: true };
    if (!store.replyFor({ relayId: relay.relayId, inReplyTo: delivered })) {
      return { event: store.messageEvent({ relayId: relay.relayId, seq: delivered }), ack: false };
    }
  }
  if (relay.status === "closed") {
    return {
      event: store.closeEventAfter({ relayId: relay.relayId, seq: cursor }) || store.closeEvent({ relayId: relay.relayId }),
      ack: true,
    };
  }
  return null;
}

async function waitOnRelay(id, relay, cursor) {
  const owner = `${process.pid}:${id}`;
  store.acquireWait({ relayId: relay.relayId, owner, pid: process.pid });
  const controller = new AbortController();
  waits.set(id, controller);
  try {
    const waited = await waitForEvents(store, {
      relayId: relay.relayId,
      client: CLIENT,
      cursor,
      types: RELAY_EVENTS,
      signal: controller.signal,
    });
    return ackAndFormat(relay, waited.events.find((event) => event.type === "relay.closed") || waited.events[0]);
  } finally {
    waits.delete(id);
    store.releaseWait({ relayId: relay.relayId, owner });
  }
}

async function waitOrRecover(id, relay) {
  const recovered = recoverPending(relay);
  if (recovered?.event) {
    return recovered.ack ? ackAndFormat(relay, recovered.event) : formatEvent(relay, recovered.event);
  }
  const cursor = store.ackThrough({ relayId: relay.relayId, client: CLIENT });
  return waitOnRelay(id, relay, cursor);
}

async function replyThenWait(id, relay, reply) {
  const delivered = store.deliveredMessageSeq({ relayId: relay.relayId });
  if (!delivered) {
    if (relay.status === "closed") return closeResult(relay);
    throw new Error("Relay has no delivered app message to reply to.");
  }
  const closeAfter = store.closeEventAfter({ relayId: relay.relayId, seq: delivered });
  if (closeAfter) return ackAndFormat(relay, closeAfter);
  const replied = store.replyToRelay({
    relayId: relay.relayId,
    payload: reply,
    ackThrough: delivered,
  });
  if (replied.duplicate) {
    return {
      status: "reply",
      relayId: relay.relayId,
      appName: relay.appName,
      inReplyTo: delivered,
      payload: replied.event.payload.payload,
      duplicate: true,
    };
  }
  return waitOnRelay(id, relay, delivered);
}

async function callRelay(id, input) {
  validateInput(input);
  if (!Object.hasOwn(input, "relayId")) {
    ok(id, toolResult(store.listRelaySummaries()));
    return;
  }
  const relay = store.resolveRelay({ relayId: input.relayId });
  const result = Object.hasOwn(input, "reply")
    ? await replyThenWait(id, relay, input.reply)
    : await waitOrRecover(id, relay);
  ok(id, toolResult(result));
}

async function handleRequest(message) {
  const { id, method, params = {} } = message;
  try {
    if (method === "initialize") {
      ok(id, {
        protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "relay", version: "0.1.0" },
      });
    } else if (method === "tools/list") {
      ok(id, { tools: [TOOL] });
    } else if (method === "tools/call" && params.name === TOOL.name) {
      await callRelay(id, params.arguments || {});
    } else if (method === "ping") {
      ok(id, {});
    } else {
      fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    fail(id, -32000, error.message);
  }
}

function handleNotification(message) {
  if (message.method === "notifications/cancelled") {
    waits.get(message.params?.requestId)?.abort();
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const message = JSON.parse(line);
    if (Object.hasOwn(message, "id")) void handleRequest(message);
    else handleNotification(message);
  } catch (error) {
    fail(null, -32700, error.message);
  }
});

rl.on("close", () => {
  for (const controller of waits.values()) controller.abort();
  store.close();
  void service.close();
});
