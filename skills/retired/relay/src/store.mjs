import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function relayRoot() {
  return path.resolve(process.env.RELAY_DATA_DIR || path.join(os.homedir(), ".skills", "relay"));
}

export function relayDbPath(root = relayRoot()) {
  return path.join(root, "relay.sqlite");
}

export function nowIso() {
  return new Date().toISOString();
}

export function timestampId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(16).slice(2, 8)}`;
}

function shortRelayId() {
  return `r_${randomBytes(6).toString("hex")}`;
}

function errorWithStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireRelayId(relayId) {
  if (typeof relayId !== "string" || !relayId.trim()) {
    throw errorWithStatus("relayId is required", 400);
  }
  return relayId.trim();
}

function parseJson(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function hasColumn(db, table, column) {
  return tableInfo(db, table).some((row) => row.name === column);
}

function normalizeLimit(value, fallback, max) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(numeric)));
}

function sideColumn(side) {
  if (side === "app") return "app_received_seq";
  if (side === "agent") return "agent_delivered_seq";
  throw new Error("side must be app or agent");
}

function processIsLive(pid) {
  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

function rowToRelay(row) {
  if (!row) return null;
  return {
    relayId: row.id,
    appName: row.app_name,
    status: row.status,
    lifecycle: row.status,
    payload: parseJson(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null,
  };
}

function rowToMessage(row) {
  if (!row) return null;
  const payload = parseJson(row.payload_json);
  return {
    seq: row.seq,
    eventId: row.event_id,
    relayId: row.relay_id,
    type: `relay.${row.kind === "message" ? "message" : row.kind}`,
    payload: row.kind === "reply"
      ? { inReplyTo: row.in_reply_to ?? null, payload }
      : payload,
    createdAt: row.created_at,
  };
}

export class RelayStore {
  constructor({ root = relayRoot() } = {}) {
    this.root = path.resolve(root);
    mkdirSync(this.root, { recursive: true });
    this.dbPath = relayDbPath(this.root);
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.#migrate();
  }

  close() {
    this.db.close();
  }

  #migrate() {
    if (!hasColumn(this.db, "relays", "agent_delivered_seq")) {
      this.db.exec(`
        DROP TABLE IF EXISTS acks;
        DROP TABLE IF EXISTS events;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS relays;
        DROP TABLE IF EXISTS waiter;
        DROP TABLE IF EXISTS waiters;
      `);
    }
    if (tableInfo(this.db, "waiter").some((row) => row.name === "id")) {
      this.db.exec("DROP TABLE IF EXISTS waiter");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relays (
        id TEXT PRIMARY KEY,
        app_name TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        app_received_seq INTEGER NOT NULL DEFAULT 0,
        agent_delivered_seq INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        relay_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        in_reply_to INTEGER,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (relay_id) REFERENCES relays(id)
      );

      CREATE TABLE IF NOT EXISTS waiter (
        relay_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        pid INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (relay_id) REFERENCES relays(id)
      );

      CREATE TABLE IF NOT EXISTS service_runtime (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        url TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        pid INTEGER,
        root TEXT NOT NULL,
        db_path TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS relays_open_app
        ON relays(app_name, status, created_at);
      CREATE INDEX IF NOT EXISTS messages_relay_kind
        ON messages(relay_id, kind, seq);
      CREATE INDEX IF NOT EXISTS messages_relay_in_reply_to
        ON messages(relay_id, kind, in_reply_to);
    `);
    this.db.exec(`
      DELETE FROM messages
      WHERE kind = 'reply'
        AND in_reply_to IS NOT NULL
        AND seq NOT IN (
          SELECT MIN(seq)
          FROM messages
          WHERE kind = 'reply' AND in_reply_to IS NOT NULL
          GROUP BY relay_id, in_reply_to
        );
    `);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS messages_reply_once
        ON messages(relay_id, in_reply_to)
        WHERE kind = 'reply' AND in_reply_to IS NOT NULL;
    `);
  }

  createRelay({ appName, payload = {} }) {
    if (typeof appName !== "string" || !appName.trim()) {
      throw errorWithStatus("appName is required", 400);
    }
    const normalizedAppName = appName.trim();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let id = shortRelayId();
      for (let attempt = 0; this.getRelay(id); attempt += 1) {
        if (attempt >= 8) throw new Error("Could not create unique relayId");
        id = shortRelayId();
      }
      const at = nowIso();
      this.db.prepare(`
        INSERT INTO relays
          (id, app_name, status, payload_json, created_at, updated_at, closed_at)
        VALUES (?, ?, 'open', ?, ?, ?, NULL)
      `).run(id, normalizedAppName, stringifyJson(payload), at, at);
      const relay = this.getRelay(id);
      this.db.exec("COMMIT");
      return { relayId: relay.relayId, relay, created: true, after: 0 };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getRelay(relayId) {
    if (!relayId) return null;
    return rowToRelay(this.db.prepare("SELECT * FROM relays WHERE id = ?").get(relayId));
  }

  resolveRelay({ relayId } = {}) {
    const id = requireRelayId(relayId);
    const relay = this.getRelay(id);
    if (!relay) throw errorWithStatus(`Unknown relay: ${id}`, 404);
    return relay;
  }

  listRelays({ appName = null, status = null, lifecycle = null } = {}) {
    const clauses = [];
    const params = [];
    if (appName) {
      clauses.push("app_name = ?");
      params.push(appName);
    }
    const requestedStatus = lifecycle || status;
    if (requestedStatus) {
      clauses.push("status = ?");
      params.push(requestedStatus);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM relays ${where} ORDER BY updated_at DESC, created_at DESC`)
      .all(...params)
      .map(rowToRelay);
  }

  listRelaySummaries({ appName = null, status = null, lifecycle = null, limit = 10 } = {}) {
    const relays = this.listRelays({ appName, status, lifecycle }).map((relay) => this.relaySummary(relay));
    relays.sort((left, right) => {
      const attention = Number(right.attention) - Number(left.attention);
      if (attention) return attention;
      const open = Number(right.lifecycle === "open") - Number(left.lifecycle === "open");
      if (open) return open;
      const updated = right.updatedAt.localeCompare(left.updatedAt);
      if (updated) return updated;
      return right.createdAt.localeCompare(left.createdAt);
    });
    const normalizedLimit = normalizeLimit(limit, 10, 50);
    return {
      status: "relays",
      limit: normalizedLimit,
      truncated: relays.length > normalizedLimit,
      relays: relays.slice(0, normalizedLimit),
    };
  }

  relaySummary(relayOrId) {
    const relay = typeof relayOrId === "string" ? this.resolveRelay({ relayId: relayOrId }) : relayOrId;
    const liveWaiter = this.hasLiveWaiter({ relayId: relay.relayId });
    const pendingTurn = relay.status === "open" ? this.agentPendingSeq({ relayId: relay.relayId }) : 0;
    const undeliveredMessage = relay.status === "open" && this.hasUndeliveredAgentMessage({ relayId: relay.relayId });
    const undeliveredAgentEvent = this.hasUndeliveredAgentEvent({ relayId: relay.relayId });
    let state = null;
    if (relay.status === "open") {
      if (pendingTurn) state = "agent_turn";
      else if (liveWaiter) state = "agent_connected";
      else if (undeliveredMessage) state = "waiting_for_agent";
      else state = "idle";
    }
    return {
      relayId: relay.relayId,
      appName: relay.appName,
      lifecycle: relay.status,
      state,
      attention: !liveWaiter && (Boolean(pendingTurn) || undeliveredAgentEvent),
      createdAt: relay.createdAt,
      updatedAt: relay.updatedAt,
    };
  }

  sendToAgent({ relayId, payload = {} }) {
    const relay = this.resolveRelay({ relayId });
    if (relay.status !== "open") throw errorWithStatus(`Relay is not open: ${relay.relayId}`, 409);
    return { relay, event: this.#append({ relayId: relay.relayId, kind: "message", payload }) };
  }

  replyToRelay({ relayId, payload = {}, ackThrough = null }) {
    const relay = this.resolveRelay({ relayId });
    if (relay.status !== "open") throw errorWithStatus(`Relay is not open: ${relay.relayId}`, 409);
    if (ackThrough === null || ackThrough === undefined) {
      throw errorWithStatus("ackThrough is required", 400);
    }
    const inReplyTo = Number(ackThrough);
    const message = this.messageEvent({ relayId: relay.relayId, seq: inReplyTo });
    if (message?.type !== "relay.message") {
      throw errorWithStatus(`No delivered app message at seq: ${inReplyTo}`, 400);
    }
    const existing = this.replyFor({ relayId: relay.relayId, inReplyTo });
    let event = existing;
    let duplicate = Boolean(existing);
    if (!event) {
      try {
        event = this.#append({
          relayId: relay.relayId,
          kind: "reply",
          inReplyTo,
          payload,
        });
      } catch (error) {
        if (error.code === "ERR_SQLITE_ERROR" && String(error.message || "").includes("UNIQUE constraint failed: messages.relay_id, messages.in_reply_to")) {
          event = this.replyFor({ relayId: relay.relayId, inReplyTo });
          duplicate = Boolean(event);
        }
        if (!event) throw error;
      }
    }
    const ack = this.ackEvents({ relayId: relay.relayId, client: "agent", through: inReplyTo });
    return { relay, event, ack, duplicate };
  }

  closeRelay({ relayId, reason = "closed", payload = {} } = {}) {
    const relay = this.resolveRelay({ relayId });
    if (relay.status !== "open") {
      return { relay, event: this.closeEvent({ relayId: relay.relayId }) };
    }
    const at = nowIso();
    this.db.prepare(`
      UPDATE relays
      SET status = 'closed', updated_at = ?, closed_at = ?
      WHERE id = ?
    `).run(at, at, relay.relayId);
    const updated = this.getRelay(relay.relayId);
    return {
      relay: updated,
      event: this.#append({ relayId: updated.relayId, kind: "closed", payload: { reason, payload } }),
    };
  }

  latestSeq({ relayId }) {
    const id = requireRelayId(relayId);
    const row = this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE relay_id = ?").get(id);
    return Number(row?.seq || 0);
  }

  ackEvents({ relayId, client, through }) {
    const relay = this.resolveRelay({ relayId });
    const column = sideColumn(client);
    const current = this.ackThrough({ relayId: relay.relayId, client });
    const next = Math.max(current, Number(through || 0));
    const at = nowIso();
    this.db.prepare(`UPDATE relays SET ${column} = ?, updated_at = ? WHERE id = ?`).run(next, at, relay.relayId);
    return { relayId: relay.relayId, client, through: next, updatedAt: at };
  }

  ackThrough({ relayId, client }) {
    const id = requireRelayId(relayId);
    const column = sideColumn(client);
    const row = this.db.prepare(`SELECT ${column} AS seq FROM relays WHERE id = ?`).get(id);
    return Number(row?.seq || 0);
  }

  pollEvents({ relayId, client, cursor = 0, limit = 50, types = null }) {
    const relay = this.resolveRelay({ relayId });
    const ack = this.ackThrough({ relayId: relay.relayId, client });
    const lowerBound = Math.max(Number(cursor || 0), ack);
    const allowed = client === "app" ? ["reply", "closed"] : ["message", "closed"];
    const wanted = types
      ? types.map((type) => String(type).replace(/^relay\./, "")).filter((type) => allowed.includes(type))
      : allowed;
    if (!wanted.length) return [];
    const rows = this.db.prepare(`
      SELECT * FROM messages
      WHERE relay_id = ?
        AND seq > ?
        AND kind IN (${wanted.map(() => "?").join(", ")})
      ORDER BY seq ASC
      LIMIT ?
    `).all(relay.relayId, lowerBound, ...wanted, normalizeLimit(limit, 50, 100));
    return rows.map(rowToMessage);
  }

  messageEvent({ relayId, seq }) {
    const id = requireRelayId(relayId);
    return rowToMessage(this.db.prepare("SELECT * FROM messages WHERE relay_id = ? AND seq = ?").get(id, Number(seq)));
  }

  deliveredMessageSeq({ relayId }) {
    const delivered = this.ackThrough({ relayId, client: "agent" });
    if (!delivered) return 0;
    const row = this.db.prepare("SELECT kind FROM messages WHERE relay_id = ? AND seq = ?").get(relayId, delivered);
    return row?.kind === "message" ? delivered : 0;
  }

  replyFor({ relayId, inReplyTo }) {
    const id = requireRelayId(relayId);
    return rowToMessage(this.db.prepare(`
      SELECT * FROM messages
      WHERE relay_id = ? AND kind = 'reply' AND in_reply_to = ?
      ORDER BY seq ASC
      LIMIT 1
    `).get(id, Number(inReplyTo)));
  }

  closeEvent({ relayId }) {
    const id = requireRelayId(relayId);
    return rowToMessage(this.db.prepare(`
      SELECT * FROM messages
      WHERE relay_id = ? AND kind = 'closed'
      ORDER BY seq ASC
      LIMIT 1
    `).get(id));
  }

  closeEventAfter({ relayId, seq = 0 }) {
    const id = requireRelayId(relayId);
    return rowToMessage(this.db.prepare(`
      SELECT * FROM messages
      WHERE relay_id = ? AND kind = 'closed' AND seq > ?
      ORDER BY seq ASC
      LIMIT 1
    `).get(id, Number(seq || 0)));
  }

  agentPendingSeq({ relayId }) {
    const delivered = this.deliveredMessageSeq({ relayId });
    if (!delivered) return 0;
    return this.replyFor({ relayId, inReplyTo: delivered }) ? 0 : delivered;
  }

  hasUndeliveredAgentMessage({ relayId }) {
    const id = requireRelayId(relayId);
    const delivered = this.ackThrough({ relayId: id, client: "agent" });
    const row = this.db.prepare(`
      SELECT 1 FROM messages
      WHERE relay_id = ? AND kind = 'message' AND seq > ?
      LIMIT 1
    `).get(id, delivered);
    return Boolean(row);
  }

  hasUndeliveredAgentEvent({ relayId }) {
    const id = requireRelayId(relayId);
    const delivered = this.ackThrough({ relayId: id, client: "agent" });
    const row = this.db.prepare(`
      SELECT 1 FROM messages
      WHERE relay_id = ? AND kind IN ('message', 'closed') AND seq > ?
      LIMIT 1
    `).get(id, delivered);
    return Boolean(row);
  }

  hasLiveWaiter({ relayId }) {
    const id = requireRelayId(relayId);
    const existing = this.db.prepare("SELECT * FROM waiter WHERE relay_id = ?").get(id);
    if (!existing) return false;
    if (processIsLive(existing.pid)) return true;
    this.db.prepare("DELETE FROM waiter WHERE relay_id = ?").run(id);
    return false;
  }

  acquireWait({ relayId, owner, pid }) {
    const relay = this.resolveRelay({ relayId });
    if (relay.status !== "open") throw errorWithStatus(`Relay is not open: ${relay.relayId}`, 409);
    const existing = this.db.prepare("SELECT * FROM waiter WHERE relay_id = ?").get(relay.relayId);
    if (existing && processIsLive(existing.pid)) {
      throw errorWithStatus("Relay already has an active agent waiter", 409);
    }
    if (existing) {
      this.db.prepare("DELETE FROM waiter WHERE relay_id = ?").run(relay.relayId);
    }
    this.db.prepare("INSERT INTO waiter (relay_id, owner, pid, created_at) VALUES (?, ?, ?, ?)")
      .run(relay.relayId, owner, Number(pid), nowIso());
  }

  releaseWait({ relayId, owner }) {
    const id = requireRelayId(relayId);
    this.db.prepare("DELETE FROM waiter WHERE relay_id = ? AND owner = ?").run(id, owner);
  }

  #touchRelay({ relayId, at = nowIso() }) {
    this.db.prepare("UPDATE relays SET updated_at = ? WHERE id = ?").run(at, relayId);
  }

  #append({ relayId, kind, payload, inReplyTo = null }) {
    const eventId = timestampId("event");
    const at = nowIso();
    this.db.prepare(`
      INSERT INTO messages (event_id, relay_id, kind, in_reply_to, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventId, relayId, kind, inReplyTo, stringifyJson(payload), at);
    this.#touchRelay({ relayId, at });
    return rowToMessage(this.db.prepare("SELECT * FROM messages WHERE event_id = ?").get(eventId));
  }
}
