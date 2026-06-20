# Relay

Relay lets you interact with Codex or Claude from another UI or application.

It is a thin MCP bridge, not an app framework. Relay owns waiting, delivery, reply correlation, and close. The UI or application owns the payload.

## Agent use

The MCP tool is `relay`:

```js
relay({})
```

```js
relay({ "bodyMarkdown": "Develop a piece before attacking." })
```

`relay({})` waits. Any non-empty object replies to the last app message, then waits again.

## App use

Node skill scripts use the runtime client Relay writes at startup: `~/.skills/relay/client.mjs`.

The HTTP routes are only the wire protocol behind the client and smoke page. Use raw HTTP for debugging or non-Node integrations, not normal skill scripts.

The first active MCP process owns the Relay HTTP service. Later same-root MCP processes attach to it so host restarts do not require manually killing Relay. If the Relay port is in use by an unhealthy or different-root process, stop that process and restart Codex or Claude.

Only one relay can be open. Durable state and the runtime client live under `~/.skills/relay/` unless `RELAY_DATA_DIR` is set.

## Install

Install the `relay` skill first, then ask the agent to install the required Relay MCP server for your host.

Example:

```text
Use the relay skill and install the required MCP.
```

The skill should ask before editing Codex or Claude config, resolve the installed skill path, verify Node, add the MCP server, and tell you to restart the host.

See `install.md` for the exact Codex and Claude Code MCP config.

## Development

See `development.md` for using Relay from another skill.
See `DEBUG.md` for the smoke page and HTTP wire protocol.

```bash
npm run check
npm run smoke
```
