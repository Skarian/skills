import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { nowIso, relayDbPath, relayRoot } from "./store.mjs";

const SERVICE_RUNTIME_SQL = `
  CREATE TABLE IF NOT EXISTS service_runtime (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    url TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    pid INTEGER,
    root TEXT NOT NULL,
    db_path TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const SERVICE_RUNTIME_COLUMNS = ["id", "url", "host", "port", "pid", "root", "db_path", "updated_at"];

function writeIfChanged(filePath, content) {
  if (existsSync(filePath) && readFileSync(filePath, "utf8") === content) return;
  writeFileSync(filePath, content);
}

function ensureServiceRuntimeTable(db) {
  db.exec(SERVICE_RUNTIME_SQL);
  const columns = new Set(db.prepare("PRAGMA table_info(service_runtime)").all().map((row) => row.name));
  if (!SERVICE_RUNTIME_COLUMNS.every((column) => columns.has(column))) {
    db.exec("DROP TABLE IF EXISTS service_runtime");
    db.exec(SERVICE_RUNTIME_SQL);
  }
}

export function publishRelayClient({ root = relayRoot() } = {}) {
  const resolvedRoot = path.resolve(root);
  mkdirSync(resolvedRoot, { recursive: true });
  const clientPath = path.join(resolvedRoot, "client.mjs");
  const typesPath = path.join(resolvedRoot, "client.d.ts");
  const sourcePath = fileURLToPath(new URL("./relay-client.mjs", import.meta.url));
  const sourceTypesPath = fileURLToPath(new URL("./relay-client.d.ts", import.meta.url));
  writeIfChanged(clientPath, readFileSync(sourcePath, "utf8"));
  writeIfChanged(typesPath, readFileSync(sourceTypesPath, "utf8"));
  return { clientPath, typesPath };
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

export function readServiceRuntime({ root = relayRoot() } = {}) {
  const resolvedRoot = path.resolve(root);
  const dbPath = relayDbPath(resolvedRoot);
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath);
  try {
    return rowToRuntime(db.prepare("SELECT * FROM service_runtime WHERE id = 1").get());
  } catch (error) {
    if (String(error.message).includes("no such table")) return null;
    throw error;
  } finally {
    db.close();
  }
}

export function writeServiceRuntime({
  root = relayRoot(),
  url,
  host = null,
  port = null,
  pid = null,
  dbPath = null,
} = {}) {
  if (!url) throw new Error("url is required");
  const resolvedRoot = path.resolve(root);
  const resolvedDbPath = path.resolve(dbPath || relayDbPath(resolvedRoot));
  const parsed = new URL(url);
  const resolvedHost = host || parsed.hostname;
  const resolvedPort = Number(port ?? (parsed.port || 80));
  const at = nowIso();
  mkdirSync(resolvedRoot, { recursive: true });
  const db = new DatabaseSync(resolvedDbPath);
  try {
    ensureServiceRuntimeTable(db);
    db.prepare(`
      INSERT INTO service_runtime
        (id, url, host, port, pid, root, db_path, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        host = excluded.host,
        port = excluded.port,
        pid = excluded.pid,
        root = excluded.root,
        db_path = excluded.db_path,
        updated_at = excluded.updated_at
    `).run(
      parsed.toString(),
      resolvedHost,
      resolvedPort,
      pid === null || pid === undefined ? null : Number(pid),
      resolvedRoot,
      resolvedDbPath,
      at,
    );
    return {
      url: parsed.toString(),
      host: resolvedHost,
      port: resolvedPort,
      pid: pid === null || pid === undefined ? null : Number(pid),
      root: resolvedRoot,
      dbPath: resolvedDbPath,
      updatedAt: at,
    };
  } finally {
    db.close();
  }
}
