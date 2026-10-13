# Relay development

Use this as the reference when building a skill that uses Relay.

Relay has two sides. The agent uses the `relay` MCP tool. Your skill's app or script uses the runtime client at `~/.skills/relay/client.mjs`.

## Concepts

Relay is a temporary handoff between the agent and another UI or local app. While it is open, the agent works through your app instead of only working in chat: it reads the context your app sends, replies, and waits for whatever the app sends next. When the work is done, the app closes the handoff and the agent returns to chat. Multiple handoffs can be open at once, so keep the `relayId` returned by `openRelay`.

What crosses between the two sides is a JSON object you design. Relay never looks inside it. Your skill decides what the fields mean on both ends. Relay only carries the object across and keeps the agent's replies in order.

The app-side loop is: receive, handle the items, save any app state, acknowledge, then receive again. Until your app acknowledges a reply, Relay treats it as possibly unhandled. If the app crashes before acknowledging, Relay may send that reply again after restart. That is intentional. Seeing a reply twice is better than losing one.

## Runtime client

In normal Node skill scripts, import the runtime client from Relay's data root.

```js
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const relayRoot = process.env.RELAY_DATA_DIR || path.join(os.homedir(), ".skills", "relay");
const clientUrl = pathToFileURL(path.join(relayRoot, "client.mjs"));
const { createRelayClient } = await import(clientUrl);

const relay = await createRelayClient();

const opened = await relay.openRelay({ appName: "my-app", payload: { sessionId: "demo" } });
const { relayId } = opened;
let after = opened.after;

try {
  await relay.send({
    relayId,
    payload: {
      type: "my-app.message",
      prompt: "Look at this app state and suggest the next step.",
      state: { screen: "main" },
    },
  });

  const result = await relay.receive({ relayId, after });

  for (const item of result.items) {
    console.log(item.payload);
  }

  after = result.nextAfter;
  // Save any app state affected by the reply before acknowledging it.
  await relay.received({ relayId, through: after });
} finally {
  await relay.closeRelay({ relayId, reason: "done", payload: { sessionId: "demo" } }).catch(() => {});
}
```

For debugging and non-Node integrations, see `DEBUG.md`.
