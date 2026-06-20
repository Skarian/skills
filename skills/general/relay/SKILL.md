---
name: relay
description: Use the Relay MCP tool when a local app or UI needs the agent to wait, receive app context, reply, and return control without building a custom agent loop.
---

Use Relay when a local app, browser UI, script, or native helper has opened a relay and needs the current agent to take a turn outside chat.

## Tool calls

- `relay({})`: wait for the current relay message.
- `relay(<relay message payload>)`: reply to the last delivered relay message, then wait again.

The relay message payload is a non-empty JSON object. Downstream skills define and own its shape.

## Steps

1. Confirm the MCP tool `relay` is available.
2. If it is missing or fails to start, read `install.md` and ask the user before changing Codex or Claude config.
3. Call `relay({})` to wait for the current app message.
4. Read the relay message payload according to the downstream skill's instructions.
5. Reply with the relevant relay message payload.
6. When Relay returns `{ status: "closed", ... }`, stop the relay loop and continue in chat.

## Rules

- Use exactly one MCP tool: `relay`.
- Do not invent polling loops, heartbeat narration, app IDs, relay IDs, cursors, acks, or `inReplyTo` fields for the agent.
- If `relay({})` says no app has opened a relay, tell the user the app must open first.
- If Relay startup says the HTTP port is already in use by an unhealthy or different-root process, stop that process and restart the agent host.
- Relay coordinates the current agent; it does not launch Codex or Claude.
