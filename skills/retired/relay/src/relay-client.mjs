import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_RELAY_PORT = 4799;

export function relayRoot() {
  return path.resolve(process.env.RELAY_DATA_DIR || path.join(os.homedir(), ".skills", "relay"));
}

export function relayDbPath(root = relayRoot()) {
  return path.join(root, "relay.sqlite");
}

export function relayUrl(port = process.env.RELAY_PORT || DEFAULT_RELAY_PORT) {
  return `http://127.0.0.1:${Number(port)}/`;
}

function localRelayUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:") {
    throw new Error("Relay URL must use local http");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("Relay URL must point to localhost");
  }
  return url.toString();
}

function rowToRuntime(row) {
  if (!row) return null;
  return {
    url: row.url,
    host: row.host,
    port: Number(row.port),
    pid: row.pid === null || row.pid === undefined ? null : Number(row.pid),
    root: row.root,
    dbPath: row.db_path,
    updatedAt: row.updated_at,
  };
}

function readServiceRuntime({ root = relayRoot() } = {}) {
  const resolvedRoot = path.resolve(root);
  const dbPath = relayDbPath(resolvedRoot);
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath);
  try {
    return rowToRuntime(db.prepare("SELECT * FROM service_runtime WHERE id = 1").get());
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function rootMatches(health, root) {
  const resolvedRoot = path.resolve(root);
  return path.resolve(health.root || "") === resolvedRoot
    && path.resolve(health.dbPath || "") === relayDbPath(resolvedRoot);
}

export async function readRelayHealth(url, { root = null, timeoutMs = 750 } = {}) {
  const baseUrl = localRelayUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let httpResult;
  try {
    httpResult = await fetch(new URL("/api/health", baseUrl), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!httpResult.ok) throw new Error(`Relay health check failed: ${httpResult.status}`);
  const health = await httpResult.json();
  if (health.name !== "relay") throw new Error("Port is not serving Relay");
  if (root && !rootMatches(health, root)) {
    throw new Error(`Relay is already running for ${health.root}, not ${path.resolve(root)}`);
  }
  return health;
}

async function verifiedRuntimeUrl(root) {
  const runtime = readServiceRuntime({ root });
  if (!runtime?.url) return null;
  try {
    await readRelayHealth(runtime.url, { root });
    return runtime.url;
  } catch {
    return null;
  }
}

export async function discoverRelayUrl({
  root = relayRoot(),
  explicitUrl = process.env.RELAY_URL || null,
  throwOnMissing = true,
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (explicitUrl) {
    const url = localRelayUrl(explicitUrl);
    await readRelayHealth(url);
    return url;
  }
  const runtimeUrl = await verifiedRuntimeUrl(resolvedRoot);
  if (runtimeUrl) return runtimeUrl;
  const fallbackUrl = relayUrl();
  try {
    await readRelayHealth(fallbackUrl, { root: resolvedRoot });
    return fallbackUrl;
  } catch (error) {
    if (!throwOnMissing) return null;
    throw new Error(`Relay is not running: ${error.message}`);
  }
}

function joinUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

export class RelayClient {
  constructor({ baseUrl = null } = {}) {
    if (!baseUrl) {
      throw new Error("RelayClient requires baseUrl; use createRelayClient() for discovery.");
    }
    this.baseUrl = baseUrl;
  }

  async request(pathname, { method = "GET", body = null, searchParams = null } = {}) {
    const url = joinUrl(this.baseUrl, pathname);
    const hasBody = body !== null && body !== undefined;
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const httpResult = await fetch(url, {
      method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    const text = await httpResult.text();
    const value = text ? JSON.parse(text) : null;
    if (!httpResult.ok) {
      throw new Error(value?.error || `Relay call failed: ${httpResult.status}`);
    }
    return value;
  }

  listRelays({ appName = null, lifecycle = null, status = null, limit = null } = {}) {
    return this.request("/api/relays", {
      searchParams: { app: appName, lifecycle: lifecycle || status, limit },
    });
  }

  health() {
    return this.request("/api/health");
  }

  openRelay({ appName, payload = {} }) {
    return this.request("/api/relay/open", {
      method: "POST",
      body: { appName, payload },
    });
  }

  send({ relayId, payload = {} } = {}) {
    return this.request("/api/relay/send", {
      method: "POST",
      body: { relayId, payload },
    });
  }

  receive({ relayId, after = 0 } = {}) {
    return this.request("/api/relay/receive", {
      method: "POST",
      body: { relayId, after },
    });
  }

  received({ relayId, through } = {}) {
    return this.request("/api/relay/received", {
      method: "POST",
      body: { relayId, through },
    });
  }

  closeRelay({ relayId, reason = "closed", payload = {} } = {}) {
    return this.request("/api/relay/close", {
      method: "POST",
      body: { relayId, reason, payload },
    });
  }
}

export async function createRelayClient({ baseUrl = null, root = undefined, throwOnMissing = true } = {}) {
  const resolvedUrl = await discoverRelayUrl({
    root,
    explicitUrl: baseUrl || undefined,
    throwOnMissing,
  });
  return resolvedUrl ? new RelayClient({ baseUrl: resolvedUrl }) : null;
}
