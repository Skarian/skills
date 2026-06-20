# Relay install

Relay is a stdio MCP server. Run the MCP entrypoint with Node:

```text
node <installed-relay-skill-folder>/bin/relay-mcp.mjs
```

Use the absolute path to `bin/relay-mcp.mjs` in the agent host config:

```bash
cd <installed-relay-skill-folder>
realpath bin/relay-mcp.mjs
```

## Agent steps

1. Ask before editing user config.
2. Resolve the actual skill folder path on this machine.
3. Verify Node can load Relay:

```bash
node --version
node -e "import('node:sqlite').then(() => console.log('node:sqlite ok'))"
node --check <relay-mcp-path>
```

4. Install for the user's agent host.
5. Tell the user to restart the host so MCP tools reload.

Relay requires a Node version with `node:sqlite` available without extra flags.

When Relay starts, it writes `client.mjs` and `client.d.ts` into `~/.skills/relay/` unless `RELAY_DATA_DIR` is set. Node skill scripts should import that runtime client instead of Relay source files or raw HTTP.

The first MCP process owns the Relay HTTP service. Later same-root MCP processes attach to the existing service. If startup reports that port `4799` is already in use by an unhealthy or different-root process, stop that process and restart the agent host.

## Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.relay]
command = "node"
args = ["<relay-mcp-path>"]
tool_timeout_sec = 86400
```

Relay waits by design, so Codex needs a long tool timeout. The Codex CLI can add the server, but still check `config.toml` afterward:

```bash
codex mcp add relay -- node <relay-mcp-path>
codex mcp list
```

## Claude Code

Install as a user-scoped stdio server:

```bash
claude mcp add --transport stdio --scope user relay -- node <relay-mcp-path>
claude mcp list
```

Inside Claude Code, run `/mcp` to confirm it connected.

## Smoke test

After restarting the agent host:

1. Open `http://127.0.0.1:4799/`.
2. Click `Open`.
3. Have the agent call `relay({})`.
4. Click `Send`.
5. Have the agent reply with a small JSON object.
6. Click `Receive`.
7. Click `Close` and confirm the agent sees `status: "closed"`.

References: [OpenAI Codex MCP docs](https://developers.openai.com/codex/mcp) and [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).
