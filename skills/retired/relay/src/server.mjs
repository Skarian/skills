import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RelayStore, relayRoot } from "./store.mjs";
import { publishRelayClient, writeServiceRuntime } from "./runtime.mjs";
import { waitForEvents } from "./wait.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(skillRoot, "public");

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function jsonReply(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value, null, 2));
}

function textReply(res, status, value) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(value);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

export function safeJoin(root, requestPath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, requestPath.replace(/^\/+/, ""));
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function bodyValue(body, key, fallback) {
  return body && Object.hasOwn(body, key) ? body[key] : fallback;
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function eventItem(event) {
  const payload = event.payload;
  const envelope = payload && typeof payload === "object" ? payload : {};
  if (event.type === "relay.closed") {
    return {
      seq: event.seq,
      status: "closed",
      reason: envelope.reason || "closed",
      payload: Object.hasOwn(envelope, "payload") ? envelope.payload : {},
      createdAt: event.createdAt,
    };
  }
  return {
    seq: event.seq,
    status: "message",
    inReplyTo: envelope.inReplyTo ?? null,
    payload: Object.hasOwn(envelope, "payload") ? envelope.payload : payload,
    createdAt: event.createdAt,
  };
}

function serviceInfo(store, server) {
  const address = server.address();
  const host = typeof address === "object" && address?.address ? address.address : "127.0.0.1";
  const port = typeof address === "object" && address?.port ? Number(address.port) : 4799;
  const url = `http://${host}:${port}/`;
  return {
    url,
    host,
    port,
    pid: process.pid,
    root: store.root,
    dbPath: store.dbPath,
  };
}

export async function startRelayServer(options = {}) {
  const store = new RelayStore({ root: options.root || relayRoot() });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/health") {
        jsonReply(res, 200, {
          name: "relay",
          status: "ok",
          ...serviceInfo(store, server),
        });
      } else if (req.method === "GET" && url.pathname === "/api/relays") {
        jsonReply(res, 200, store.listRelaySummaries({
          appName: url.searchParams.get("app") || undefined,
          lifecycle: url.searchParams.get("lifecycle") || url.searchParams.get("status") || undefined,
          limit: url.searchParams.get("limit") || undefined,
        }));
      } else if (req.method === "POST" && url.pathname === "/api/relay/open") {
        const body = await parseBody(req);
        jsonReply(res, 200, store.createRelay({
          appName: body.appName,
          payload: bodyValue(body, "payload", {}),
        }));
      } else if (req.method === "POST" && url.pathname === "/api/relay/send") {
        const body = await parseBody(req);
        jsonReply(res, 200, store.sendToAgent({
          relayId: body.relayId,
          payload: bodyValue(body, "payload", {}),
        }));
      } else if (req.method === "POST" && url.pathname === "/api/relay/receive") {
        const body = await parseBody(req);
        const relay = store.resolveRelay({ relayId: body.relayId });
        const after = Number(body.after || 0);
        const immediate = store.pollEvents({
          relayId: body.relayId,
          client: "app",
          cursor: after,
          types: ["relay.reply", "relay.closed"],
        });
        if (!immediate.length && relay.status !== "open") {
          throw httpError(`Relay is not open: ${relay.relayId}`, 409);
        }
        const events = immediate.length ? immediate : (await waitForEvents(store, {
          relayId: body.relayId,
          client: "app",
          cursor: after,
          types: ["relay.reply", "relay.closed"],
        })).events;
        jsonReply(res, 200, {
          relayId: relay.relayId,
          appName: relay.appName,
          after,
          nextAfter: events.at(-1).seq,
          items: events.map(eventItem),
        });
      } else if (req.method === "POST" && url.pathname === "/api/relay/received") {
        const body = await parseBody(req);
        store.resolveRelay({ relayId: body.relayId });
        if (!Object.hasOwn(body, "through")) {
          throw httpError("through is required", 400);
        }
        jsonReply(res, 200, store.ackEvents({
          relayId: body.relayId,
          client: "app",
          through: Number(body.through || 0),
        }));
      } else if (req.method === "POST" && url.pathname === "/api/relay/close") {
        const body = await parseBody(req);
        jsonReply(res, 200, store.closeRelay({
          relayId: body.relayId,
          reason: body.reason || "closed",
          payload: bodyValue(body, "payload", {}),
        }));
      } else if (req.method === "GET") {
        const filePath = url.pathname === "/" ? path.join(publicRoot, "index.html") : safeJoin(publicRoot, url.pathname);
        const body = await readFile(filePath);
        res.writeHead(200, {
          "Content-Type": MIME.get(path.extname(filePath)) || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(body);
      } else {
        textReply(res, 405, "Method not allowed");
      }
    } catch (error) {
      jsonReply(res, error.status || 500, { error: error.message });
    }
  });

  const requestedPort = Number(options.port ?? process.env.RELAY_PORT ?? 4799);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(requestedPort, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    store.close();
    throw error;
  }
  const info = serviceInfo(store, server);
  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  };
  try {
    writeServiceRuntime(info);
    publishRelayClient({ root: store.root });
  } catch (error) {
    await close();
    throw error;
  }
  return {
    url: info.url,
    host: info.host,
    port: info.port,
    pid: info.pid,
    root: store.root,
    dbPath: store.dbPath,
    server,
    close,
  };
}
