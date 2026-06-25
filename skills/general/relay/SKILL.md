---
name: relay
description: Use the Relay MCP tool when a local app or UI needs the agent to wait, receive app context, reply, and return control without building a custom agent loop.
---

Use Relay when a local app, browser UI, script, or native helper has opened a relay and needs the current agent to take a turn outside chat.

## Tool calls

- `relay({})`: list recent relay sessions.
- `relay({ relayId })`: wait on that relay, or recover its pending agent turn.
- `relay({ relayId, reply })`: reply with `reply`, then wait again on that relay.

The `relayId` is internal routing state from Relay. Do not mention it to the user unless debugging. Downstream skills define and own the `reply` payload shape.

## Steps

1. Confirm the MCP tool `relay` is available.
2. If it is missing or fails to start, read `install.md` and ask the user before changing Codex or Claude config.
3. Call `relay({})` to list open or attention-needed relays.
4. Call `relay({ relayId })` for the target relay.
5. Read the relay message payload according to the downstream skill's instructions.
6. Reply with `relay({ relayId, reply: <payload> })`.
7. When Relay returns `{ status: "closed", ... }`, stop that relay loop and continue in chat.

## Rules

- Use exactly one MCP tool: `relay`.
- Do not invent polling loops, heartbeat narration, app IDs, relay IDs, cursors, acks, or `inReplyTo` fields.
- Use only a `relayId` returned by Relay or provided by the app context.
- If `relay({})` lists no relevant relay, tell the user the app must open one first.
- If Relay startup says the HTTP port is already in use by an unhealthy or different-root process, stop that process and restart the agent host.
- Relay coordinates the current agent; it does not launch Codex or Claude.
