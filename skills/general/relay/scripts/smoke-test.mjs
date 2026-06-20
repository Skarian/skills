#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RelayStore } from "../src/store.mjs";
import { discoverRelayUrl, ensureRelayService } from "../src/service.mjs";
import { readServiceRuntime, writeServiceRuntime } from "../src/runtime.mjs";
import { safeJoin, startRelayServer } from "../src/server.mjs";
import { createRelayClient, RelayClient } from "../src/relay-client.mjs";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function timeout(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(Symbol.for("timeout")), ms);
  });
}

const root = await mkdtemp(path.join(os.tmpdir(), "relay-smoke-"));
const store = new RelayStore({ root });

const opened = store.createRelay({
  appName: "chess",
  payload: false,
});
assert.equal(opened.created, true);
assert.equal(opened.relay.payload, false);

const reused = store.createRelay({
  appName: "chess",
  payload: { ignored: true },
});
assert.equal(reused.created, false);
assert.equal(reused.relay.relayId, opened.relay.relayId);

assert.throws(() => store.createRelay({
  appName: "other-app",
  payload: {},
}), /Relay already open for app: chess/);

const message = store.sendToAgent({
  relayId: opened.relay.relayId,
  payload: 0,
});
assert.equal(message.event.type, "relay.message");

const agentEvents = store.pollEvents({
  relayId: opened.relay.relayId,
  client: "agent",
  cursor: opened.after,
  types: ["relay.message"],
});
assert.equal(agentEvents.length, 1);
assert.equal(agentEvents[0].payload, 0);

const reply = store.replyToRelay({
  relayId: opened.relay.relayId,
  payload: false,
  ackThrough: agentEvents[0].seq,
});
assert.equal(reply.event.type, "relay.reply");
assert.equal(reply.ack.through, agentEvents[0].seq);

const appEvents = store.pollEvents({
  relayId: opened.relay.relayId,
  client: "app",
  cursor: opened.after,
  types: ["relay.reply"],
});
assert.equal(appEvents.length, 1);
assert.equal(appEvents[0].payload.payload, false);

const reusedWithPendingReply = store.createRelay({ appName: "chess" });
assert.equal(reusedWithPendingReply.after, 0);
assert.equal(store.pollEvents({
  relayId: opened.relay.relayId,
  client: "app",
  cursor: reusedWithPendingReply.after,
  types: ["relay.reply"],
}).length, 1);

store.ackEvents({ relayId: opened.relay.relayId, client: "app", through: appEvents[0].seq });
assert.equal(store.pollEvents({
  relayId: opened.relay.relayId,
  client: "app",
  cursor: 0,
  types: ["relay.reply"],
}).length, 0);

const closed = store.closeRelay({
  relayId: opened.relay.relayId,
  payload: "done",
});
assert.equal(closed.relay.status, "closed");
assert.equal(closed.event.payload.payload, "done");
assert.equal(store.findClientRelay("agent").relayId, opened.relay.relayId);
store.ackEvents({ relayId: opened.relay.relayId, client: "agent", through: closed.event.seq });
assert.equal(store.findClientRelay("agent"), null);
assert.throws(() => store.replyToRelay({
  relayId: opened.relay.relayId,
  payload: {},
}), /Relay is not open/);

store.close();
await rm(root, { recursive: true, force: true });

assert.equal(safeJoin("/tmp/relay-public", "index.html"), "/tmp/relay-public/index.html");
assert.throws(() => safeJoin("/tmp/relay-public", "../relay-publicity/secret.txt"), /Invalid path/);
assert.throws(() => new RelayClient(), /baseUrl|createRelayClient/);

const originalRelayUrl = process.env.RELAY_URL;
const originalRelayPort = process.env.RELAY_PORT;
const leakRoot = await mkdtemp(path.join(os.tmpdir(), "relay-leak-smoke-"));
const leakPort = await freePort();
const leakStore = new RelayStore({ root: leakRoot });
try {
  leakStore.db.exec("DROP TABLE service_runtime");
  leakStore.db.exec("CREATE TABLE service_runtime (id INTEGER PRIMARY KEY CHECK (id = 1), url TEXT NOT NULL)");
  leakStore.close();
  const healed = await startRelayServer({ root: leakRoot, port: leakPort });
  assert.equal(readServiceRuntime({ root: leakRoot }).url, healed.url);
  await healed.close();
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(leakPort, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
} finally {
  await rm(leakRoot, { recursive: true, force: true });
}

const httpRoot = await mkdtemp(path.join(os.tmpdir(), "relay-http-smoke-"));
const port = await freePort();
process.env.RELAY_PORT = String(port);
delete process.env.RELAY_URL;
const service = await ensureRelayService({ root: httpRoot, port });
const httpStore = new RelayStore({ root: httpRoot });
try {
  assert.equal(service.owner, true);
  const runtime = readServiceRuntime({ root: httpRoot });
  assert.equal(runtime.url, service.url);
  assert.equal(runtime.port, service.port);
  assert.equal(runtime.root, service.root);
  assert.equal(runtime.dbPath, service.dbPath);
  const runtimeClientPath = path.join(httpRoot, "client.mjs");
  assert.equal(existsSync(runtimeClientPath), true);
  assert.equal(existsSync(path.join(httpRoot, "client.d.ts")), true);
  const runtimeClientModule = await import(pathToFileURL(runtimeClientPath));
  const client = new RelayClient({ baseUrl: service.url });

  const attachedService = await ensureRelayService({ root: httpRoot, port });
  assert.equal(attachedService.owner, false);
  assert.equal(attachedService.url, service.url);
  assert.equal(attachedService.pid, service.pid);
  await attachedService.close();
  assert.equal((await client.health()).url, service.url);
  assert.equal(readServiceRuntime({ root: httpRoot }).url, service.url);

  const health = await client.health();
  assert.equal(health.url, service.url);
  assert.equal(health.host, "127.0.0.1");
  assert.equal(health.port, service.port);
  assert.equal(health.pid, process.pid);

  const discoveredUrl = await discoverRelayUrl({ root: httpRoot });
  assert.equal(discoveredUrl, service.url);
  const discoveredClient = await createRelayClient({ root: httpRoot });
  assert.equal((await discoveredClient.health()).url, service.url);
  const runtimeDiscoveredClient = await runtimeClientModule.createRelayClient({ root: httpRoot });
  assert.equal((await runtimeDiscoveredClient.health()).url, service.url);

  const stalePort = await freePort();
  writeServiceRuntime({
    root: httpRoot,
    url: `http://127.0.0.1:${stalePort}/`,
    host: "127.0.0.1",
    port: stalePort,
    pid: 1,
    dbPath: service.dbPath,
  });
  assert.equal(await discoverRelayUrl({ root: httpRoot }), service.url);

  writeServiceRuntime({
    root: httpRoot,
    url: `http://127.0.0.1:${stalePort}/`,
    host: "127.0.0.1",
    port: stalePort,
    pid: 1,
    dbPath: service.dbPath,
  });
  const attachedFromStaleRuntime = await ensureRelayService({ root: httpRoot, port });
  assert.equal(attachedFromStaleRuntime.owner, false);
  assert.equal(attachedFromStaleRuntime.url, service.url);
  await attachedFromStaleRuntime.close();
  assert.equal(readServiceRuntime({ root: httpRoot }).port, port);

  process.env.RELAY_URL = service.url;
  assert.equal((await (await createRelayClient({ root: httpRoot })).health()).url, service.url);
  assert.equal((await (await runtimeClientModule.createRelayClient({ root: httpRoot })).health()).url, service.url);
  process.env.RELAY_URL = `http://127.0.0.1:${stalePort}/`;
  await assert.rejects(() => createRelayClient({ root: httpRoot }), /Relay|fetch|abort/i);
  delete process.env.RELAY_URL;

  const otherRoot = await mkdtemp(path.join(os.tmpdir(), "relay-other-root-"));
  const otherService = await ensureRelayService({ root: otherRoot, port: await freePort() });
  const badDefaultPort = await freePort();
  process.env.RELAY_PORT = String(badDefaultPort);
  writeServiceRuntime({
    root: httpRoot,
    url: otherService.url,
    host: otherService.host,
    port: otherService.port,
    pid: otherService.pid,
    dbPath: service.dbPath,
  });
  await assert.rejects(() => discoverRelayUrl({ root: httpRoot }), /Relay is not running/);
  await otherService.close();
  await rm(otherRoot, { recursive: true, force: true });
  process.env.RELAY_PORT = String(port);

  const zeroRoot = await mkdtemp(path.join(os.tmpdir(), "relay-zero-port-"));
  const zeroService = await ensureRelayService({ root: zeroRoot, port: 0 });
  assert.equal(readServiceRuntime({ root: zeroRoot }).port, zeroService.port);
  await zeroService.close();
  await rm(zeroRoot, { recursive: true, force: true });

  const openedHttp = await client.openRelay({
    appName: "debug-app",
    payload: null,
  });
  assert.equal(openedHttp.relay.payload, null);
  await assert.rejects(() => client.received(), /no received batch/);

  const reusedHttp = await client.openRelay({
    appName: "debug-app",
    payload: { ignored: true },
  });
  assert.equal(reusedHttp.created, false);
  assert.equal(reusedHttp.relay.relayId, openedHttp.relay.relayId);

  await assert.rejects(() => client.openRelay({ appName: "other-debug-app" }), /Relay already open for app: debug-app/);

  const published = await client.send(false);
  assert.equal(published.event.type, "relay.message");

  const agentHttpEvents = httpStore.pollEvents({
    relayId: openedHttp.relay.relayId,
    client: "agent",
    cursor: openedHttp.after,
    types: ["relay.message"],
  });
  assert.equal(agentHttpEvents.length, 1);
  assert.equal(agentHttpEvents[0].payload, false);

  const pendingReceive = client.receive();
  const earlyReceive = await Promise.race([pendingReceive, timeout(200)]);
  assert.equal(earlyReceive, Symbol.for("timeout"), "receive returned before an agent reply existed");
  await assert.rejects(() => client.receive(), /already waiting/);

  const replied = httpStore.replyToRelay({
    relayId: openedHttp.relay.relayId,
    payload: 0,
  });
  assert.equal(replied.event.type, "relay.reply");

  const appHttpEvents = await Promise.race([pendingReceive, timeout(3000)]);
  assert.notEqual(appHttpEvents, Symbol.for("timeout"), "receive did not return after an agent reply");
  assert.equal(Object.hasOwn(appHttpEvents, "after"), false);
  assert.equal(Object.hasOwn(appHttpEvents, "nextAfter"), false);
  assert.equal(appHttpEvents.items.length, 1);
  assert.equal(appHttpEvents.items[0].payload, 0);
  await assert.rejects(() => client.receive(), /unacknowledged receive batch/);

  httpStore.closeRelay({
    relayId: openedHttp.relay.relayId,
    reason: "old-closed",
    payload: { ok: true },
  });
  const openedAfterClose = await client.openRelay({
    appName: "debug-app-next",
    payload: {},
  });
  assert.equal(openedAfterClose.created, true);
  await client.received();
  assert.equal(httpStore.pollEvents({
    relayId: openedHttp.relay.relayId,
    client: "app",
    cursor: 0,
    types: ["relay.reply"],
  }).length, 0);

  const pendingCloseReceive = client.receive();
  const closeEarly = await Promise.race([pendingCloseReceive, timeout(200)]);
  assert.equal(closeEarly, Symbol.for("timeout"), "receive returned before close");
  await client.closeRelay({ reason: "smoke-close", payload: { ok: true } });
  const closeEvents = await Promise.race([pendingCloseReceive, timeout(3000)]);
  assert.notEqual(closeEvents, Symbol.for("timeout"), "receive did not return after close");
  assert.equal(closeEvents.items[0].status, "closed");
  assert.deepEqual(closeEvents.items[0].payload, { ok: true });
  await client.received();
} finally {
  if (originalRelayUrl === undefined) delete process.env.RELAY_URL;
  else process.env.RELAY_URL = originalRelayUrl;
  if (originalRelayPort === undefined) delete process.env.RELAY_PORT;
  else process.env.RELAY_PORT = originalRelayPort;
  httpStore.close();
  await service.close();
  await rm(httpRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, cleaned: true }));
