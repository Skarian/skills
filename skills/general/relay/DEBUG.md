# Relay debug

Use this only for debugging, manual smoke tests, or non-Node integrations. Node skill scripts should use `~/.skills/relay/client.mjs`.

`RELAY_URL` can target a specific Relay service when you are debugging.

In normal use, the first MCP process owns the Relay HTTP service. Same-root MCP processes can attach to that service after a host restart. Do not run a second Relay service on the same port.

## HTTP wire protocol

```text
GET  /api/health
GET  /api/relays
POST /api/relay/open      { appName, payload? }
POST /api/relay/send      <opaque payload>
POST /api/relay/receive   { after? }
POST /api/relay/received  { relayId?, through }
POST /api/relay/close     { reason?, payload? }
```

`receive` waits until an agent reply or close event exists. Tests may wrap calls in their own timers, but Relay does not expose a public receive timeout.

The smoke page is available while Relay is running:

```text
http://127.0.0.1:4799/
```
