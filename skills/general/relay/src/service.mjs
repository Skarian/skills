import path from "node:path";
import { startRelayServer } from "./server.mjs";
import { relayRoot } from "./store.mjs";
import { publishRelayClient, writeServiceRuntime } from "./runtime.mjs";
import {
  DEFAULT_RELAY_PORT,
  readRelayHealth,
  relayUrl,
} from "./relay-client.mjs";
export { DEFAULT_RELAY_PORT, discoverRelayUrl, readRelayHealth, relayUrl } from "./relay-client.mjs";

async function attachExistingRelay({ root, port }) {
  const url = relayUrl(port);
  const health = await readRelayHealth(url, { root });
  writeServiceRuntime({
    root,
    url: health.url || url,
    host: health.host,
    port: health.port,
    pid: health.pid,
    dbPath: health.dbPath,
  });
  publishRelayClient({ root });
  return {
    url: health.url || url,
    host: health.host || "127.0.0.1",
    port: Number(health.port || port),
    pid: health.pid ?? null,
    root: health.root || root,
    dbPath: health.dbPath,
    owner: false,
    close: async () => {},
  };
}

async function relayPortConflict({ root, port, cause }) {
  const url = relayUrl(port);
  let detail = "";
  try {
    const health = await readRelayHealth(url);
    const owner = [
      health.pid ? `pid ${health.pid}` : null,
      health.root ? `root ${health.root}` : null,
    ].filter(Boolean).join(", ");
    const rootDetail = health.root && path.resolve(health.root) !== path.resolve(root)
      ? ` This MCP is configured for root ${path.resolve(root)}.`
      : "";
    detail = owner ? ` Existing Relay: ${owner}.${rootDetail}` : " Existing Relay responded on the port.";
  } catch (error) {
    if (error.message) detail = ` ${error.message}.`;
  }
  if (!detail) {
    detail = " The port is not serving a healthy Relay endpoint.";
  }
  const error = new Error(
    `Relay HTTP port ${port} is already in use.${detail} Stop the other process and restart the MCP host.`,
  );
  error.code = "EADDRINUSE";
  error.cause = cause;
  return error;
}

export async function ensureRelayService({
  root = relayRoot(),
  port = process.env.RELAY_PORT || DEFAULT_RELAY_PORT,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedPort = Number(port);
  try {
    const service = await startRelayServer({ root: resolvedRoot, port: resolvedPort });
    return { ...service, owner: true };
  } catch (error) {
    if (error.code !== "EADDRINUSE") {
      throw error;
    }
    try {
      return await attachExistingRelay({ root: resolvedRoot, port: resolvedPort });
    } catch {
      throw await relayPortConflict({ root: resolvedRoot, port: resolvedPort, cause: error });
    }
  }
}
